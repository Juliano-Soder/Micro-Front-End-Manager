const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Menu } = require('electron');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const url = require('url');

// ===== CONFIGURAÇÃO DE HANDLERS IPC =====
// CRÍTICO: Todos os handlers IPC devem ser registrados IMEDIATAMENTE após os imports

console.log('[DEBUG] Registrando handlers IPC...');

// Handler de teste simples
ipcMain.on('test-ipc', (event, data) => {
    console.log(`[TEST] IPC funcionando! Dados recebidos: ${JSON.stringify(data)}`);
    event.reply('test-ipc-response', { success: true, received: data, timestamp: new Date().toISOString() });
});

// Handler genérico para executar qualquer comando Git
ipcMain.on('execute-git-command', async (event, { command, projectPath, projectName, projectIndex, isPamp }) => {
  try {
    console.log(`[DEBUG] execute-git-command recebido: ${command} para ${projectName}, path: ${projectPath}`);
    
    sendGitCommandOutput(event, `Executando: ${command}`, false);
    
    const result = await executeCommand(command, projectPath);
    console.log(`[DEBUG] Resultado do comando:`, result);
    
    if (result.error) {
      sendGitCommandOutput(event, `❌ Erro: ${result.error}`, true, true);
      console.log(`[DEBUG] Erro no comando: ${result.error}`);
    } else {
      if (result.stdout) {
        sendGitCommandOutput(event, result.stdout, false, false);
      }
      if (result.stderr) {
        sendGitCommandOutput(event, `⚠️  ${result.stderr}`, false, false);
      }
      
      // Marca comando como completo
      sendGitCommandOutput(event, `✅ Comando concluído`, false, true);
      
      // Se for um comando que pode mudar o estado (checkout, pull, etc), atualizar status
      if (command.includes('checkout') || command.includes('pull') || command.includes('fetch')) {
        console.log(`[DEBUG] Comando pode ter alterado status, atualizando...`);
        setTimeout(async () => {
          try {
            const gitStatus = await checkGitStatus(projectPath);
            event.reply('git-status-updated', { projectIndex, gitStatus });
            console.log(`[DEBUG] Status Git atualizado para projeto ${projectIndex}`);
          } catch (error) {
            console.log(`[DEBUG] Erro ao atualizar status: ${error.message}`);
          }
        }, 1000);
      }
    }
  } catch (error) {
    console.log(`[DEBUG] Erro na função execute-git-command: ${error.message}`);
    sendGitCommandOutput(event, `❌ Erro inesperado: ${error.message}`, true, true);
  }
});

// Handler para refresh-git-status
ipcMain.on('refresh-git-status', async (event, { projectPath, projectIndex, isPamp }) => {
  try {
    console.log(`[DEBUG] refresh-git-status para ${projectPath}`);
    const gitStatus = await checkGitStatus(projectPath);
    event.reply('git-status-updated', { projectIndex, gitStatus });
    console.log(`[DEBUG] Status enviado para UI: projeto ${projectIndex}`);
  } catch (error) {
    console.log(`[DEBUG] Erro no refresh-git-status: ${error.message}`);
    event.reply('git-status-updated', { projectIndex, gitStatus: null });
  }
});

// Handler para iniciar verificação Git em segundo plano
ipcMain.on('start-background-git-check', async (event) => {
  console.log(`[DEBUG] Solicitação para iniciar verificação Git em segundo plano`);
  startBackgroundGitCheck().catch(error => {
    console.log(`[DEBUG] Erro na verificação em segundo plano: ${error.message}`);
  });
});

// Handler para atualizar um projeto específico
ipcMain.on('update-project-git-status', async (event, { projectIndex }) => {
  console.log(`[DEBUG] Solicitação para atualizar projeto específico: ${projectIndex}`);
  updateProjectGitStatus(projectIndex).catch(error => {
    console.log(`[DEBUG] Erro na atualização específica: ${error.message}`);
  });
});

console.log('[DEBUG] Handlers IPC registrados com sucesso');

// Função auxiliar para enviar saída de comandos Git (declarada cedo)
function sendGitCommandOutput(event, output, isError = false, isComplete = false) {
  event.reply('git-command-output', {
    output: safeLog(output),
    isError,
    isComplete
  });
}

// Função auxiliar para executar comandos Git de forma promisificada (declarada cedo)
function executeCommand(command, workingDirectory) {
  return new Promise((resolve) => {
    exec(command, {
      cwd: workingDirectory,
      timeout: 30000,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      resolve({
        error: error ? (stderr || error.message) : null,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

// ⚡ OTIMIZAÇÕES DE PERFORMANCE ⚡
// Habilita aceleração de hardware
app.commandLine.appendSwitch('--enable-gpu-rasterization');
app.commandLine.appendSwitch('--enable-zero-copy');
app.commandLine.appendSwitch('--disable-dev-shm-usage');
app.commandLine.appendSwitch('--max_old_space_size', '4096');

// Fix para problemas de cache no Windows
app.commandLine.appendSwitch('--disable-http-cache');
app.commandLine.appendSwitch('--disable-application-cache');

// Otimizações do Windows
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('--high-dpi-support', '1');
  app.commandLine.appendSwitch('--force-device-scale-factor', '1');
  // Fix para encoding UTF-8 no Windows
  if (process.stdout && process.stdout.setDefaultEncoding) {
    process.stdout.setDefaultEncoding('utf8');
  }
}

const userDataPath = app.getPath('userData');
const loginStateFile = path.join(userDataPath, 'login-state.json');
const configFile = path.join(userDataPath, 'config.json');
const cacheFile = path.join(userDataPath, 'app-cache.json');

// Cache global para dados da aplicação
let appCache = {
  projects: null,
  nodeInfo: null,
  angularInfo: null,
  loginState: null,
  lastUpdate: 0
};

// ⚡ FUNÇÃO HELPER PARA LOGS COMPATÍVEIS COM WINDOWS ⚡
function safeLog(message, type = 'info') {
  // Remove emojis problemáticos e substitui por texto
  const cleanMessage = message
    .replace(/🚀/g, '[ROCKET]')
    .replace(/⚡/g, '[LIGHTNING]')
    .replace(/💾/g, '[DISK]')
    .replace(/📁/g, '[FOLDER]')
    .replace(/🔍/g, '[SEARCH]')
    .replace(/❌/g, '[ERROR]')
    .replace(/✅/g, '[SUCCESS]')
    .replace(/🌿/g, '[BRANCH]')
    .replace(/💡/g, '[IDEA]')
    .replace(/🔧/g, '[TOOL]')
    .replace(/🎯/g, '[TARGET]')
    .replace(/🔄/g, '[RELOAD]')
    .replace(/⏹️/g, '[STOP]')
    .replace(/ℹ️/g, '[INFO]')
    .replace(/⚠️/g, '[WARNING]')
    .replace(/🔀/g, '[CHECKOUT]')
    .replace(/📡/g, '[FETCH]')
    .replace(/⬇️/g, '[PULL]');

  switch(type) {
    case 'error':
      console.error(cleanMessage);
      break;
    case 'warn':
      console.warn(cleanMessage);
      break;
    default:
      console.log(cleanMessage);
  }
}

// Carrega cache na inicialização
function loadAppCache() {
  try {
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const cacheAge = Date.now() - cacheData.timestamp;
      
      // Cache é válido por 5 minutos
      if (cacheAge < 5 * 60 * 1000) {
        appCache = { ...cacheData };
        safeLog('[CACHE] Cache carregado com sucesso');
        return true;
      }
    }
  } catch (error) {
    console.log('Cache não encontrado ou inválido, será regenerado');
  }
  return false;
}

// Salva cache (excluindo dados dinâmicos como commits pendentes)
function saveAppCache() {
  try {
    // Remove dados dinâmicos que nunca devem ser cachados
    const cleanCache = { ...appCache };
    
    // Garante que dados Git dinâmicos nunca sejam salvos no cache
    if (cleanCache.projects && Array.isArray(cleanCache.projects)) {
      cleanCache.projects = cleanCache.projects.map(project => {
        if (typeof project === 'object') {
          const { pendingCommits, hasUpdates, gitBranch, ...staticData } = project;
          return staticData;
        }
        return project;
      });
    }
    
    const cacheData = {
      ...cleanCache,
      timestamp: Date.now()
    };
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    safeLog('[CACHE] Cache salvo com sucesso (dados dinâmicos excluídos)');
  } catch (error) {
    console.error('Erro ao salvar cache:', error);
  }
}

// ⚡ FUNÇÕES DE PRÉ-CARREGAMENTO E CACHE ⚡
async function preloadCriticalData() {
  safeLog('[ROCKET] Pre-carregando dados criticos...');
  const startTime = Date.now();
  
  try {
    // Carrega dados em paralelo
    const promises = [];
    
    // Se não temos cache válido, carrega os dados
    if (!appCache.projects) {
      promises.push(preloadProjects());
    }
    
    if (!appCache.nodeInfo) {
      promises.push(preloadNodeInfo());
    }
    
    if (!appCache.angularInfo) {
      promises.push(preloadAngularInfo());
    }
    
    if (!appCache.loginState) {
      promises.push(preloadLoginState());
    }
    
    // Executa todas as operações em paralelo
    await Promise.allSettled(promises);
    
    // Salva o cache atualizado
    saveAppCache();
    
    const loadTime = Date.now() - startTime;
    safeLog(`[LIGHTNING] Pre-carregamento concluido em ${loadTime}ms`);
    
  } catch (error) {
    console.error('Erro durante pré-carregamento:', error);
  }
}

async function preloadProjects() {
  try {
    const projectsContent = await fs.promises.readFile('projects.txt', 'utf-8');
    const projectNames = projectsContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // Não sobrescreve a variável projects global, apenas salva no cache
    appCache.projects = projectNames;
    console.log(`[FOLDER] ${projectNames.length} projetos carregados no cache para pre-carregamento`);
  } catch (error) {
    console.log('Arquivo projects.txt não encontrado, será criado quando necessário');
    appCache.projects = [];
  }
}

async function preloadNodeInfo() {
  return new Promise((resolve) => {
    exec('node --version', { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        appCache.nodeInfo = { version: 'N/A', available: false };
      } else {
        appCache.nodeInfo = { 
          version: stdout.trim(),
          available: true
        };
      }
      resolve();
    });
  });
}

async function preloadAngularInfo() {
  try {
    console.log('🔍 Pré-carregando informações do Angular CLI...');
    
    return new Promise((resolve) => {
      // Usar exec assíncrono com timeout maior
      exec('ng version', { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) {
          console.log('[ERROR] Angular CLI nao disponivel no pre-carregamento:', error.message);
          
          // NÃO salva no cache quando há erro - deixa para verificação posterior
          appCache.angularInfo = {
            version: null,
            available: false,
            needsReverification: true, // Flag para indicar que precisa reverificar
            cacheSkipped: true // Indica que o cache foi pulado por erro
          };
          resolve();
          return;
        }
        
        const angularOutput = stdout.toString();
        console.log('[SUCCESS] Angular CLI encontrado no pre-carregamento');
        const angularCliMatch = angularOutput.match(/Angular CLI: (\d+\.\d+\.\d+)/);
        
        if (angularCliMatch) {
          const version = angularCliMatch[1];
          // SOMENTE salva no cache quando CONFIRMADO como disponível
          appCache.angularInfo = {
            version: version,
            available: true,
            confirmed: true, // Flag para indicar que foi confirmado
            fullOutput: angularOutput
          };
          console.log(`[SUCCESS] Angular CLI pre-carregado e confirmado: ${version}`);
        } else {
          // Mesmo sem versão detectada, se chegou aqui é porque está instalado
          appCache.angularInfo = {
            version: 'Instalado (versão não detectada)',
            available: true,
            confirmed: true,
            fullOutput: angularOutput
          };
          console.log('[SUCCESS] Angular CLI pre-carregado (versao nao detectada mas confirmado)');
        }
        
        resolve();
      });
    });
  } catch (error) {
    console.error('Erro no pré-carregamento do Angular:', error);
    // NÃO define cache em caso de erro
    appCache.angularInfo = {
      version: null,
      available: false,
      needsReverification: true,
      cacheSkipped: true
    };
  }
}

async function preloadLoginState() {
  try {
    if (fs.existsSync(loginStateFile)) {
      const data = await fs.promises.readFile(loginStateFile, 'utf-8');
      appCache.loginState = JSON.parse(data);
    } else {
      appCache.loginState = { isLoggedIn: false };
    }
  } catch (error) {
    appCache.loginState = { isLoggedIn: false };
  }
}

// ⚡ FUNÇÃO PARA OBTER BRANCH GIT DO PROJETO ⚡
async function getProjectGitBranch(projectPath) {
  if (!projectPath || projectPath.trim() === '') {
    return null; // Não há path definido
  }

  try {
    // Verifica se o diretório existe
    if (!fs.existsSync(projectPath)) {
      return null; // Diretório não existe
    }

    // Verifica se é um repositório Git
    const gitPath = path.join(projectPath, '.git');
    if (!fs.existsSync(gitPath)) {
      return null; // Não é um repositório Git
    }

    return new Promise((resolve) => {
      exec('git branch --show-current', { 
        cwd: projectPath, 
        timeout: 5000,
        encoding: 'utf8'
      }, (error, stdout, stderr) => {
        if (error) {
          console.log(`[GIT] Erro ao obter branch para ${projectPath}: ${error.message}`);
          resolve(null);
          return;
        }

        const branch = stdout.trim();
        if (branch) {
          console.log(`[GIT] ${path.basename(projectPath)}: ${branch}`);
          resolve(branch);
        } else {
          console.log(`[GIT] Nenhuma branch para ${projectPath}`);
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.log(`[GIT] Erro geral ao verificar branch para ${projectPath}: ${error.message}`);
    return null;
  }
}

// ⚡ FUNÇÃO PARA OBTER BRANCHES DE TODOS OS PROJETOS DE FORMA SEGURA ⚡
async function getAllProjectsBranches(projects) {
  console.log('[GIT] Iniciando detecção de branches...');
  
  // Filtra apenas projetos que têm path definido
  const projectsWithPaths = projects.filter(project => 
    project.path && project.path.trim() !== ''
  );

  if (projectsWithPaths.length === 0) {
    console.log('[GIT] Nenhum projeto com path definido, pulando detecção de branches');
    return projects.map(project => ({
      ...project,
      gitBranch: null
    }));
  }

  try {
    console.log(`[GIT] Verificando branches para ${projectsWithPaths.length} projeto(s) com path`);
    
    const branchPromises = projects.map(async (project) => {
      if (!project.path || project.path.trim() === '') {
        return {
          ...project,
          gitBranch: null
        };
      }

      const branch = await getProjectGitBranch(project.path);
      return {
        ...project,
        gitBranch: branch
      };
    });

    const projectsWithBranches = await Promise.all(branchPromises);
    console.log('[GIT] Detecção de branches concluída');
    return projectsWithBranches;
  } catch (error) {
    console.log(`[GIT] Erro durante detecção de branches: ${error.message}`);
    // Em caso de erro, retorna projetos sem branches
    return projects.map(project => ({
      ...project,
      gitBranch: null
    }));
  }
}

// Função para limpar dados dinâmicos de Git dos projetos
function clearDynamicGitData(projects) {
  return projects.map(project => {
    const cleanProject = { ...project };
    // Remove dados dinâmicos que devem ser recalculados a cada execução
    delete cleanProject.pendingCommits;
    delete cleanProject.hasUpdates;
    // gitBranch também é dinâmico, mas pode ser mantido temporariamente para performance
    // delete cleanProject.gitBranch;
    return cleanProject;
  });
}

// ⚡ FUNÇÃO PARA FAZER GIT FETCH E VERIFICAR COMMITS PENDENTES ⚡
async function checkGitStatus(projectPath) {
  if (!projectPath || projectPath.trim() === '') {
    return { branch: null, pendingCommits: 0, hasUpdates: false };
  }

  try {
    // Verifica se é um repositório Git
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return { branch: null, pendingCommits: 0, hasUpdates: false };
    }

    // Primeiro obtém a branch atual
    const currentBranch = await getProjectGitBranch(projectPath);
    if (!currentBranch) {
      return { branch: null, pendingCommits: 0, hasUpdates: false };
    }

    return new Promise((resolve) => {
      console.log(`[GIT] Fazendo fetch para ${projectPath}...`);
      
      // Executa git fetch
      exec('git fetch', { 
        cwd: projectPath,
        timeout: 10000,
        encoding: 'utf8'
      }, (fetchError, fetchStdout, fetchStderr) => {
        if (fetchError) {
          console.log(`[GIT] Erro no fetch para ${projectPath}: ${fetchError.message}`);
          resolve({ branch: currentBranch, pendingCommits: 0, hasUpdates: false });
          return;
        }

        // Agora verifica quantos commits estão pendentes
        const revListCommand = `git rev-list HEAD..origin/${currentBranch} --count`;
        
        exec(revListCommand, {
          cwd: projectPath,
          timeout: 5000,
          encoding: 'utf8'
        }, (countError, countStdout, countStderr) => {
          if (countError) {
            console.log(`[GIT] Erro ao contar commits para ${projectPath}: ${countError.message}`);
            resolve({ branch: currentBranch, pendingCommits: 0, hasUpdates: false });
            return;
          }

          const pendingCommits = parseInt(countStdout.trim()) || 0;
          const hasUpdates = pendingCommits > 0;
          
          console.log(`[GIT] ${projectPath} - Branch: ${currentBranch}, Commits pendentes: ${pendingCommits}`);
          
          resolve({ 
            branch: currentBranch, 
            pendingCommits: pendingCommits,
            hasUpdates: hasUpdates
          });
        });
      });
    });
  } catch (error) {
    console.log(`[GIT] Erro geral ao verificar status Git para ${projectPath}: ${error.message}`);
    return { branch: null, pendingCommits: 0, hasUpdates: false };
  }
}

// ⚡ FUNÇÃO SIMPLES PARA VERIFICAR APENAS A BRANCH ATUAL ⚡
async function checkCurrentBranch(projectPath) {
  if (!projectPath || projectPath.trim() === '') {
    return null;
  }

  try {
    // Verifica se é um repositório Git
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return null;
    }

    return new Promise((resolve) => {
      exec('git branch --show-current', { 
        cwd: projectPath,
        timeout: 3000, // Timeout menor, só para verificar branch
        encoding: 'utf8'
      }, (error, stdout, stderr) => {
        if (error) {
          console.log(`[GIT] Erro ao verificar branch atual para ${projectPath}: ${error.message}`);
          resolve(null);
          return;
        }

        const branch = stdout.trim();
        if (branch) {
          console.log(`[GIT] Branch atual verificada para ${projectPath}: ${branch}`);
          resolve(branch);
        } else {
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.log(`[GIT] Erro ao verificar branch atual: ${error.message}`);
    return null;
  }
}

// ⚡ SISTEMA DE VERIFICAÇÃO GIT EM SEGUNDO PLANO ⚡
let backgroundGitRunning = false;
let backgroundGitQueue = [];

// Função principal para iniciar verificação Git em segundo plano
async function startBackgroundGitCheck() {
  if (backgroundGitRunning) {
    console.log('[GIT-BG] Verificação já está em execução, ignorando nova solicitação');
    return;
  }
  
  backgroundGitRunning = true;
  console.log('[GIT-BG] 🚀 Iniciando verificação Git em segundo plano...');
  
  // Filtra projetos que têm path e branch definidos
  const projectsToCheck = projects.filter(project => 
    project.path && 
    project.path.trim() !== '' && 
    project.gitBranch
  );
  
  console.log(`[GIT-BG] 📋 ${projectsToCheck.length} projetos serão verificados em segundo plano`);
  
  // Processa projetos de forma assíncrona, um por vez para não sobrecarregar
  for (let i = 0; i < projectsToCheck.length; i++) {
    const project = projectsToCheck[i];
    const projectIndex = projects.findIndex(p => p.name === project.name);
    
    if (projectIndex === -1) continue;
    
    console.log(`[GIT-BG] 🔍 Verificando ${project.name} (${i + 1}/${projectsToCheck.length})`);
    
    try {
      // Executa checkGitStatus em segundo plano
      const gitStatus = await checkGitStatus(project.path);
      
      // Atualiza o projeto na lista global
      projects[projectIndex] = {
        ...projects[projectIndex],
        gitBranch: gitStatus.branch || projects[projectIndex].gitBranch,
        pendingCommits: gitStatus.pendingCommits,
        hasUpdates: gitStatus.hasUpdates
      };
      
      // Notifica a UI sobre a atualização específica deste projeto
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log(`[GIT-BG] ✅ ${project.name} - Commits pendentes: ${gitStatus.pendingCommits}`);
        mainWindow.webContents.send('git-status-updated', {
          projectIndex,
          gitStatus: {
            branch: gitStatus.branch,
            pendingCommits: gitStatus.pendingCommits,
            hasUpdates: gitStatus.hasUpdates
          }
        });
        console.log(`[GIT-BG] 📡 IPC enviado para UI: projeto ${projectIndex}`);
      }
      
      // Pequeno delay para não sobrecarregar o sistema
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.log(`[GIT-BG] ❌ Erro ao verificar ${project.name}: ${error.message}`);
    }
  }
  
  backgroundGitRunning = false;
  console.log('[GIT-BG] 🎉 Verificação Git em segundo plano concluída!');
}

// Função para atualizar um projeto específico em segundo plano
async function updateProjectGitStatus(projectIndex) {
  const project = projects[projectIndex];
  if (!project || !project.path || !project.gitBranch) {
    return;
  }
  
  console.log(`[GIT-BG] 🔄 Atualizando status Git para ${project.name}...`);
  
  try {
    const gitStatus = await checkGitStatus(project.path);
    
    // Atualiza o projeto na lista global
    projects[projectIndex] = {
      ...projects[projectIndex],
      gitBranch: gitStatus.branch || projects[projectIndex].gitBranch,
      pendingCommits: gitStatus.pendingCommits,
      hasUpdates: gitStatus.hasUpdates
    };
    
    // Notifica a UI sobre a atualização
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('git-status-updated', {
        projectIndex,
        gitStatus: {
          branch: gitStatus.branch,
          pendingCommits: gitStatus.pendingCommits,
          hasUpdates: gitStatus.hasUpdates
        }
      });
    }
    
    console.log(`[GIT-BG] ✅ ${project.name} atualizado - Commits pendentes: ${gitStatus.pendingCommits}`);
    
  } catch (error) {
    console.log(`[GIT-BG] ❌ Erro ao atualizar ${project.name}: ${error.message}`);
  }
}

// ⚡ FUNÇÃO PARA VERIFICAR BRANCH E FETCH ANTES DE INICIAR PROJETO ⚡
async function checkGitBeforeStart(projectPath) {
  if (!projectPath || projectPath.trim() === '') {
    return { branch: null, pendingCommits: 0, hasUpdates: false, changed: false };
  }

  try {
    // Verifica se é um repositório Git
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return { branch: null, pendingCommits: 0, hasUpdates: false, changed: false };
    }

    console.log(`[START-GIT] 🔍 Verificando branch e fetch para ${projectPath}...`);

    // Primeiro obtém a branch atual
    const currentBranch = await getProjectGitBranch(projectPath);
    if (!currentBranch) {
      return { branch: null, pendingCommits: 0, hasUpdates: false, changed: false };
    }

    // Verifica se a branch mudou comparando com o que estava salvo
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    let branchChanged = false;
    
    if (projectIndex !== -1) {
      const previousBranch = projects[projectIndex].gitBranch;
      branchChanged = currentBranch !== previousBranch;
      
      if (branchChanged) {
        console.log(`[START-GIT] 🔄 Branch mudou de '${previousBranch}' para '${currentBranch}'`);
      } else {
        console.log(`[START-GIT] ✅ Branch continua sendo: ${currentBranch}`);
      }
    }

    return new Promise((resolve) => {
      // Executa git fetch
      console.log(`[START-GIT] 📡 Fazendo fetch para verificar atualizações...`);
      exec('git fetch', { 
        cwd: projectPath,
        timeout: 10000,
        encoding: 'utf8'
      }, (fetchError, fetchStdout, fetchStderr) => {
        if (fetchError) {
          console.log(`[START-GIT] ⚠️ Erro no fetch para ${projectPath}: ${fetchError.message}`);
          resolve({ 
            branch: currentBranch, 
            pendingCommits: 0, 
            hasUpdates: false, 
            changed: branchChanged 
          });
          return;
        }

        console.log(`[START-GIT] ✅ Fetch concluído, verificando commits pendentes...`);

        // Agora verifica quantos commits estão pendentes
        const revListCommand = `git rev-list HEAD..origin/${currentBranch} --count`;
        
        exec(revListCommand, {
          cwd: projectPath,
          timeout: 5000,
          encoding: 'utf8'
        }, (countError, countStdout, countStderr) => {
          if (countError) {
            console.log(`[START-GIT] ⚠️ Erro ao contar commits para ${projectPath}: ${countError.message}`);
            resolve({ 
              branch: currentBranch, 
              pendingCommits: 0, 
              hasUpdates: false, 
              changed: branchChanged 
            });
            return;
          }

          const pendingCommits = parseInt(countStdout.trim()) || 0;
          const hasUpdates = pendingCommits > 0;
          
          console.log(`[START-GIT] 📊 Resultado: Branch=${currentBranch}, Commits pendentes=${pendingCommits}, Changed=${branchChanged}`);
          
          resolve({ 
            branch: currentBranch, 
            pendingCommits: pendingCommits,
            hasUpdates: hasUpdates,
            changed: branchChanged
          });
        });
      });
    });
  } catch (error) {
    console.log(`[START-GIT] ❌ Erro geral ao verificar Git para ${projectPath}: ${error.message}`);
    return { branch: null, pendingCommits: 0, hasUpdates: false, changed: false };
  }
}

// Impede múltiplas instâncias do app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguém tentou executar uma segunda instância, foca na janela existente
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

require('events').EventEmitter.defaultMaxListeners = 50;

// Funções para gerenciar configurações (OTIMIZADAS COM CACHE)
function getDefaultConfig() {
  return {
    darkMode: false,
    projectOrder: [], // Array para armazenar a ordem customizada dos projetos (deprecated)
    pasOrder: [], // Ordem específica dos projetos PAS
    pampOrder: [] // Ordem específica dos projetos PAMP
  };
}

function saveConfig(config) {
  const dir = path.dirname(configFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
  
  // Atualiza cache
  appCache.config = config;
  saveAppCache();
}

function loadConfig() {
  // Usa cache se disponível
  if (appCache.config) {
    return appCache.config;
  }
  
  if (fs.existsSync(configFile)) {
    try {
      const data = fs.readFileSync(configFile, 'utf-8');
      const config = JSON.parse(data);
      // Mescla com configurações padrão para garantir que todas as propriedades existam
      const finalConfig = { ...getDefaultConfig(), ...config };
      
      // Salva no cache
      appCache.config = finalConfig;
      
      return finalConfig;
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      const defaultConfig = getDefaultConfig();
      appCache.config = defaultConfig;
      return defaultConfig;
    }
  }
  
  const defaultConfig = getDefaultConfig();
  appCache.config = defaultConfig;
  return defaultConfig;
}

function updateConfigProperty(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
  return config;
}

// Salva o estado de login (OTIMIZADO COM CACHE)
function saveLoginState(isLoggedIn) {
  const dir = path.dirname(loginStateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const loginState = { isLoggedIn, timestamp: Date.now() };
  fs.writeFileSync(loginStateFile, JSON.stringify(loginState, null, 2), 'utf-8');
  
  // Atualiza cache
  appCache.loginState = loginState;
  saveAppCache();
  
  console.log(`[SAVE] Estado de login salvo: ${isLoggedIn}`);
}

// Carrega o estado de login (OTIMIZADO COM CACHE)
function loadLoginState() {
  // Usa cache se disponível
  if (appCache.loginState) {
    return appCache.loginState;
  }
  
  if (fs.existsSync(loginStateFile)) {
    const data = fs.readFileSync(loginStateFile, 'utf-8');
    const loginState = JSON.parse(data);
    
    // Salva no cache
    appCache.loginState = loginState;
    
    return loginState.isLoggedIn;
  }
  
  const defaultState = { isLoggedIn: false };
  appCache.loginState = defaultState;
  return false;
}

function checkNexusLoginStatus() {
  return new Promise((resolve) => {
    console.log('🔍 [DEBUG] Iniciando verificação de login...');
    console.log('🔍 [DEBUG] Total de projetos carregados:', projects.length);
    
    // Debug detalhado dos projetos
    projects.forEach((project, index) => {
      console.log(`🔍 [DEBUG] Projeto ${index}:`, {
        name: project.name || 'Sem nome',
        path: project.path || 'Sem path',
        pathExists: project.path ? fs.existsSync(project.path) : false,
        npmrcExists: project.path ? fs.existsSync(path.join(project.path, '.npmrc')) : false
      });
    });

    const mfePaths = projects
      .filter(
        (project) =>
          typeof project.path === 'string' &&
          project.path.trim() !== "" &&
          fs.existsSync(project.path) &&
          fs.existsSync(path.join(project.path, '.npmrc'))
      )
      .map((project) => project.path);

    console.log('🔍 [DEBUG] Projetos válidos com .npmrc:', mfePaths.length);
    mfePaths.forEach((path, index) => {
      console.log(`🔍 [DEBUG] Path válido ${index}: ${path}`);
    });

    if (mfePaths.length === 0) {
      console.log('❌ [DEBUG] Nenhum projeto com .npmrc encontrado para verificar login.');
      resolve({ isLoggedIn: false, reason: 'no-projects', username: null });
      return;
    }

    const projectPath = mfePaths[0];
    const npmrcPath = path.join(projectPath, '.npmrc');
    let registry = 'http://nexus.viavarejo.com.br/repository/npm-marketplace/';
    
    console.log(`🔍 [DEBUG] Usando projeto: ${projectPath}`);
    
    if (fs.existsSync(npmrcPath)) {
      const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
      console.log(`🔍 [DEBUG] Conteúdo .npmrc (primeiras 100 chars): ${npmrcContent.substring(0, 100)}...`);
      if (npmrcContent.includes('https://')) {
        registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/';
      }
    }

    console.log(`🔍 [DEBUG] Registry detectado: ${registry}`);

    // Primeiro tenta npm whoami
    console.log('🔍 [DEBUG] Executando npm whoami...');
    exec(`npm whoami --registry=${registry}`, { cwd: projectPath, timeout: 10000 }, (whoamiErr, whoamiStdout, whoamiStderr) => {
      console.log('🔍 [DEBUG] npm whoami resultado:', {
        erro: whoamiErr?.message,
        stdout: whoamiStdout?.trim(),
        stderr: whoamiStderr?.trim()
      });

      if (!whoamiErr && whoamiStdout && whoamiStdout.trim()) {
        const username = whoamiStdout.trim();
        console.log(`✅ [DEBUG] Login verificado via whoami: ${username}`);
        resolve({ isLoggedIn: true, reason: 'whoami-success', username: username, registry: registry });
        return;
      }

      console.log(`⚠️ [DEBUG] npm whoami falhou, tentando npm ping...`);
      
      // Se whoami falhar, tenta npm ping
      exec(`npm ping --registry=${registry}`, { cwd: projectPath, timeout: 10000 }, (pingErr, pingStdout, pingStderr) => {
        console.log('🔍 [DEBUG] npm ping resultado:', {
          erro: pingErr?.message,
          stdout: pingStdout?.trim(),
          stderr: pingStderr?.trim()
        });

        if (!pingErr && pingStdout && pingStdout.includes('PONG')) {
          console.log('⚠️ [DEBUG] npm ping bem-sucedido, mas usuário pode não estar logado');
          resolve({ isLoggedIn: false, reason: 'ping-success-no-auth', username: null, registry: registry });
          return;
        }

        console.log('❌ [DEBUG] Ambos whoami e ping falharam, usuário provavelmente não está logado');
        resolve({ isLoggedIn: false, reason: 'both-failed', username: null, registry: registry });
      });
    });
  });
}

function handleNpmLogin() {
  return new Promise((resolve, reject) => {
    console.log('Iniciando verificação de status de login no Nexus...');
    
    // Mostra uma mensagem de "verificando" para o usuário
    mainWindow.webContents.send('log', { message: 'Verificando status de login no Nexus...' });

    checkNexusLoginStatus().then(({ isLoggedIn, reason, username, registry }) => {
      if (isLoggedIn) {
        // Usuário já está logado
        console.log(`Usuário já está logado no Nexus: ${username}`);
        mainWindow.webContents.send('log', { message: `✓ Você já está logado no Nexus como: ${username}` });
        
        // Salva o estado de login
        saveLoginState(true);
        
        // Mostra dialog informativo
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Login já realizado',
          message: `Você já está logado no Nexus!`,
          detail: `Usuário: ${username}\nRegistry: ${registry}\n\nNão é necessário fazer login novamente.`,
          buttons: ['OK']
        }).then(() => resolve()).catch(() => resolve());
        
        return;
      }

      // Usuário não está logado, procede com o login
      console.log(`Login necessário. Motivo: ${reason}`);
      
      if (reason === 'no-projects') {
        mainWindow.webContents.send('log', { message: 'Erro: Nenhum projeto com arquivo .npmrc encontrado para login no npm.' });

        // Mostra um alerta nativo para o usuário
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Atenção',
          message: 'Você precisa ter pelo menos um projeto salvo e o caminho configurado corretamente antes de fazer login no npm.',
          buttons: ['OK']
        }).then(() => resolve()).catch(() => resolve());
        return;
      }

      // Continua com o processo de login
      performNpmLogin(registry);
      resolve();
    }).catch((error) => {
      console.error('Erro ao verificar status de login:', error);
      mainWindow.webContents.send('log', { message: `Erro ao verificar login: ${error.message}. Prosseguindo com login...` });
      
      // Em caso de erro na verificação, procede com login usando lógica antiga
      performNpmLoginFallback();
      resolve();
    });
  });
}

function performNpmLogin(registry) {
  const mfePaths = projects
    .filter(
      (project) =>
        typeof project.path === 'string' &&
        project.path.trim() !== "" &&
        fs.existsSync(project.path) &&
        fs.existsSync(path.join(project.path, '.npmrc'))
    )
    .map((project) => project.path);

  const projectPath = mfePaths[0];

  console.log(`Iniciando processo de login no registry: ${registry}`);
  mainWindow.webContents.send('log', { message: `Iniciando login no Nexus (${registry})...` });

  // Limpa qualquer processo anterior antes de criar nova janela
  cleanupLoginProcesses();

  // Se já existe uma janela de login, fecha ela primeiro
  if (loginWindow && !loginWindow.isDestroyed()) {
    console.log('[CLOSE] Fechando janela de login anterior...');
    loginWindow.destroy();
    loginWindow = null;
  }

  // Cria uma nova janela para o terminal
  loginWindow = new BrowserWindow({
    width: 600,
    height: 400,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
  });

  loginWindow.loadFile(path.join(__dirname, 'login.html'));

  // Event handlers para cleanup quando a janela for fechada
  loginWindow.on('closed', () => {
    console.log('🔴 Janela de login foi fechada pelo usuário');
    cleanupLoginProcesses();
    loginWindow = null;
  });

  loginWindow.on('close', () => {
    console.log('🔴 Janela de login está sendo fechada');
    cleanupLoginProcesses();
  });

  // Event handler para caso a janela trave
  loginWindow.webContents.on('unresponsive', () => {
    console.log('⚠️ Janela de login não está respondendo');
    cleanupLoginProcesses();
  });

  // Event handler para erros na janela
  loginWindow.webContents.on('crashed', () => {
    console.log('💥 Janela de login crashou');
    cleanupLoginProcesses();
    loginWindow = null;
  });

  loginWindow.webContents.once('did-finish-load', () => {
    loginWindow.webContents.send('start-npm-login', { projectPath, registry });
    
    // Timeout de segurança - se o login não completar em 10 minutos, limpa tudo
    loginTimeout = setTimeout(() => {
      console.log('⏰ Timeout de login atingido - limpando processos...');
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.webContents.send('command-output', '\n⏰ Timeout de login atingido. Fechando janela...\n');
        setTimeout(() => {
          cleanupLoginProcesses();
          if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.close();
          }
        }, 2000);
      }
    }, 10 * 60 * 1000); // 10 minutos
  });

  ipcMain.once('npm-login-complete', (event, { success, message }) => {
    console.log(`🔚 Login completado - sucesso: ${success}, mensagem: ${message}`);
    
    // Limpa o timeout
    if (loginTimeout) {
      clearTimeout(loginTimeout);
      loginTimeout = null;
    }
    
    if (success) {
      console.log('✅ Login no npm realizado com sucesso!');
      mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
      saveLoginState(true);
    } else {
      console.error('❌ Erro ao realizar login no npm:', message);
      mainWindow.webContents.send('log', { message: `Erro no login: ${message}` });
    }
    
    // Limpa processos e fecha janela
    cleanupLoginProcesses();
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
    }
    loginWindow = null;
  });

  ipcMain.on('close-login-window', () => {
    console.log('🔴 Solicitação para fechar janela de login');
    
    // Limpa todos os processos antes de fechar
    cleanupLoginProcesses();
    
    // Fecha a janela de forma segura
    if (loginWindow && !loginWindow.isDestroyed()) {
      try {
        loginWindow.close();
        console.log('✅ Janela de login fechada');
      } catch (error) {
        console.error('❌ Erro ao fechar janela de login:', error);
        // Força o fechamento se houver erro
        if (loginWindow && !loginWindow.isDestroyed()) {
          loginWindow.destroy();
        }
      }
    }
    
    loginWindow = null;
  });
}

function performNpmLoginFallback() {
  // Lógica de fallback usando a implementação original
  const mfePaths = projects
    .filter(
      (project) =>
        typeof project.path === 'string' &&
        project.path.trim() !== "" &&
        fs.existsSync(project.path) &&
        fs.existsSync(path.join(project.path, '.npmrc'))
    )
    .map((project) => project.path);

  if (mfePaths.length === 0) {
    console.error('Nenhum projeto com arquivo .npmrc encontrado para login no npm.');
    mainWindow.webContents.send('log', { message: 'Erro: Nenhum projeto com arquivo .npmrc encontrado para login no npm.' });

    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Atenção',
      message: 'Você precisa ter pelo menos um projeto salvo e o caminho configurado corretamente antes de fazer login no npm.',
      buttons: ['OK']
    });
    return;
  }

  const projectPath = mfePaths[0];
  const npmrcPath = path.join(projectPath, '.npmrc');
  let registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/';
  if (fs.existsSync(npmrcPath)) {
    const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
    if (npmrcContent.includes('http://')) {
      registry = 'http://nexus.viavarejo.com.br/repository/npm-marketplace/';
    }
  }

  performNpmLogin(registry);
}

// Função para abrir a janela de configurações
let configWindow = null;

function openConfigWindow() {
  // Se já existe uma janela de configurações, apenas foca nela
  if (configWindow && !configWindow.isDestroyed()) {
    configWindow.focus();
    return;
  }

  configWindow = new BrowserWindow({
    width: 800,
    height: 600,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    resizable: false,
    titleBarStyle: 'hidden',
    show: false, // Não mostra a janela imediatamente
  });

  // Carrega o arquivo e mostra a janela quando estiver pronta
  configWindow.loadFile(path.join(__dirname, 'configs.html'));

  configWindow.webContents.once('did-finish-load', () => {
    console.log('Janela de configurações carregada.');
    // Mostra a janela com uma pequena animação
    configWindow.show();
    configWindow.focus();
    
    // Timeout de segurança para garantir que a janela seja mostrada
    setTimeout(() => {
      if (configWindow && !configWindow.isDestroyed()) {
        configWindow.webContents.executeJavaScript(`
          if (typeof forceHideLoading === 'function') {
            console.log('🚨 Executando timeout de segurança');
            forceHideLoading();
          }
        `).catch(err => {
          console.log('Erro ao executar JavaScript de segurança:', err.message);
        });
      }
    }, 3000);
  });

  // Limpa a referência quando a janela for fechada e reabilita o menu
  configWindow.on('closed', () => {
    configWindow = null;
    const menuItem = appMenu ? appMenu.getMenuItemById('open-config') : null;
    if (menuItem) {
      menuItem.label = '🔧 Configurações';
      menuItem.enabled = true;
    }
  });
}

// Função para instalar dependências
function handleInstallDependencies() {
  const installWindow = new BrowserWindow({
    width: 600,
    height: 400,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
  });

  installWindow.loadFile('install.html');

  installWindow.webContents.once('did-finish-load', () => {
    console.log('A janela de instalação foi carregada.');
    installWindow.webContents.send('start-installation');
  });

  // Tratamento seguro para fechamento da janela
  const closeHandler = () => {
    if (!installWindow.isDestroyed()) {
      try {
        installWindow.close();
        console.log('✅ Janela de instalação fechada com sucesso');
      } catch (error) {
        console.error('Erro ao fechar janela de instalação:', error);
      }
    }
  };

  // Listener único para esta instância da janela
  const closeListener = () => {
    closeHandler();
    ipcMain.removeListener('close-install-window', closeListener);
  };

  ipcMain.once('close-install-window', closeListener);

  // Quando a janela de instalação é fechada, reabilita o menu
  installWindow.on('closed', () => {
    const menuItem = appMenu ? appMenu.getMenuItemById('install-deps') : null;
    if (menuItem) {
      menuItem.label = 'Instalar Dependências';
      menuItem.enabled = true;
    }
    // Remove o listener se ainda existir
    ipcMain.removeListener('close-install-window', closeListener);
    console.log('🧹 Limpeza de handlers da janela de instalação concluída');
  });

  // Tratamento para quando a janela é fechada via [x] - PREVINE TRAVAMENTO
  installWindow.on('close', (event) => {
    console.log('Janela de instalação sendo fechada pelo usuário...');
    // Não previne o fechamento - deixa fechar normalmente
  });

  // Tratamento para quando a janela é destruída - PREVINE VAZAMENTOS
  installWindow.on('destroy', () => {
    console.log('Janela de instalação destruída - removendo handlers');
    ipcMain.removeListener('close-install-window', closeListener);
  });

  // Tratamento para erros não capturados
  installWindow.webContents.on('crashed', () => {
    console.error('Janela de instalação teve crash');
    if (!installWindow.isDestroyed()) {
      installWindow.close();
    }
  });

  // Tratamento para contexto não responsivo
  installWindow.webContents.on('unresponsive', () => {
    console.warn('Janela de instalação não está respondendo');
  });

  installWindow.webContents.on('responsive', () => {
    console.log('Janela de instalação voltou a responder');
  });
}

let mainWindow;
let loginWindow = null;
let splashWindow;
let appMenu; // Referência global do menu para uso nas funções
const projectsFile = path.join(userDataPath, 'projects.txt');
let runningProcesses = {}; // Armazena os processos em execução
let canceledProjects = new Set(); // Controla projetos que foram cancelados

// Função utilitária para dialogs seguros
function safeDialog(options) {
  return new Promise((resolve, reject) => {
    try {
      // Verifica se a janela principal ainda existe e não foi destruída
      if (!mainWindow || mainWindow.isDestroyed()) {
        resolve({ response: 0 }); // Default to "OK" or first option
        return;
      }

      dialog.showMessageBox(mainWindow, options)
        .then((result) => resolve(result))
        .catch((error) => {
          console.error('Dialog error:', error);
          resolve({ response: 0 }); // Safe fallback
        });
        
    } catch (error) {
      console.error('Dialog creation error:', error);
      resolve({ response: 0 }); // Safe fallback
    }
  });
}

// Função global para verificar Git (pode ser usada independentemente)
function checkGitGlobal() {
  try {
    execSync('git --version', { encoding: 'utf8' });
    return true;
  } catch (error) {
    return false;
  }
}

function removeAnsiCodes(input) {
  return input.replace(
    /[\u001b\u009b][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><])/g,
    ''
  );
}

function loadProjects() {
  const defaultProjects = [
    { name: 'mp-pas-root', path: '', port: 9000 },
    { name: 'mp-pas-navbar', path: '', port: 9001 },
    { name: 'mp-pas-home', path: '', port: 9002 },
    { name: 'mp-pas-marketplace', path: '', port: 9003 },
    { name: 'mp-pas-configuracoes', path: '', port: 9004 },
    { name: 'mp-pas-financeiro', path: '', port: 9005 },
    { name: 'mp-pas-vendas', path: '', port: 9006 },
    { name: 'mp-pas-catalogo', path: '', port: 9007 },
    { name: 'mp-pas-logistica', path: '', port: 9008 },
    { name: 'mp-pas-comercial', path: '', port: 9009 },
    { name: 'mp-pas-via-performance', path: '', port: 9011 },
    { name: 'mp-pas-atendimento', path: '', port: 9012 },
    { name: 'mp-pamp', path: '', port: 4200 },
    { name: 'mp-pamp-setup', path: '', port: '' },
    { name: 'mp-pamp-comercial', path: '', port: '' },
    { name: 'mp-pamp-vendas', path: '', port: '' },
    { name: 'mp-pamp-catalogo', path: '', port: '' },
    { name: 'mp-pamp-marketplace', path: '', port: '' }
  ];

  let loadedProjects = defaultProjects;

  if (fs.existsSync(projectsFile)) {
    const data = fs.readFileSync(projectsFile, 'utf-8');
    if (data.trim()) {
      const savedProjects = JSON.parse(data);

      // Mescla os projetos salvos com os padrões
      loadedProjects = defaultProjects.map((defaultProject) => {
        const savedProject = savedProjects.find(
          (project) => project.name === defaultProject.name
        );
        return savedProject
          ? { ...defaultProject, ...savedProject } // Substitui os valores padrão pelos salvos
          : defaultProject; // Mantém os valores padrão
      });
    }
  }

  // Aplica a ordem customizada antes de retornar
  return applyCustomProjectOrder(loadedProjects);
}

// Função para salvar os projetos
function saveProjects(projects) {
  const dir = path.dirname(projectsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
}

// Função para aplicar ordem customizada dos projetos (NOVA VERSÃO)
function applyCustomProjectOrder(projects) {
  // FORÇA UMA RELEITURA FRESH DA CONFIGURAÇÃO (sem cache)
  let config;
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf-8');
      config = JSON.parse(data);
      // Mescla com configurações padrão para garantir que todas as propriedades existam
      config = { ...getDefaultConfig(), ...config };
    } else {
      config = getDefaultConfig();
    }
  } catch (error) {
    console.error('Erro ao carregar configuração fresh:', error);
    config = getDefaultConfig();
  }
  
  console.log('[RELOAD] Aplicando ordenacao personalizada dos projetos');
  
  // Separa projetos PAS e PAMP
  const pasProjects = projects.filter(p => p.name && !p.name.startsWith('mp-pamp'));
  const pampProjects = projects.filter(p => p.name && p.name.startsWith('mp-pamp'));
  
  // Aplica ordem personalizada aos projetos PAS
  let orderedPasProjects = [];
  if (config.pasOrder && config.pasOrder.length > 0) {
    console.log('[TARGET] Aplicando ordem personalizada PAS: ' + JSON.stringify(config.pasOrder));
    // Primeiro, adiciona projetos na ordem salva
    config.pasOrder.forEach(projectName => {
      const project = pasProjects.find(p => p.name === projectName);
      if (project && !orderedPasProjects.includes(project)) {
        orderedPasProjects.push(project);
      }
    });
    
    // Depois, adiciona projetos que não estão na ordem salva (novos projetos)
    pasProjects.forEach(project => {
      if (!orderedPasProjects.includes(project)) {
        orderedPasProjects.push(project);
      }
    });
  } else {
    console.log('[FOLDER] Usando ordem padrao para projetos PAS');
    orderedPasProjects = pasProjects;
  }
  
  // Aplica ordem personalizada aos projetos PAMP
  let orderedPampProjects = [];
  if (config.pampOrder && config.pampOrder.length > 0) {
    console.log('[FOLDER] Aplicando ordem personalizada PAMP: ' + JSON.stringify(config.pampOrder));
    // Primeiro, adiciona projetos na ordem salva
    config.pampOrder.forEach(projectName => {
      const project = pampProjects.find(p => p.name === projectName);
      if (project && !orderedPampProjects.includes(project)) {
        orderedPampProjects.push(project);
      }
    });
    
    // Depois, adiciona projetos que não estão na ordem salva (novos projetos)
    pampProjects.forEach(project => {
      if (!orderedPampProjects.includes(project)) {
        orderedPampProjects.push(project);
      }
    });
  } else {
    console.log('[FOLDER] Usando ordem padrao para projetos PAMP');
    orderedPampProjects = pampProjects;
  }
  
  // Combina projetos ordenados: PAS primeiro, depois PAMP
  return [...orderedPasProjects, ...orderedPampProjects];
}

// Nova função para aplicar ordenação aos projetos em memória
function applyProjectOrdering() {
  console.log('[RELOAD] Reaplicando ordenacao dos projetos...');
  projects = applyCustomProjectOrder(projects);
  console.log('[SUCCESS] Ordenacao aplicada aos projetos em memoria');
}

// Função para salvar ordem customizada dos projetos (DEPRECIADA - mantida para compatibilidade)
function saveCustomProjectOrder(projectOrder) {
  console.log('⚠️  Função saveCustomProjectOrder está depreciada. Use a nova configuração separada para PAS e PAMP.');
  const config = loadConfig();
  config.projectOrder = projectOrder;
  saveConfig(config);
  console.log('💾 Ordem customizada dos projetos salva (modo compatibilidade):', projectOrder);
}

let projects = clearDynamicGitData(loadProjects());
let startingProjects = new Set(); // Para controlar projetos que estão sendo iniciados

// Funções para controlar cancelamento de projetos
function markProjectAsCanceled(projectPath) {
  canceledProjects.add(projectPath);
  console.log(`Projeto marcado como cancelado: ${projectPath}`);
}

function unmarkProjectAsCanceled(projectPath) {
  canceledProjects.delete(projectPath);
  console.log(`Projeto desmarcado como cancelado: ${projectPath}`);
}

function isProjectCanceled(projectPath) {
  return canceledProjects.has(projectPath);
}

function checkCancelationAndExit(projectPath, stepName) {
  if (isProjectCanceled(projectPath)) {
    console.log(`⛔ Execução interrompida em ${stepName} para ${projectPath} (projeto foi cancelado)`);
    return true;
  }
  return false;
}

// Função para criar a splash screen
function createSplashWindow() {
  safeLog('[TOOL] Criando splash screen...');
  splashWindow = new BrowserWindow({
    width: 520, // Aumentado de 500 para evitar barra de rolagem
    height: 420, // Aumentado de 400 para mais espaço
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#1e1e1e', // Fundo de fallback
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Impede throttling
    },
    icon: path.join(__dirname, 'OIP.ico'),
    show: true, // Mostra imediatamente
    center: true,
    resizable: false,
    skipTaskbar: true
  });

  safeLog('[FOLDER] Carregando splash.html...');
  
  // Alternativa: carrega HTML diretamente na memória com conteúdo garantido
  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
                color: white;
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                height: 100vh;
                text-align: center;
                overflow: hidden; /* Remove barra de rolagem */
                box-sizing: border-box;
                transition: background 0.3s, color 0.3s;
            }
            
            /* Tema claro */
            body.light-mode {
                background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%) !important;
                color: #222222 !important;
            }
            
            .logo { 
                font-size: 24px; 
                margin-bottom: 20px;
                background: linear-gradient(45deg, #0033C6, #E31233);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            .spinner {
                border: 4px solid #333;
                border-top: 4px solid #0033C6;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px 0;
            }
            body.light-mode .spinner {
                border: 4px solid #cccccc;
                border-top: 4px solid #0033C6;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .progress-bar {
                width: 300px;
                height: 4px;
                background: #333;
                margin: 20px 0;
                border-radius: 2px;
                overflow: hidden;
            }
            body.light-mode .progress-bar {
                background: #cccccc;
            }
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #0033C6, #E31233);
                width: 0%;
                transition: width 0.5s ease;
            }
            .loading-text {
                color: #00ff00;
                margin: 10px 0;
            }
            body.light-mode .loading-text {
                color: #00aa00;
            }
            .status {
                color: #888888;
                font-size: 14px;
                margin-top: 10px;
            }
            body.light-mode .status {
                color: #666666;
            }
        </style>
    </head>
    <body>
        <div class="logo">Micro Front-End Manager</div>
        <div class="spinner"></div>
        <div class="loading-text">Carregando aplicação...</div>
        <div class="progress-bar">
            <div class="progress-fill" id="progress"></div>
        </div>
        <div class="status" id="status">Inicializando...</div>
        
        <script>
            console.log('Splash screen carregada!');
            const { ipcRenderer } = require('electron');
            
            let progress = 0;
            const progressBar = document.getElementById('progress');
            const status = document.getElementById('status');
            
            const steps = [
                'Inicializando sistema...',
                'Carregando configurações...',
                'Verificando Node.js...',
                'Verificando Angular CLI...',
                'Verificando dependências...',
                'Preparando interface...',
                'Finalizando...'
            ];
            
            let currentStep = 0;
            
            function updateProgress() {
                if (currentStep < steps.length) {
                    status.textContent = steps[currentStep];
                    progress = ((currentStep + 1) / steps.length) * 90;
                    progressBar.style.width = progress + '%';
                    currentStep++;
                    setTimeout(updateProgress, 800);
                }
            }
            
            // Função para aplicar tema
            function applyTheme(isDark) {
                console.log('Aplicando tema na splash:', isDark ? 'escuro' : 'claro');
                if (isDark) {
                    document.body.classList.remove('light-mode');
                } else {
                    document.body.classList.add('light-mode');
                }
            }
            
            // Listener para tema
            ipcRenderer.on('apply-dark-mode', (event, isDarkMode) => {
                applyTheme(isDarkMode);
            });
            
            // Inicia imediatamente
            updateProgress();
            
            // Listener para fechar
            ipcRenderer.on('main-app-ready', () => {
                progressBar.style.width = '100%';
                status.textContent = 'Pronto!';
                setTimeout(() => {
                    ipcRenderer.send('close-splash');
                }, 500);
            });
        </script>
    </body>
    </html>
  `;
  
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  
  splashWindow.webContents.once('did-finish-load', () => {
    console.log('💡 Splash screen HTML carregado diretamente');
    splashWindow.focus();
    
    // Detecta e aplica o tema atual usando a função loadConfig() existente
    try {
      const config = loadConfig(); // Usa a função que já salva na pasta do usuário
      const isDarkMode = config.darkMode === true; // Por padrão é false (tema claro)
      
      console.log(`🎨 Aplicando tema na splash: ${isDarkMode ? 'escuro' : 'claro'} (config.darkMode: ${config.darkMode})`);
      
      // Aguarda um pouco para garantir que o DOM esteja pronto
      setTimeout(() => {
        splashWindow.webContents.send('apply-dark-mode', isDarkMode);
      }, 200);
      
    } catch (error) {
      console.log('Erro ao aplicar tema na splash:', error);
    }
    
    // DELAY MAIOR para garantir que a splash seja vista
    console.log('⏳ Aguardando 3 segundos antes de iniciar app principal...');
    setTimeout(initializeMainApp, 3000); // Aumentado para 3000ms
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// Função para inicializar a aplicação principal (OTIMIZADA)
async function initializeMainApp() {
  console.log('[START] Iniciando aplicacao principal com otimizacoes...');
  const startTime = Date.now();
  
  // Carrega cache se ainda não foi carregado
  if (!appCache.projects) {
    loadAppCache();
  }
  
  // Executa pré-carregamento se necessário
  if (!appCache.projects || !appCache.nodeInfo || !appCache.angularInfo) {
    await preloadCriticalData();
  }
  
  // Usa dados do cache
  let isLoggedIn = appCache.loginState ? appCache.loginState.isLoggedIn : loadLoginState();
  let nodeVersion = null;
  let nodeWarning = null;
  let angularVersion = null;
  let angularWarning = null;
  
  // Usa informações em cache se disponíveis
  if (appCache.nodeInfo && appCache.nodeInfo.available) {
    nodeVersion = appCache.nodeInfo.version;
    if (nodeVersion !== 'v16.10.0') {
      nodeWarning = `A versão ideal do Node.js é v16.10.0. A versão atual é ${nodeVersion}, o que pode causar problemas.`;
    }
  } else {
    // Fallback para verificação síncrona apenas se não tiver cache
    try {
      const isNodeInPath = process.env.PATH.split(path.delimiter).some((dir) => {
        const nodePath = path.join(dir, 'node' + (os.platform() === 'win32' ? '.exe' : ''));
        return fs.existsSync(nodePath);
      });

      if (isNodeInPath) {
        nodeVersion = execSync('node -v', { timeout: 3000 }).toString().trim();
        if (nodeVersion !== 'v16.10.0') {
          nodeWarning = `A versão ideal do Node.js é v16.10.0. A versão atual é ${nodeVersion}, o que pode causar problemas.`;
        }
      }
    } catch (err) {
      console.error('Node.js não está disponível:', err.message);
      nodeVersion = null;
    }
  }
  
  // Não faz verificação síncrona do Angular CLI na inicialização
  // Deixa que seja verificado apenas quando solicitado via IPC
  // Isso evita o problema de cache incorreto e bloqueios na inicialização
  console.log('🔍 Angular CLI será verificado em tempo real quando necessário');
  
  const initTime = Date.now() - startTime;
  console.log(`⚡ Aplicação inicializada em ${initTime}ms`);
  
  // Cria a janela principal
  createMainWindow(isLoggedIn, nodeVersion, nodeWarning, angularVersion, angularWarning);
}

// Função para criar a janela principal (OTIMIZADA)
function createMainWindow(isLoggedIn, nodeVersion, nodeWarning, angularVersion, angularWarning) {
  console.log('🖼️ Criando janela principal otimizada...');
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Otimizações de performance
      backgroundThrottling: false,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'OIP.ico'),
    show: false, // Não mostra até estar carregada
    // Otimizações Windows
    frame: true,
    transparent: false,
    hasShadow: true
  });

  // ⚡ CRIA O MENU APÓS A JANELA PRINCIPAL ⚡
  // Cria o menu da aplicação e usa a variável global
  const menuTemplate = [
    {
      label: 'Dependências',
      submenu: [
        {
          label: 'Reiniciar Aplicativo',
          accelerator: 'CmdOrCtrl+R',
          id: 'restart-app',
          click: () => {
            // Desabilita o item do menu
            const menuItem = appMenu ? appMenu.getMenuItemById('restart-app') : null;
            if (menuItem) {
              menuItem.label = 'Reiniciando...';
              menuItem.enabled = false;
            }

            // Mostra confirmação antes de reiniciar
            dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: 'Reiniciar Aplicativo',
              message: 'Deseja reiniciar o aplicativo?',
              detail: 'Isso irá fechar e reabrir o aplicativo. Todos os processos em execução serão interrompidos.',
              buttons: ['Cancelar', 'Reiniciar'],
              defaultId: 1,
              cancelId: 0
            }).then((result) => {
              if (result.response === 1) {
                console.log('Reiniciando aplicativo...');
                // Para todos os processos em execução
                Object.keys(runningProcesses).forEach(processPath => {
                  try {
                    runningProcesses[processPath].kill();
                    console.log(`Processo parado: ${processPath}`);
                  } catch (error) {
                    console.error(`Erro ao parar processo ${processPath}:`, error);
                  }
                });
                
                // Reinicia o aplicativo
                app.relaunch();
                app.exit();
              } else {
                // Reabilita o item se cancelado
                if (menuItem) {
                  menuItem.label = 'Reiniciar Aplicativo';
                  menuItem.enabled = true;
                }
              }
            }).catch(() => {
              // Reabilita o item em caso de erro
              if (menuItem) {
                menuItem.label = 'Reiniciar Aplicativo';
                menuItem.enabled = true;
              }
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Login npm',
          id: 'npm-login',
          click: () => {
            // Desabilita o item do menu
            const menuItem = appMenu ? appMenu.getMenuItemById('npm-login') : null;
            if (menuItem) {
              menuItem.label = 'Login npm...';
              menuItem.enabled = false;
            }

            // Executa a função original
            handleNpmLogin()
              .finally(() => {
                // Reabilita o item após conclusão
                setTimeout(() => {
                  if (menuItem) {
                    menuItem.label = 'Login npm';
                    menuItem.enabled = true;
                  }
                }, 1000);
              });
          },
        },
        {
          label: 'Verificar Status Nexus',
          id: 'verify-nexus',
          click: () => {
            // Desabilita o item do menu
            const menuItem = appMenu ? appMenu.getMenuItemById('verify-nexus') : null;
            if (menuItem) {
              menuItem.label = 'Verificando Status...';
              menuItem.enabled = false;
            }

            // Cria janela de console para mostrar o progresso
            const verifyWindow = new BrowserWindow({
              width: 700,
              height: 500,
              modal: true,
              parent: mainWindow,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
              },
              autoHideMenuBar: true,
              resizable: false,
              titleBarStyle: 'default',
              title: '🔍 Verificação Status Nexus'
            });

            verifyWindow.loadFile(path.join(__dirname, 'verify-status.html'));

            // Reabilita o menu quando a janela for fechada
            verifyWindow.on('closed', () => {
              if (menuItem) {
                menuItem.label = 'Verificar Status Nexus';
                menuItem.enabled = true;
              }
            });

            // Handler para fechar a janela
            ipcMain.once('close-verify-status-window', () => {
              verifyWindow.close();
            });

            // Handler para iniciar a verificação
            ipcMain.once('start-nexus-verification', () => {
              // Envia log inicial
              verifyWindow.webContents.send('verify-status-log', { 
                message: 'Procurando projetos com arquivo .npmrc...', 
                type: 'info' 
              });

              // Executa a verificação
              checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username, registry, reason }) => {
                // Logs de progresso
                verifyWindow.webContents.send('verify-status-log', { 
                  message: `Verificando registry: ${registry}`, 
                  type: 'info' 
                });
                
                if (actualLoginStatus) {
                  verifyWindow.webContents.send('verify-status-log', { 
                    message: `Login detectado: ${username}`, 
                    type: 'success' 
                  });
                  
                  // Atualiza o estado salvo se necessário
                  const currentLoginState = loadLoginState();
                  if (!currentLoginState) {
                    saveLoginState(true);
                  }

                  // Atualiza a bolinha verde
                  mainWindow.webContents.send('login-state', true);
                  mainWindow.webContents.send('log', { message: `✓ Conectado ao Nexus como: ${username}` });
                } else {
                  verifyWindow.webContents.send('verify-status-log', { 
                    message: 'Nenhum login detectado', 
                    type: 'warning' 
                  });
                  
                  // Atualiza o estado salvo se necessário
                  const currentLoginState = loadLoginState();
                  if (currentLoginState) {
                    saveLoginState(false);
                  }

                  // Atualiza a bolinha verde
                  mainWindow.webContents.send('login-state', false);
                }

                // Envia o resultado final para a janela
                verifyWindow.webContents.send('verify-status-result', {
                  isLoggedIn: actualLoginStatus,
                  username,
                  registry,
                  reason
                });

              }).catch((error) => {
                console.log('[DEBUG] Erro capturado no catch:', error);
                verifyWindow.webContents.send('verify-status-log', { 
                  message: `Erro na verificação: ${error.message}`, 
                  type: 'error' 
                });
                
                verifyWindow.webContents.send('verify-status-result', {
                  isLoggedIn: false,
                  username: null,
                  registry: null,
                  reason: 'error'
                });
                
                // Reabilita o menu em caso de erro
                if (menuItem) {
                  menuItem.label = 'Verificar Status Nexus';
                  menuItem.enabled = true;
                }
              });
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Instalar Dependências',
          id: 'install-deps',
          click: () => {
            // Desabilita o item do menu
            const menuItem = appMenu ? appMenu.getMenuItemById('install-deps') : null;
            if (menuItem) {
              menuItem.label = 'Instalando...';
              menuItem.enabled = false;
            }

            handleInstallDependencies();
            
            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = 'Instalar Dependências';
                menuItem.enabled = true;
              }
            }, 5000);
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Configurações',
      submenu: [
        {
          label: '🔧 Configurações',
          accelerator: 'CmdOrCtrl+Comma',
          id: 'open-config',
          click: () => {
            // Desabilita temporariamente
            const menuItem = appMenu ? appMenu.getMenuItemById('open-config') : null;
            if (menuItem) {
              menuItem.label = 'Abrindo...';
              menuItem.enabled = false;
            }

            openConfigWindow();

            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = '🔧 Configurações';
                menuItem.enabled = true;
              }
            }, 1000);
          },
        },
      ],
    },
  ];

  // Define o menu e armazena a referência
  appMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(appMenu);
  console.log('📋 Menu de configurações criado e aplicado');

  mainWindow.loadFile('index.html');
  
  // Mostra a janela apenas quando estiver pronta
  mainWindow.once('ready-to-show', async () => {
    console.log('✅ Janela principal pronta para exibição');
    
    // Carrega apenas branches básicas (rápido, sem fetch)
    console.log('[GIT] Carregando branches básicas (sem fetch)...');
    const projectsWithBranches = await getAllProjectsBranches(projects);
    projects = projectsWithBranches;
    
    // Notifica a splash screen que está pronto (SEM comandos Git pesados)
    if (splashWindow) {
      console.log('📱 Notificando splash que app principal está pronto');
      splashWindow.webContents.send('main-app-ready');
    }
    
    // DELAY REDUZIDO - app carrega mais rápido
    setTimeout(() => {
      console.log('🚀 Mostrando janela principal e fechando splash');
      mainWindow.show();
      mainWindow.focus();
      
      // Fecha a splash screen após mostrar a principal
      setTimeout(() => {
        if (splashWindow) {
          splashWindow.close();
        }
      }, 200);

      // Envia os projetos iniciais para a UI
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('[UI] Enviando projetos iniciais (sem status Git completo)');
          mainWindow.webContents.send('projects-loaded', projects);
          
          // INICIA VERIFICAÇÃO GIT EM SEGUNDO PLANO
          startBackgroundGitCheck();
        }
      }, 300);
    }, 800); // Reduzido de 2000ms para 800ms
  });

  // Remove todos os listeners IPC existentes para evitar duplicação
  ipcMain.removeAllListeners();

  // Adiciona listener para tecla F5 (Refresh/Restart)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' && !input.alt && !input.control && !input.meta && !input.shift) {
      event.preventDefault();
      
      // Executa a mesma lógica do menu
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Reiniciar Aplicativo',
        message: 'Deseja reiniciar o aplicativo?',
        detail: 'Tecla F5 pressionada. Isso irá fechar e reabrir o aplicativo. Todos os processos em execução serão interrompidos.',
        buttons: ['Cancelar', 'Reiniciar'],
        defaultId: 1,
        cancelId: 0
      }).then((result) => {
        if (result.response === 1) {
          console.log('Reiniciando aplicativo via F5...');
          // Para todos os processos em execução
          Object.keys(runningProcesses).forEach(processPath => {
            try {
              runningProcesses[processPath].kill();
              console.log(`Processo parado: ${processPath}`);
            } catch (error) {
              console.error(`Erro ao parar processo ${processPath}:`, error);
            }
          });
          
          // Reinicia o aplicativo
          app.relaunch();
          app.exit();
        }
      });
    }
  });

  ipcMain.on('login-success', () => {
    saveLoginState(true);
    mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
    // Força atualização imediata da interface
    mainWindow.webContents.send('login-state', true);
  });

  // Handler para forçar verificação do login (útil para troubleshooting)
  ipcMain.on('force-login-check', (event) => {
    console.log('[CHECK] Verificacao de login forcada pelo usuario');
    checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username }) => {
      saveLoginState(actualLoginStatus);
      event.reply('login-state', actualLoginStatus);
      
      if (actualLoginStatus) {
        console.log(`✅ Login confirmado: ${username}`);
        mainWindow.webContents.send('log', { message: `✓ Login confirmado: ${username}` });
      } else {
        console.log('❌ Não logado');
        mainWindow.webContents.send('log', { message: 'Não está logado no Nexus' });
      }
    }).catch((error) => {
      console.log('❌ Erro na verificação forçada:', error.message);
      mainWindow.webContents.send('log', { message: `Erro na verificação: ${error.message}` });
    });
  });

  // Handlers IPC para configurações (OTIMIZADOS)
  ipcMain.on('load-configs', async (event) => {
    try {
      // Carrega configurações de forma assíncrona
      const config = await new Promise((resolve) => {
        setImmediate(() => {
          resolve(loadConfig());
        });
      });
      event.reply('configs-loaded', config);
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      event.reply('configs-loaded', getDefaultConfig());
    }
  });

  ipcMain.on('save-config', (event, { key, value }) => {
    // Salva configuração de forma assíncrona para não bloquear a UI
    setImmediate(() => {
      const updatedConfig = updateConfigProperty(key, value);
      console.log(`Configuração atualizada: ${key} = ${value}`);
    });
  });

  ipcMain.on('apply-dark-mode', (event, isDarkMode) => {
    // Aplica o modo escuro na janela principal
    if (mainWindow) {
      mainWindow.webContents.send('apply-dark-mode', isDarkMode);
    }
  });

  ipcMain.on('close-config-window', () => {
    // Fecha a janela de configurações se ela existir
    if (configWindow && !configWindow.isDestroyed()) {
      configWindow.close();
    }
  });

  ipcMain.on('close-splash', () => {
    // Fecha a splash screen se ela existir
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  ipcMain.on('load-login-state', (event) => {
    // Usa cache para resposta instantânea
    let currentLoginState;
    
    if (appCache.loginState) {
      currentLoginState = appCache.loginState.isLoggedIn;
      event.reply('login-state', currentLoginState);
      console.log('⚡ Estado de login carregado do cache:', currentLoginState);
    } else {
      // Fallback para arquivo
      currentLoginState = loadLoginState();
      event.reply('login-state', currentLoginState);
    }
    
    // 🧠 NOVA LÓGICA INTELIGENTE:
    // - Se LOGADO no cache → confia e não verifica (performance)
    // - Se DESLOGADO no cache → SEMPRE verifica (pode ter feito login)
    
    if (currentLoginState === true) {
      console.log('✅ Cache mostra LOGADO - confiando no cache (não verifica)');
      return; // Não faz verificação se já está logado
    }
    
    console.log('❌ Cache mostra DESLOGADO - verificando login em tempo real...');
    checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username }) => {
      if (actualLoginStatus !== currentLoginState) {
        // O status real é diferente do salvo, atualiza
        console.log(`[UPDATE] Atualizando login state: ${currentLoginState} → ${actualLoginStatus}`);
        saveLoginState(actualLoginStatus);
        event.reply('login-state', actualLoginStatus);
        
        if (actualLoginStatus) {
          console.log(`✅ Login detectado automaticamente: ${username}`);
          mainWindow.webContents.send('log', { message: `✓ Login detectado automaticamente: ${username}` });
        } else {
          console.log('❌ Status de login confirmado: deslogado');
        }
      } else {
        console.log('✅ Status DESLOGADO confirmado');
      }
    }).catch((error) => {
      console.log('❌ Erro na verificação de login:', error.message);
      // Em caso de erro, mantém estado do cache
    });

    // Código legado removido
    const cacheAge = appCache.loginState ? Date.now() - (appCache.loginState.timestamp || 0) : Infinity;
    if (false) { // Código antigo desabilitado
      checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username }) => {
        if (actualLoginStatus !== currentLoginState) {
          // O status real é diferente do salvo, atualiza
          saveLoginState(actualLoginStatus);
          event.reply('login-state', actualLoginStatus);
          
          if (actualLoginStatus) {
            console.log(`Login detectado automaticamente: ${username}`);
            mainWindow.webContents.send('log', { message: `✓ Login detectado automaticamente: ${username}` });
          } else {
            console.log('Status de login atualizado: deslogado');
          }
        }
      }).catch((error) => {
        console.log('Erro na verificação automática de login:', error.message);
      });
    } else {
      console.log('⚡ Cache de login ainda válido, pulando verificação');
    }
  });

  ipcMain.on('load-node-info', (event) => {
    // Sempre faz verificação em tempo real para garantir precisão
    console.log('🔍 Verificando Node.js em tempo real...');
    
    exec('node --version', { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('Node.js não disponível:', error.message);
        event.reply('node-info', { 
          version: null, 
          warning: 'Node.js não está disponível no PATH' 
        });
        return;
      }
      
      const version = stdout.toString().trim();
      let warning = null;
      
      if (version !== 'v16.10.0') {
        warning = `A versão ideal do Node.js é v16.10.0. A versão atual é ${version}, o que pode causar problemas.`;
      }
      
      console.log(`✅ Node.js encontrado: ${version}`);
      event.reply('node-info', { version, warning });
      
      // Atualiza o cache com a informação correta
      appCache.nodeInfo = {
        version: version,
        available: true
      };
      saveAppCache();
    });
  });

  ipcMain.on('load-angular-info', (event) => {
    console.log('🔍 [ANGULAR DEBUG] Verificando Angular CLI em tempo real...');
    
    // 🧠 LÓGICA INTELIGENTE:
    // - Se cache mostra CONFIRMADO → usa cache (não verifica)  
    // - Se cache mostra ERRO/NÃO CONFIRMADO → SEMPRE verifica
    // - Sucesso SEMPRE sobrescreve falha
    // - Falha NUNCA sobrescreve sucesso confirmado
    
    const hasConfirmedCache = appCache.angularInfo && 
                             appCache.angularInfo.available && 
                             appCache.angularInfo.confirmed;
    
    if (hasConfirmedCache) {
      console.log('⚡ [ANGULAR DEBUG] Cache confirmado - Angular CLI já verificado anteriormente');
      const version = appCache.angularInfo.version;
      let warning = null;
      
      if (version !== '13.3.11' && version !== 'Instalado (versão não detectada)') {
        warning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${version}, o que pode causar problemas.`;
      }
      
      event.reply('angular-info', { version, warning });
      return;
    }
    
    console.log('🔍 [ANGULAR DEBUG] Cache não confirmado - verificando Angular CLI...');
    console.log('🔍 [ANGULAR DEBUG] PATH atual:', process.env.PATH?.slice(0, 200) + '...');
    
    // Primeira verificação - tentativa principal
    exec('ng version', { timeout: 20000 }, (error, stdout, stderr) => {
      console.log('🔍 [ANGULAR DEBUG] Primeira verificação - Resultado:', {
        erro: error?.message,
        stdout: stdout?.slice(0, 200),
        stderr: stderr?.slice(0, 200)
      });

      if (!error && stdout) {
        // SUCESSO na primeira tentativa
        const angularOutput = stdout.toString();
        const angularCliMatch = angularOutput.match(/Angular CLI: (\d+\.\d+\.\d+)/);
        
        console.log('✅ [ANGULAR DEBUG] Primeira verificação bem-sucedida');
        
        if (angularCliMatch) {
          const version = angularCliMatch[1];
          let warning = null;
          
          if (version !== '13.3.11') {
            warning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${version}, o que pode causar problemas.`;
          }
          
          console.log(`✅ [ANGULAR DEBUG] Angular CLI encontrado: ${version}`);
          
          // SALVA NO CACHE APENAS QUANDO CONFIRMADO
          appCache.angularInfo = {
            version: version,
            available: true,
            confirmed: true,
            fullOutput: angularOutput
          };
          saveAppCache();
          
          event.reply('angular-info', { version, warning });
          
        } else {
          const version = 'Instalado (versão não detectada)';
          console.log('✅ [ANGULAR DEBUG] Angular CLI instalado mas versão não detectada');
          
          // SALVA NO CACHE MESMO SEM VERSÃO DETECTADA
          appCache.angularInfo = {
            version: version,
            available: true,
            confirmed: true,
            fullOutput: angularOutput
          };
          saveAppCache();
          
          event.reply('angular-info', { version, warning: null });
        }
        return;
      }
      
      // ERRO na primeira tentativa - tenta segunda verificação
      console.log('⚠️ [ANGULAR DEBUG] Primeira verificação falhou - tentando segunda verificação...');
      
      setTimeout(() => {
        exec('ng --version', { timeout: 20000 }, (error2, stdout2, stderr2) => {
          console.log('🔍 [ANGULAR DEBUG] Segunda verificação - Resultado:', {
            erro: error2?.message,
            stdout: stdout2?.slice(0, 200),
            stderr: stderr2?.slice(0, 200)
          });

          if (!error2 && stdout2) {
            // SUCESSO na segunda tentativa
            const angularOutput = stdout2.toString();
            const angularCliMatch = angularOutput.match(/Angular CLI: (\d+\.\d+\.\d+)/);
            
            console.log('✅ [ANGULAR DEBUG] Segunda verificação bem-sucedida');
            
            if (angularCliMatch) {
              const version = angularCliMatch[1];
              let warning = null;
              
              if (version !== '13.3.11') {
                warning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${version}, o que pode causar problemas.`;
              }
              
              console.log(`✅ [ANGULAR DEBUG] Angular CLI encontrado na segunda tentativa: ${version}`);
              
              // SALVA NO CACHE APÓS SEGUNDA VERIFICAÇÃO BEM-SUCEDIDA
              appCache.angularInfo = {
                version: version,
                available: true,
                confirmed: true,
                fullOutput: angularOutput
              };
              saveAppCache();
              
              event.reply('angular-info', { version, warning });
              
            } else {
              const version = 'Instalado (versão não detectada)';
              console.log('✅ [ANGULAR DEBUG] Angular CLI instalado na segunda tentativa (versão não detectada)');
              
              appCache.angularInfo = {
                version: version,
                available: true,
                confirmed: true,
                fullOutput: angularOutput
              };
              saveAppCache();
              
              event.reply('angular-info', { version, warning: null });
            }
            return;
          }
          
          // ERRO em ambas as tentativas
          console.log('❌ [ANGULAR DEBUG] Ambas verificações falharam');
          
          // Se já havia um cache confirmado, NÃO sobrescreve
          if (appCache.angularInfo && appCache.angularInfo.confirmed) {
            console.log('� [ANGULAR DEBUG] Mantendo cache confirmado anterior - não sobrescrevendo com erro');
            const version = appCache.angularInfo.version;
            let warning = null;
            
            if (version !== '13.3.11' && version !== 'Instalado (versão não detectada)') {
              warning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${version}, o que pode causar problemas.`;
            }
            
            event.reply('angular-info', { version, warning });
            return;
          }
          
          // Se não há cache confirmado, reporta erro
          console.log('❌ [ANGULAR DEBUG] Angular CLI não foi encontrado após ambas tentativas');
          
          // NÃO salva erro no cache - deixa para próxima verificação
          event.reply('angular-info', { 
            version: null, 
            warning: 'Angular CLI não está disponível ou não está no PATH. Verifique se está instalado globalmente com: npm install -g @angular/cli' 
          });
        });
      }, 2000); // 2 segundos entre tentativas
    });
  });

  ipcMain.on('download-project', (event, { name, index }) => {
    const workdir = path.join('C:/', 'projetos'); // Caminho base para os projetos
    const projectPath = path.join(workdir, name);
    const repoUrl = `https://github.com/viavarejo-internal/${name}.git`;

    console.log(`Iniciando download do projeto: ${name}`);
    if (name.startsWith('mp-pamp')) {
      event.reply('pamp-log', { 
        path: projectPath, 
        message: `Fazendo download do projeto: ${name}`,
        index: index,
        name: name
      });
    } else {
      event.reply('log', { 
        path: projectPath, 
        message: `Fazendo download do projeto: ${name}`
      });
    }

    if (!fs.existsSync(workdir)) {
        console.log(`Criando diretório base: ${workdir}`);
        fs.mkdirSync(workdir, { recursive: true });
    }

    if (fs.existsSync(projectPath)) {
        console.log(`O projeto ${name} já existe em ${projectPath}.`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `O projeto pamp ${name} já existe em ${projectPath}.`,
            index: index,
            name: name 
          });
        } else {
          event.reply('log', { path: projectPath, message: `O projeto pas ${name} já existe em ${projectPath}.` });
        }
        return;
    }

    exec(`git clone ${repoUrl} ${projectPath}`, (err, stdout, stderr) => {
        if (err) {
        console.error(`Erro ao clonar o repositório ${repoUrl}: ${err.message}`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `Erro ao clonar o repositório ${repoUrl}: ${err.message}`,
            index: index,
            name: name
          });
        } else {
          event.reply('log', { path: projectPath, message: `Erro ao clonar o repositório ${repoUrl}: ${err.message}` });
        }
        return;
        }

        console.log(`Projeto ${name} clonado com sucesso em ${projectPath}.`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `Projeto baixado e disponível no caminho: ${projectPath}`,
            index: index,
            name: name
          });
        } else {
          event.reply('log', { path: projectPath, message: `Projeto baixado e disponível no caminho: ${projectPath}` });
        }

        projects[index].path = projectPath;
        saveProjects(projects); // Atualiza o arquivo `projects.txt`
        event.reply('projects-loaded', projects); // Atualiza o frontend
    });
  });

  ipcMain.on('load-projects', async (event) => {
    try {
      // Carrega projetos de forma assíncrona
      console.log('📋 Carregando projetos:', projects.length, 'projetos encontrados');
      
      // ⚡ OBTER BRANCHES GIT DE TODOS OS PROJETOS ⚡
      const projectsWithBranches = await getAllProjectsBranches(projects);
      
      // Aplica ordenação personalizada de forma assíncrona
      const orderedProjects = await new Promise((resolve) => {
        setImmediate(() => {
          resolve(applyCustomProjectOrder(projectsWithBranches));
        });
      });
      
      event.reply('projects-loaded', orderedProjects);
      
      // Verifica se o login automático deve ser exibido
      const noPathsConfigured = projectsWithBranches.every((project) => !project.path);
      if (!isLoggedIn && noPathsConfigured) {
        console.log('Nenhum login detectado e nenhum projeto configurado. Exibindo login automático.');
        mainWindow.webContents.send('show-login');
      }
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
      event.reply('projects-loaded', projects); // Fallback para projetos sem ordenação
    }
  });

  // Novos handlers para configuração de ordem dos projetos (OTIMIZADOS)
  ipcMain.on('get-project-order', async (event, type) => {
    try {
      // Carrega configuração de forma assíncrona
      const config = await new Promise((resolve) => {
        setImmediate(() => {
          resolve(loadConfig());
        });
      });
      
      const order = type === 'pas' ? config.pasOrder : config.pampOrder;
      
      console.log(`📋 Carregando ordem dos projetos ${type.toUpperCase()}:`, order);
      event.reply('project-order-loaded', { type, order: order || [] });
    } catch (error) {
      console.error(`Erro ao carregar ordem dos projetos ${type}:`, error);
      event.reply('project-order-loaded', { type, order: [] });
    }
  });

  ipcMain.on('save-project-order', (event, { type, order }) => {
    try {
      console.log(`[SAVE] Tentando salvar ordem dos projetos ${type.toUpperCase()}:`, order);
      
      const config = loadConfig();
      console.log('📋 Configuração atual:', JSON.stringify(config, null, 2));
      
      if (type === 'pas') {
        config.pasOrder = order;
        console.log('✅ pasOrder atualizado:', order);
      } else if (type === 'pamp') {
        config.pampOrder = order;
        console.log('✅ pampOrder atualizado:', order);
      }
      
      saveConfig(config);
      console.log('💾 Configuração salva com sucesso');
      
      console.log(`✅ Ordem dos projetos ${type.toUpperCase()} salva:`, order);
      
      // Aplica a nova ordenação aos projetos em memória
      console.log('[APPLY] Aplicando nova ordenacao aos projetos em memoria...');
      applyProjectOrdering();
      
      // Envia os projetos ordenados para a tela principal IMEDIATAMENTE
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('📡 Enviando projetos reordenados para a tela principal...');
        const orderedProjects = applyCustomProjectOrder(projects);
        console.log('📋 Projetos após ordenação:', orderedProjects.map(p => p.name));
        mainWindow.webContents.send('projects-loaded', orderedProjects);
        console.log('✅ Projetos reordenados enviados para a tela principal');
      } else {
        console.log('⚠️  Janela principal não disponível para atualização');
      }
      
      event.reply('project-order-saved', { success: true, type });
      
    } catch (error) {
      console.error(`❌ Erro ao salvar ordem dos projetos ${type}:`, error);
      event.reply('project-order-saved', { success: false, type, error: error.message });
    }
  });

  ipcMain.on('reload-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[RELOAD] Recarregando janela principal...');
      mainWindow.webContents.reload();
    }
  });

  // Handler para salvar ordem customizada dos projetos
  ipcMain.on('save-project-order', (event, { projectOrder }) => {
    try {
      // Filtra apenas projetos reordenáveis (não ROOT)
      const reorderableOrder = projectOrder.filter(name => 
        name !== 'mp-pas-root' && name !== 'mp-pamp'
      );
      
      saveCustomProjectOrder(reorderableOrder);
      
      // Aplica a nova ordem aos projetos em memória
      projects = applyCustomProjectOrder(projects);
      
      console.log('✅ Ordem dos projetos atualizada e aplicada');
      event.reply('project-order-saved', { success: true });
      
    } catch (error) {
      console.error('❌ Erro ao salvar ordem dos projetos:', error);
      event.reply('project-order-saved', { success: false, error: error.message });
    }
  });

  ipcMain.on('update-project-path', (event, { index, path }) => {
    projects[index].path = path;
    saveProjects(projects);
  });

  // Handler para git pull em uma branch específica
  ipcMain.on('git-pull-branch', async (event, { projectIndex, projectName, projectPath, isPamp }) => {
    console.log(`[GIT-PULL] ===== HANDLER CHAMADO =====`);
    console.log(`[GIT-PULL] Dados recebidos:`, { projectIndex, projectName, projectPath, isPamp });
    
    try {
      console.log(`[GIT-PULL] Iniciando git pull para ${projectName} em ${projectPath}`);
      
      if (!projectPath || projectPath.trim() === '') {
        console.log(`[GIT-PULL] ERRO: Caminho vazio para ${projectName}`);
        event.reply('git-pull-result', {
          projectIndex,
          projectName,
          success: false,
          output: 'Caminho do projeto não encontrado',
          isPamp
        });
        return;
      }

      // Verifica se é um repositório Git
      const gitDir = path.join(projectPath, '.git');
      if (!fs.existsSync(gitDir)) {
        console.log(`[GIT-PULL] ERRO: Não é repositório Git - ${projectPath}`);
        event.reply('git-pull-result', {
          projectIndex,
          projectName,
          success: false,
          output: 'Não é um repositório Git válido',
          isPamp
        });
        return;
      }

      // Obtém a branch atual
      const currentBranch = await getProjectGitBranch(projectPath);
      if (!currentBranch) {
        console.log(`[GIT-PULL] ERRO: Não foi possível determinar a branch para ${projectName}`);
        event.reply('git-pull-result', {
          projectIndex,
          projectName,
          success: false,
          output: 'Não foi possível determinar a branch atual',
          isPamp
        });
        return;
      }

      console.log(`[GIT-PULL] Branch atual: ${currentBranch}`);

      // Executa git pull origin <branch>
      const pullCommand = `git pull origin ${currentBranch}`;
      console.log(`[GIT-PULL] Executando: ${pullCommand} em ${projectPath}`);

      exec(pullCommand, {
        cwd: projectPath,
        timeout: 30000,
        encoding: 'utf8'
      }, async (error, stdout, stderr) => {
        console.log(`[GIT-PULL] ===== RESULTADO COMPLETO =====`);
        console.log(`[GIT-PULL] stdout:`, stdout);
        console.log(`[GIT-PULL] stderr:`, stderr);
        console.log(`[GIT-PULL] error:`, error);
        console.log(`[GIT-PULL] ================================`);

        const fullOutput = [stdout, stderr].filter(s => s && s.trim()).join('\n');
        
        // Detecta diferentes tipos de problemas
        const hasFatalError = error && error.message.includes('fatal');
        const hasMergeConflict = fullOutput.includes('would be overwritten by merge') || 
                                fullOutput.includes('Please commit your changes') ||
                                fullOutput.includes('Aborting');
        const hasNetworkError = fullOutput.includes('Could not resolve host') || 
                               fullOutput.includes('Connection refused');
        
        // Define se é sucesso real (merge completado)
        const isRealSuccess = !error && !hasMergeConflict && !hasNetworkError && !hasFatalError;
        
        console.log(`[GIT-PULL] Análise: isRealSuccess=${isRealSuccess}, hasMergeConflict=${hasMergeConflict}, hasFatalError=${hasFatalError}`);

        if (hasFatalError || hasNetworkError) {
          console.log(`[GIT-PULL] Erro FATAL no pull para ${projectName}: ${error.message}`);
          event.reply('git-pull-result', {
            projectIndex,
            projectName,
            success: false,
            output: `ERRO FATAL: ${stderr || error.message}`,
            isPamp
          });
          return;
        }

        console.log(`[GIT-PULL] Output completo para ${projectName}:`, fullOutput);
        console.log(`[GIT-PULL] Pull ${isRealSuccess ? 'bem-sucedido' : 'executado com avisos'} para ${projectName}`);

        // Atualiza o status Git do projeto após o pull
        try {
          const gitStatus = await checkGitStatus(projectPath);
          
          // Atualiza o projeto na lista global apenas se houve sucesso real
          if (projects[projectIndex] && isRealSuccess) {
            projects[projectIndex].gitBranch = gitStatus.branch || currentBranch;
            projects[projectIndex].pendingCommits = gitStatus.pendingCommits;
            projects[projectIndex].hasUpdates = gitStatus.hasUpdates;
          }

          event.reply('git-pull-result', {
            projectIndex,
            projectName,
            success: isRealSuccess, // Só marca como sucesso se realmente fez merge
            output: fullOutput || 'Comando executado',
            isPamp
          });

        } catch (statusError) {
          console.log(`[GIT-PULL] Erro ao verificar status após pull: ${statusError.message}`);
          // Mesmo com erro no status, reportamos o resultado do pull
          event.reply('git-pull-result', {
            projectIndex,
            projectName,
            success: isRealSuccess,
            output: fullOutput || 'Pull executado (erro ao verificar status final)',
            isPamp
          });
        }
      });

    } catch (error) {
      console.log(`[GIT-PULL] Erro geral no git pull para ${projectName}: ${error.message}`);
      event.reply('git-pull-result', {
        projectIndex,
        projectName,
        success: false,
        output: error.message,
        isPamp
      });
    }
  });

  ipcMain.on('start-project', (event, { projectPath, port, projectIndex }) => {
    console.log(`[START] 🚀 Iniciando projeto: ${projectPath} na porta: ${port}`);
    
    // Desmarca o projeto como cancelado ao iniciar normalmente
    unmarkProjectAsCanceled(projectPath);
    
    if (!port) {
        event.reply('log', { path: projectPath, message: '❌ Porta não definida.' });
        return;
    }

    // ⚡ NOVA VERIFICAÇÃO GIT COMPLETA ANTES DE INICIAR ⚡
    checkGitBeforeStart(projectPath).then(gitResult => {
      const foundProjectIndex = projectIndex !== undefined ? projectIndex : projects.findIndex(p => p.path === projectPath);
      
      if (foundProjectIndex !== -1 && gitResult.branch) {
        // Atualiza os dados do projeto na memória
        projects[foundProjectIndex] = {
          ...projects[foundProjectIndex],
          gitBranch: gitResult.branch,
          pendingCommits: gitResult.pendingCommits,
          hasUpdates: gitResult.hasUpdates
        };

        // SEMPRE atualiza a UI com as informações mais recentes
        console.log(`[START] 📡 Enviando atualização Git para UI: projeto ${foundProjectIndex} - ${gitResult.pendingCommits} commits pendentes`);
        
        // Envia atualização para a UI usando o mesmo formato do sistema de segundo plano
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('git-status-updated', {
            projectIndex: foundProjectIndex,
            gitStatus: {
              branch: gitResult.branch,
              pendingCommits: gitResult.pendingCommits,
              hasUpdates: gitResult.hasUpdates
            }
          });
        }

        // Logs informativos
        if (gitResult.changed) {
          event.reply('log', { 
            path: projectPath, 
            message: `🔄 Branch atualizada: ${gitResult.branch}`,
            isImportant: true
          });
        }

        if (gitResult.pendingCommits > 0) {
          event.reply('log', { 
            path: projectPath, 
            message: `📊 ${gitResult.pendingCommits} commits pendentes para baixar`,
            isImportant: true
          });
        } else if (gitResult.branch) {
          event.reply('log', { 
            path: projectPath, 
            message: `✅ Projeto está atualizado (branch: ${gitResult.branch})`
          });
        }
      }

      // Prossegue com a inicialização normal
      console.log(`[START] 🔄 Liberando porta ${port}...`);
      
      // Derruba qualquer processo rodando na porta
      exec(`npx kill-port ${port}`, (err) => {
        if (err) {
          event.reply('log', { path: projectPath, message: `⚠️ Erro ao liberar a porta ${port}: ${err.message}` });
        } else {
          event.reply('log', { path: projectPath, message: `✅ Porta ${port} liberada. Iniciando projeto...` });
        }
      
        // Aguarda 10 segundos antes de iniciar o projeto
        setTimeout(() => {
          // Verifica cancelamento antes de iniciar projeto
          if (checkCancelationAndExit(projectPath, "início do projeto após verificação Git")) {
            return;
          }
          startProject(event, projectPath, port);
        }, 10000);
      });
    }).catch(error => {
      console.log(`[START] ❌ Erro na verificação Git: ${error.message}`);
      event.reply('log', { 
        path: projectPath, 
        message: `⚠️ Erro na verificação Git: ${error.message}. Prosseguindo...`
      });
      
      // Continua mesmo com erro no Git
      exec(`npx kill-port ${port}`, (err) => {
        if (err) {
          event.reply('log', { path: projectPath, message: `⚠️ Erro ao liberar a porta ${port}: ${err.message}` });
        } else {
          event.reply('log', { path: projectPath, message: `✅ Porta ${port} liberada. Iniciando projeto...` });
        }
      
        setTimeout(() => {
          if (checkCancelationAndExit(projectPath, "início do projeto após erro Git")) {
            return;
          }
          startProject(event, projectPath, port);
        }, 10000);
      });
    });
  });

  ipcMain.on('start-project-pamp', async (event, { projectPath, port, projectIndex }) => {
    console.log(`[START-PAMP] 🚀 Iniciando projeto PAMP: ${projectPath} na porta: ${port || 'N/A'}`);
    
    // Desmarca o projeto como cancelado ao iniciar normalmente
    unmarkProjectAsCanceled(projectPath);
    
    // ⚡ NOVA VERIFICAÇÃO GIT COMPLETA ANTES DE INICIAR ⚡
    try {
      const gitResult = await checkGitBeforeStart(projectPath);
      
      const foundProjectIndex = projectIndex !== undefined ? projectIndex : projects.findIndex(p => p.path === projectPath);
      const projectName = foundProjectIndex !== -1 ? projects[foundProjectIndex].name : path.basename(projectPath);
      
      if (foundProjectIndex !== -1 && gitResult.branch) {
        // Atualiza os dados do projeto na memória
        projects[foundProjectIndex] = {
          ...projects[foundProjectIndex],
          gitBranch: gitResult.branch,
          pendingCommits: gitResult.pendingCommits,
          hasUpdates: gitResult.hasUpdates
        };

        // SEMPRE atualiza a UI com as informações mais recentes (para PAMP)
        console.log(`[START-PAMP] 📡 Enviando atualização Git para UI: projeto ${foundProjectIndex} - ${gitResult.pendingCommits} commits pendentes`);
        
        // Envia atualização para a UI usando o mesmo formato do sistema de segundo plano
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('git-status-updated', {
            projectIndex: foundProjectIndex,
            gitStatus: {
              branch: gitResult.branch,
              pendingCommits: gitResult.pendingCommits,
              hasUpdates: gitResult.hasUpdates
            }
          });
        }

        // Logs informativos para PAMP
        if (gitResult.changed) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `🔄 Branch atualizada: ${gitResult.branch}`,
            index: foundProjectIndex,
            name: projectName
          });
        }

        if (gitResult.pendingCommits > 0) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `📊 ${gitResult.pendingCommits} commits pendentes para baixar`,
            index: foundProjectIndex,
            name: projectName
          });
        } else if (gitResult.branch) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `✅ Projeto está atualizado (branch: ${gitResult.branch})`,
            index: foundProjectIndex,
            name: projectName
          });
        }
      }
      
      event.reply('pamp-log', { 
        path: projectPath, 
        message: `[GIT] ✅ Verificação concluída. Iniciando projeto...`,
        index: foundProjectIndex,
        name: projectName
      });
      
      // Finalmente, inicia o projeto normalmente
      startProject(event, projectPath, port);
    } catch (error) {
      console.error(`[GIT] Erro na verificação Git completa para PAMP:`, error);
      const foundProjectIndex = projectIndex !== undefined ? projectIndex : projects.findIndex(p => p.path === projectPath);
      const projectName = foundProjectIndex !== -1 ? projects[foundProjectIndex].name : path.basename(projectPath);
      
      event.reply('pamp-log', { 
        path: projectPath, 
        message: `⚠️ Erro na verificação Git: ${error.message}`,
        index: foundProjectIndex,
        name: projectName
      });
      
      // Continua mesmo com erro na verificação Git
      startProject(event, projectPath, port);
    }
  });

  ipcMain.on('stop-project', (event, { projectPath, port }) => {
    console.log(`Parando projeto: ${projectPath} na porta: ${port}`);

    // Determine se é um projeto PAMP pelo nome do diretório
    const projectName = path.basename(projectPath);
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);

    // Avisa a UI para atualizar o status para "Parando..."
    event.reply('status-update', { 
      path: projectPath, 
      status: 'stopping',
      isPamp: isPampProject,
      index: projectIndex
    });
    
    // Remove a porta da UI quando o projeto for parado
    event.reply('port-removed', {
      projectIndex: projectIndex,
      isPamp: isPampProject
    });

    // Função para finalizar o processo de parada
    const finishStop = (message) => {
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message,
          index: projectIndex,
          name: projectName
        });
      } else {
        event.reply('log', { path: projectPath, message });
      }
      
      // Atualiza a UI para indicar que o processo foi parado
      event.reply('status-update', { 
        path: projectPath, 
        status: 'stopped',
        isPamp: isPampProject,
        index: projectIndex
      });
    };

    // Primeiro tenta encerrar o processo conhecido
    if (runningProcesses[projectPath]) {
      console.log(`Encerrando processo para ${projectPath}...`);
      try {
        // Kill mais agressivo para garantir que processo pai e filhos sejam encerrados
        if (os.platform() === 'win32') {
          exec(`taskkill /PID ${runningProcesses[projectPath].pid} /T /F`, (err) => {
            if (err) {
              console.log(`Erro ao encerrar árvore de processos: ${err.message}`);
            }
          });
        } else {
          // Linux/Mac - mata grupo de processos
          exec(`pkill -f "${projectPath}"`, (err) => {
            if (err) {
              console.log(`Erro ao encerrar processos: ${err.message}`);
            }
          });
        }
        runningProcesses[projectPath].kill('SIGKILL');
      } catch (error) {
        console.log(`Erro ao encerrar processo: ${error.message}`);
      }
      delete runningProcesses[projectPath];
      console.log(`Processo para ${projectPath} encerrado.`);
    }

    // Sempre executa kill por porta para garantir que todos os processos relacionados sejam encerrados
    if (os.platform() === 'win32') {
      // Windows - mata processos na porta específica
      exec(`netstat -aon | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) {
          finishStop(`Projeto parado (nenhum processo encontrado na porta ${port}).`);
          return;
        }

        // Extrai os PIDs dos processos
        const pids = stdout
          .split('\n')
          .map(line => line.trim().split(/\s+/).pop())
          .filter(pid => pid && !isNaN(pid));

        if (pids.length === 0) {
          finishStop(`Projeto parado (nenhum processo encontrado na porta ${port}).`);
          return;
        }

        let processesKilled = 0;
        let totalProcesses = pids.length;

        // Mata cada processo encontrado
        pids.forEach(pid => {
          exec(`taskkill /PID ${pid} /T /F`, (killErr) => {
            processesKilled++;
            
            if (killErr) {
              console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
            } else {
              console.log(`Processo PID ${pid} encerrado com sucesso.`);
            }

            // Quando todos os processos foram processados
            if (processesKilled === totalProcesses) {
              finishStop(`Projeto parado (${totalProcesses} processo(s) encerrado(s) na porta ${port}).`);
            }
          });
        });
      });
    } else {
      // Linux/Mac - mata processos na porta específica
      exec(`lsof -ti :${port}`, (err, stdout) => {
        if (err || !stdout) {
          finishStop(`Projeto parado (nenhum processo encontrado na porta ${port}).`);
          return;
        }

        // Extrai os PIDs dos processos
        const pids = stdout
          .split('\n')
          .map(pid => pid.trim())
          .filter(pid => pid && !isNaN(pid));

        if (pids.length === 0) {
          finishStop(`Projeto parado (nenhum processo encontrado na porta ${port}).`);
          return;
        }

        let processesKilled = 0;
        let totalProcesses = pids.length;

        // Mata cada processo encontrado
        pids.forEach(pid => {
          exec(`kill -9 ${pid}`, (killErr) => {
            processesKilled++;
            
            if (killErr) {
              console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
            } else {
              console.log(`Processo PID ${pid} encerrado com sucesso.`);
            }

            // Quando todos os processos foram processados
            if (processesKilled === totalProcesses) {
              finishStop(`Projeto parado (${totalProcesses} processo(s) encerrado(s) na porta ${port}).`);
            }
          });
        });
      });
    }
  });

  ipcMain.on('cancel-project-startup', (event, { projectPath, isPamp, index }) => {
    console.log(`Cancelando inicialização do projeto: ${projectPath}`);
    
    // Marca o projeto como cancelado
    markProjectAsCanceled(projectPath);
    
    // Remove a porta da UI quando o projeto for cancelado
    event.reply('port-removed', {
      projectIndex: index,
      isPamp: isPamp
    });
    
    const projectName = path.basename(projectPath);
    let processCanceled = false;
    
    // Para o processo em execução se existir
    if (runningProcesses[projectPath]) {
      console.log(`Matando processo de inicialização para ${projectPath}`);
      try {
        const childProcess = runningProcesses[projectPath];
        const pid = childProcess.pid;
        
        console.log(`[CANCELAMENTO] Tentando matar processo PID: ${pid} para ${projectPath}`);
        
        // No Windows, usa taskkill para matar toda a árvore de processos
        if (os.platform() === 'win32') {
          // Mata toda a árvore de processos filhos também
          exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
            if (error) {
              console.log(`[CANCELAMENTO] Erro ao usar taskkill: ${error.message}`);
              // Como fallback, tenta o método tradicional
              try {
                childProcess.kill('SIGTERM');
                setTimeout(() => {
                  try {
                    childProcess.kill('SIGKILL');
                  } catch (e) {
                    console.log(`[CANCELAMENTO] Processo já foi finalizado: ${e.message}`);
                  }
                }, 2000);
              } catch (killError) {
                console.log(`[CANCELAMENTO] Erro ao usar kill: ${killError.message}`);
              }
            } else {
              console.log(`[CANCELAMENTO] ✅ Taskkill executado com sucesso para PID ${pid}`);
              console.log(`[CANCELAMENTO] Stdout: ${stdout}`);
              if (stderr) console.log(`[CANCELAMENTO] Stderr: ${stderr}`);
            }
          });
        } else {
          // Para sistemas Unix-like
          childProcess.kill('SIGTERM');
          setTimeout(() => {
            try {
              childProcess.kill('SIGKILL');
            } catch (e) {
              console.log(`[CANCELAMENTO] Processo já foi finalizado: ${e.message}`);
            }
          }, 2000);
        }
        
        processCanceled = true;
        
      } catch (error) {
        console.log(`[CANCELAMENTO] Erro geral ao matar processo para ${projectPath}:`, error.message);
      } finally {
        delete runningProcesses[projectPath];
      }
    }
    
    // Remove da proteção de início múltiplo (busca por qualquer chave que comece com o projectPath)
    for (let key of startingProjects) {
      if (key.startsWith(projectPath)) {
        startingProjects.delete(key);
        console.log(`Removido ${key} da proteção de início múltiplo`);
      }
    }
    
    // Força parada de processos na porta (se soubermos qual é)
    // Tenta encontrar o projeto para descobrir a porta
    const project = projects.find(p => p.path === projectPath);
    if (project && project.port) {
      console.log(`Matando processo na porta ${project.port} para garantir cancelamento`);
      if (os.platform() === 'win32') {
        exec(`netstat -aon | findstr :${project.port}`, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.split('\n');
            lines.forEach(line => {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              if (pid && !isNaN(pid)) {
                exec(`taskkill /PID ${pid} /F`, (killErr) => {
                  if (!killErr) {
                    console.log(`Processo PID ${pid} na porta ${project.port} foi morto`);
                  }
                });
              }
            });
          }
        });
      }
    }
    
    // Envia log de cancelamento
    const cancelMessage = '🛑 Cancelado com sucesso!';
      
    if (isPamp) {
      event.reply('pamp-log', { 
        path: projectPath, 
        message: cancelMessage,
        index: index,
        name: projectName
      });
      
      // Resetar botões do projeto PAMP
      event.reply('pamp-process-error', { 
        path: projectPath,
        index: index 
      });
    } else {
      event.reply('log', { 
        path: projectPath, 
        message: cancelMessage
      });
      
      // Resetar botões do projeto PAS
      event.reply('process-error', { path: projectPath });
    }
    
    // Atualiza o status para "stopped"
    event.reply('status-update', { 
      path: projectPath, 
      status: 'stopped',
      isPamp: isPamp,
      index: index
    });
    
    console.log(`Inicialização cancelada para ${projectPath}. Processo cancelado: ${processCanceled}`);
  });

  function startProject(event, projectPath, port) {
    // Verifica se o projeto foi cancelado antes de iniciar
    if (checkCancelationAndExit(projectPath, "início da função startProject")) {
      return;
    }
    
    // ⚡ ATUALIZA BRANCH GIT QUANDO PROJETO É INICIADO (TEMPORARIAMENTE DESABILITADO) ⚡
    /*
    const updateProjectBranch = async () => {
      try {
        const currentBranch = await getProjectGitBranch(projectPath);
        const projectIndex = projects.findIndex(p => p.path === projectPath);
        
        if (projectIndex !== -1 && currentBranch) {
          // Atualiza a branch do projeto localmente
          projects[projectIndex].gitBranch = currentBranch;
          
          // Envia atualização para o frontend
          event.reply('update-project-branch', { 
            index: projectIndex, 
            branch: currentBranch,
            path: projectPath
          });
          
          console.log(`🌿 Branch atualizada para ${path.basename(projectPath)}: ${currentBranch}`);
        }
      } catch (error) {
        console.error(`Erro ao atualizar branch do projeto ${projectPath}:`, error);
      }
    };
    
    // Executa atualização da branch de forma assíncrona
    updateProjectBranch();
    */
    
    // Define o comando com base no nome do projeto
    const projectName = path.basename(projectPath); // Extrai o nome do projeto do caminho
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    let command;

    // Ajusta o comando para projetos específicos
    if (projectName === 'mp-pas-root') {
      command = 'npm run start'; // Comando específico para o mp-pas-root
    } else if (projectName.startsWith('mp-pas-')) {
      // Para projetos PAS, usa a porta dinamicamente se disponível
      const project = projects.find(p => p.path === projectPath);
      const projectPort = project ? project.port : port;
      
      if (projectPort) {
        // Constrói o comando com a porta específica do projeto
        const projectKey = projectName.replace('mp-', '');
        command = `ng s --project ${projectName} --disable-host-check --port ${projectPort} --live-reload false`;
      } else {
        // Fallback para o comando npm run se não houver porta definida
        command = `npm run serve:single-spa:${projectName.replace('mp-', '')}`;
      }
    } else if (isPampProject) {
      command = 'ng serve';
    } else {
      command = 'npm run start'; // Comando padrão para outros projetos
    }
    
    console.log(`Executando comando: ${command} no caminho: ${projectPath}`);

    // Se o projeto já tem uma porta definida, notifica a UI (laranja - ainda não rodando)
    if (port) {
      event.reply('port-detected', {
        projectIndex: projectIndex,
        port: port,
        status: 'starting',
        isPamp: isPampProject
      });
    }

    if (isPampProject) {
      event.reply('pamp-log', { 
        path: projectPath, 
        message: `Executando comando: ${command} no caminho: ${projectPath}`,
        index: projectIndex,
        name: projectName
      });
    } else {
      event.reply('log', { path: projectPath, message: `Executando comando: ${command} no caminho: ${projectPath}` });
    }

    // Verifica se o diretório node_modules existe
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    console.log(`[DEBUG] Verificando node_modules em: ${nodeModulesPath}`);
    console.log(`[DEBUG] node_modules existe: ${fs.existsSync(nodeModulesPath)}`);
    
    if (!fs.existsSync(nodeModulesPath)) {
      // Verifica cancelamento antes de instalar dependências
      if (checkCancelationAndExit(projectPath, "instalação de dependências")) {
        return;
      }
      
      console.log(`[DEBUG] node_modules NÃO existe, executando npm install`);

      console.log(`Diretório node_modules não encontrado em ${projectPath}. Instalando dependências...`);
      const installMessage = 'Instalando dependências com npm install...';
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: installMessage,
          index: projectIndex,
          name: projectName 
        });
      } else {
        event.reply('log', { path: projectPath, message: installMessage });
      }
      
      // Abre o console imediatamente antes de começar a instalação
      event.reply('show-console', { path: projectPath, index: projectIndex, isPamp: isPampProject });

      // Executa npm install com configurações otimizadas para logs
      const installProcess = exec('npm install --progress=true --verbose', { 
        cwd: projectPath,
        maxBuffer: 1024 * 1024 * 50, // Buffer maior (50MB)
        env: { 
          ...process.env,
          npm_config_progress: 'true',
          npm_config_loglevel: 'info' // Mais logs detalhados
        }
      });
      
      // Força flush do buffer a cada 500ms para logs mais frequentes
      const logInterval = setInterval(() => {
        if (installProcess && !installProcess.killed) {
          console.log('📦 npm install em progresso...');
          const progressMessage = '📦 Instalando dependências... (processo em andamento)';
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: progressMessage,
              index: projectIndex,
              name: projectName
            });
          } else {
            event.reply('log', { path: projectPath, message: progressMessage });
          }
        }
      }, 3000); // A cada 3 segundos mostra que está em progresso

      installProcess.stdout.on('data', (data) => {
        const cleanData = data.toString().trim();
        if (cleanData) { // Só loga se não for string vazia
          console.log(`[npm install] ${cleanData}`);
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: `[npm install] ${cleanData}`,
              index: projectIndex,
              name: projectName
            });
          } else {
            event.reply('log', { path: projectPath, message: `[npm install] ${cleanData}` });
          }
        }
      });

      installProcess.stderr.on('data', (data) => {
        const cleanData = data.toString().trim();
        if (cleanData) { // Só loga se não for string vazia
          console.error(`[npm install] ${cleanData}`);
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: `[npm install] ${cleanData}`,
              index: projectIndex,
              name: projectName
            });
          } else {
            event.reply('log', { path: projectPath, message: `[npm install] ${cleanData}` });
          }
        }
      });

      installProcess.on('close', (code) => {
        clearInterval(logInterval); // Para o interval de progresso
        if (code === 0) {
          // Verifica cancelamento antes de executar comando de start
          if (checkCancelationAndExit(projectPath, "execução do comando de start após npm install")) {
            return;
          }
          
          console.log(`Dependências instaladas com sucesso em ${projectPath}.`);
          
          const successMessage = 'Dependências instaladas com sucesso.';
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: successMessage,
              index: projectIndex,
              name: projectName
            });
          } else {
            event.reply('log', { path: projectPath, message: successMessage });
          }

          // Após instalar as dependências, inicia o projeto
          executeStartCommand(event, projectPath, command, port);
        } else {
          console.error(`Erro ao instalar dependências em ${projectPath}. Código: ${code}`);
          
          const errorMessage = `Erro ao instalar dependências. Código: ${code}`;
          
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: errorMessage,
              index: projectIndex,
              name: projectName,
              error: true
            });
            
            // Resetar botões do projeto PAMP
            event.reply('pamp-process-error', { 
              path: projectPath,
              index: projectIndex 
            });
          } else {
            event.reply('log', { 
              path: projectPath, 
              message: errorMessage,
              error: true
            });
            
            // Resetar botões do projeto PAS
            event.reply('process-error', { path: projectPath });
          }
        }
      });
    } else {
      // Verifica cancelamento antes de executar comando diretamente
      if (checkCancelationAndExit(projectPath, "execução direta do comando")) {
        return;
      }
      
      // Se node_modules já existir, abre o console e inicia o projeto diretamente
      event.reply('show-console', { path: projectPath, index: projectIndex, isPamp: isPampProject });
      executeStartCommand(event, projectPath, command, port);
    }
  }

  function executeStartCommand(event, projectPath, command, port) {
    // Verifica se o projeto foi cancelado antes de executar comando
    if (checkCancelationAndExit(projectPath, "início da função executeStartCommand")) {
      return;
    }
    
    const childProcess = exec(command, { 
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 50, // Buffer maior (50MB)
      env: { ...process.env } // Preserva todas as variáveis de ambiente
    });
    runningProcesses[projectPath] = childProcess;

    // Determine se é um projeto PAMP pelo nome do diretório
    const projectName = path.basename(projectPath);
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);

    // Variáveis para rastreamento de porta em uso
    let portInUseDetected = false;
    let detectedPort = null;
    let portInUseTimer = null;
    // ⚡ VARIÁVEIS PARA CONTROLE INTELIGENTE DE LOGS ⚡
    let lastLogTime = 0;
    let consecutiveErrors = 0;
    let lastRebuildTime = 0;
    let compilationInProgress = false;
    const errorThreshold = 3; // Máximo de erros consecutivos antes de alertar

    // Função para classificar se uma mensagem do stderr é realmente um erro crítico
    const isActualError = (message) => {
      if (!message) return false;
      
      const lowerMessage = message.toLowerCase();
      
      // Lista de padrões que NÃO são erros críticos (apenas warnings/informações)
      const nonCriticalPatterns = [
        'warning:',
        'deprecated',
        'deprecation',
        'the `form-control-focus()` mixin has been deprecated',
        'commonjs or amd dependencies can cause optimization bailouts',
        'your global angular cli version',
        'to disable this warning use',
        'project is attempting to disable the ivy compiler',
        'angular versions 12 and higher do not support',
        'the ivy compiler will be used to build this project',
        'for additional information or if the build fails',
        'the local angular cli version is used',
        'depends on \'',
        'for more info see: https://angular.io/guide/',
        '[webpack-dev-server]',
        'project is running at:',
        'loopback:',
        'on your network:',
        'content not from webpack is served from',
        '404s will fallback to',
        'webpack output is served from',
        'generating browser application bundles',
        'generating browser application bundles (phase: setup)',
        'generating browser application bundles (phase: building)'
      ];
      
      // Lista de padrões que SÃO erros críticos
      const criticalPatterns = [
        'error:',
        'failed',
        'cannot find module',
        'module not found',
        'compilation error',
        'syntax error',
        'type error',
        'reference error',
        'unexpected token',
        'command not found',
        'permission denied',
        'enoent',
        'eacces',
        'git.*not found',
        "'git' is not recognized",
        'fatal: not a git repository'
      ];
      
      // Primeiro verifica se é um erro crítico
      const isCritical = criticalPatterns.some(pattern => lowerMessage.includes(pattern));
      if (isCritical) return true;
      
      // Se não é crítico, verifica se está na lista de não-críticos
      const isNonCritical = nonCriticalPatterns.some(pattern => lowerMessage.includes(pattern));
      if (isNonCritical) return false;
      
      // Para mensagens que não se encaixam em nenhuma categoria, 
      // considera como warning se contém certas palavras-chave
      const warningKeywords = ['note:', 'info:', 'hint:', 'suggestion:', 'tip:'];
      const isWarning = warningKeywords.some(keyword => lowerMessage.includes(keyword));
      
      // Por padrão, se não conseguiu classificar e não tem indicadores de warning,
      // trata como erro (comportamento conservador)
      return !isWarning;
    };

    // ⚡ FUNÇÃO MELHORADA PARA ENVIAR LOGS COM DETECÇÃO DE REBUILDS ⚡
    const sendLog = (message, isError = false, forceShow = false) => {
      if (!message || !message.trim()) return; // Ignora mensagens vazias
      
      const now = Date.now();
      const lowerMessage = message.toLowerCase();
      
      // ⚡ DETECÇÃO INTELIGENTE DE REBUILDS E RECOMPILAÇÕES ⚡
      const isRebuildMessage = 
        lowerMessage.includes('file change detected') ||
        lowerMessage.includes('rebuilding') ||
        lowerMessage.includes('recompiling') ||
        lowerMessage.includes('compilation started') ||
        lowerMessage.includes('webpack compilation started') ||
        lowerMessage.includes('webpack building') ||
        lowerMessage.includes('compiling') ||
        lowerMessage.includes('building') ||
        lowerMessage.includes('recompiling') ||
        lowerMessage.includes('webpack compiled') ||
        lowerMessage.includes('bundle generation') ||
        lowerMessage.includes('chunk ') ||
        lowerMessage.includes('emitted') ||
        lowerMessage.includes('hash:') ||
        lowerMessage.includes('time:') ||
        lowerMessage.includes('built at:') ||
        (lowerMessage.includes('compiled') && (
          lowerMessage.includes('successfully') || 
          lowerMessage.includes('with') || 
          lowerMessage.includes('error') ||
          lowerMessage.includes('warnings')
        ));
      
      // ⚡ DETECÇÃO DE COMPILAÇÃO COMPLETA ⚡
      const isCompilationComplete = 
        lowerMessage.includes('compiled successfully') ||
        lowerMessage.includes('compilation complete') ||
        lowerMessage.includes('webpack compiled') ||
        lowerMessage.includes('build complete') ||
        lowerMessage.includes('√ compiled successfully') ||
        lowerMessage.includes('✓ compiled successfully') ||
        lowerMessage.includes('webpack: compiled successfully') ||
        lowerMessage.includes('compiled with') ||
        lowerMessage.includes('warnings but no errors') ||
        (lowerMessage.includes('compiled') && lowerMessage.includes('ms'));

      // ⚡ DETECÇÃO DE ERROS DE COMPILAÇÃO ⚡
      const isCompilationError = 
        lowerMessage.includes('compilation error') ||
        lowerMessage.includes('build error') ||
        lowerMessage.includes('webpack error') ||
        (lowerMessage.includes('error') && (
          lowerMessage.includes('ts') || 
          lowerMessage.includes('typescript') ||
          lowerMessage.includes('angular')
        ));

      // ⚡ LÓGICA ESPECIAL PARA REBUILDS - SEMPRE MOSTRA ⚡
      if (isRebuildMessage || forceShow) {
        if (isRebuildMessage && !isCompilationComplete) {
          compilationInProgress = true;
          lastRebuildTime = now;
          console.log(`[REBUILD] [REBUILD DETECTADO] ${message}`);
        }
        // Para rebuilds, sempre mostra a mensagem
        sendLogToUI(message, isError, true);
        return;
      }

      // ⚡ LÓGICA ESPECIAL PARA ERROS DE COMPILAÇÃO - SEMPRE MOSTRA ⚡
      if (isCompilationError || isError) {
        consecutiveErrors++;
        console.log(`❌ [ERRO COMPILAÇÃO] ${message} (Erro ${consecutiveErrors})`);
        sendLogToUI(message, true, true);
        compilationInProgress = false;
        return;
      }

      // ⚡ LÓGICA ESPECIAL PARA SUCESSO DE COMPILAÇÃO ⚡
      if (isCompilationComplete) {
        if (compilationInProgress || (now - lastRebuildTime < 30000)) {
          // Se há compilação em andamento ou rebuild recente, sempre mostra
          console.log(`✅ [COMPILAÇÃO SUCESSO] ${message}`);
          sendLogToUI(message, false, true);
          compilationInProgress = false;
          consecutiveErrors = 0; // Reset contador de erros
          return;
        } else {
          // Controle de spam apenas para sucessos sem rebuild recente
          if (now - lastLogTime < 3000) {
            return; // Ignora se a última mensagem foi há menos de 3 segundos
          }
        }
      }

      // ⚡ CONTROLE PADRÃO PARA OUTRAS MENSAGENS ⚡
      lastLogTime = now;
      sendLogToUI(message, isError, false);
    };

    // ⚡ FUNÇÃO AUXILIAR PARA ENVIAR LOGS PARA UI ⚡
    const sendLogToUI = (message, isError = false, isImportant = false) => {
      console.log(`[${isError ? 'STDERR' : 'STDOUT'}]${isImportant ? ' [IMPORTANTE]' : ''} ${message}`);
      
      // Detecta erros relacionados ao Git e adiciona orientação
      const lowerMessage = message.toLowerCase();
      let enhancedMessage = message;
      
      if (lowerMessage.includes('git') && (
          lowerMessage.includes('not found') ||
          lowerMessage.includes('command not found') ||
          lowerMessage.includes("'git' is not recognized") ||
          lowerMessage.includes('no such file or directory') ||
          lowerMessage.includes('fatal: not a git repository')
        )) {
        enhancedMessage += '\n\n💡 SOLUÇÃO: Git não está instalado ou não está no PATH do sistema.';
        enhancedMessage += '\n   • Acesse o menu "Instalar Dependências" para instalação automática';
        enhancedMessage += '\n   • Ou instale manualmente em: https://git-scm.com/downloads';
        enhancedMessage += '\n   • Após a instalação, reinicie o Micro Front-End Manager';
      }
      
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: enhancedMessage,
          index: projectIndex,
          name: projectName,
          error: isError,
          isImportant: isImportant
        });
      } else {
        event.reply('log', { 
          path: projectPath, 
          message: enhancedMessage,
          error: isError,
          isImportant: isImportant
        });
      }
    };

    childProcess.stdout.on('data', (data) => {
      // ⚡ VERIFICA CANCELAMENTO ANTES DE PROCESSAR DADOS ⚡
      if (checkCancelationAndExit(projectPath, "processamento de stdout")) {
        return;
      }

      let cleanData;
      try {
        cleanData = removeAnsiCodes(data.toString().trim());
      } catch (err) {
        console.error('Erro ao limpar caracteres ANSI:', err);
        cleanData = data.toString().trim();
      }

      // ⚡ DETECÇÃO MELHORADA DE REBUILDS E COMPILAÇÕES ⚡
      const lowerData = cleanData.toLowerCase();
      
      // Detecta início de rebuild/recompilação
      const isRebuildStart = 
        lowerData.includes('file change detected') ||
        lowerData.includes('rebuilding') ||
        lowerData.includes('recompiling') ||
        lowerData.includes('compilation started') ||
        lowerData.includes('webpack building') ||
        lowerData.includes('webpack compilation started') ||
        lowerData.includes('bundle generation') ||
        lowerData.includes('chunk ') ||
        lowerData.includes('emitted') ||
        lowerData.includes('hash:') ||
        lowerData.includes('time:') ||
        lowerData.includes('built at:') ||
        (lowerData.includes('compiling') && !lowerData.includes('compiled'));

      // Detecta compilação bem-sucedida
      const isCompilationSuccess = 
        lowerData.includes('compiled successfully') ||
        lowerData.includes('√ compiled successfully') ||
        lowerData.includes('✓ compiled successfully') ||
        lowerData.includes('webpack compiled successfully') ||
        lowerData.includes('webpack: compiled successfully') ||
        lowerData.includes('compiled with') ||
        lowerData.includes('warnings but no errors') ||
        (lowerData.includes('compiled') && lowerData.includes('ms'));

      // Detecta erros de compilação
      const hasCompilationError = 
        lowerData.includes('compilation error') ||
        lowerData.includes('build error') ||
        lowerData.includes('webpack error') ||
        lowerData.includes('failed to compile') ||
        lowerData.includes('compilation failed') ||
        lowerData.includes('build failed') ||
        (lowerData.includes('error') && (
          lowerData.includes('ts(') || 
          lowerData.includes('typescript') ||
          lowerData.includes('angular') ||
          lowerData.includes('ng ')
        )) ||
        (lowerData.includes('compiled with') && lowerData.includes('error'));

      // ⚡ FORÇA EXIBIÇÃO PARA REBUILDS E COMPILAÇÕES ⚡
      if (isRebuildStart || isCompilationSuccess || hasCompilationError) {
        sendLog(cleanData, false, true); // Force show = true
      } else {
        sendLog(cleanData, false, false);
      }

      // Detecta se uma porta está em uso
      const portInUseMatch = cleanData.match(/Port (\d+) is already in use/);
      if (portInUseMatch) {
        detectedPort = portInUseMatch[1];
        console.log(`Detectada porta em uso: ${detectedPort}`);
        
        // Evita múltiplas execuções, apenas processa se for a primeira detecção
        if (!portInUseDetected) {
          portInUseDetected = true;
          
          // Salva a porta detectada no projeto PAMP
          if (isPampProject && projectIndex !== -1) {
            projects[projectIndex].port = detectedPort;
            saveProjects(projects);
            console.log(`Porta ${detectedPort} salva para o projeto ${projectName}`);
          }
          
          // Informa o usuário
          const message = `Porta ${detectedPort} em uso. Tentando matar o processo nessa porta...`;
          sendLog(message, false, true);
          
          // Notifica a UI sobre a porta detectada (em laranja - não disponível ainda)
          event.reply('port-detected', {
            projectIndex: projectIndex,
            port: detectedPort,
            status: 'in-use',
            isPamp: isPampProject
          });
          
          // Encerra o processo atual que está esperando input
          if (runningProcesses[projectPath]) {
            runningProcesses[projectPath].kill();
            delete runningProcesses[projectPath];
          }
          
          // Aguarda para garantir que o processo foi encerrado
          clearTimeout(portInUseTimer);
          portInUseTimer = setTimeout(() => {
            // Mata o processo na porta detectada
            exec(`npx kill-port ${detectedPort}`, (err) => {
              let nextMessage;
              if (err) {
                nextMessage = `Erro ao liberar a porta ${detectedPort}: ${err.message}`;
                console.error(nextMessage);
              } else {
                nextMessage = `Porta ${detectedPort} liberada. Reiniciando projeto...`;
                console.log(nextMessage);
              }
              
              // Informa o usuário usando sendLog
              sendLog(nextMessage, false, true);
              
              // Inicia o projeto novamente após um breve intervalo
              setTimeout(() => {
                // Verifica cancelamento antes de reiniciar projeto
                if (checkCancelationAndExit(projectPath, "reinício do projeto após liberação de porta")) {
                  return;
                }
                
                console.log(`Reiniciando projeto ${projectName} após liberação de porta`);
                startProject(event, projectPath, detectedPort);
              }, 2000);
            });
          }, 500);
          
          return;
        }
      }

      // ⚡ DETECTA PORTA DO ANGULAR LIVE DEVELOPMENT SERVER ⚡
      const angularServerMatch = cleanData.match(/\*\* Angular Live Development Server is listening on localhost:(\d+)/);
      const browserOpenMatch = cleanData.match(/open your browser on http:\/\/localhost:(\d+)\//); 
      
      // ⚡ DETECTA PORTA DO WEBPACK-DEV-SERVER (PAS PROJECTS) ⚡
      const webpackServerMatch = cleanData.match(/Project is running at:/) || 
                                cleanData.match(/Loopback: http:\/\/localhost:(\d+)\//); 
      
      let detectedServerPort = null;
      if (angularServerMatch) {
        detectedServerPort = angularServerMatch[1];
      } else if (browserOpenMatch) {
        detectedServerPort = browserOpenMatch[1];
      } else if (webpackServerMatch && cleanData.includes('Loopback:')) {
        const loopbackMatch = cleanData.match(/Loopback: http:\/\/localhost:(\d+)\//); 
        if (loopbackMatch) {
          detectedServerPort = loopbackMatch[1];
        }
      }
      
      if (detectedServerPort) {
        console.log(`Detectada porta do servidor: ${detectedServerPort} para projeto ${projectName}`);
        
        // Salva a porta no projeto
        if (projectIndex !== -1) {
          projects[projectIndex].port = detectedServerPort;
          saveProjects(projects);
          console.log(`Porta ${detectedServerPort} salva para o projeto ${projectName}`);
        }
        
        // Notifica a UI sobre a porta detectada e funcionando (verde - clicável)
        event.reply('port-detected', {
          projectIndex: projectIndex,
          port: detectedServerPort,
          status: 'running',
          isPamp: isPampProject
        });
      }      // Detecta palavras-chave para atualizar o status 
      if (
        cleanData.toLowerCase().includes('successfully') || 
        cleanData.includes('√ Compiled successfully.') ||
        cleanData.includes('** Angular Live Development Server is listening on') ||
        cleanData.includes('✓ Compiled successfully') ||
        cleanData.includes('ÔêÜ Compiled successfully') ||
        cleanData.includes('webpack compiled successfully') ||
        (cleanData.includes('webpack') && cleanData.includes('compiled successfully')) ||
        cleanData.includes('webpack 5.99.3 compiled successfully') ||
        cleanData.includes('No errors found.') ||
        (cleanData.includes('webpack') && cleanData.match(/webpack \d+\.\d+\.\d+ compiled successfully/)) ||
        cleanData.includes('compiled successfully in')
      ) {
        console.log(`Projeto detectado como rodando: ${projectPath}`);
        event.reply('status-update', { 
          path: projectPath, 
          status: 'running',
          isPamp: isPampProject,
          index: projectIndex 
        });
        
        // ⚡ ATUALIZA PORTA PARA VERDE QUANDO COMPILAÇÃO É BEM-SUCEDIDA ⚡
        // Se o projeto já tem porta definida, atualiza para status 'running' (verde)
        const project = projects[projectIndex];
        if (project && project.port && projectIndex !== -1) {
          console.log(`Atualizando porta ${project.port} para verde (running) - projeto ${projectName}`);
          event.reply('port-detected', {
            projectIndex: projectIndex,
            port: project.port,
            status: 'running',
            isPamp: isPampProject
          });
        }
      }
    });

    childProcess.stderr.on('data', (data) => {
      // ⚡ VERIFICA CANCELAMENTO ANTES DE PROCESSAR DADOS ⚡
      if (checkCancelationAndExit(projectPath, "processamento de stderr")) {
        return;
      }

      let cleanData;
      try {
        cleanData = removeAnsiCodes(data.toString().trim());
      } catch (err) {
        console.error('Erro ao limpar caracteres ANSI:', err);
        cleanData = data.toString().trim();
      }

      // ⚡ ANÁLISE MELHORADA DE ERROS NO STDERR ⚡
      const lowerData = cleanData.toLowerCase();
      
      // Detecta se é realmente um erro crítico
      const isRealError = isActualError(cleanData);
      
      // Detecta erros de compilação específicos que devem sempre aparecer
      const isCompilationError = 
        lowerData.includes('compilation error') ||
        lowerData.includes('build error') ||
        lowerData.includes('typescript error') ||
        lowerData.includes('webpack error') ||
        lowerData.includes('failed to compile') ||
        lowerData.includes('compilation failed') ||
        lowerData.includes('build failed') ||
        (lowerData.includes('error') && (
          lowerData.includes('ts(') || 
          lowerData.includes('ng ') ||
          lowerData.includes('angular') ||
          lowerData.includes('typescript') ||
          lowerData.includes('webpack')
        ) && 
        // Exclui mensagens informativas do webpack-dev-server
        !lowerData.includes('[webpack-dev-server]') &&
        !lowerData.includes('project is running at') &&
        !lowerData.includes('loopback:') &&
        !lowerData.includes('on your network:')) ||
        (lowerData.includes('compiled with') && lowerData.includes('error'));
      
      // ⚡ FORÇA EXIBIÇÃO PARA ERROS DE COMPILAÇÃO ⚡
      if (isCompilationError) {
        sendLog(cleanData, true, true); // Force show = true para erros de compilação
      } else {
        // Para outros tipos de stderr, usa a classificação normal
        sendLog(cleanData, isRealError, false);
      }
    });
    
    childProcess.on('close', (code) => {
      delete runningProcesses[projectPath];
      
      // Remove proteção de início múltiplo
      const projectKey = `${projectPath}:${port || ''}`;
      startingProjects.delete(projectKey);
      console.log(`[DEBUG] Processo terminou, removido ${projectKey} da proteção`);
      
      // ⚡ VERIFICA SE FOI CANCELAMENTO INTENCIONAL ⚡
      const wasCanceled = isProjectCanceled(projectPath);
      if (wasCanceled) {
        console.log(`[CANCELAMENTO] Processo finalizado devido ao cancelamento intencional para ${projectPath}`);
        // Remove da lista de cancelados já que o processo foi devidamente finalizado
        unmarkProjectAsCanceled(projectPath);
        
        // Atualiza status na UI para indicar que foi cancelado
        if (isPampProject) {
          event.reply('status-update', { path: projectPath, status: 'stopped', isPamp: true, index: projectIndex });
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `🛑 Projeto cancelado com sucesso!`,
            index: projectIndex,
            name: projectName
          });
        } else {
          event.reply('status-update', { path: projectPath, status: 'stopped', isPamp: false, index: projectIndex });
          event.reply('log', { path: projectPath, message: `🛑 Projeto cancelado com sucesso!` });
        }
        return;
      }
      
      // Lógica mais inteligente para detectar erros reais
      // Código 0 = sucesso, null = processo foi morto intencionalmente
      // Código 130 = SIGINT (Ctrl+C), não é erro
      // Código 1 pode ser erro ou término normal em alguns casos
      const isIntentionalExit = code === null || code === 0 || code === 130;
      const isPotentialError = code === 1;
      
      // Para código 1, verifica se houve mensagens de erro reais durante a execução
      // Isso pode ser implementado com uma variável de controle se necessário
      let isError = false;
      
      if (!isIntentionalExit) {
        if (isPotentialError) {
          // Para código 1, verifica contexto adicional
          // Se o projeto chegou a compilar e rodar, provavelmente não é erro crítico
          console.log(`[DEBUG] Código 1 detectado para ${projectPath} - analisando contexto`);
          isError = false; // Assume que não é erro crítico por enquanto
        } else if (code > 1) {
          // Códigos maiores que 1 geralmente indicam erros reais
          isError = true;
        }
      }
      
      // Obter a versão atual do Node.js
      let nodeVersionInfo = '';
      try {
        nodeVersionInfo = execSync('node -v').toString().trim();
      } catch (err) {
        console.error('Erro ao obter versão do Node.js:', err);
        nodeVersionInfo = 'desconhecida';
      }
      
      // Verifica se é erro de sintaxe específico do Node.js em projetos PAMP
      const isNodeVersionError = isPotentialError && 
                                isPampProject && 
                                nodeVersionInfo !== 'v16.10.0';
      
      // Mensagem base - só mostra erro se realmente for um erro crítico
      let message = '';
      if (code === 0) {
        message = `✅ Projeto iniciado com sucesso em ${projectPath}`;
      } else if (isIntentionalExit) {
        message = `⏹️ Processo encerrado normalmente (código ${code || 'null'})`;
      } else if (isError) {
        message = `❌ O processo terminou com código de erro ${code}`;
      } else if (isPotentialError) {
        // Para código 1, dá uma mensagem mais neutra se não detectou erro real
        message = `⚠️ Processo encerrado (código ${code}) - Verificar logs para detalhes`;
      } else {
        message = `ℹ️ Processo encerrado (código ${code})`;
      }
            
      // Adicionar informações detalhadas para erros específicos
      if (isNodeVersionError) {
        message += `\n\nProvavelmente devido à incompatibilidade da versão do Node.js (${nodeVersionInfo}).
        Projetos PAMP requerem Node.js v16.10.0. A versão incompatível pode causar erros de sintaxe em arquivos de configuração.
        
        Considere usar o NVM (Node Version Manager) para alternar para a versão correta:
        1. Instale NVM: https://github.com/nvm-sh/nvm (Linux/Mac) ou https://github.com/coreybutler/nvm-windows (Windows)
        2. Execute: nvm install 16.10.0
        3. Execute: nvm use 16.10.0`;
      }
      
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message,
          index: projectIndex,
          name: projectName,
          error: isError // Adicione este flag para indicar erro
        });
        
        // Para projetos PAMP com erro, envie evento específico para resetar os botões
        if (isError) {
          event.reply('pamp-process-error', { 
            path: projectPath,
            index: projectIndex 
          });
        }
      } else {
        event.reply('log', { 
          path: projectPath, 
          message,
          error: isError // Também para projetos PAS
        });
        
        // Para projetos regulares com erro
        if (isError) {
          event.reply('process-error', { path: projectPath });
        }
      }
      
      // Atualize o status para 'stopped' em caso de erro ou término normal
      if (code !== 0 || !code) {
        event.reply('status-update', { path: projectPath, status: 'stopped' }); 
      }
    });
  }

// Variáveis globais para gerenciar processos de login
let terminalProcess = null;
let loginInProgress = false;
let loginTimeout = null;

// Função para limpar processos de login
function cleanupLoginProcesses() {
  console.log('🧹 Limpando processos de login...');
  
  // Limpa o timeout se existir
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = null;
    console.log('🔴 Timeout de login cancelado');
  }
  
  if (terminalProcess) {
    try {
      console.log('🔴 Terminando processo de terminal...');
      
      // Tenta finalizar graciosamente primeiro
      if (terminalProcess.stdin && !terminalProcess.stdin.destroyed) {
        terminalProcess.stdin.write('\x03\n'); // Ctrl+C
        terminalProcess.stdin.end();
      }
      
      // Força o término se necessário
      setTimeout(() => {
        if (terminalProcess && !terminalProcess.killed) {
          console.log('🔴 Forçando término do processo...');
          terminalProcess.kill('SIGTERM');
          
          // Se SIGTERM não funcionar, usa SIGKILL
          setTimeout(() => {
            if (terminalProcess && !terminalProcess.killed) {
              console.log('🔴 Usando SIGKILL...');
              terminalProcess.kill('SIGKILL');
            }
          }, 2000);
        }
      }, 1000);
      
    } catch (error) {
      console.error('❌ Erro ao limpar processo de terminal:', error);
    } finally {
      terminalProcess = null;
      loginInProgress = false;
    }
  }
  
  console.log('✅ Limpeza de processos concluída');
}

ipcMain.on('execute-command', (event, command) => {
  console.log(`🔧 Executando comando: ${command}`);
  
  if (!terminalProcess) {
    console.log('🚀 Inicializando novo processo de terminal...');
    loginInProgress = true;
    
    // Inicializa o terminal real
    terminalProcess = spawn('cmd.exe', [], { 
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    terminalProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`📤 Terminal output: ${output.trim()}`);
      event.reply('command-output', output);
    });

    terminalProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.log(`📤 Terminal error: ${error.trim()}`);
      event.reply('command-output', `${error}`);
    });

    terminalProcess.on('close', (code) => {
      console.log(`🔴 Processo de terminal encerrado com código: ${code}`);
      terminalProcess = null;
      loginInProgress = false;
    });

    terminalProcess.on('error', (error) => {
      console.error('❌ Erro no processo de terminal:', error);
      event.reply('command-output', `Erro: ${error.message}\n`);
      terminalProcess = null;
      loginInProgress = false;
    });
  }

  // Envia o comando para o terminal real
  if (terminalProcess && terminalProcess.stdin && !terminalProcess.stdin.destroyed) {
    try {
      terminalProcess.stdin.write(`${command}\n`);
      console.log(`✅ Comando enviado: ${command}`);
    } catch (error) {
      console.error('❌ Erro ao enviar comando:', error);
      event.reply('command-output', `Erro ao enviar comando: ${error.message}\n`);
    }
  } else {
    console.error('❌ Terminal não disponível para executar comando');
    event.reply('command-output', `Erro: Terminal não disponível\n`);
  }
});

  ipcMain.on('delete-project', (event, { index, path }) => {
    console.log(`Deletando projeto no caminho: ${path}`);
    event.reply('delete-project-log', { path, message: `Iniciando exclusão do projeto em ${path}...`, success: false, index });

    const deleteCommand = os.platform() === 'win32' ? `rmdir /s /q "${path}"` : `rm -rf "${path}"`;

    exec(deleteCommand, (err, stdout, stderr) => {
      if (err) {
        console.error(`Erro ao deletar o projeto: ${err.message}`);
        event.reply('delete-project-log', { path, message: `Erro ao deletar o projeto: ${err.message}`, success: false, index });
      }

      console.log(`Projeto deletado com sucesso: ${path}`);
      event.reply('delete-project-log', { path, message: `Projeto deletado com sucesso: ${path}`, success: true, index });

      projects[index].path = '';
      saveProjects(projects);
      event.reply('update-project', { index, path: '' });
    });
  });

  // Handler para abrir terminal na pasta do projeto
  ipcMain.on('open-terminal', (event, { projectPath }) => {
    console.log(`Abrindo terminal na pasta: ${projectPath}`);
    
    try {
      // Verifica se o caminho existe
      if (!fs.existsSync(projectPath)) {
        console.error(`Caminho não encontrado: ${projectPath}`);
        return;
      }
      
      // Comando para abrir terminal baseado no sistema operacional
      let command;
      if (os.platform() === 'win32') {
        // Windows: abre PowerShell na pasta usando cmd
        command = `cmd /c "cd /d "${projectPath}" && start powershell"`;
      } else if (os.platform() === 'darwin') {
        // macOS: abre Terminal na pasta
        command = `open -a Terminal "${projectPath}"`;
      } else {
        // Linux: tenta abrir terminal padrão
        command = `gnome-terminal --working-directory="${projectPath}" || xterm -e "cd '${projectPath}' && bash" || konsole --workdir "${projectPath}"`;
      }
      
      console.log(`Executando comando: ${command}`);
      exec(command, (err) => {
        if (err) {
          console.error(`Erro ao abrir terminal: ${err.message}`);
        } else {
          console.log(`Terminal aberto com sucesso em: ${projectPath}`);
        }
      });
      
    } catch (error) {
      console.error(`Erro ao abrir terminal:`, error);
    }
  });

  // Handler para abrir navegador
  ipcMain.on('open-browser', (event, { url }) => {
    console.log(`🌐 Abrindo navegador: ${url}`);
    const { shell } = require('electron');
    shell.openExternal(url).catch(error => {
      console.error('Erro ao abrir navegador:', error);
    });
  });

  // Handler para abrir arquivo environment.ts
  ipcMain.on('open-environment-file', (event, { filePath, mpPampPath }) => {
    console.log(`📝 Tentando abrir arquivo environment.ts: ${filePath}`);
    console.log(`📝 Caminho do mp-pamp: ${mpPampPath}`);
    
    try {
      // Verifica se o arquivo existe
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Arquivo não encontrado: ${filePath}`);
        
        // Notifica o frontend sobre o erro
        event.reply('environment-file-error', { 
          error: 'Arquivo não encontrado',
          message: `O arquivo environment.ts não foi encontrado em:\n${filePath}\n\nVerifique se o projeto mp-pamp está configurado corretamente e se a estrutura de pastas está completa.`
        });
        
        dialog.showErrorBox('Arquivo não encontrado', 
          `O arquivo environment.ts não foi encontrado em:\n${filePath}\n\nVerifique se o projeto mp-pamp está configurado corretamente e se a estrutura de pastas está completa.`);
        return;
      }
      
      console.log(`✅ Arquivo encontrado, abrindo: ${filePath}`);
      
      // Tenta abrir o arquivo
      openFileWithEditor(filePath, (success) => {
        if (success) {
          // Notifica o frontend sobre o sucesso
          event.reply('environment-file-opened', { 
            success: true,
            filePath: filePath
          });
        } else {
          // Notifica o frontend sobre o erro
          event.reply('environment-file-error', { 
            error: 'Erro ao abrir editor',
            message: 'Não foi possível abrir o editor de código.'
          });
        }
      });
      
    } catch (error) {
      console.error(`❌ Erro ao abrir arquivo environment.ts:`, error);
      
      // Notifica o frontend sobre o erro
      event.reply('environment-file-error', { 
        error: 'Erro inesperado',
        message: `Erro inesperado ao tentar abrir o arquivo:\n${error.message}`
      });
      
      dialog.showErrorBox('Erro', `Erro inesperado ao tentar abrir o arquivo:\n${error.message}`);
    }
  });

  // Função auxiliar para abrir arquivo com editor
  function openFileWithEditor(filePath, callback) {
    // Define comandos baseados no sistema operacional
    let codeCommand;
    if (os.platform() === 'win32') {
      codeCommand = `code "${filePath}"`;
    } else if (os.platform() === 'darwin') {
      // macOS
      codeCommand = `code "${filePath}"`;
    } else {
      // Linux
      codeCommand = `code "${filePath}" || gedit "${filePath}" || nano "${filePath}"`;
    }
    
    console.log(`📝 Executando comando: ${codeCommand}`);
    
    exec(codeCommand, (codeError) => {
      if (codeError) {
        console.log('Editor de código não encontrado, tentando abrir com editor padrão...');
        
        // Se editores de código não estiverem disponíveis, abre com o editor padrão do sistema
        const { shell } = require('electron');
        shell.openPath(filePath).then((result) => {
          if (result) {
            console.error(`Erro ao abrir arquivo com editor padrão: ${result}`);
            if (callback) callback(false);
          } else {
            console.log(`Arquivo environment.ts aberto com sucesso: ${filePath}`);
            if (callback) callback(true);
          }
        }).catch((shellError) => {
          console.error(`Erro ao abrir arquivo:`, shellError);
          if (callback) callback(false);
        });
      } else {
        console.log(`Arquivo environment.ts aberto no editor: ${filePath}`);
        if (callback) callback(true);
      }
    });
  }

  // Handler para procurar projeto existente na máquina
  ipcMain.on('browse-project-folder', async (event, { index, projectName }) => {
    console.log(`Procurando pasta para projeto: ${projectName} (índice: ${index})`);
    
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: `Selecione a pasta do projeto ${projectName}`,
        buttonLabel: 'Selecionar Pasta',
        defaultPath: path.join('C:', 'projetos') // Sugere o diretório padrão
      });

      if (result.canceled) {
        console.log('Usuário cancelou a seleção da pasta');
        return;
      }

      const selectedPath = result.filePaths[0];
      console.log(`Pasta selecionada: ${selectedPath}`);
      
      // Valida se a pasta contém arquivos de projeto (package.json, etc)
      const hasPackageJson = fs.existsSync(path.join(selectedPath, 'package.json'));
      const folderName = path.basename(selectedPath);
      const isCorrectName = folderName === projectName;
      
      let confirmMessage = '';
      if (!hasPackageJson) {
        confirmMessage += '⚠️ Esta pasta não contém um arquivo package.json.\n';
      }
      if (!isCorrectName) {
        confirmMessage += `⚠️ O nome da pasta (${folderName}) é diferente do projeto (${projectName}).\n`;
      }
      
      if (confirmMessage) {
        confirmMessage += '\nDeseja continuar mesmo assim?';
        const confirmResult = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          title: 'Validação da Pasta',
          message: 'Pasta selecionada',
          detail: confirmMessage,
          buttons: ['Cancelar', 'Continuar'],
          defaultId: 0,
          cancelId: 0
        });

        if (confirmResult.response === 0) {
          console.log('Usuário cancelou após validação');
          return;
        }
      }

      // Atualiza o projeto com o novo caminho
      projects[index].path = selectedPath;
      saveProjects(projects);
      
      console.log(`Projeto ${projectName} atualizado com caminho: ${selectedPath}`);
      
      // Notifica o frontend para atualizar o input
      event.reply('project-path-selected', { 
        index: index, 
        path: selectedPath,
        projectName: projectName
      });
      
      // Mostra mensagem de sucesso
      mainWindow.webContents.send('log', { 
        message: `📁 Projeto ${projectName} configurado: ${selectedPath}` 
      });
      
    } catch (error) {
      console.error('Erro ao procurar pasta do projeto:', error);
      mainWindow.webContents.send('log', { 
        message: `Erro ao procurar pasta: ${error.message}` 
      });
    }
  });

  // Handler para mover projeto para nova localização
  ipcMain.on('move-project', async (event, { index, currentPath, projectName }) => {
    console.log(`Iniciando processo de mover projeto: ${projectName} de ${currentPath}`);
    
    try {
      // Verifica se o projeto está rodando
      if (runningProcesses[currentPath]) {
        event.reply('move-project-log', { 
          index, 
          message: `Erro: Não é possível mover o projeto enquanto ele estiver rodando. Pare o projeto primeiro.`, 
          success: false 
        });
        return;
      }

      // Abre o dialog para selecionar a nova pasta
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: `Selecione o local para mover o projeto ${projectName}`,
        buttonLabel: 'Mover para este local'
      });

      if (result.canceled) {
        console.log('Usuário cancelou a seleção da pasta');
        event.reply('move-project-log', { 
          index, 
          message: `Operação cancelada pelo usuário.`, 
          success: false 
        });
        return;
      }

      const newBasePath = result.filePaths[0];
      const newProjectPath = path.join(newBasePath, path.basename(currentPath));
      
      console.log(`Movendo projeto de ${currentPath} para ${newProjectPath}`);
      
      // Verifica se o destino já existe
      if (fs.existsSync(newProjectPath)) {
        // Pergunta ao usuário se deseja substituir
        const replaceResult = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          title: 'Destino já existe',
          message: `O destino ${newProjectPath} já existe!`,
          detail: 'Deseja substituir o projeto existente?',
          buttons: ['Cancelar', 'Substituir'],
          defaultId: 0,
          cancelId: 0
        });

        if (replaceResult.response === 0) {
          // Usuário escolheu cancelar
          event.reply('move-project-log', { 
            index, 
            message: `Operação cancelada: destino já existe.`, 
            success: false 
          });
          return;
        }

        // Se chegou aqui, usuário escolheu substituir - remove o destino existente
        event.reply('move-project-log', { 
          index, 
          message: `Removendo projeto existente no destino...`, 
          success: false 
        });

        try {
          await removeDirectoryRecursive(newProjectPath, event, index);
        } catch (removeError) {
          event.reply('move-project-log', { 
            index, 
            message: `Erro ao remover destino existente: ${removeError.message}`, 
            success: false 
          });
          return;
        }
      }

      // Verifica se o caminho de origem existe
      if (!fs.existsSync(currentPath)) {
        event.reply('move-project-log', { 
          index, 
          message: `Erro: O caminho de origem ${currentPath} não existe!`, 
          success: false 
        });
        return;
      }

      // Envia log de início
      event.reply('move-project-log', { 
        index, 
        message: `Movendo projeto para ${newProjectPath}...`, 
        success: false 
      });

      // Usa fs nativo do Node.js para mover usando rename (mais rápido e confiável)
      try {
        await fs.promises.rename(currentPath, newProjectPath);
        
        console.log(`Projeto movido com sucesso para: ${newProjectPath}`);
        event.reply('move-project-log', { 
          index, 
          message: `Projeto movido com sucesso para: ${newProjectPath}`, 
          success: true 
        });

        // Atualiza o path do projeto no array e salva
        projects[index].path = newProjectPath;
        saveProjects(projects);
        
        console.log(`Notificando frontend para atualizar input: índice ${index}, novo path: ${newProjectPath}`);
        
        // Notifica o frontend para atualizar o input
        event.reply('update-project-path', { index, path: newProjectPath });
        
        // Também força um reload dos projetos para garantir sincronização
        setTimeout(() => {
          mainWindow.webContents.send('projects-loaded', projects);
        }, 500);
        
      } catch (renameError) {
        console.log(`Rename falhou, tentando cópia + remoção: ${renameError.message}`);
        event.reply('move-project-log', { 
          index, 
          message: `Rename falhou, tentando método alternativo...`, 
          success: false 
        });
        
        // Se rename falhar (provavelmente entre discos diferentes), usar cópia + remoção
        event.reply('move-project-log', { 
          index, 
          message: `Movendo entre discos diferentes. Iniciando cópia de arquivos...`, 
          success: false 
        });
        
        // Adiciona timeout para operações longas
        const moveTimeout = setTimeout(() => {
          event.reply('move-project-log', { 
            index, 
            message: `Operação de cópia está levando mais tempo que o esperado. Por favor, aguarde...`, 
            success: false 
          });
        }, 30000); // 30 segundos
        
        try {
          await copyDirectoryRecursive(currentPath, newProjectPath, event, index);
          
          event.reply('move-project-log', { 
            index, 
            message: `Cópia concluída, removendo pasta original...`, 
            success: false 
          });
          
          // Remove a pasta original após cópia bem-sucedida
          await removeDirectoryRecursive(currentPath, event, index);
          
          clearTimeout(moveTimeout);
          
          console.log(`Projeto movido com sucesso para: ${newProjectPath}`);
          event.reply('move-project-log', { 
            index, 
            message: `Projeto movido com sucesso para: ${newProjectPath}`, 
            success: true 
          });

          // Atualiza o path do projeto no array e salva
          projects[index].path = newProjectPath;
          saveProjects(projects);
          
          console.log(`Notificando frontend para atualizar input: índice ${index}, novo path: ${newProjectPath}`);
          
          // Notifica o frontend para atualizar o input
          event.reply('update-project-path', { index, path: newProjectPath });
          
          // Também força um reload dos projetos para garantir sincronização
          setTimeout(() => {
            mainWindow.webContents.send('projects-loaded', projects);
          }, 500);
          
        } catch (copyError) {
          clearTimeout(moveTimeout);
          throw copyError;
        }
      }

    } catch (error) {
      console.error('Erro no processo de mover projeto:', error);
      event.reply('move-project-log', { 
        index, 
        message: `Erro inesperado: ${error.message}`, 
        success: false 
      });
    }
  });

  // Função auxiliar para copiar diretório recursivamente
  async function copyDirectoryRecursive(src, dest, event = null, index = null) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    let fileCount = 0;
    let totalFiles = 0;

    // Conta total de arquivos para progresso
    const countFiles = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (let entry of entries) {
        if (entry.isDirectory()) {
          await countFiles(path.join(dir, entry.name));
        } else {
          totalFiles++;
        }
      }
    };

    await countFiles(src);

    const copyRecursive = async (srcDir, destDir) => {
      const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });

      for (let entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
          await fs.promises.mkdir(destPath, { recursive: true });
          await copyRecursive(srcPath, destPath);
        } else {
          await fs.promises.copyFile(srcPath, destPath);
          fileCount++;
          
          // Envia progresso a cada 100 arquivos ou no final
          if (event && index !== null && (fileCount % 100 === 0 || fileCount === totalFiles)) {
            event.reply('move-project-log', { 
              index, 
              message: `Copiando arquivos... ${fileCount}/${totalFiles} (${Math.round((fileCount/totalFiles)*100)}%)`, 
              success: false 
            });
          }
        }
      }
    };

    await copyRecursive(src, dest);
  }

  // Função auxiliar para remover diretório recursivamente
  async function removeDirectoryRecursive(dirPath, event = null, index = null) {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const removeRecursive = async (currentPath) => {
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      
      for (let entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          await removeRecursive(fullPath);
        } else {
          // Tenta remover atributos readonly antes de deletar
          try {
            await fs.promises.chmod(fullPath, 0o666);
          } catch (chmodError) {
            // Ignora erros de chmod
          }
          
          try {
            await fs.promises.unlink(fullPath);
          } catch (unlinkError) {
            // Se falhar, tenta forçar a remoção no Windows
            if (os.platform() === 'win32') {
              try {
                require('child_process').execSync(`del /f /q "${fullPath}"`, { stdio: 'ignore' });
              } catch (delError) {
                console.error(`Erro ao deletar arquivo ${fullPath}:`, delError.message);
              }
            }
          }
        }
      }
      
      // Remove o diretório vazio
      try {
        await fs.promises.rmdir(currentPath);
      } catch (rmdirError) {
        // Se falhar, tenta forçar a remoção no Windows
        if (os.platform() === 'win32') {
          try {
            require('child_process').execSync(`rmdir /s /q "${currentPath}"`, { stdio: 'ignore' });
          } catch (rmdirForceError) {
            console.error(`Erro ao deletar diretório ${currentPath}:`, rmdirForceError.message);
          }
        }
      }
    };

    if (event && index !== null) {
      event.reply('move-project-log', { 
        index, 
        message: `Removendo pasta original...`, 
        success: false 
      });
    }

    await removeRecursive(dirPath);
  }

  // Handler para instalação de dependências - usando 'on' em vez de 'once' para permitir múltiplas execuções
  ipcMain.on('start-installation', async (event) => {
    // Previne múltiplas execuções simultâneas
    if (global.installationInProgress) {
      event.reply('installation-log', '⚠️ Uma instalação já está em progresso...');
      return;
    }

    global.installationInProgress = true;

    console.log('Iniciando instalação de dependências (Git, Node.js e Angular CLI)...');

    // Função para cleanup quando instalação terminar ou der erro
    const cleanupInstallation = () => {
      global.installationInProgress = false;
      console.log('🧹 Limpeza da instalação concluída');
    };

    try {
      event.reply('installation-log', 'Iniciando instalação de dependências...');
      event.reply('installation-log', 'Verificando Git, Node.js e Angular CLI...');

      const sendLog = (message) => {
        console.log(message); // Log no console para depuração
        // Verifica se o event sender ainda existe antes de enviar
        try {
          if (event && event.reply && !event.sender.isDestroyed()) {
            event.reply('installation-log', message);
          }
        } catch (error) {
          console.warn('Não foi possível enviar log para janela (provavelmente fechada):', message);
        }
      };

    // Função para verificar Git
    const checkGit = async () => {
      sendLog('🔍 Passo 1: Verificando Git...');
      try {
        const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
        sendLog(`✅ Git encontrado: ${gitVersion}`);
        return true;
      } catch (error) {
        sendLog('❌ Git não encontrado no sistema.');
        return false;
      }
    };

    // Função para instalar Git
    const installGit = async () => {
      const isWindows = os.platform() === 'win32';
      const isLinux = os.platform() === 'linux';
      const isMac = os.platform() === 'darwin';
      
      sendLog('📥 Iniciando instalação do Git...');
      
      if (isWindows) {
        return await installGitWindows();
      } else if (isLinux) {
        return await installGitLinux();
      } else if (isMac) {
        return await installGitMac();
      } else {
        sendLog('❌ Sistema operacional não suportado para instalação automática do Git.');
        sendLog('Por favor, instale o Git manualmente em: https://git-scm.com/downloads');
        return false;
      }
    };

    // Instalação do Git no Windows
    const installGitWindows = async () => {
      try {
        sendLog('🪟 Detectado sistema Windows');
        
        // Função helper para aguardar confirmação do usuário
        const waitForUserConfirmation = (message) => {
          return new Promise((resolve) => {
            sendLog(message);
            sendLog('');
            
            // Para instalação de dependências, assumimos que o usuário quer continuar
            // já que ele clicou propositalmente em "Instalar Dependências"
            sendLog('💡 Prosseguindo automaticamente...');
            sendLog('   (Usuário já confirmou ao clicar em "Instalar Dependências")');
            sendLog('');
            
            // Pequeno delay para dar tempo de ler a mensagem
            setTimeout(() => {
              sendLog('✅ Continuando com a instalação...');
              resolve(true);
            }, 1500);
          });
        };
        
        // Verifica se winget está disponível
        let hasWinget = false;
        let hasChoco = false;
        
        try {
          sendLog('🔍 Verificando se winget está instalado...');
          await execPromise('winget --version');
          sendLog('✅ winget encontrado!');
          hasWinget = true;
        } catch (wingetError) {
          sendLog('❌ winget não encontrado');
        }
        
        // Verifica se chocolatey está disponível
        if (!hasWinget) {
          try {
            sendLog('🔍 Verificando se chocolatey está instalado...');
            await execPromise('choco --version');
            sendLog('✅ chocolatey encontrado!');
            hasChoco = true;
          } catch (chocoError) {
            sendLog('❌ chocolatey não encontrado');
          }
        }
        
        // Se nenhum gerenciador está disponível, oferece instalação
        if (!hasWinget && !hasChoco) {
          sendLog('');
          sendLog('🛠️ Nenhum gerenciador de pacotes encontrado (winget/chocolatey)');
          sendLog('Para instalar o Git automaticamente, precisamos de um gerenciador de pacotes.');
          sendLog('');
          sendLog('Opções disponíveis:');
          sendLog('1. winget (recomendado - moderno e integrado ao Windows)');
          sendLog('2. chocolatey (alternativa popular)');
          sendLog('');
          
          // Tenta instalar winget primeiro
          const shouldInstallWinget = await waitForUserConfirmation('🔄 Deseja instalar o winget (Microsoft App Installer)?');
          
          if (shouldInstallWinget) {
            try {
              sendLog('� Instalando winget (Microsoft App Installer)...');
              sendLog('Isso pode levar alguns minutos...');
              
              // Método 1: Tenta via Microsoft Store (mais confiável)
              try {
                sendLog('🏪 Abrindo Microsoft Store...');
                await execPromise('start ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1');
                sendLog('ℹ️ Microsoft Store aberta para instalar "App Installer".');
                sendLog('Após a instalação na Store, volte aqui.');
                
                const continueAfterStore = await waitForUserConfirmation('✅ Instalou o App Installer via Microsoft Store?');
                if (continueAfterStore) {
                  // Verifica se winget agora está disponível
                  await execPromise('winget --version');
                  sendLog('✅ winget instalado e funcionando!');
                  hasWinget = true;
                } else {
                  throw new Error('Usuário não confirmou instalação via Store');
                }
                
              } catch (storeError) {
                sendLog('⚠️ Método via Store não funcionou, tentando download direto...');
                
                // Método 2: Download direto do pacote
                try {
                  const downloadWingetCommand = [
                    '$ProgressPreference = "SilentlyContinue"',
                    'Write-Output "Baixando Microsoft App Installer..."',
                    '$url = "https://github.com/microsoft/winget-cli/releases/latest/download/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle"',
                    '$output = "$env:TEMP\\Microsoft.DesktopAppInstaller.msixbundle"',
                    'Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing',
                    'Write-Output "Instalando Microsoft App Installer..."',
                    'Add-AppxPackage -Path $output',
                    'Write-Output "winget instalado com sucesso!"'
                  ].join('; ');
                  
                  await execPromise(`powershell -ExecutionPolicy Bypass -Command "${downloadWingetCommand}"`);
                  
                  // Verifica se a instalação funcionou
                  await execPromise('winget --version');
                  sendLog('✅ winget instalado com sucesso via download direto!');
                  hasWinget = true;
                } catch (downloadError) {
                  throw new Error(`Falha no download: ${downloadError.message}`);
                }
              }
            } catch (error) {
              sendLog(`❌ Erro na instalação do winget: ${error.message}`);
            }
          }
          
          // Se winget falhou, tenta chocolatey
          if (!hasWinget) {
            const shouldInstallChoco = await waitForUserConfirmation('🔄 winget não disponível. Deseja instalar o chocolatey?');
            
            if (shouldInstallChoco) {
              try {
                sendLog('📥 Instalando chocolatey...');
                sendLog('Isso pode levar alguns minutos...');
                
                const installChocoCommand = [
                  'Set-ExecutionPolicy Bypass -Scope Process -Force',
                  '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072',
                  'iex ((New-Object System.Net.WebClient).DownloadString("https://community.chocolatey.org/install.ps1"))'
                ].join('; ');
                
                await execPromise(`powershell -ExecutionPolicy Bypass -Command "${installChocoCommand}"`);
                sendLog('✅ chocolatey instalado com sucesso!');
                hasChoco = true;
                
                // Recarrega PATH para chocolatey
                sendLog('🔄 Recarregando variáveis de ambiente...');
                process.env.PATH = process.env.PATH + ';C:\\ProgramData\\chocolatey\\bin';
                
              } catch (chocoInstallError) {
                sendLog(`❌ Erro na instalação do chocolatey: ${chocoInstallError.message}`);
                sendLog('💡 Instalação manual do chocolatey:');
                sendLog('1. Abra PowerShell como Administrador');
                sendLog('2. Execute: Set-ExecutionPolicy Bypass -Scope Process -Force');
                sendLog('3. Execute: iex ((New-Object System.Net.WebClient).DownloadString("https://chocolatey.org/install.ps1"))');
                sendLog('4. Reinicie este processo');
              }
            }
          }
        }
        
        // Agora tenta instalar Git com o gerenciador disponível
        sendLog('');
        sendLog('📥 Tentando instalar Git...');
        
        if (hasWinget) {
          try {
            sendLog('🔄 Instalando Git via winget...');
            await execPromise('winget install --id Git.Git -e --source winget --silent');
            sendLog('✅ Git instalado com sucesso via winget!');
            return true;
          } catch (wingetGitError) {
            sendLog(`⚠️ Falha na instalação via winget: ${wingetGitError.message}`);
            hasWinget = false; // Marca como não disponível para próxima tentativa
          }
        }
        
        if (hasChoco) {
          try {
            sendLog('🔄 Instalando Git via chocolatey...');
            await execPromise('choco install git -y');
            sendLog('✅ Git instalado com sucesso via chocolatey!');
            return true;
          } catch (chocoGitError) {
            sendLog(`⚠️ Falha na instalação via chocolatey: ${chocoGitError.message}`);
          }
        }
        
        // Se chegou aqui, todos os métodos falharam
        sendLog('');
        sendLog('❌ Instalação automática do Git falhou');
        sendLog('💡 Instalação manual recomendada:');
        sendLog('');
        sendLog('📋 OPÇÕES DE INSTALAÇÃO MANUAL:');
        sendLog('1. Site oficial: https://git-scm.com/download/win');
        sendLog('2. Via Microsoft Store: procure "Git"');
        sendLog('3. Via GitHub Desktop (inclui Git): https://desktop.github.com/');
        sendLog('');
        sendLog('⚠️ Após a instalação manual:');
        sendLog('• Reinicie o Micro Front-End Manager');
        sendLog('• Ou adicione Git ao PATH do sistema');
        sendLog('');
        
        return false;
        
      } catch (error) {
        sendLog(`❌ Erro crítico na instalação do Git no Windows: ${error.message}`);
        return false;
      }
    };

    // Instalação do Git no Linux
    const installGitLinux = async () => {
      try {
        sendLog('🐧 Detectado sistema Linux');
        
        // Tenta detectar a distribuição
        let installCommand = '';
        
        try {
          // Ubuntu/Debian
          await execPromise('which apt-get');
          installCommand = 'sudo apt-get update && sudo apt-get install -y git';
          sendLog('📦 Usando apt-get (Ubuntu/Debian)...');
        } catch {
          try {
            // CentOS/RHEL/Fedora
            await execPromise('which yum');
            installCommand = 'sudo yum install -y git';
            sendLog('📦 Usando yum (CentOS/RHEL)...');
          } catch {
            try {
              // Fedora moderno
              await execPromise('which dnf');
              installCommand = 'sudo dnf install -y git';
              sendLog('📦 Usando dnf (Fedora)...');
            } catch {
              try {
                // Arch Linux
                await execPromise('which pacman');
                installCommand = 'sudo pacman -S --noconfirm git';
                sendLog('📦 Usando pacman (Arch Linux)...');
              } catch {
                sendLog('❌ Gerenciador de pacotes não identificado.');
                sendLog('Por favor, instale o Git manualmente usando seu gerenciador de pacotes.');
                return false;
              }
            }
          }
        }
        
        sendLog(`🔄 Executando: ${installCommand}`);
        await execPromise(installCommand);
        sendLog('✅ Git instalado com sucesso no Linux!');
        return true;
        
      } catch (error) {
        sendLog(`❌ Erro na instalação do Git no Linux: ${error.message}`);
        sendLog('💡 Tente executar manualmente:');
        sendLog('   Ubuntu/Debian: sudo apt-get install git');
        sendLog('   CentOS/RHEL: sudo yum install git');
        sendLog('   Fedora: sudo dnf install git');
        sendLog('   Arch: sudo pacman -S git');
        return false;
      }
    };

    // Instalação do Git no macOS
    const installGitMac = async () => {
      try {
        sendLog('🍎 Detectado sistema macOS');
        
        // Tenta usar Homebrew primeiro
        try {
          sendLog('🔄 Tentando instalar via Homebrew...');
          await execPromise('brew install git');
          sendLog('✅ Git instalado com sucesso via Homebrew!');
          return true;
        } catch (brewError) {
          sendLog('⚠️ Homebrew não disponível ou falhou');
        }
        
        // Se Homebrew falhou, usa Xcode Command Line Tools
        try {
          sendLog('🔄 Tentando instalar via Xcode Command Line Tools...');
          await execPromise('xcode-select --install');
          sendLog('✅ Git será instalado com Xcode Command Line Tools');
          sendLog('ℹ️ Pode ser necessário confirmar a instalação na janela que abriu');
          return true;
        } catch (xcodeError) {
          sendLog('❌ Erro ao instalar Command Line Tools');
        }
        
        sendLog('💡 Para instalação manual no macOS:');
        sendLog('1. Instale Homebrew: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
        sendLog('2. Execute: brew install git');
        sendLog('Ou baixe em: https://git-scm.com/download/mac');
        
        return false;
        
      } catch (error) {
        sendLog(`❌ Erro na instalação do Git no macOS: ${error.message}`);
        return false;
      }
    };
  
    const installNodeWindows = async () => {
      sendLog('🔍 Passo 2: Verificando Node.js...');
      
      // Primeira verificação: Node.js já está na versão correta?
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        sendLog(`Node.js encontrado: ${nodeVersion}`);
        if (nodeVersion === 'v16.10.0') {
          sendLog('✓ Node.js já está instalado na versão 16.10.0.');
          sendLog('Nenhuma ação necessária para o Node.js.');
          return Promise.resolve();
        } else {
          sendLog(`⚠️ Versão atual: ${nodeVersion} (recomendada: v16.10.0)`);
          sendLog('IMPORTANTE: Se você já tem projetos funcionando com esta versão,');
          sendLog('pode não ser necessário fazer upgrade. Prosseguindo com verificações...');
        }
      } catch {
        sendLog('Node.js não encontrado no PATH do sistema.');
      }

      // Segunda verificação: NVM está instalado?
      sendLog('Verificando se NVM (Node Version Manager) está disponível...');
      try {
        const nvmVersion = execSync('nvm version', { encoding: 'utf8' }).trim();
        sendLog(`✓ NVM encontrado: ${nvmVersion}`);
        
        // Se NVM existe, verifica se Node.js 16.10.0 já está instalado via NVM
        try {
          const nvmList = execSync('nvm list', { encoding: 'utf8' });
          if (nvmList.includes('16.10.0')) {
            sendLog('✓ Node.js 16.10.0 já está instalado via NVM.');
            sendLog('Ativando Node.js 16.10.0...');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 ativado com sucesso.');
            return Promise.resolve();
          } else {
            sendLog('Node.js 16.10.0 não encontrado. Instalando via NVM...');
            await execPromise('nvm install 16.10.0');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 instalado e ativado via NVM.');
            return Promise.resolve();
          }
        } catch (nvmListError) {
          sendLog('Erro ao listar versões do NVM. Tentando instalar Node.js 16.10.0...');
          try {
            await execPromise('nvm install 16.10.0');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 instalado e ativado via NVM.');
            return Promise.resolve();
          } catch (installError) {
            sendLog(`Erro ao instalar via NVM existente: ${installError.message}`);
            sendLog('Prosseguindo com método alternativo...');
          }
        }
      } catch {
        sendLog('NVM não encontrado no sistema.');
      }

      // Terceira verificação: Se Node.js existe mas não é a versão ideal
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        if (nodeVersion && nodeVersion !== 'v16.10.0') {
          sendLog('═══════════════════════════════════════════════════════════════');
          sendLog('⚠️  ATENÇÃO: Node.js já está instalado em uma versão diferente!');
          sendLog(`   Versão atual: ${nodeVersion}`);
          sendLog(`   Versão recomendada: v16.10.0`);
          sendLog('');
          sendLog('OPÇÕES DISPONÍVEIS:');
          sendLog('1. Manter a versão atual (pode funcionar para a maioria dos casos)');
          sendLog('2. Instalar NVM para gerenciar múltiplas versões');
          sendLog('3. Substituir por Node.js 16.10.0 (pode afetar outros projetos)');
          sendLog('');
          sendLog('Por segurança, mantendo a versão atual instalada.');
          sendLog('Se houver problemas, considere instalar o NVM manualmente.');
          sendLog('═══════════════════════════════════════════════════════════════');
          return Promise.resolve();
        }
      } catch {
        // Node.js não existe, prosseguir com instalação
      }

      // Quarta opção: Instalar NVM apenas se nada foi encontrado
      sendLog('');
      sendLog('Nenhuma instalação adequada do Node.js ou NVM foi encontrada.');
      sendLog('Iniciando instalação do NVM para gerenciamento de versões...');

      try {
        // Download e instalação do NVM (apenas se nada foi encontrado)
        const nvmDir = path.join(os.homedir(), 'nvm');
        sendLog(`Criando diretório NVM em: ${nvmDir}`);
        
        if (!fs.existsSync(nvmDir)) {
          fs.mkdirSync(nvmDir, { recursive: true });
        }

        const nvmZipUrl = 'https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-noinstall.zip';
        const nvmZipPath = path.join(os.tmpdir(), 'nvm-noinstall.zip');
        
        sendLog('Baixando NVM for Windows...');
        await downloadFileWithRetry(nvmZipUrl, nvmZipPath);
        
        sendLog('Extraindo NVM...');
        await extractZip(nvmZipPath, nvmDir);
        
        // Adicionar NVM ao PATH do usuário
        sendLog('Configurando NVM no PATH...');
        await addToUserPath(nvmDir);
        
        // Configurar NVM
        const settingsPath = path.join(nvmDir, 'settings.txt');
        const settingsContent = `root: ${nvmDir}\npath: ${path.join(nvmDir, 'nodejs')}\n`;
        fs.writeFileSync(settingsPath, settingsContent);
        
        sendLog('Aguardando configuração do PATH (10 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Instalar Node.js via NVM
        sendLog('Instalando Node.js 16.10.0 via NVM recém-instalado...');
        await execPromise(`"${path.join(nvmDir, 'nvm.exe')}" install 16.10.0`);
        await execPromise(`"${path.join(nvmDir, 'nvm.exe')}" use 16.10.0`);
        
        sendLog('✓ NVM e Node.js 16.10.0 instalados com sucesso.');
        
      } catch (error) {
        sendLog(`Erro na instalação via NVM: ${error.message}`);
        sendLog('Tentando instalação direta do Node.js como último recurso...');
        
        // Fallback: instalação direta (apenas se tudo falhar)
        const installerUrl = 'https://nodejs.org/dist/v16.10.0/node-v16.10.0-x64.msi';
        const installerPath = path.join(os.tmpdir(), 'node-v16.10.0-x64.msi');
        
        sendLog('Baixando instalador oficial do Node.js...');
        await downloadFileWithRetry(installerUrl, installerPath);
        
        sendLog('Executando instalador do Node.js... (Isso pode demorar alguns minutos)');
        sendLog('AVISO: Esta instalação pode substituir versões existentes do Node.js!');
        await execPromise(`msiexec /i "${installerPath}" /quiet /norestart`);
        
        sendLog('Aguardando finalização da instalação (30 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        sendLog('✓ Node.js instalado com sucesso via instalador MSI.');
      }
    };

    const installNodeLinux = async () => {
      sendLog('Detectado sistema Linux. Verificando Node.js...');
      
      // Verifica se Node.js já está instalado na versão correta
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        sendLog(`Node.js encontrado: ${nodeVersion}`);
        if (nodeVersion === 'v16.10.0') {
          sendLog('✓ Node.js já está instalado na versão 16.10.0.');
          sendLog('Nenhuma ação necessária para o Node.js.');
          return Promise.resolve();
        } else {
          sendLog(`⚠️ Versão atual: ${nodeVersion} (recomendada: v16.10.0)`);
          sendLog('IMPORTANTE: Se você já tem projetos funcionando com esta versão,');
          sendLog('pode não ser necessário fazer upgrade. Prosseguindo com instalação...');
        }
      } catch {
        sendLog('Node.js não encontrado. Instalando Node.js 16.x...');
      }

      try {
        // Usar NodeSource repository para versão específica
        sendLog('Configurando repositório NodeSource...');
        await execPromise('curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -');
        
        sendLog('Instalando Node.js 16.x...');
        await execPromise('sudo apt-get install -y nodejs');
        
        sendLog('✓ Node.js instalado com sucesso no Linux.');
      } catch (error) {
        sendLog(`Erro na instalação no Linux: ${error.message}`);
        throw error;
      }
    };

    const installNode = () => {
      if (os.platform() === 'win32') {
        return installNodeWindows();
      } else {
        return installNodeLinux();
      }
    };
  
    const installAngular = async () => {
      sendLog('Passo 2: Verificando Angular CLI...');
      try {
        const angularVersion = execSync('ng version', { encoding: 'utf8' });
        sendLog(`Angular CLI encontrado: ${angularVersion.split('\n')[0]}`);
        if (angularVersion.includes('13.3.11')) {
          sendLog('Angular CLI já está instalado na versão 13.3.11.');
          return Promise.resolve();
        } else {
          sendLog('Versão diferente encontrada. Instalando versão 13.3.11...');
        }
      } catch {
        sendLog('Angular CLI não encontrado. Iniciando instalação...');
      }

      try {
        sendLog('Verificando se npm está disponível...');
        execSync('npm --version', { encoding: 'utf8' });
        sendLog('npm encontrado. Instalando Angular CLI...');
        
        // Primeiro desinstala versões existentes
        sendLog('Removendo versões anteriores do Angular CLI...');
        try {
          await execPromise('npm uninstall -g @angular/cli');
        } catch {
          // Ignora erro se não existir
        }
        
        sendLog('Instalando Angular CLI versão 13.3.11... (Isso pode demorar alguns minutos)');
        await execPromise('npm install -g @angular/cli@13.3.11');
        
        sendLog('Verificando instalação do Angular CLI...');
        const installedVersion = execSync('ng version', { encoding: 'utf8' });
        sendLog(`Angular CLI instalado com sucesso: ${installedVersion.split('\n')[0]}`);
        
      } catch (error) {
        throw new Error(`Erro ao instalar Angular CLI: ${error.message}`);
      }
    };

    console.log('Iniciando instalação das dependências (Git, Node.js e Angular CLI)...');
    sendLog('=== INSTALAÇÃO DE DEPENDÊNCIAS ===');
    sendLog('Verificando e instalando: Git, Node.js e Angular CLI');
    sendLog('ATENÇÃO: Este processo pode demorar vários minutos.');
    sendLog('Mantenha a janela aberta e aguarde a conclusão.');
    sendLog('Você pode fechar esta janela a qualquer momento clicando no [X].');
    sendLog('');
  
    try {
      // Verifica e instala Git primeiro
      const gitInstalled = await checkGit();
      if (!gitInstalled) {
        sendLog('🔧 Git não encontrado. Tentando instalar...');
        const gitInstallSuccess = await installGit();
        if (gitInstallSuccess) {
          sendLog('✅ Git instalado com sucesso!');
        } else {
          sendLog('⚠️ Git não foi instalado automaticamente.');
          sendLog('⚠️ Alguns recursos podem não funcionar corretamente.');
          sendLog('💡 Instale manualmente em: https://git-scm.com/downloads');
        }
        sendLog('');
      }
      
      // Continua com Node.js
      await installNode();
      sendLog('');
      sendLog('✓ Node.js configurado com sucesso!');
      sendLog('');
      
      await installAngular();
      sendLog('');
      sendLog('✓ Angular CLI configurado com sucesso!');
      sendLog('');
      
      sendLog('=== INSTALAÇÃO CONCLUÍDA ===');
      sendLog('Todas as dependências foram instaladas com sucesso!');
      sendLog('RECOMENDAÇÃO: Reinicie o aplicativo para garantir que as');
      sendLog('novas versões sejam reconhecidas corretamente.');
      sendLog('Você pode usar: Ctrl+R ou F5 ou Menu > File > Reiniciar Aplicativo');
      event.reply('installation-complete');
      
      // Mostra dialog sugerindo reinício após pequeno delay
      setTimeout(() => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Instalação Concluída',
          message: 'Dependências instaladas com sucesso!',
          detail: 'Recomendamos reiniciar o aplicativo para garantir que as novas versões sejam reconhecidas corretamente.\n\nDeseja reiniciar agora?',
          buttons: ['Agora não', 'Reiniciar Agora'],
          defaultId: 1,
          cancelId: 0
        }).then((result) => {
          if (result.response === 1) {
            console.log('Reiniciando aplicativo após instalação...');
            // Para todos os processos em execução
            Object.keys(runningProcesses).forEach(processPath => {
              try {
                runningProcesses[processPath].kill();
                console.log(`Processo parado: ${processPath}`);
              } catch (error) {
                console.error(`Erro ao parar processo ${processPath}:`, error);
              }
            });
            
            // Reinicia o aplicativo
            app.relaunch();
            app.exit();
          }
        });
      }, 2000); // 2 segundos de delay para não interferir com o fechamento da janela de instalação
      
    } catch (err) {
      sendLog('');
      sendLog('❌ ERRO DURANTE A INSTALAÇÃO:');
      sendLog(`Detalhes: ${err.message}`);
      sendLog('');
      sendLog('SUGESTÕES:');
      sendLog('1. Verifique sua conexão com a internet');
      sendLog('2. Execute o aplicativo como administrador');
      sendLog('3. Desative temporariamente o antivírus');
      sendLog('4. Tente novamente em alguns minutos');
      sendLog('');
      sendLog('Se o problema persistir, você pode instalar manualmente:');
      sendLog('- Node.js 16.10.0: https://nodejs.org/dist/v16.10.0/');
      sendLog('- Angular CLI: npm install -g @angular/cli@13.3.11');
    }

    } catch (globalError) {
      console.error('Erro global na instalação:', globalError);
      sendLog(`❌ Erro crítico na instalação: ${globalError.message}`);
    } finally {
      // Sempre limpa o estado de instalação
      cleanupInstallation();
    }
  });

  // Função global para mostrar mensagem sobre Git ausente
  function showGitInstallationGuidance() {
    const isGitAvailable = checkGitGlobal();
    if (!isGitAvailable) {
      console.log('⚠️ Git não encontrado no sistema');
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('log', { 
          message: '⚠️ Git não encontrado: Use o menu "Instalar Dependências" para instalação automática ou visite https://git-scm.com/downloads'
        });
      }
      return false;
    }
    return true;
  }

  function execPromise(command) {
    return new Promise((resolve, reject) => {
      exec(command, (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout || stderr);
        }
      });
    });
  }

  function downloadFile(fileUrl, dest) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const parsedUrl = url.parse(fileUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const request = protocol.get(fileUrl, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlink(dest, () => {});
          return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        }
        
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }).on('error', (err) => {
        file.close();
        fs.unlink(dest, () => reject(err));
      });
      
      request.setTimeout(30000, () => {
        request.abort();
        file.close();
        fs.unlink(dest, () => reject(new Error('Download timeout')));
      });
    });
  }

  function downloadFileWithRetry(fileUrl, dest, maxRetries = 3) {
    return new Promise(async (resolve, reject) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          await downloadFile(fileUrl, dest);
          resolve();
          return;
        } catch (error) {
          console.log(`Tentativa ${i + 1} falhou: ${error.message}`);
          if (i === maxRetries - 1) {
            reject(new Error(`Falha no download após ${maxRetries} tentativas: ${error.message}`));
          } else {
            // Aguarda antes da próxima tentativa
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
    });
  }

  function extractZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
      // Usar PowerShell para extrair (disponível no Windows por padrão)
      const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Erro ao extrair ZIP: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  function addToUserPath(nvmPath) {
    return new Promise((resolve, reject) => {
      // Adicionar ao PATH do usuário usando PowerShell
      const command = `powershell -command "
        $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User');
        if ($userPath -notlike '*${nvmPath}*') {
          $newPath = if ($userPath) { $userPath + ';${nvmPath}' } else { '${nvmPath}' };
          [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User');
        }
      "`;
      
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Erro ao adicionar ao PATH: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  // 🔍 VERIFICAÇÃO DE BACKGROUND DO ANGULAR CLI APÓS APP CARREGAR
  // Agenda uma verificação adicional do Angular CLI após o app estar totalmente carregado
  // Isso garante que mesmo se a verificação inicial falhar, teremos uma segunda chance
  setTimeout(() => {
    console.log('🔍 [BACKGROUND] Iniciando verificação de background do Angular CLI...');
    
    // Só faz a verificação de background se não temos cache confirmado
    const hasConfirmedCache = appCache.angularInfo && 
                             appCache.angularInfo.available && 
                             appCache.angularInfo.confirmed;
    
    if (hasConfirmedCache) {
      console.log('⚡ [BACKGROUND] Cache já confirmado - pulando verificação de background');
      return;
    }
    
    console.log('🔍 [BACKGROUND] Verificando Angular CLI em background...');
    exec('ng version', { timeout: 25000 }, (error, stdout, stderr) => {
      if (!error && stdout) {
        const angularOutput = stdout.toString();
        const angularCliMatch = angularOutput.match(/Angular CLI: (\d+\.\d+\.\d+)/);
        
        if (angularCliMatch) {
          const version = angularCliMatch[1];
          console.log(`✅ [BACKGROUND] Angular CLI encontrado em verificação de background: ${version}`);
          
          // SALVA NO CACHE - esta é uma confirmação positiva
          appCache.angularInfo = {
            version: version,
            available: true,
            confirmed: true,
            fullOutput: angularOutput
          };
          saveAppCache();
          
          // Notifica a interface sobre a mudança
          if (mainWindow && !mainWindow.isDestroyed()) {
            let warning = null;
            if (version !== '13.3.11') {
              warning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${version}, o que pode causar problemas.`;
            }
            mainWindow.webContents.send('angular-info', { version, warning });
            console.log('📡 [BACKGROUND] Interface notificada sobre Angular CLI encontrado');
          }
          
        } else {
          const version = 'Instalado (versão não detectada)';
          console.log('✅ [BACKGROUND] Angular CLI instalado em background (versão não detectada)');
          
          appCache.angularInfo = {
            version: version,
            available: true,
            confirmed: true,
            fullOutput: angularOutput
          };
          saveAppCache();
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('angular-info', { version, warning: null });
            console.log('📡 [BACKGROUND] Interface notificada sobre Angular CLI (versão não detectada)');
          }
        }
      } else {
        console.log('❌ [BACKGROUND] Verificação de background do Angular CLI falhou:', error?.message);
        // Não sobrescreve cache confirmado anterior, apenas ignora este erro
      }
    });
  }, 5000); // 5 segundos após o app carregar
}

// Evento principal do aplicativo
// ⚡ INICIALIZAÇÃO OTIMIZADA ⚡
app.on('ready', async () => {
  safeLog('[ROCKET] Aplicacao pronta, iniciando otimizacoes...');
  
  // ⚡ LIMPA CACHE PROBLEMÁTICO DO ELECTRON NO WINDOWS ⚡
  clearElectronCacheIfNeeded();
  
  // Define prioridade alta no Windows para startup mais rápido
  if (process.platform === 'win32') {
    try {
      exec('wmic process where "name=\'electron.exe\'" call setpriority "above normal"', (error) => {
        if (!error) safeLog('[LIGHTNING] Prioridade do processo aumentada');
      });
    } catch (e) {
      // Ignora se não conseguir ajustar prioridade
    }
  }
  
  // Carrega cache na inicialização
  const cacheLoaded = loadAppCache();
  if (cacheLoaded) {
    safeLog('[DISK] Cache pre-carregado com sucesso');
  }
  
  // Inicia pré-carregamento em background
  preloadCriticalData().catch(console.error);
  
  // Verifica se Git está disponível (não bloqueia a inicialização)
  setTimeout(() => {
    const isGitAvailable = checkGitGlobal();
    if (!isGitAvailable) {
      safeLog('[WARNING] Git nao detectado - usuario sera informado se necessario', 'warn');
    } else {
      safeLog('[SUCCESS] Git detectado no sistema');
    }
  }, 2000);
  
  // Cria splash screen
  createSplashWindow();

  // ⚡ HANDLER PARA ATUALIZAR BRANCH DE PROJETO ESPECÍFICO (TEMPORARIAMENTE DESABILITADO) ⚡
  /*
  ipcMain.on('update-project-branch', async (event, { index }) => {
    try {
      if (index >= 0 && index < projects.length) {
        const project = projects[index];
        const currentBranch = await getProjectGitBranch(project.path);
        
        if (currentBranch) {
          projects[index].gitBranch = currentBranch;
          
          event.reply('project-branch-updated', { 
            index: index, 
            branch: currentBranch,
            path: project.path
          });
          
          console.log(`🌿 Branch atualizada manualmente para ${project.name}: ${currentBranch}`);
        }
      }
    } catch (error) {
      console.error('Erro ao atualizar branch do projeto:', error);
    }
  });
  */
});

// ⚡ GESTÃO OTIMIZADA DO CICLO DE VIDA DA APP ⚡
app.on('window-all-closed', () => {
  // Salva cache antes de fechar
  saveAppCache();
  
  // Limpa cache antigo (mais de 24 horas)
  try {
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const cacheAge = Date.now() - cacheData.timestamp;
      
      if (cacheAge > 24 * 60 * 60 * 1000) { // 24 horas
        fs.unlinkSync(cacheFile);
        safeLog('[TOOL] Cache antigo removido');
      }
    }
  } catch (error) {
    console.log('Erro na limpeza do cache:', error.message);
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createSplashWindow();
});

// ⚡ SISTEMA DE CACHE AUTOMÁTICO ⚡
// Atualiza cache periodicamente a cada 2 minutos quando a app estiver rodando
setInterval(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    preloadCriticalData().catch(console.error);
    console.log('[CACHE] Cache atualizado automaticamente');
  }
}, 2 * 60 * 1000); // 2 minutos

console.log('[LIGHTNING] SISTEMA DE PERFORMANCE ATIVADO [LIGHTNING]');
console.log('[ROCKET] Cache inteligente, pre-carregamento e otimizacoes Windows habilitadas');
console.log('[DISK] Dados criticos serao carregados em background para maxima velocidade');
console.log('[TARGET] Otimizacoes multi-core e multi-threading implementadas');

// ⚡ FUNÇÃO PARA LIMPAR CACHE PROBLEMÁTICO DO ELECTRON NO WINDOWS ⚡
function clearElectronCacheIfNeeded() {
  if (process.platform === 'win32') {
    try {
      const session = require('electron').session;
      if (session && session.defaultSession) {
        session.defaultSession.clearCache(() => {
          safeLog('[TOOL] Cache do Electron limpo no Windows');
        });
      }
    } catch (error) {
      // Ignora erros de limpeza de cache
      safeLog('[WARNING] Nao foi possivel limpar cache do Electron: ' + error.message, 'warn');
    }
  }
}
