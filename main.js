const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const url = require('url');

// ===== CARREGAR HANDLERS IPC APÓS INICIALIZAÇÃO =====
// console.log('[MAIN] Carregando handlers IPC...');
// require('./ipc-handlers');
// console.log('[MAIN] ✅ Handlers IPC carregados!');

// Registrar handler crítico para debugging
console.log('[MAIN] INÍCIO: Preparando para registrar handler start-node-installation...');

// Imports para gerenciamento de Node.js portátil
const NodeInstaller = require('./node-installer');
const ProjectConfigManager = require('./project-config-manager');
const OnboardingManager = require('./onboarding-manager');
const SplashManager = require('./splash-manager');

// Função para ler a versão do package.json
function getAppVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.error('Erro ao ler versão do package.json:', error);
    return '0.0.11'; // fallback
  }
}

const APP_VERSION = getAppVersion();
console.log(`[MAIN] 🚀 Front-end Manager v${APP_VERSION} iniciando...`);

const { 
  NODE_VERSIONS, 
  getNodeExecutablePath, 
  getCurrentOS,
  getNodesBasePath
} = require('./node-version-config');

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

// ===== UTILITÁRIOS PARA PERMISSÕES LINUX =====
/**
 * Obtém o caminho seguro para escrita baseado no SO
 * Windows: Usa __dirname para arquivos de configuração local
 * Linux: Usa userData para evitar problemas de permissão
 */
function getSafeWritePath(filename) {
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows: mantém comportamento atual
    return path.join(__dirname, filename);
  } else {
    // Linux/Mac: usa userData para evitar problemas de permissão
    return path.join(app.getPath('userData'), filename);
  }
}

/**
 * Cria diretório com tratamento de erro de permissão
 * Tenta criar no local preferido, fallback para userData em caso de erro
 */
function safeMkdirSync(dirPath, options = { recursive: true }) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, options);
    }
    return dirPath;
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.warn(`[PERMISSION] Sem permissão para criar ${dirPath}, usando userData...`);
      const fallbackPath = path.join(app.getPath('userData'), path.basename(dirPath));
      if (!fs.existsSync(fallbackPath)) {
        fs.mkdirSync(fallbackPath, options);
      }
      return fallbackPath;
    }
    throw error;
  }
}

/**
 * Escreve arquivo com tratamento de erro de permissão
 */
function safeWriteFileSync(filePath, data, options = 'utf8') {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      safeMkdirSync(dir);
    }
    fs.writeFileSync(filePath, data, options);
    return filePath;
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.warn(`[PERMISSION] Sem permissão para escrever ${filePath}, usando userData...`);
      const fallbackPath = path.join(app.getPath('userData'), path.basename(filePath));
      const fallbackDir = path.dirname(fallbackPath);
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      fs.writeFileSync(fallbackPath, data, options);
      return fallbackPath;
    }
    throw error;
  }
}

/**
 * Lê arquivo de configuração com fallback para userData
 */
function safeReadConfigFile(filename) {
  const platform = os.platform();
  
  // Lista de caminhos para tentar (ordem: userData, __dirname para compatibilidade)
  const paths = [];
  
  if (platform === 'win32') {
    // Windows: primeiro __dirname (comportamento atual), depois userData
    paths.push(path.join(__dirname, filename));
    paths.push(path.join(app.getPath('userData'), filename));
  } else {
    // Linux/Mac: primeiro userData, depois __dirname para migração
    paths.push(path.join(app.getPath('userData'), filename));
    paths.push(path.join(__dirname, filename));
  }
  
  for (const configPath of paths) {
    if (fs.existsSync(configPath)) {
      try {
        return { 
          content: fs.readFileSync(configPath, 'utf8'),
          path: configPath
        };
      } catch (error) {
        console.warn(`[CONFIG] Erro ao ler ${configPath}:`, error.message);
        continue;
      }
    }
  }
  
  return null;
}

// Instâncias globais
let nodeInstaller = null;
let projectConfigManager = null;
let installerWindow = null;
let projectConfigsWindow = null;
let newCLIsWindow = null;
let onboardingNodeConfigWindow = null;

// ===== REGISTRAR HANDLER CRÍTICO IMEDIATAMENTE =====
console.log('[MAIN] EXECUTANDO: Registrando handler start-node-installation AGORA...');
ipcMain.on('start-node-installation', async () => {
  console.log('[DEBUG] ===== start-node-installation RECEBIDO =====');
  console.log('[DEBUG] installerWindow exists?', !!installerWindow);
  console.log('[DEBUG] nodeInstaller exists?', !!nodeInstaller);
  
  if (!nodeInstaller) {
    console.log('[DEBUG] Criando novo NodeInstaller...');
    nodeInstaller = new NodeInstaller(installerWindow);
  } else {
    console.log('[DEBUG] Usando NodeInstaller existente, atualizando janela...');
    nodeInstaller.setMainWindow(installerWindow);
  }
  
  try {
    console.log('[DEBUG] Iniciando installAllVersions...');
    await nodeInstaller.installAllVersions();
    console.log('[DEBUG] installAllVersions CONCLUÍDO com sucesso');
    
    // Salva flag de instalação completa
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let settings = {};
    
    try {
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (error) {
      console.error('Erro ao ler settings:', error);
    }
    
    settings.dependenciesInstalled = true;
    settings.lastInstallDate = new Date().toISOString();
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    // Verifica o status das dependências para enviar update para todas as janelas
    const depsInstalled = nodeInstaller.checkDependenciesInstalled();
    const { getNodesBasePath, getCurrentOS } = require('./node-version-config');
    const nodesPath = path.join(getNodesBasePath(), getCurrentOS());
    
    const statusUpdate = depsInstalled ? {
      installed: true, 
      message: '✅ Dependências instaladas',
      nodesPath: nodesPath
    } : {
      installed: false, 
      message: '❗ Dependências não instaladas',
      nodesPath: nodesPath
    };
    
    // Função para enviar status para uma janela se existir
    const sendStatusToWindow = (window, windowName) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('dependencies-status', statusUpdate);
        console.log(`📡 Status das dependências enviado para ${windowName}`);
      }
    };
    
    // Envia status atualizado para todas as janelas relevantes
    sendStatusToWindow(mainWindow, 'mainWindow');
    sendStatusToWindow(configWindow, 'configWindow');
    sendStatusToWindow(projectConfigsWindow, 'projectConfigsWindow');
    sendStatusToWindow(newCLIsWindow, 'newCLIsWindow');
    
    if (installerWindow && !installerWindow.isDestroyed()) {
      installerWindow.webContents.send('installation-complete', {
        success: true,
        message: 'Todas as dependências foram instaladas com sucesso!'
      });
      
      // Também envia o status atualizado para a janela do installer
      sendStatusToWindow(installerWindow, 'installerWindow');
    }
    
  } catch (error) {
    console.error('[DEBUG] Erro na instalação:', error);
    
    // Mesmo em caso de erro, verifica o status das dependências
    const depsInstalled = nodeInstaller ? nodeInstaller.checkDependenciesInstalled() : false;
    const { getNodesBasePath, getCurrentOS } = require('./node-version-config');
    const nodesPath = path.join(getNodesBasePath(), getCurrentOS());
    
    const statusUpdate = depsInstalled ? {
      installed: true, 
      message: '✅ Dependências instaladas',
      nodesPath: nodesPath
    } : {
      installed: false, 
      message: '❗ Dependências não instaladas',
      nodesPath: nodesPath
    };
    
    // Função para enviar status para uma janela se existir
    const sendStatusToWindow = (window, windowName) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('dependencies-status', statusUpdate);
        console.log(`📡 Status das dependências enviado para ${windowName} (após erro)`);
      }
    };
    
    // Envia status atualizado para todas as janelas relevantes mesmo após erro
    sendStatusToWindow(mainWindow, 'mainWindow');
    sendStatusToWindow(configWindow, 'configWindow');
    sendStatusToWindow(projectConfigsWindow, 'projectConfigsWindow');
    sendStatusToWindow(newCLIsWindow, 'newCLIsWindow');
    
    if (installerWindow && !installerWindow.isDestroyed()) {
      installerWindow.webContents.send('installation-complete', {
        success: false,
        message: `Erro na instalação: ${error.message}`
      });
      
      // Também envia o status atualizado para a janela do installer
      sendStatusToWindow(installerWindow, 'installerWindow');
    }
  }
});
console.log('[MAIN] ✅ Handler start-node-installation registrado!');

// Outros handlers
ipcMain.on('close-installer-window', () => {
  if (installerWindow && !installerWindow.isDestroyed()) {
    installerWindow.close();
    installerWindow = null;
  }
});

ipcMain.on('reinstall-response', async (event, { version, shouldReinstall }) => {
  if (shouldReinstall && nodeInstaller) {
    try {
      await nodeInstaller.reinstallNodeVersion(version);
    } catch (error) {
      nodeInstaller.sendLog(`Erro na reinstalação: ${error.message}`, true);
    }
  }
});

// Função para procurar IDE dinamicamente
async function findIDEExecutable(ideConfig, platform) {
  const searchPaths = ideConfig.searchPaths?.[platform];
  if (!searchPaths || searchPaths.length === 0) {
    return null;
  }

  for (const searchPath of searchPaths) {
    try {
      // Expande variáveis de ambiente
      let expandedPath = searchPath.replace('%USERNAME%', os.userInfo().username);
      
      // Para Windows, tenta encontrar pastas com wildcards usando fs
      if (platform === 'win32' && expandedPath.includes('*')) {
        const basePath = expandedPath.substring(0, expandedPath.indexOf('*'));
        const suffix = expandedPath.substring(expandedPath.indexOf('*') + 1);
        
        try {
          const baseDir = path.dirname(basePath);
          const files = fs.readdirSync(baseDir);
          const matchingDirs = files.filter(file => 
            file.toLowerCase().includes('intellij') || 
            file.toLowerCase().includes('webstorm') || 
            file.toLowerCase().includes('idea')
          );
          
          for (const dir of matchingDirs) {
            const fullPath = path.join(baseDir, dir, suffix);
            if (fs.existsSync(fullPath)) {
              console.log(`✅ IDE encontrada: ${fullPath}`);
              return fullPath;
            }
          }
        } catch (dirError) {
          console.log(`❌ Erro ao buscar diretório: ${dirError.message}`);
        }
      } else {
        // Caminho direto sem wildcards
        if (fs.existsSync(expandedPath)) {
          console.log(`✅ IDE encontrada: ${expandedPath}`);
          return expandedPath;
        }
      }
    } catch (error) {
      console.log(`❌ Erro ao buscar em ${searchPath}: ${error.message}`);
      continue;
    }
  }

  return null;
}

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

// ===== HANDLERS PARA INSTALADOR DE NODE.JS =====

// Abre janela do instalador
ipcMain.on('open-installer-window', () => {
  console.log('[DEBUG] Abrindo janela do instalador');
  openInstallerWindow();
});

// ===== HANDLERS PARA CONFIGURAÇÕES DE PROJETOS =====

// Abre janela de configurações de projetos
ipcMain.on('open-project-configs-window', () => {
  console.log('[DEBUG] Abrindo janela de configurações de projetos');
  openProjectConfigsWindow();
});

// Obtém configurações de projetos
ipcMain.on('get-project-configs', (event) => {
  console.log('[DEBUG] Solicitação de configurações de projetos recebida');
  
  if (!projectConfigManager) {
    projectConfigManager = new ProjectConfigManager();
  }
  
  const configs = projectConfigManager.getAllConfigs();
  const { getDefaultNodeVersion } = require('./node-version-config');
  
  // Mostra TODOS os projetos (mesmo sem path definido)
  const projectsList = projects.map(p => {
    const defaultVersion = getDefaultNodeVersion(p.name);
    console.log(`[DEBUG] ${p.name}: defaultVersion=${defaultVersion}`);
    return {
      name: p.name,
      path: p.path || 'Caminho não definido',
      defaultVersion: defaultVersion // Adiciona versão padrão
    };
  });
  
  console.log('[DEBUG] Enviando dados:', {
    totalProjects: projectsList.length,
    projects: projectsList.map(p => `${p.name} (default: ${p.defaultVersion})`),
    configs: configs
  });
  
  event.reply('project-configs-data', {
    projects: projectsList,
    configs: configs
  });
});

// Obtém versões disponíveis do Node.js (detecta automaticamente)
ipcMain.on('get-available-node-versions', (event) => {
  console.log('[DEBUG] Solicitação de versões disponíveis recebida');
  
  const fs = require('fs');
  const path = require('path');
  
  const availableVersions = {};
  const nodesBasePath = getNodesBasePath();
  const currentOS = getCurrentOS();
  const osPath = path.join(nodesBasePath, currentOS);
  
  console.log(`[DEBUG] Detectando versões em: ${osPath}`);
  
  // Verifica se o diretório existe
  if (!fs.existsSync(osPath)) {
    console.log('[DEBUG] Diretório de nodes não existe ainda');
    event.reply('available-node-versions', availableVersions);
    return;
  }
  
  // Lista todos os diretórios no path do OS
  const entries = fs.readdirSync(osPath, { withFileTypes: true });
  
  entries.forEach(entry => {
    // Ignora arquivos e diretórios que não parecem ser do Node.js
    if (!entry.isDirectory() || entry.name === '.gitkeep') {
      return;
    }
    
    console.log(`[DEBUG] 🔍 Verificando pasta: ${entry.name}`);
    
    const folderPath = path.join(osPath, entry.name);
    
    // 🔍 PROCURA node.exe E npm.cmd (DIRETAMENTE OU EM SUBPASTAS)
    let nodeExePath = null;
    let npmPath = null;
    let actualFolderPath = folderPath;
    
    if (currentOS === 'windows') {
      // Tenta primeiro diretamente na pasta
      nodeExePath = path.join(folderPath, 'node.exe');
      npmPath = path.join(folderPath, 'npm.cmd');
      
      console.log(`[DEBUG]   Verificando diretamente: ${nodeExePath}`);
      console.log(`[DEBUG]   Existe node.exe? ${fs.existsSync(nodeExePath)}`);
      console.log(`[DEBUG]   Existe npm.cmd? ${fs.existsSync(npmPath)}`);
      
      // Se não encontrar, procura em subpastas (para estruturas como node-v22.12.0/node-v22.12.0-win-x64/)
      if (!fs.existsSync(nodeExePath) || !fs.existsSync(npmPath)) {
        console.log(`[DEBUG]   ⚠️ Não encontrado diretamente, procurando em subpastas...`);
        
        try {
          const subfolders = fs.readdirSync(folderPath, { withFileTypes: true })
            .filter(item => item.isDirectory());
          
          console.log(`[DEBUG]   Subpastas encontradas: ${subfolders.map(s => s.name).join(', ')}`);
          
          for (const subfolder of subfolders) {
            const subfolderPath = path.join(folderPath, subfolder.name);
            const subNodeExe = path.join(subfolderPath, 'node.exe');
            const subNpmCmd = path.join(subfolderPath, 'npm.cmd');
            
            console.log(`[DEBUG]     Verificando subpasta ${subfolder.name}...`);
            console.log(`[DEBUG]     Existe node.exe? ${fs.existsSync(subNodeExe)}`);
            console.log(`[DEBUG]     Existe npm.cmd? ${fs.existsSync(subNpmCmd)}`);
            
            if (fs.existsSync(subNodeExe) && fs.existsSync(subNpmCmd)) {
              nodeExePath = subNodeExe;
              npmPath = subNpmCmd;
              actualFolderPath = subfolderPath;
              console.log(`[DEBUG] ✅ Node.js encontrado em subpasta: ${subfolder.name}`);
              break;
            }
          }
        } catch (err) {
          console.log(`[DEBUG]   ❌ Erro ao ler subpastas: ${err.message}`);
        }
      }
    } else {
      // Linux/Mac: procura em bin/
      nodeExePath = path.join(folderPath, 'bin', 'node');
      npmPath = path.join(folderPath, 'bin', 'npm');
    }
    
    // Verifica se é uma instalação válida do Node.js
    const isValidNodeInstall = nodeExePath && npmPath && fs.existsSync(nodeExePath) && fs.existsSync(npmPath);
    
    console.log(`[DEBUG]   Instalação válida? ${isValidNodeInstall}`);
    
    if (isValidNodeInstall) {
      // Extrai a versão do nome da pasta
      // Formato esperado: node-v16.10.0-win-x64 ou node-v18.20.4 ou node-v22.12.0
      const versionMatch = entry.name.match(/node-v([\d.]+)/i);
      
      console.log(`[DEBUG]   Regex match resultado: ${versionMatch ? versionMatch[1] : 'NENHUM'}`);
      
      if (versionMatch) {
        const version = versionMatch[1];
        
        console.log(`[DEBUG] ✅ Versão detectada: ${version} (pasta: ${entry.name})`);
        
        availableVersions[version] = {
          version: version,
          folderName: entry.name,
          label: `Node ${version}`,
          installed: true,
          path: actualFolderPath // USA O CAMINHO REAL (pode ser subpasta)
        };
      } else {
        console.log(`[DEBUG] ⚠️ Pasta ignorada (formato não reconhecido): ${entry.name}`);
      }
    } else {
      console.log(`[DEBUG] ⚠️ Pasta ignorada (não tem node.exe/npm): ${entry.name}`);
    }
  });
  
  console.log(`[DEBUG] Total de versões detectadas: ${Object.keys(availableVersions).length}`);
  console.log('[DEBUG] Versões disponíveis:', Object.keys(availableVersions));
  event.reply('available-node-versions', availableVersions);
});

// Atualiza versão de um projeto
ipcMain.on('update-project-version', async (event, { projectName, version }) => {
  if (!projectConfigManager) {
    projectConfigManager = new ProjectConfigManager();
  }
  
  projectConfigManager.setProjectNodeVersion(projectName, version);
  console.log(`[DEBUG] Versão do ${projectName} atualizada para ${version}`);
  
  // Verifica se a versão do Node.js já está instalada
  if (!nodeInstaller) {
    nodeInstaller = new NodeInstaller(null);
  }
  
  try {
    const nodePaths = require('./node-version-config').getNodeExecutablePath(version, require('./node-version-config').getCurrentOS());
    const isInstalled = require('fs').existsSync(nodePaths.nodeExe);
    
    if (!isInstalled) {
      console.log(`🔧 Instalando Node.js ${version} automaticamente...`);
      event.reply('installation-status', { 
        projectName, 
        version, 
        status: 'installing',
        message: `Instalando Node.js ${version}...`
      });
      
      await nodeInstaller.installNodeVersion(version);
      
      console.log(`✅ Node.js ${version} instalado com sucesso!`);
      event.reply('installation-status', { 
        projectName, 
        version, 
        status: 'success',
        message: `Node.js ${version} instalado com sucesso!`
      });
    } else {
      console.log(`✅ Node.js ${version} já está instalado`);
      event.reply('installation-status', { 
        projectName, 
        version, 
        status: 'already-installed',
        message: `Node.js ${version} já está instalado`
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao instalar Node.js ${version}:`, error);
    event.reply('installation-status', { 
      projectName, 
      version, 
      status: 'error',
      message: `Erro ao instalar Node.js ${version}: ${error.message}`
    });
  }
});

// Instala Angular CLI em Node portátil específico
ipcMain.on('install-angular-cli-portable', async (event, { projectName, nodeVersion, cliVersion }) => {
  console.log(`🔧 Instalando Angular CLI ${cliVersion} no Node ${nodeVersion} portátil para ${projectName}...`);
  
  try {
    const { getNodeExecutablePath } = require('./node-version-config');
    const currentOS = require('./node-version-config').getCurrentOS();
    const nodePaths = getNodeExecutablePath(nodeVersion, currentOS);
    
    // Verifica se o Node está instalado
    if (!fs.existsSync(nodePaths.nodeExe)) {
      console.error(`❌ Node.js ${nodeVersion} não está instalado`);
      event.reply('cli-installation-status', {
        projectName,
        nodeVersion,
        cliVersion,
        status: 'error',
        message: `Node.js ${nodeVersion} não encontrado`
      });
      return;
    }
    
    // Monta comando para instalar CLI no Node portátil
    const npmExe = nodePaths.npmExe || nodePaths.nodeExe.replace('node.exe', 'npm.cmd');
    const installCommand = `"${npmExe}" install -g @angular/cli@${cliVersion}`;
    
    console.log(`📝 Executando: ${installCommand}`);
    
    exec(installCommand, { 
      maxBuffer: 1024 * 1024 * 10,
      env: {
        ...process.env,
        PATH: path.dirname(nodePaths.nodeExe) + path.delimiter + process.env.PATH
      }
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Erro ao instalar Angular CLI ${cliVersion}:`, error.message);
        event.reply('cli-installation-status', {
          projectName,
          nodeVersion,
          cliVersion,
          status: 'error',
          message: `Erro: ${error.message}`
        });
        return;
      }
      
      console.log(`✅ Angular CLI ${cliVersion} instalado com sucesso no Node ${nodeVersion}`);
      event.reply('cli-installation-status', {
        projectName,
        nodeVersion,
        cliVersion,
        status: 'success',
        message: `CLI ${cliVersion} instalado com sucesso`
      });
    });
    
  } catch (error) {
    console.error(`❌ Erro ao instalar Angular CLI:`, error);
    event.reply('cli-installation-status', {
      projectName,
      nodeVersion,
      cliVersion,
      status: 'error',
      message: error.message
    });
  }
});

// Salva configurações de projetos
ipcMain.on('save-project-configs', (event, configs) => {
  if (!projectConfigManager) {
    projectConfigManager = new ProjectConfigManager();
  }
  
  Object.keys(configs).forEach(projectName => {
    projectConfigManager.setProjectNodeVersion(projectName, configs[projectName]);
  });
  
  console.log('[DEBUG] Configurações de projetos salvas');
});

// ===== HANDLERS PARA NOVAS CLIs =====

// Salva configuração de usar sistema global
ipcMain.on('save-global-system-config', (event, useGlobal) => {
  try {
    const configPath = getSafeWritePath('global-system-config.json');
    const config = { useGlobalSystem: useGlobal };
    safeWriteFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[DEBUG] Configuração global salva: usar sistema global = ${useGlobal}`);
  } catch (error) {
    console.error('[ERROR] Erro ao salvar configuração global:', error);
  }
});

// Obtém configuração de usar sistema global
ipcMain.on('get-global-system-config', (event) => {
  try {
    const configResult = safeReadConfigFile('global-system-config.json');
    if (configResult) {
      const config = JSON.parse(configResult.content);
      event.reply('global-system-config', config.useGlobalSystem);
    } else {
      event.reply('global-system-config', false);
    }
  } catch (error) {
    console.error('[ERROR] Erro ao carregar configuração global:', error);
    event.reply('global-system-config', false);
  }
});

// Abre pasta de versões instaladas
ipcMain.on('open-installed-versions-folder', (event) => {
  try {
    console.log(`[CUSTOM-CLI] Abrindo pasta de versões instaladas...`);
    const { shell } = require('electron');
    const nodeVersionConfig = require('./node-version-config');
    const nodesPath = nodeVersionConfig.getNodesBasePath();
    
    console.log(`[CUSTOM-CLI] Caminho: ${nodesPath}`);
    
    if (!fs.existsSync(nodesPath)) {
      console.warn(`[CUSTOM-CLI] ⚠️ Caminho não existe: ${nodesPath}`);
      return;
    }
    
    shell.openPath(nodesPath).then((error) => {
      if (error) {
        console.error(`[CUSTOM-CLI] ❌ Erro ao abrir pasta: ${error}`);
      } else {
        console.log(`[CUSTOM-CLI] ✅ Pasta aberta com sucesso`);
      }
    });
  } catch (error) {
    console.error('[CUSTOM-CLI] ❌ Erro ao abrir pasta:', error);
  }
});

// Retorna todas as versões de Node configuradas para os projetos
ipcMain.handle('get-all-node-versions', async (event) => {
  if (!projectConfigManager) {
    projectConfigManager = new ProjectConfigManager();
  }
  
  const configs = projectConfigManager.getAllConfigs();
  console.log('[DEBUG] Retornando configurações de versões:', configs);
  return configs;
});

// Handler para obter versão do app
ipcMain.handle('get-app-version', async (event) => {
  return APP_VERSION;
});

// Handler para seleção de pasta
ipcMain.handle('select-folder', async (event) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  } catch (error) {
    console.error('[SELECT-FOLDER] Erro ao abrir dialog:', error);
    return { canceled: true };
  }
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

// ===== CONFIGURAÇÃO DE IDEs SUPORTADAS =====
const IDE_CONFIG = {
  vscode: {
    name: 'Visual Studio Code',
    icon: 'vscode.png',
    commands: {
      win32: 'code "{path}"',
      darwin: 'code "{path}"',
      linux: 'code "{path}" || code-insiders "{path}" || codium "{path}"'
    }
  },
  webstorm: {
    name: 'WebStorm',
    icon: 'webstorm.png',
    commands: {
      win32: 'webstorm "{path}"',
      darwin: 'webstorm "{path}"',
      linux: 'webstorm "{path}"'
    },
    searchPaths: {
      win32: [
        'C:\\Program Files\\JetBrains\\WebStorm*\\bin\\webstorm64.exe',
        'C:\\Users\\%USERNAME%\\AppData\\Local\\JetBrains\\Toolbox\\apps\\WebStorm\\ch-0\\*\\bin\\webstorm64.exe'
      ],
      darwin: [
        '/Applications/WebStorm.app/Contents/MacOS/webstorm'
      ],
      linux: [
        '/opt/webstorm/bin/webstorm.sh',
        '~/webstorm/bin/webstorm.sh'
      ]
    }
  },
  intellij: {
    name: 'IntelliJ IDEA',
    icon: 'intellij.png',
    commands: {
      win32: 'idea "{path}"',
      darwin: 'idea "{path}"',
      linux: 'idea "{path}"'
    },
    searchPaths: {
      win32: [
        'C:\\Program Files\\JetBrains\\IntelliJ IDEA*\\bin\\idea64.exe',
        'C:\\Program Files\\JetBrains\\IntelliJ IDEA Community Edition*\\bin\\idea64.exe',
        'C:\\Users\\%USERNAME%\\AppData\\Local\\JetBrains\\Toolbox\\apps\\IDEA*\\bin\\idea64.exe'
      ],
      darwin: [
        '/Applications/IntelliJ IDEA.app/Contents/MacOS/idea',
        '/Applications/IntelliJ IDEA CE.app/Contents/MacOS/idea'
      ],
      linux: [
        '/opt/idea/bin/idea.sh',
        '/usr/local/bin/idea',
        '~/idea/bin/idea.sh'
      ]
    }
  },
  sublime: {
    name: 'Sublime Text',
    icon: 'sublime.png',
    commands: {
      win32: 'subl "{path}"',
      darwin: 'subl "{path}"',
      linux: 'subl "{path}"'
    },
    searchPaths: {
      win32: [
        'C:\\Program Files\\Sublime Text*\\subl.exe',
        'C:\\Program Files\\Sublime Text\\sublime_text.exe'
      ],
      darwin: [
        '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
        '/usr/local/bin/subl'
      ],
      linux: [
        '/usr/bin/subl',
        '/opt/sublime_text/sublime_text'
      ]
    }
  },
  vim: {
    name: 'Vim',
    icon: 'vim.png',
    commands: {
      win32: 'nvim "{path}" || vim "{path}" || gvim "{path}"',
      darwin: 'nvim "{path}" || vim "{path}"',
      linux: 'nvim "{path}" || vim "{path}"'
    },
    searchPaths: {
      win32: [
        'C:\\Program Files\\Neovim\\bin\\nvim.exe',
        'C:\\Program Files (x86)\\Vim\\vim*\\gvim.exe',
        'C:\\tools\\neovim\\Neovim\\bin\\nvim.exe'
      ],
      darwin: [
        '/usr/local/bin/nvim',
        '/opt/homebrew/bin/nvim',
        '/usr/local/bin/vim'
      ],
      linux: [
        '/usr/bin/nvim',
        '/usr/local/bin/nvim',
        '/usr/bin/vim'
      ]
    }
  },
  notepad: {
    name: 'Notepad++',
    icon: 'notepad.png',
    commands: {
      win32: 'notepad++ "{path}"',
      darwin: 'open -a "TextEdit" "{path}"', // Fallback para TextEdit no Mac
      linux: 'gedit "{path}" || kate "{path}" || mousepad "{path}"' // Vários editores Linux
    },
    searchPaths: {
      win32: [
        'C:\\Program Files\\Notepad++\\notepad++.exe',
        'C:\\Program Files (x86)\\Notepad++\\notepad++.exe'
      ],
      darwin: [
        '/Applications/TextEdit.app/Contents/MacOS/TextEdit'
      ],
      linux: [
        '/usr/bin/gedit',
        '/usr/bin/kate',
        '/usr/bin/mousepad'
      ]
    }
  },
  eclipse: {
    name: 'Eclipse',
    icon: 'eclipse.png',
    commands: {
      win32: 'eclipse -data "{path}"',
      darwin: 'eclipse -data "{path}"',
      linux: 'eclipse -data "{path}"'
    }
  },
  androidstudio: {
    name: 'Android Studio',
    icon: 'androidStudio.png',
    commands: {
      win32: 'studio "{path}"',
      darwin: 'studio "{path}"',
      linux: 'studio.sh "{path}"'
    }
  },
  xcode: {
    name: 'Xcode',
    icon: 'xcode.png',
    commands: {
      win32: 'echo "Xcode não disponível no Windows"', // Placeholder
      darwin: 'xed "{path}"',
      linux: 'echo "Xcode não disponível no Linux"' // Placeholder
    }
  }
};

/**
 * Função para obter o ícone do terminal baseado no tema
 * Dark mode ativo = terminal_whitesmoke.png (branco)
 * Dark mode inativo = terminal_black.png (preto)
 */
function getTerminalIconForMenu() {
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    const isDarkMode = config.darkMode === true;
    
    const iconFile = isDarkMode ? 'terminal_whitesmoke.png' : 'terminal_black.png';
    const iconPath = path.join(__dirname, 'assets', iconFile);
    
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      return icon.resize({ width: 16, height: 16 });
    }
  } catch (error) {
    console.warn('[MENU] Erro ao obter ícone do terminal:', error.message);
  }
  return null;
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
          // console.log(`[GIT] Erro ao obter branch para ${projectPath}: ${error.message}`);
          resolve(null);
          return;
        }

        const branch = stdout.trim();
        if (branch) {
          // console.log(`[GIT] ${path.basename(projectPath)}: ${branch}`);
          resolve(branch);
        } else {
          // console.log(`[GIT] Nenhuma branch para ${projectPath}`);
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
      // console.log(`[GIT] Fazendo fetch para ${projectPath}...`);
      
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
          
          // console.log(`[GIT] ${projectPath} - Branch: ${currentBranch}, Commits pendentes: ${pendingCommits}`);
          
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
    // console.log('[GIT-BG] Verificação já está em execução, ignorando nova solicitação');
    return;
  }
  
  backgroundGitRunning = true;
  // console.log('[GIT-BG] 🚀 Iniciando verificação Git em segundo plano...');
  
  // Filtra projetos que têm path e branch definidos
  const projectsToCheck = projects.filter(project => 
    project.path && 
    project.path.trim() !== '' && 
    project.gitBranch
  );
  
  // console.log(`[GIT-BG] 📋 ${projectsToCheck.length} projetos serão verificados em segundo plano`);
  
  // Processa projetos de forma assíncrona, um por vez para não sobrecarregar
  for (let i = 0; i < projectsToCheck.length; i++) {
    const project = projectsToCheck[i];
    const projectIndex = projects.findIndex(p => p.name === project.name);
    
    if (projectIndex === -1) continue;
    
    // console.log(`[GIT-BG] 🔍 Verificando ${project.name} (${i + 1}/${projectsToCheck.length})`);
    
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
        // console.log(`[GIT-BG] ✅ ${project.name} - Commits pendentes: ${gitStatus.pendingCommits}`);
        mainWindow.webContents.send('git-status-updated', {
          projectIndex,
          gitStatus: {
            branch: gitStatus.branch,
            pendingCommits: gitStatus.pendingCommits,
            hasUpdates: gitStatus.hasUpdates
          }
        });
        // console.log(`[GIT-BG] 📡 IPC enviado para UI: projeto ${projectIndex}`);
      }
      
      // Pequeno delay para não sobrecarregar o sistema
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      // console.log(`[GIT-BG] ❌ Erro ao verificar ${project.name}: ${error.message}`);
    }
  }
  
  backgroundGitRunning = false;
  // console.log('[GIT-BG] 🎉 Verificação Git em segundo plano concluída!');
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

// Cache local para configurações e login (separado do cache de loading do SplashManager)
let appCache = {
  config: null,
  loginState: null
};

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
    pampOrder: [], // Ordem específica dos projetos PAMP
    preferredIDE: 'vscode', // IDE preferida do usuário
    preferredTerminal: null // Terminal preferido do usuário (será definido pelo seletor)
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

// Variáveis globais para gerenciamento de login
let loginInProgress = false;
let loginTimeout = null;
let terminalProcess = null;

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

// Função auxiliar para obter o caminho do npm portátil
function getPortableNpmPath() {
  try {
    const nodeVersionConfig = require('./node-version-config');
    const currentOS = nodeVersionConfig.getCurrentOS();
    const nodesBasePath = nodeVersionConfig.getNodesBasePath();
    
    console.log(`🔍 Procurando npm portátil...`);
    console.log(`📁 Base path: ${nodesBasePath}`);
    console.log(`💻 Sistema: ${currentOS}`);
    
    // Mapeamento de OS para pasta
    const osFolderMap = {
      'windows': 'windows',
      'linux': 'linux',
      'mac': 'mac',
      'mac-arm64': 'mac'
    };
    
    const osFolder = osFolderMap[currentOS] || 'windows';
    const nodesFolderPath = path.join(nodesBasePath, osFolder);
    
    console.log(`📂 Verificando pasta: ${nodesFolderPath}`);
    
    if (!fs.existsSync(nodesFolderPath)) {
      console.error(`❌ Pasta de nodes não encontrada: ${nodesFolderPath}`);
      return null;
    }
    
    // Lista todas as versões disponíveis
    const folders = fs.readdirSync(nodesFolderPath);
    console.log(`📋 Versões encontradas: ${folders.join(', ')}`);
    
    // Procura por qualquer versão do Node
    for (const folder of folders) {
      const folderPath = path.join(nodesFolderPath, folder);
      
      // Verifica se é uma pasta
      if (!fs.statSync(folderPath).isDirectory()) {
        continue;
      }
      
      // Para Windows, verifica se tem npm.cmd na raiz ou em subpastas
      if (currentOS === 'windows') {
        // Primeiro verifica na raiz
        let npmPath = path.join(folderPath, 'npm.cmd');
        if (fs.existsSync(npmPath)) {
          console.log(`✅ npm.cmd encontrado em: ${npmPath}`);
          return npmPath;
        }
        
        // Se não encontrou, verifica em subpastas (ex: node-v18.20.4/node-v18.20.4-win-x64/)
        const subfolders = fs.readdirSync(folderPath);
        for (const subfolder of subfolders) {
          const subfolderPath = path.join(folderPath, subfolder);
          if (fs.statSync(subfolderPath).isDirectory()) {
            npmPath = path.join(subfolderPath, 'npm.cmd');
            if (fs.existsSync(npmPath)) {
              console.log(`✅ npm.cmd encontrado em: ${npmPath}`);
              return npmPath;
            }
          }
        }
      } else {
        // Para Linux/Mac, verifica em bin/npm
        const npmPath = path.join(folderPath, 'bin', 'npm');
        if (fs.existsSync(npmPath)) {
          console.log(`✅ npm encontrado em: ${npmPath}`);
          return npmPath;
        }
      }
    }
    
    console.error(`❌ Nenhum npm portátil encontrado nas versões instaladas`);
    return null;
  } catch (error) {
    console.error(`❌ Erro ao procurar npm portátil:`, error);
    return null;
  }
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

    // Obtém o caminho do npm portátil
    const npmPath = getPortableNpmPath();
    
    if (!npmPath) {
      console.error('❌ [DEBUG] npm portátil não encontrado para verificação de login');
      resolve({ isLoggedIn: false, reason: 'npm-not-found', username: null, registry: registry });
      return;
    }
    
    console.log(`✅ [DEBUG] Usando npm portátil: ${npmPath}`);

    // Primeiro tenta npm whoami
    console.log('🔍 [DEBUG] Executando npm whoami...');
    
    // Para Windows, precisa usar cmd /c para executar .cmd files corretamente
    const nodeVersionConfig = require('./node-version-config');
    const currentOS = nodeVersionConfig.getCurrentOS();
    const whoamiCommand = currentOS === 'windows' 
      ? `cmd /c "${npmPath}" whoami --registry=${registry}`
      : `"${npmPath}" whoami --registry=${registry}`;
    
    console.log('🔍 [DEBUG] Comando whoami:', whoamiCommand);
    
    exec(whoamiCommand, { cwd: projectPath, timeout: 30000 }, (whoamiErr, whoamiStdout, whoamiStderr) => {
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
      const pingCommand = currentOS === 'windows' 
        ? `cmd /c "${npmPath}" ping --registry=${registry}`
        : `"${npmPath}" ping --registry=${registry}`;
      
      console.log('🔍 [DEBUG] Comando ping:', pingCommand);
      
      exec(pingCommand, { cwd: projectPath, timeout: 30000 }, (pingErr, pingStdout, pingStderr) => {
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
        // Usuário já está logado - se clicou é porque quer fazer login de novo!
        console.log(`Usuário já logado no Nexus: ${username} - mas vai fazer login novamente pois clicou`);
        mainWindow.webContents.send('log', { message: `🔄 Você já está logado como ${username}, mas vou fazer login novamente...` });
        
        // Continua direto com o processo de login (sem perguntar!)
        performNpmLogin(registry);
        resolve();
        return;
      }

      // Usuário não está logado, procede com o login
      console.log(`Login necessário. Motivo: ${reason}`);
      
      if (reason === 'no-projects') {
        console.log('⚠️ Nenhum projeto encontrado, criando diretório temporário para login...');
        mainWindow.webContents.send('log', { 
          message: '⚠️ Nenhum projeto configurado. Criando ambiente temporário para login...' 
        });

        // Cria diretório temporário para fazer login
        const tempLoginDir = path.join(app.getPath('temp'), 'micro-front-end-manager-login');
        
        try {
          // Cria diretório se não existir
          if (!fs.existsSync(tempLoginDir)) {
            fs.mkdirSync(tempLoginDir, { recursive: true });
          }
          
          // Cria .npmrc temporário se não existir
          const tempNpmrc = path.join(tempLoginDir, '.npmrc');
          if (!fs.existsSync(tempNpmrc)) {
            fs.writeFileSync(tempNpmrc, `registry=https://registry.npmjs.org/\n`, 'utf8');
          }
          
          console.log(`✅ Diretório temporário criado: ${tempLoginDir}`);
          mainWindow.webContents.send('log', { 
            message: '✅ Ambiente temporário criado com sucesso' 
          });
          
          // Usa o diretório temporário para login
          performNpmLoginWithPath(tempLoginDir, registry);
          resolve();
          
        } catch (error) {
          console.error('❌ Erro ao criar diretório temporário:', error);
          mainWindow.webContents.send('log', { 
            message: `❌ Erro ao criar ambiente: ${error.message}` 
          });
          
          dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Erro',
            message: 'Não foi possível criar ambiente temporário para login.',
            detail: `Erro: ${error.message}\n\nConfigure pelo menos um projeto primeiro.`,
            buttons: ['OK']
          }).then(() => resolve()).catch(() => resolve());
        }
        return;
      }

      // Continua com o processo de login
      performNpmLogin(registry);
      resolve();
    }).catch((error) => {
      console.error('Erro ao verificar status de login:', error);
      mainWindow.webContents.send('log', { message: `Erro ao verificar login: ${error.message}. Tente fazer login manualmente.` });
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
  
  performNpmLoginWithPath(projectPath, registry);
}

function performNpmLoginWithPath(projectPath, registry) {
  console.log(`════════════════════════════════════════════`);
  console.log(`🔐 [performNpmLoginWithPath] INICIANDO LOGIN`);
  console.log(`📁 Path: ${projectPath}`);
  console.log(`🌐 Registry: ${registry}`);
  console.log(`════════════════════════════════════════════`);
  
  // Verifica se é login no Nexus ou no registry público para mostrar mensagem apropriada
  const isNexusLogin = registry && registry.includes('nexus.viavarejo.com.br');
  console.log(`🔍 É login do Nexus?`, isNexusLogin);
  
  if (isNexusLogin) {
    mainWindow.webContents.send('log', { message: `🔐 Iniciando login no Nexus...` });
    mainWindow.webContents.send('log', { message: `📍 Após o login, o registry será configurado automaticamente para npm-group` });
  } else {
    mainWindow.webContents.send('log', { message: `📍 Login no registry público (${registry})...` });
  }

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
    width: 900,
    height: 600,
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

  ipcMain.once('npm-login-complete', (event, { success, message, credentials }) => {
    console.log(`🔚 Login completado - sucesso: ${success}, mensagem: ${message}`);
    
    // Limpa o timeout
    if (loginTimeout) {
      clearTimeout(loginTimeout);
      loginTimeout = null;
    }
    
    if (success) {
      console.log('✅ Login no npm realizado com sucesso!');
      
      // Verifica se este foi um login do Nexus ou do registry público
      const isNexusLogin = registry && registry.includes('nexus.viavarejo.com.br');
      
      console.log('✅ Login completado - sistema de fallback removido conforme solicitado');
      
      if (isNexusLogin) {
        // Login no Nexus completado - agora configura o registry para npm-group
        console.log('✅ Login Nexus detectado! Configurando registry para npm-group...');
        console.log('Credenciais disponíveis?', credentials ? 'SIM' : 'NÃO');
        
        mainWindow.webContents.send('log', { message: '✅ Logado no Nexus! Agora configurando registry para npm-group...' });
        
        // Fecha a janela de login
        cleanupLoginProcesses();
        if (loginWindow && !loginWindow.isDestroyed()) {
          loginWindow.close();
        }
        loginWindow = null;
        
        // Configura o registry para npm-group para permitir download de dependências
        const npmPath = getPortableNpmPath();
        if (npmPath) {
          const { exec } = require('child_process');
          const configCmd = `cmd /c "${npmPath}" config set registry https://nexus.viavarejo.com.br/repository/npm-group/`;
          
          console.log('🔧 Configurando registry para npm-group...');
          exec(configCmd, { cwd: projectPath }, (error, stdout, stderr) => {
            if (error) {
              console.error('❌ Erro ao configurar registry:', error);
              mainWindow.webContents.send('log', { 
                message: `⚠️ Aviso: Erro ao configurar registry automaticamente: ${error.message}` 
              });
            } else {
              console.log('✅ Registry configurado para npm-group');
              mainWindow.webContents.send('log', { 
                message: '✅ Registry configurado para npm-group! Agora você pode fazer npm install.' 
              });
            }
            
            // Salva estado de login
            saveLoginState(true);
          });
        } else {
          console.error('❌ npm portátil não encontrado para configurar registry');
          mainWindow.webContents.send('log', { 
            message: '⚠️ npm portátil não encontrado. Configure o registry manualmente.' 
          });
          saveLoginState(true);
        }
      } else {
        // Login no registry público completado - agora sim está tudo pronto
        mainWindow.webContents.send('log', { message: '✅ Login completo! Você está autenticado no Nexus E no npmjs.org!' });
        saveLoginState(true);
        
        // Limpa processos e fecha janela
        cleanupLoginProcesses();
        if (loginWindow && !loginWindow.isDestroyed()) {
          loginWindow.close();
        }
        loginWindow = null;
      }
    } else {
      console.error('❌ Erro ao realizar login no npm:', message);
      mainWindow.webContents.send('log', { message: `Erro no login: ${message}` });
      
      // Limpa processos e fecha janela
      cleanupLoginProcesses();
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      loginWindow = null;
    }
  });

  ipcMain.on('open-browser-login', (event, { url }) => {
    console.log('🌐 Abrindo login do npmjs.org no navegador:', url);
    mainWindow.webContents.send('log', { message: '🌐 Abrindo navegador para login no npmjs.org...' });
    
    // Abre URL no navegador padrão do sistema
    const { shell } = require('electron');
    shell.openExternal(url).then(() => {
      console.log('✅ Navegador aberto com sucesso');
      mainWindow.webContents.send('log', { message: '✅ Complete o login no navegador e aguarde...' });
    }).catch((error) => {
      console.error('❌ Erro ao abrir navegador:', error);
      mainWindow.webContents.send('log', { message: '❌ Erro ao abrir navegador. Copie a URL manualmente da janela de login.' });
    });
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

// Função performNpmLoginFallback() removida - sistema de fallback desabilitado conforme solicitado

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
  console.log('📦 Abrindo instalador de dependências (Node.js portátil)');
  
  // Usa o novo sistema de instalação com Node.js portátil
  openInstallerWindow();
}

// Função para abrir janela do instalador de Node.js
function openInstallerWindow() {
  // Se já existe uma janela do instalador, apenas foca nela
  if (installerWindow && !installerWindow.isDestroyed()) {
    installerWindow.focus();
    return;
  }

  installerWindow = new BrowserWindow({
    width: 900,
    height: 700,
    modal: false,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    title: 'Instalador de Dependências - Node.js Portátil',
    icon: path.join(__dirname, 'OIP.ico'),
  });

  installerWindow.loadFile(path.join(__dirname, 'installer.html'));

  // Inicializa NodeInstaller quando a janela estiver pronta
  installerWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Janela do instalador carregada');
    
    // Abre DevTools para debug
    // Para desenvolvimento - descomente a linha abaixo se precisar debugar
    //installerWindow.webContents.openDevTools();
    
    if (!nodeInstaller) {
      nodeInstaller = new NodeInstaller(installerWindow);
      console.log('[DEBUG] NodeInstaller criado para janela do instalador');
    } else {
      console.log('[DEBUG] NodeInstaller já existe, atualizando janela');
      nodeInstaller.setMainWindow(installerWindow);
    }
    
    // Log para verificar se está funcionando
    console.log('[DEBUG] Enviando mensagem de teste para installerWindow');
    installerWindow.webContents.send('installer-log', { 
      message: 'Janela do instalador carregada com sucesso!', 
      isError: false 
    });
    
    // TESTE CRÍTICO: Verificar se handlers IPC estão funcionando
    console.log('[DEBUG] ===== TESTE DE HANDLERS IPC =====');
    console.log('[DEBUG] Listando todos os handlers registrados...');
    console.log('[DEBUG] handlers start-node-installation:', ipcMain.listenerCount('start-node-installation'));
    console.log('[DEBUG] ===== FIM DO TESTE =====');
  });

  // Limpa referência quando fechada
  installerWindow.on('closed', () => {
    installerWindow = null;
    nodeInstaller = null;
    console.log('🧹 Janela do instalador fechada');
  });
}

// Função para abrir janela de configurações de projetos
function openProjectConfigsWindow() {
  // Se já existe uma janela, apenas foca nela
  if (projectConfigsWindow && !projectConfigsWindow.isDestroyed()) {
    projectConfigsWindow.focus();
    return;
  }

  projectConfigsWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    resizable: true,
    title: 'Configurações de Projetos',
    icon: path.join(__dirname, 'OIP.ico'),
  });

  projectConfigsWindow.loadFile(path.join(__dirname, 'project-configs.html'));

  // Para desenvolvimento - descomente a linha abaixo se precisar debugar
  // projectConfigsWindow.webContents.openDevTools();

  // Inicializa ProjectConfigManager quando a janela estiver pronta
  projectConfigsWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Janela de configurações de projetos carregada');
    if (!projectConfigManager) {
      projectConfigManager = new ProjectConfigManager();
    }
    
    // Envia tema para a janela
    try {
      const config = loadConfig();
      const isDarkMode = config.darkMode === true;
      projectConfigsWindow.webContents.send('apply-theme', isDarkMode);
      console.log(`🎨 Tema enviado para configurações de projetos: ${isDarkMode ? 'escuro' : 'claro'}`);
    } catch (error) {
      console.error('Erro ao enviar tema:', error);
    }
    
    // Detecta e envia informações de layout responsivo
    function sendLayoutInfo() {
      const { screen } = require('electron');
      const bounds = projectConfigsWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const windowWidth = bounds.width;
      const screenWidth = display.workArea.width;
      const screenHeight = display.workArea.height;
      
      // Define se deve usar 2 colunas baseado na largura da janela E do monitor
      // Usa 2 colunas se a janela for >= 1400px OU se o monitor for >= 1920px e janela for >= 1200px
      const use2Columns = windowWidth >= 1400 || (screenWidth >= 1920 && windowWidth >= 1200);
      
      console.log(`[LAYOUT] 📐 Monitor: ${screenWidth}x${screenHeight}px | Janela: ${windowWidth}x${bounds.height}px | Layout: ${use2Columns ? '2 COLUNAS' : '1 COLUNA'}`);
      
      projectConfigsWindow.webContents.send('layout-config', {
        windowWidth,
        windowHeight: bounds.height,
        screenWidth,
        screenHeight,
        use2Columns
      });
    }
    
    // Envia layout inicial
    setTimeout(() => sendLayoutInfo(), 100);
    
    // Monitora mudanças de tamanho (resize, maximize, etc)
    projectConfigsWindow.on('resize', () => {
      sendLayoutInfo();
    });
    
    projectConfigsWindow.on('maximize', () => {
      setTimeout(() => sendLayoutInfo(), 100);
    });
    
    projectConfigsWindow.on('unmaximize', () => {
      setTimeout(() => sendLayoutInfo(), 100);
    });
    
    // Aguarda um pouco mais para garantir que a página está totalmente carregada
    setTimeout(() => {
      const configs = projectConfigManager.getAllConfigs();
      const { getDefaultNodeVersion } = require('./node-version-config');
      
      const projectsList = projects.map(p => {
        const defaultVersion = getDefaultNodeVersion(p.name);
        console.log(`[AUTO-SEND DEBUG] ${p.name}: defaultVersion=${defaultVersion}`);
        return {
          name: p.name,
          path: p.path || 'Caminho não definido',
          defaultVersion: defaultVersion
        };
      });
      
      console.log('[AUTO-SEND] Enviando dados automaticamente:', {
        totalProjects: projectsList.length,
        projects: projectsList.map(p => `${p.name} (default: ${p.defaultVersion})`),
        configs: configs
      });
      
      // Envia dados dos projetos
      projectConfigsWindow.webContents.send('project-configs-data', {
        projects: projectsList,
        configs: configs
      });
      
      // Envia versões disponíveis do Node.js (DETECÇÃO DINÂMICA)
      setTimeout(() => {
        console.log('[AUTO-SEND] Enviando versões disponíveis...');
        const { NODE_VERSIONS } = require('./node-version-config');
        const fs = require('fs');
        const path = require('path');
        
        const availableVersions = {};
        const nodesBasePath = getNodesBasePath();
        const currentOS = getCurrentOS();
        const osPath = path.join(nodesBasePath, currentOS);
        
        console.log('[AUTO-SEND] 🔍 Detectando versões em:', osPath);
        
        // DETECÇÃO DINÂMICA - escaneia filesystem em vez de usar NODE_VERSIONS hardcoded
        if (fs.existsSync(osPath)) {
          const folders = fs.readdirSync(osPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
          
          console.log('[AUTO-SEND] 📁 Pastas encontradas:', folders.length);
          
          folders.forEach(folder => {
            console.log(`[AUTO-SEND] 🔎 Verificando: ${folder}`);
            const folderPath = path.join(osPath, folder);
            
            // Verifica se tem node.exe diretamente
            let nodeExePath = path.join(folderPath, currentOS === 'windows' ? 'node.exe' : 'bin/node');
            let npmPath = path.join(folderPath, currentOS === 'windows' ? 'npm.cmd' : 'bin/npm');
            let actualPath = folderPath;
            
            // Se não encontrar, procura em subpastas
            if (!fs.existsSync(nodeExePath) || !fs.existsSync(npmPath)) {
              console.log(`[AUTO-SEND]   ⚠️ Não encontrado diretamente, procurando em subpastas...`);
              const subfolders = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
              
              for (const subfolder of subfolders) {
                const subfolderPath = path.join(folderPath, subfolder);
                const subNodeExe = path.join(subfolderPath, currentOS === 'windows' ? 'node.exe' : 'bin/node');
                const subNpmPath = path.join(subfolderPath, currentOS === 'windows' ? 'npm.cmd' : 'bin/npm');
                
                if (fs.existsSync(subNodeExe) && fs.existsSync(subNpmPath)) {
                  console.log(`[AUTO-SEND]   ✅ Encontrado em subpasta: ${subfolder}`);
                  nodeExePath = subNodeExe;
                  npmPath = subNpmPath;
                  actualPath = subfolderPath;
                  break;
                }
              }
            }
            
            const isInstalled = fs.existsSync(nodeExePath) && fs.existsSync(npmPath);
            
            if (isInstalled) {
              // Extrai versão do nome da pasta
              const versionMatch = folder.match(/node-v([\d.]+)/);
              if (versionMatch) {
                const version = versionMatch[1];
                console.log(`[AUTO-SEND]   ✅ Versão detectada: ${version}`);
                
                // Tenta pegar configuração do NODE_VERSIONS, senão usa defaults
                const versionConfig = NODE_VERSIONS[version] || {
                  nodeLabel: `Node ${version}`,
                  angularVersion: 'Unknown',
                  angularPackage: '@angular/cli@latest'
                };
                
                availableVersions[version] = {
                  version: version,
                  label: versionConfig.nodeLabel || `Node ${version}`,
                  installed: true,
                  angularVersion: versionConfig.angularVersion,
                  angularPackage: versionConfig.angularPackage
                };
              }
            }
          });
        }
        
        console.log('[AUTO-SEND] 📋 Total de versões detectadas:', Object.keys(availableVersions).length);
        console.log('[AUTO-SEND] Versões disponíveis:', availableVersions);
        projectConfigsWindow.webContents.send('available-node-versions', availableVersions);
      }, 200);
      
    }, 1000); // Aumentado de 500ms para 1000ms
  });

  // Limpa referência quando fechada
  projectConfigsWindow.on('closed', () => {
    projectConfigsWindow = null;
    console.log('🧹 Janela de configurações de projetos fechada');
  });
}

// Função para abrir janela de configuração Node.js do Onboarding
function openOnboardingNodeConfigWindow() {
  // Se já existe uma janela, apenas foca nela
  if (onboardingNodeConfigWindow && !onboardingNodeConfigWindow.isDestroyed()) {
    onboardingNodeConfigWindow.focus();
    return;
  }

  onboardingNodeConfigWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    resizable: true,
    title: '🎓 Configuração Node.js - Onboarding',
    icon: path.join(__dirname, 'OIP.ico'),
  });

  // Carrega o arquivo HTML específico para configuração Node.js do Onboarding
  onboardingNodeConfigWindow.loadFile(path.join(__dirname, 'onboarding-node-config.html'));

  // Para desenvolvimento - descomente a linha abaixo se precisar debugar
  // onboardingNodeConfigWindow.webContents.openDevTools();

  // Quando a janela estiver carregada, aplica o tema
  onboardingNodeConfigWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Janela de configuração Node.js do Onboarding carregada');
    
    // Envia tema para a janela
    try {
      const config = loadConfig();
      const isDarkMode = config.darkMode === true;
      onboardingNodeConfigWindow.webContents.send('apply-theme', isDarkMode);
      console.log(`🎨 Tema enviado para configuração Onboarding: ${isDarkMode ? 'escuro' : 'claro'}`);
    } catch (error) {
      console.error('Erro ao enviar tema:', error);
    }
    
    // Foca na aba de configuração do Node.js se houver
    setTimeout(() => {
      onboardingNodeConfigWindow.webContents.send('focus-node-config-tab');
    }, 500);
  });

  // Limpa referência quando fechada
  onboardingNodeConfigWindow.on('closed', () => {
    onboardingNodeConfigWindow = null;
    console.log('🧹 Janela de configuração Node.js do Onboarding fechada');
  });
}

// Função para abrir janela de novas CLIs
function openNewCLIsWindow() {
  console.log('[DEBUG] Abrindo janela de novas CLIs');
  
  if (newCLIsWindow && !newCLIsWindow.isDestroyed()) {
    newCLIsWindow.focus();
    return;
  }

  newCLIsWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'OIP.ico'),
    title: 'Adicionar novas CLIs',
    resizable: true,
    minimizable: true,
    maximizable: true
  });

  newCLIsWindow.loadFile(path.join(__dirname, 'new-clis.html'));

  // Abrir DevTools automaticamente para debug
  // Para desenvolvimento - descomente a linha abaixo se precisar debugar
  // newCLIsWindow.webContents.openDevTools();

  // Listener para erros de carregamento
  newCLIsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`❌ Erro ao carregar new-clis.html: ${errorCode} - ${errorDescription}`);
  });

  // Listener para erros de processo
  newCLIsWindow.webContents.on('crashed', () => {
    console.error('❌ Processo da janela de CLIs crashou!');
  });

  newCLIsWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error(`❌ Erro ao carregar preload: ${preloadPath}`, error);
  });

  newCLIsWindow.webContents.once('did-finish-load', () => {
    console.log('✅ Janela de novas CLIs carregada');
    
    // Envia o tema atual para a janela
    try {
      const configPath = path.join(userDataPath, 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const isDarkMode = config.darkMode === true;
        newCLIsWindow.webContents.send('apply-theme', isDarkMode);
        console.log(`🎨 Tema enviado para novas CLIs: ${isDarkMode ? 'escuro' : 'claro'}`);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar tema para novas CLIs:', error);
    }
  });

  // Limpa referência quando fechada
  newCLIsWindow.on('closed', () => {
    newCLIsWindow = null;
    console.log('🧹 Janela de novas CLIs fechada');
  });
}

// Função para abrir a janela de seleção de terminal
let mainWindow;
let loginWindow = null;
let splashManager; // Gerenciador de splash screen e loading
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

// Função para inicializar a aplicação principal (OTIMIZADA)
async function initializeMainApp() {
  console.log('[START] Iniciando aplicacao principal com otimizacoes...');
  const startTime = Date.now();
  
  // Inicializa o SplashManager se não foi inicializado
  if (!splashManager) {
    splashManager = new SplashManager();
  }
  
  // Carrega cache se ainda não foi carregado
  const splashCache = splashManager.getAppCache();
  if (!splashCache.projects) {
    splashManager.loadAppCache();
  }
  
  // Executa pré-carregamento se necessário
  if (!splashCache.projects || !splashCache.nodePortableInfo) {
    await splashManager.preloadCriticalData();
  }
  
  // Usa dados do cache
  const updatedSplashCache = splashManager.getAppCache();
  let isLoggedIn = updatedSplashCache.loginState ? updatedSplashCache.loginState.isLoggedIn : loadLoginState();
  let dependenciesInstalled = false;
  let dependenciesMessage = '';
  
  // Verifica se as dependências Node.js portátil estão instaladas
  try {
    // Carrega settings
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let settings = {};
    
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    
    // Inicializa NodeInstaller para verificar
    if (!nodeInstaller) {
      nodeInstaller = new NodeInstaller(null);
    }
    
    // Verifica se dependências estão instaladas
    const depsInstalled = nodeInstaller.checkDependenciesInstalled();
    
    if (depsInstalled && settings.dependenciesInstalled) {
      dependenciesInstalled = true;
      dependenciesMessage = '✅ Dependências instaladas';
      console.log('✅ Node.js portátil instalado corretamente');
    } else {
      dependenciesInstalled = false;
      dependenciesMessage = '⚠️ Falta instalar as dependências. Use a opção do menu "Instalar Dependências Node.js"';
      console.log('⚠️ Node.js portátil não instalado');
    }
    
  } catch (err) {
    console.error('❌ Erro ao verificar dependências:', err.message);
    dependenciesInstalled = false;
    dependenciesMessage = '⚠️ Falta instalar as dependências. Use a opção do menu "Instalar Dependências Node.js"';
  }
  
  const initTime = Date.now() - startTime;
  console.log(`⚡ Aplicação inicializada em ${initTime}ms`);
  
  // Cria a janela principal
  createMainWindow(isLoggedIn, dependenciesInstalled, dependenciesMessage);
}

// Função para criar a janela principal (OTIMIZADA)
function createMainWindow(isLoggedIn, dependenciesInstalled, dependenciesMessage) {
  console.log('🖼️ Criando janela principal otimizada...');
  
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: `Front-end Manager v${APP_VERSION}`,
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
  // Função para obter o ícone do terminal (sempre whitesmoke para o menu superior escuro)
  const getTerminalIconForMenu = () => {
    const iconPath = path.join(__dirname, 'assets', 'terminal_whitesmoke.png');
    try {
      return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } catch (error) {
      console.log('[MENU] Aviso: Não foi possível carregar ícone do terminal:', error.message);
      return undefined;
    }
  };

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
          icon: getTerminalIconForMenu(),
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
          icon: getTerminalIconForMenu(),
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
        {
          label: 'Configurar Manualmente',
          icon: path.join(__dirname, 'assets', 'manual.png'),
          id: 'manual-setup',
          click: () => {
            // Cria janela para configuração manual
            const manualWindow = new BrowserWindow({
              width: 750,
              height: 800,
              modal: true,
              parent: mainWindow,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
              },
              autoHideMenuBar: true,
              resizable: true,
              minWidth: 600,
              minHeight: 600,
              titleBarStyle: 'default',
              title: '🛠️ Configuração Manual - Nexus',
              icon: path.join(__dirname, 'assets', 'manual.png')
            });

            manualWindow.loadFile(path.join(__dirname, 'manual-setup.html'));

            // Envia o estado de dark mode para a janela
            manualWindow.webContents.on('did-finish-load', () => {
              const config = loadConfig();
              manualWindow.webContents.send('apply-dark-mode', config.darkMode || false);
            });

            // Handler para fechar a janela
            ipcMain.once('close-manual-setup-window', () => {
              manualWindow.close();
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Instalar Dependências Node.js',
          id: 'install-deps',
          click: () => {
            // Desabilita o item do menu
            const menuItem = appMenu ? appMenu.getMenuItemById('install-deps') : null;
            if (menuItem) {
              menuItem.label = 'Abrindo instalador...';
              menuItem.enabled = false;
            }

            openInstallerWindow();
            
            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = 'Instalar Dependências Node.js';
                menuItem.enabled = true;
              }
            }, 1000);
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
        { type: 'separator' },
        {
          label: '🎓 Configurar Onboarding (Node.js)',
          id: 'onboarding-node-config',
          click: () => {
            console.log('[ONBOARDING] 🖱️ Abrindo configuração Node.js do Onboarding...');
            
            // Desabilita temporariamente
            const menuItem = appMenu ? appMenu.getMenuItemById('onboarding-node-config') : null;
            if (menuItem) {
              menuItem.label = 'Abrindo...';
              menuItem.enabled = false;
            }

            // Abre janela separada ao invés de enviar evento para janela principal
            openOnboardingNodeConfigWindow();

            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = '🎓 Configurar Onboarding (Node.js)';
                menuItem.enabled = true;
              }
            }, 1000);
          },
        },
        { type: 'separator' },
        {
          label: '⚙️ Configurar CLIs projetos',
          id: 'project-configs',
          click: () => {
            // Desabilita temporariamente
            const menuItem = appMenu ? appMenu.getMenuItemById('project-configs') : null;
            if (menuItem) {
              menuItem.label = 'Abrindo...';
              menuItem.enabled = false;
            }

            openProjectConfigsWindow();

            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = '⚙️ Configurar CLIs projetos';
                menuItem.enabled = true;
              }
            }, 1000);
          },
        },
        {
          label: '📦 Adicionar novas CLIs',
          id: 'new-clis',
          click: () => {
            // Desabilita temporariamente
            const menuItem = appMenu ? appMenu.getMenuItemById('new-clis') : null;
            if (menuItem) {
              menuItem.label = 'Abrindo...';
              menuItem.enabled = false;
            }

            openNewCLIsWindow();

            // Reabilita após um tempo
            setTimeout(() => {
              if (menuItem) {
                menuItem.label = '📦 Adicionar novas CLIs';
                menuItem.enabled = true;
              }
            }, 1000);
          },
        },
        { type: 'separator' },
        {
          label: '📁 Ver versões instaladas',
          click: () => {
            const { shell } = require('electron');
            const nodeVersionConfig = require('./node-version-config');
            const nodesPath = nodeVersionConfig.getNodesBasePath();
            shell.openPath(nodesPath);
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
  
  // Abre o DevTools tela principal
  //mainWindow.webContents.openDevTools();
  
  // Mostra a janela apenas quando estiver pronta
  mainWindow.once('ready-to-show', async () => {
    console.log('✅ Janela principal pronta para exibição');
    
    // Carrega apenas branches básicas (rápido, sem fetch)
    console.log('[GIT] Carregando branches básicas (sem fetch)...');
    const projectsWithBranches = await getAllProjectsBranches(projects);
    projects = projectsWithBranches;
    
    // Notifica a splash screen que está pronto (SEM comandos Git pesados)
    if (splashManager && splashManager.isSplashActive()) {
      console.log('📱 Notificando splash que app principal está pronto');
      splashManager.notifyMainAppReady();
    }
    
    // ===== LAYOUT RESPONSIVO - DETECTA TAMANHO E ENVIA PARA FRONTEND =====
    function sendMainWindowLayoutInfo() {
      const { screen } = require('electron');
      const bounds = mainWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const windowWidth = bounds.width;
      const screenWidth = display.workArea.width;
      
      // Usa 2 colunas se a janela for >= 1400px OU se o monitor for >= 1920px e janela for >= 1200px
      const use2Columns = windowWidth >= 1400 || (screenWidth >= 1920 && windowWidth >= 1200);
      
      //console.log(`[LAYOUT] 📐 Monitor: ${screenWidth}x${display.workArea.height}px | Janela: ${windowWidth}x${bounds.height}px | Layout: ${use2Columns ? '2 COLUNAS' : '1 COLUNA'}`);
      
      mainWindow.webContents.send('layout-config', {
        windowWidth,
        windowHeight: bounds.height,
        screenWidth,
        screenHeight: display.workArea.height,
        use2Columns
      });
    }
    
    // Envia layout inicial após a janela estar visível
    setTimeout(() => sendMainWindowLayoutInfo(), 500);
    
    // Monitora mudanças de tamanho
    mainWindow.on('resize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        sendMainWindowLayoutInfo();
      }
    });
    
    mainWindow.on('maximize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => sendMainWindowLayoutInfo(), 100);
      }
    });
    
    mainWindow.on('unmaximize', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => sendMainWindowLayoutInfo(), 100);
      }
    });
    // ===== FIM DO LAYOUT RESPONSIVO =====
    
    // DELAY REDUZIDO - app carrega mais rápido
    setTimeout(() => {
      console.log('🚀 Mostrando janela principal e fechando splash');
      mainWindow.show();
      mainWindow.focus();
      
      // Fecha a splash screen após mostrar a principal
      setTimeout(() => {
        if (splashManager && splashManager.isSplashActive()) {
          splashManager.closeSplash();
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
    if (splashManager && splashManager.isSplashActive()) {
      splashManager.closeSplash();
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

  // Handler para verificar status das dependências Node.js portátil
  ipcMain.on('check-dependencies-status', (event) => {
    console.log('🔍 Verificando status das dependências Node.js portátil...');
    
    try {
      // Inicializa NodeInstaller para verificar
      if (!nodeInstaller) {
        nodeInstaller = new NodeInstaller(null);
      }
      
      // Verifica se dependências estão instaladas
      const depsInstalled = nodeInstaller.checkDependenciesInstalled();
      const { getNodesBasePath, getCurrentOS } = require('./node-version-config');
      const nodesPath = path.join(getNodesBasePath(), getCurrentOS());
      
      if (depsInstalled) {
        event.reply('dependencies-status', { 
          installed: true, 
          message: '✅ Dependências instaladas',
          nodesPath: nodesPath
        });
        console.log('✅ Node.js portátil instalado corretamente em:', nodesPath);
      } else {
        event.reply('dependencies-status', { 
          installed: false, 
          message: '❗ Dependências não instaladas',
          nodesPath: nodesPath
        });
        console.log('⚠️ Node.js portátil não instalado');
        console.log('📁 Caminho esperado:', nodesPath);
      }
      
    } catch (err) {
      console.error('❌ Erro ao verificar dependências:', err.message);
      event.reply('dependencies-status', { 
        installed: false, 
        message: '❗ Erro ao verificar dependências',
        nodesPath: ''
      });
    }
  });

  // REMOVIDO: load-angular-info - não é mais necessário pois usamos Node.js portátil

  // Handler para abrir pasta nodes no explorer
  ipcMain.on('open-nodes-folder', (event, folderPath) => {
    console.log('📁 Abrindo pasta nodes:', folderPath);
    
    try {
      // Cria a pasta se não existir
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log('📁 Pasta criada:', folderPath);
      }
      
      // Abre no explorer
      const { shell } = require('electron');
      shell.openPath(folderPath).then(error => {
        if (error) {
          console.error('Erro ao abrir pasta:', error);
        } else {
          console.log('✅ Pasta aberta no explorer');
        }
      });
    } catch (error) {
      console.error('❌ Erro ao abrir pasta nodes:', error);
    }
  });

  ipcMain.on('download-project', (event, { name, index }) => {
    console.log(`📥 Iniciando download do projeto: ${name} (index: ${index})`);
    
    // Verifica se já está baixando este projeto
    if (downloadingProjects.has(index)) {
      console.warn(`⚠️ Projeto ${index} (${name}) já está sendo baixado, ignorando clique duplicado`);
      return;
    }
    
    // Marca como em processo de download
    downloadingProjects.set(index, true);
    
    // Caminho base para os projetos baseado no SO
    const platform = os.platform();
    let workdir;
    
    if (platform === 'win32') {
      // Windows: mantém comportamento atual
      workdir = path.join('C:', 'projetos');
    } else {
      // Linux/Mac: usa pasta do usuário para evitar problemas de permissão
      workdir = path.join(os.homedir(), 'projetos');
    }
    
    const projectPath = path.join(workdir, name);
    const repoUrl = `https://github.com/viavarejo-internal/${name}.git`;

    console.log(`Iniciando download do projeto: ${name}`);
    console.log(`📂 Destino: ${projectPath}`);
    console.log(`🔗 Repositório: ${repoUrl}`);
    
    const downloadMsg = `📥 Fazendo download do projeto: ${name}`;
    if (name.startsWith('mp-pamp')) {
      event.reply('pamp-log', { 
        path: projectPath, 
        message: downloadMsg,
        index: index,
        name: name
      });
    } else {
      event.reply('log', { 
        path: projectPath, 
        message: downloadMsg
      });
    }

    if (!fs.existsSync(workdir)) {
        console.log(`Criando diretório base: ${workdir}`);
        try {
          safeMkdirSync(workdir);
        } catch (error) {
          console.error(`❌ Erro ao criar diretório ${workdir}:`, error.message);
          const errorMsg = `Erro ao criar diretório base: ${error.message}`;
          if (name.startsWith('mp-pamp')) {
            event.reply('pamp-log', { path: projectPath, message: errorMsg, index, name, error: true });
          } else {
            event.reply('log', { path: projectPath, message: errorMsg, error: true });
          }
          downloadingProjects.delete(index); // Remove o bloqueio
          return;
        }
    }

    if (fs.existsSync(projectPath)) {
        console.log(`O projeto ${name} já existe em ${projectPath}.`);
        const existsMsg = `O projeto ${name.startsWith('mp-pamp') ? 'pamp' : 'pas'} ${name} já existe em ${projectPath}.`;
        
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: existsMsg,
            index: index,
            name: name 
          });
        } else {
          event.reply('log', { path: projectPath, message: existsMsg });
        }
        
        // IMPORTANTE: Atualiza o caminho mesmo que já exista
        console.log(`✅ Atualizando caminho do projeto existente: ${projectPath}`);
        projects[index].path = projectPath;
        saveProjects(projects);
        event.reply('update-project', { index, path: projectPath });
        
        downloadingProjects.delete(index); // Remove o bloqueio
        return;
    }

    const cloneCommand = `git clone ${repoUrl} ${projectPath}`;
    console.log(`🔧 Executando: ${cloneCommand}`);
    
    const cloneProcess = exec(cloneCommand, { 
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 300000 // 5 minutos
    });
    
    // Throttle para mensagens de progresso (evita spam)
    let lastProgressUpdate = 0;
    let lastProgressPercent = 0;
    
    // Mostra progresso do clone
    cloneProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[git clone] ${output}`);
        const progressMsg = `📦 ${output}`;
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: progressMsg,
            index: index,
            name: name
          });
        } else {
          event.reply('log', { path: projectPath, message: progressMsg });
        }
      }
    });
    
    cloneProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[git clone stderr] ${output}`);
        
        // Git envia progresso para stderr - precisamos mostrar!
        const isProgressMessage = output.includes('Updating files:') || 
                                   output.includes('Receiving objects:') || 
                                   output.includes('Resolving deltas:');
        
        if (isProgressMessage) {
          // Throttle: mostra apenas a cada 10% ou 500ms
          const now = Date.now();
          const percentMatch = output.match(/(\d+)%/);
          const percent = percentMatch ? parseInt(percentMatch[1]) : 0;
          
          const shouldShow = 
            (percent % 10 === 0 && percent !== lastProgressPercent) || // A cada 10%
            (now - lastProgressUpdate > 500); // Ou a cada 500ms
          
          if (shouldShow) {
            lastProgressUpdate = now;
            lastProgressPercent = percent;
            
            const progressMsg = `📦 ${output}`;
            if (name.startsWith('mp-pamp')) {
              event.reply('pamp-log', { 
                path: projectPath, 
                message: progressMsg,
                index: index,
                name: name
              });
            } else {
              event.reply('log', { path: projectPath, message: progressMsg });
            }
          }
        } else {
          // Outras mensagens (Cloning into, errors, warnings) sempre mostra
          const progressMsg = `📦 ${output}`;
          if (name.startsWith('mp-pamp')) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: progressMsg,
              index: index,
              name: name
            });
          } else {
            event.reply('log', { path: projectPath, message: progressMsg });
          }
        }
      }
    });
    
    cloneProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ Erro ao clonar o repositório ${repoUrl}: código de saída ${code}`);
        const errorMsg = `❌ Erro ao clonar o repositório ${repoUrl}: código de saída ${code}`;
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: errorMsg,
            index: index,
            name: name,
            error: true
          });
        } else {
          event.reply('log', { path: projectPath, message: errorMsg, error: true });
        }
        downloadingProjects.delete(index); // Remove o bloqueio
        return;
      }

      console.log(`✅ Projeto ${name} clonado com sucesso em ${projectPath}.`);
      const successMsg = `✅ Projeto baixado com sucesso!`;
      const pathMsg = `📁 Disponível em: ${projectPath}`;
      
      if (name.startsWith('mp-pamp')) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: successMsg,
          index: index,
          name: name
        });
        event.reply('pamp-log', { 
          path: projectPath, 
          message: pathMsg,
          index: index,
          name: name
        });
      } else {
        event.reply('log', { path: projectPath, message: successMsg });
        event.reply('log', { path: projectPath, message: pathMsg });
      }

      // Atualiza o caminho no projeto
      console.log(`✅ Atualizando caminho do projeto no index ${index}: ${projectPath}`);
      projects[index].path = projectPath;
      saveProjects(projects);
      event.reply('update-project', { index, path: projectPath });
      downloadingProjects.delete(index); // Remove o bloqueio após sucesso
    });
    
    cloneProcess.on('error', (error) => {
      console.error(`❌ Erro no processo de clone:`, error);
      const errorMsg = `❌ Erro ao clonar: ${error.message}`;
      if (name.startsWith('mp-pamp')) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: errorMsg,
          index: index,
          name: name,
          error: true
        });
      } else {
        event.reply('log', { path: projectPath, message: errorMsg, error: true });
      }
      downloadingProjects.delete(index); // Remove o bloqueio após erro
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
      console.log(`[START] 🔄 Iniciando projeto...`);
      
      // Não precisamos mais liberar porta - o Angular faz isso automaticamente
      // Verifica cancelamento antes de iniciar projeto
      if (checkCancelationAndExit(projectPath, "início do projeto após verificação Git")) {
        return;
      }
      
      console.log(`[START-DEBUG] 🎯 Chamando startProject para ${projectPath}`);
      startProject(event, projectPath, port);
    }).catch(error => {
      console.log(`[START] ❌ Erro na verificação Git: ${error.message}`);
      event.reply('log', { 
        path: projectPath, 
        message: `⚠️ Erro na verificação Git: ${error.message}. Prosseguindo...`
      });
      
      // Continua mesmo com erro no Git
      if (checkCancelationAndExit(projectPath, "início do projeto após erro Git")) {
        return;
      }
      
      console.log(`[START-DEBUG] 🎯 Chamando startProject após erro Git para ${projectPath}`);
      startProject(event, projectPath, port);
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

  /**
   * Função auxiliar para executar npm install com tratamento de erros
   */
  function executeNpmInstall(event, projectPath, projectName, projectIndex, isPampProject, npmCmd, nodePaths, command, port) {
    console.log(`[INSTALL] Iniciando npm install simples para ${projectName}`);

    // Executa npm install SIMPLES - SEM fallback, SEM login automático, SEM complicação
    const installCommand = `${npmCmd} install --progress=true`;
    console.log(`[DEBUG] Executando comando simples: ${installCommand}`);
    
    // Configura ambiente com Node.js portátil se disponível
    let installEnv;
    if (nodePaths) {
      installEnv = { 
        ...process.env,
        PATH: `${nodePaths.nodeDir}${path.delimiter}${process.env.PATH}`
      };
      console.log(`[DEBUG] Usando Node.js portátil: ${nodePaths.nodeDir}`);
    } else {
      installEnv = { ...process.env };
      console.log(`[DEBUG] Usando Node.js global do sistema`);
    }
    
    const installProcess = exec(installCommand, { 
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 50, // Buffer maior (50MB)
      env: installEnv
    });
    
    // Armazena a saída de erro para análise
    let errorOutput = '';
    
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
      errorOutput += cleanData + '\n'; // Armazena para análise
      
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
        
        // Erro real na instalação - SEM tentar login automático
        const errorMessage = `❌ [ERRO] Erro ao instalar dependências. Código: ${code}`;
        
        if (isPampProject) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: errorMessage,
            index: projectIndex,
            name: projectName,
            error: true
          });
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
          event.reply('process-error', { path: projectPath });
        }
      }
    });
  }

  function startProject(event, projectPath, port) {
    console.log(`[DEBUG] ======= startProject INICIADO para ${projectPath} =======`);
    
    // Verifica se o projeto foi cancelado antes de iniciar
    if (checkCancelationAndExit(projectPath, "início da função startProject")) {
      console.log(`[DEBUG] Projeto cancelado, saindo...`);
      return;
    }
    
    // Define o comando com base no nome do projeto
    const projectName = path.basename(projectPath); // Extrai o nome do projeto do caminho
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    
    console.log(`[DEBUG] Projeto: ${projectName}, isPamp: ${isPampProject}, index: ${projectIndex}`);
    
    // 🎯 VERIFICA SE DEVE USAR SISTEMA GLOBAL OU PORTÁTIL
    let useGlobalSystem = false;
    try {
      const configResult = safeReadConfigFile('global-system-config.json');
      if (configResult) {
        const config = JSON.parse(configResult.content);
        useGlobalSystem = config.useGlobalSystem || false;
      }
    } catch (error) {
      console.error('[ERROR] Erro ao ler configuração global:', error);
    }

    console.log(`[DEBUG] Usar sistema global: ${useGlobalSystem}`);
    
    // 🎯 OBTÉM VERSÃO DO NODE.JS PARA ESTE PROJETO
    if (!projectConfigManager) {
      projectConfigManager = new ProjectConfigManager();
      console.log(`[DEBUG] ProjectConfigManager criado`);
    }
    
    const nodeVersion = projectConfigManager.getProjectNodeVersion(projectName);
    console.log(`[DEBUG] 🎯 Projeto ${projectName} usando Node.js ${nodeVersion}`);
    
    // Obtém caminhos do Node.js (portátil ou global)
    let nodePaths;
    let npmCmd;
    let command;
    
    if (useGlobalSystem) {
      // USA SISTEMA GLOBAL (PATH do Windows)
      console.log(`[DEBUG] 🌐 Usando Node.js e CLIs globais do sistema`);
      
      // Define para sistema global
      npmCmd = 'npm';
      nodePaths = null;
      
      // Define comandos usando binários globais
      if (projectName === 'mp-pas-root') {
        command = `npm run start`; // Webpack
      } else if (projectName.startsWith('mp-pas-')) {
        const scriptName = projectName.replace('mp-', ''); // Remove apenas 'mp-', mantém 'pas-'
        command = `npm run serve:single-spa:${scriptName}`;
      } else if (isPampProject) {
        command = `ng serve`; // PAMP - usando ng serve diretamente (README recomenda)
      } else {
        command = `npm run start`; // Padrão
      }
      
      console.log(`[DEBUG] 🌐 Comando global: ${command}`);
      
    } else {
      // USA SISTEMA PORTÁTIL (como antes)
      try {
        console.log(`[DEBUG] 📦 Tentando obter caminhos do Node.js portátil ${nodeVersion}...`);
        nodePaths = getNodeExecutablePath(nodeVersion);
        console.log(`[DEBUG] ✅ Node.js portátil encontrado em: ${nodePaths.nodeDir}`);
        console.log(`[DEBUG] Node exe: ${nodePaths.nodeExe}`);
        console.log(`[DEBUG] NPM cmd: ${nodePaths.npmCmd}`);
        
        // Verifica se o executável existe
        if (!fs.existsSync(nodePaths.nodeExe)) {
          const errorMsg = `❌ Node.js ${nodeVersion} não está instalado. Use "Instalar Dependências Node.js" no menu.`;
          console.error(`[DEBUG] ${errorMsg}`);
          
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: errorMsg,
              index: projectIndex,
              name: projectName,
              error: true
            });
            event.reply('pamp-process-error', { path: projectPath, index: projectIndex });
          } else {
            event.reply('log', { path: projectPath, message: errorMsg });
            event.reply('process-stopped', { path: projectPath });
          }
          return;
        }
        
        // 🎯 CONSTRÓI COMANDOS USANDO NODE.JS PORTÁTIL
        const nodeExe = `"${nodePaths.nodeExe}"`;
        npmCmd = `"${nodePaths.npmCmd}"`; // ✅ Define npmCmd no escopo externo
        const ngCmd = `"${nodePaths.ngCmd}"`;

        // Ajusta o comando para projetos específicos
        if (projectName === 'mp-pas-root') {
          command = `${npmCmd} run start`; // Comando específico para o mp-pas-root (usa webpack)
        } else if (projectName.startsWith('mp-pas-')) {
          // Para projetos PAS, usa npm run com o script correto (mantém o 'pas-' no nome)
          // Não podemos usar ng.cmd diretamente com node.exe (ng.cmd é batch, não JavaScript)
          const scriptName = projectName.replace('mp-', ''); // Remove apenas 'mp-', mantém 'pas-'
          command = `${npmCmd} run serve:single-spa:${scriptName}`;
        } else if (isPampProject) {
          // Para projetos PAMP, usa ng serve diretamente (README recomenda)
          command = `${ngCmd} serve`;
        } else {
          command = `${npmCmd} run start`; // Comando padrão para outros projetos
        }
      } catch (error) {
        const errorMsg = `❌ Erro ao obter Node.js portátil: ${error.message}`;
        console.error(`[DEBUG] ${errorMsg}`);
        console.error(`[DEBUG] Stack do erro:`, error.stack);
        
        if (isPampProject) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: errorMsg,
            index: projectIndex,
            name: projectName,
            error: true
          });
          event.reply('pamp-process-error', { path: projectPath, index: projectIndex });
        } else {
          event.reply('log', { path: projectPath, message: errorMsg });
          event.reply('process-stopped', { path: projectPath });
        }
        return;
      }
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
      console.log(`[DEBUG] 🎯 npmCmd a ser usado: ${npmCmd}`);
      console.log(`[DEBUG] 🎯 nodePaths: ${nodePaths ? 'PORTÁTIL' : 'GLOBAL'}`);

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
      
      // Prossegue direto com npm install (verificação de login removida para evitar travamentos)
      // Se houver problema de autenticação, o npm install vai falhar e mostrar o erro apropriado
      console.log('📦 Iniciando npm install diretamente...');
      executeNpmInstall(event, projectPath, projectName, projectIndex, isPampProject, npmCmd, nodePaths, command, port);
      
      // Retorna aqui para evitar execução do código abaixo
      return;
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
    
    // Determine se é um projeto PAMP pelo nome do diretório
    const projectName = path.basename(projectPath);
    
    // 🎯 VERIFICA SE DEVE USAR SISTEMA GLOBAL OU PORTÁTIL
    let useGlobalSystem = false;
    try {
      const configResult = safeReadConfigFile('global-system-config.json');
      if (configResult) {
        const config = JSON.parse(configResult.content);
        useGlobalSystem = config.useGlobalSystem || false;
      }
    } catch (error) {
      console.error('[ERROR] Erro ao ler configuração global:', error);
    }

    let customEnv;
    
    if (useGlobalSystem) {
      // USA AMBIENTE PADRÃO DO SISTEMA
      console.log(`🌐 Usando ambiente global do sistema (PATH padrão)`);
      customEnv = { ...process.env }; // Usa PATH do sistema
    } else {
      // USA NODE.JS PORTÁTIL
      // Obtém o diretório do Node.js portátil para este projeto
      const projectNodeConfigManager = new ProjectConfigManager();
      const nodeVersion = projectNodeConfigManager.getProjectNodeVersion(projectName);
      const nodePaths = getNodeExecutablePath(nodeVersion);
      const nodeDir = nodePaths.nodeDir;
      
      // Adiciona o diretório do Node.js portátil NO INÍCIO do PATH
      // Isso garante que npm, node e ng do portátil sejam usados ao invés do sistema
      customEnv = { 
        ...process.env,
        PATH: `${nodeDir}${path.delimiter}${process.env.PATH}`, // Node.js portátil primeiro!
        NODE_PATH: path.join(nodeDir, 'node_modules'), // Garante que módulos globais sejam encontrados
      };
      
      console.log(`🎯 PATH configurado para usar Node.js portátil: ${nodeDir}`);
      console.log(`📦 Versão Node.js: ${nodeVersion}`);
      console.log(`🔧 PATH completo: ${customEnv.PATH.substring(0, 200)}...`);
      console.log(`🔧 NODE_PATH: ${customEnv.NODE_PATH}`);
    }
    
    console.log(`🚀 Executando comando: ${command}`);
    console.log(`📂 Diretório de trabalho: ${projectPath}`);
    
    const childProcess = exec(command, { 
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 50, // Buffer maior (50MB)
      env: customEnv // Usa PATH customizado com Node.js portátil
    });
    runningProcesses[projectPath] = childProcess;
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
      
      // ⚡ PRIMEIRO: Verifica se é WARNING (NUNCA é erro crítico) ⚡
      if (lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
        return false; // Warnings NUNCA são erros críticos
      }
      
      // Lista de padrões que NÃO são erros críticos (apenas warnings/informações)
      const nonCriticalPatterns = [
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
        'processing legacy',
        'view engine',
        'encourage the library authors to publish an ivy distribution',
        '[webpack-dev-server]',
        'project is running at:',
        'loopback:',
        'on your network:',
        'content not from webpack is served from',
        '404s will fallback to',
        'webpack output is served from',
        'generating browser application bundles',
        'generating browser application bundles (phase: setup)',
        'generating browser application bundles (phase: building)',
        // Padrões específicos para bibliotecas View Engine (Angular)
        'es2015/esm2015',
        'es2015/esm5',
        'module/esm5',
        '[es2015/esm2015]',
        '[module/esm5]',
        'git+https://github.com/',
        'git+ssh://git@github.com:',
        '@ngx-translate/',
        '@ng-bootstrap/',
        '@angular/',
        'ngx-',
        'angular-',
        'angular2-'
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
        enhancedMessage += '\n   • Após a instalação, reinicie o Front-End Manager';
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

      // ⚡ IGNORA LINHAS MUITO CURTAS QUE SÃO APENAS NOMES DE COMANDOS ⚡
      // Exemplos: "npm", "ng", "node" (sem contexto adicional)
      if (cleanData.length <= 10 && !cleanData.includes(':') && !cleanData.includes('error')) {
        console.log(`[STDERR] Ignorando linha curta sem contexto: "${cleanData}"`);
        return;
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
// Função cleanupLoginProcesses já definida acima

ipcMain.on('execute-command', (event, command) => {
  console.log(`🔧 [execute-command] Recebido comando: ${command}`);
  console.log(`🔧 [execute-command] terminalProcess existe?`, terminalProcess ? 'SIM' : 'NÃO');
  
  if (!terminalProcess) {
    console.log('🚀 Inicializando novo processo de terminal...');
    loginInProgress = true;
    
    // Verifica se o comando é npm login e substitui pelo caminho portátil
    let finalCommand = command;
    if (command.includes('npm login')) {
      const npmPath = getPortableNpmPath();
      
      if (npmPath) {
        // Substitui "npm" pelo caminho completo do npm portátil
        finalCommand = command.replace('npm', `"${npmPath}"`);
        console.log(`✅ Usando npm portátil: ${npmPath}`);
        console.log(`📝 Comando ajustado: ${finalCommand}`);
        
        // Envia feedback visual para o usuário
        event.reply('command-output', `\n✅ Usando npm portátil: ${npmPath}\n\n`);
      } else {
        console.error(`❌ npm portátil não encontrado!`);
        event.reply('command-output', `\n❌ ERRO: npm não encontrado!\n`);
        event.reply('command-output', `Nenhuma versão do Node.js portátil foi encontrada.\n`);
        event.reply('command-output', `Por favor, instale pelo menos uma versão do Node.js através do menu "Dependências > Instalar Node Portable".\n\n`);
        
        // Encerra o processo de login
        loginInProgress = false;
        
        // Envia evento de falha
        setTimeout(() => {
          event.sender.send('npm-login-complete', { 
            success: false, 
            message: 'npm não encontrado. Instale uma versão do Node.js portátil primeiro.' 
          });
        }, 2000);
        
        return;
      }
    }
    
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
      
      // Detecta erros críticos
      if (error.toLowerCase().includes('not recognized') || 
          error.toLowerCase().includes('não é reconhecido') ||
          error.toLowerCase().includes('command not found')) {
        console.error('❌ Comando não encontrado - provável que npm não está disponível');
        event.reply('command-output', `\n❌ ERRO: Comando npm não foi encontrado no sistema.\n`);
        event.reply('command-output', `Instale uma versão do Node.js portátil através do menu.\n\n`);
      }
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
    
    // Envia o comando ajustado para o terminal real
    if (terminalProcess && terminalProcess.stdin && !terminalProcess.stdin.destroyed) {
      try {
        terminalProcess.stdin.write(`${finalCommand}\n`);
        console.log(`✅ Comando enviado: ${finalCommand}`);
      } catch (error) {
        console.error('❌ Erro ao enviar comando:', error);
        event.reply('command-output', `Erro ao enviar comando: ${error.message}\n`);
      }
    } else {
      console.error('❌ Terminal não disponível para executar comando');
      event.reply('command-output', `Erro: Terminal não disponível\n`);
    }
  } else {
    // Se o terminal já existe, apenas envia o comando (para inputs de usuário/senha)
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
  }
});

  // Map para rastrear deleções em andamento e prevenir múltiplos cliques
  const deletingProjects = new Map();
  
  // Map para rastrear downloads em andamento e prevenir múltiplos cliques
  const downloadingProjects = new Map();

  ipcMain.on('delete-project', (event, { index, path: projectPath }) => {
    console.log(`🗑️ Deletando projeto no caminho: ${projectPath}`);
    console.log(`🗑️ Index do projeto: ${index}`);
    
    // Verifica se já está deletando este projeto
    if (deletingProjects.has(index)) {
      console.warn(`⚠️ Projeto ${index} já está sendo deletado, ignorando clique duplicado`);
      return;
    }
    
    // Marca como em processo de deleção
    deletingProjects.set(index, true);
    
    // Valida se o caminho existe
    if (!projectPath || projectPath.trim() === '') {
      console.error('❌ Caminho do projeto vazio ou inválido');
      event.reply('delete-project-log', { 
        path: projectPath, 
        message: 'Erro: Caminho do projeto vazio ou inválido', 
        success: false, 
        index 
      });
      deletingProjects.delete(index); // Remove o bloqueio
      return;
    }
    
    // Verifica se o diretório existe antes de tentar deletar
    if (!fs.existsSync(projectPath)) {
      console.warn('⚠️ Diretório não existe, apenas limpando referência');
      event.reply('delete-project-log', { 
        path: projectPath, 
        message: 'Diretório não encontrado, apenas limpando referência...', 
        success: true, 
        index 
      });
      
      projects[index].path = '';
      saveProjects(projects);
      event.reply('update-project', { index, path: '' });
      deletingProjects.delete(index); // Remove o bloqueio
      return;
    }
    
    event.reply('delete-project-log', { 
      path: projectPath, 
      message: `Iniciando exclusão do projeto em ${projectPath}...`, 
      success: false, 
      index 
    });

    const deleteCommand = os.platform() === 'win32' 
      ? `rmdir /s /q "${projectPath}"` 
      : `rm -rf "${projectPath}"`;
    
    console.log(`🔧 Executando comando: ${deleteCommand}`);

    exec(deleteCommand, (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Erro ao deletar o projeto: ${err.message}`);
        console.error(`❌ stderr: ${stderr}`);
        event.reply('delete-project-log', { 
          path: projectPath, 
          message: `Erro ao deletar o projeto: ${err.message}`, 
          success: false, 
          index 
        });
        deletingProjects.delete(index); // Remove o bloqueio
        return; // IMPORTANTE: Para a execução aqui se houver erro
      }

      // Verifica se o diretório realmente foi deletado
      if (fs.existsSync(projectPath)) {
        console.error(`❌ Diretório ainda existe após comando de deleção: ${projectPath}`);
        event.reply('delete-project-log', { 
          path: projectPath, 
          message: `Erro: Falha ao deletar diretório. Pode estar em uso por outro processo.`, 
          success: false, 
          index 
        });
        deletingProjects.delete(index); // Remove o bloqueio
        return;
      }

      console.log(`✅ Projeto deletado com sucesso: ${projectPath}`);
      event.reply('delete-project-log', { 
        path: projectPath, 
        message: `Projeto deletado com sucesso: ${projectPath}`, 
        success: true, 
        index 
      });

      projects[index].path = '';
      saveProjects(projects);
      event.reply('update-project', { index, path: '' });
      deletingProjects.delete(index); // Remove o bloqueio após sucesso
    });
  });

  // Handler para abrir terminal na pasta do projeto
  ipcMain.on('open-terminal', (event, { projectPath }) => {
    console.log(`🖥️ [TERMINAL] Abrindo terminal na pasta: ${projectPath}`);
    
    try {
      // Verifica se o caminho existe
      if (!fs.existsSync(projectPath)) {
        console.error(`[TERMINAL] ❌ Caminho não encontrado: ${projectPath}`);
        return;
      }
      
      // Obtém o terminal preferido do usuário - LEITURA DIRETA DO ARQUIVO, SEM CACHE
      console.log(`[TERMINAL] 📖 Lendo config do arquivo diretamente...`);
      let preferredTerminal = null;
      
      try {
        if (fs.existsSync(configFile)) {
          const configData = fs.readFileSync(configFile, 'utf-8');
          const config = JSON.parse(configData);
          preferredTerminal = config.preferredTerminal;
          console.log(`[TERMINAL] 📖 Config lida do arquivo:`, JSON.stringify(config, null, 2));
        }
      } catch (e) {
        console.error(`[TERMINAL] ❌ Erro ao ler config do arquivo:`, e);
      }
      
      console.log(`[TERMINAL] 📌 Terminal preferido: ${preferredTerminal ? preferredTerminal.name : 'Nenhum (usando padrão)'}`);
      console.log(`[TERMINAL] 📌 Objeto terminal completo:`, JSON.stringify(preferredTerminal));
      
      // Define o caminho do Node.js portátil (para adicionar ao PATH se possível)
      let nodeDir = '';
      try {
        const { getNodesBasePath, getCurrentOS } = require('./node-version-config');
        const osType = getCurrentOS();
        nodeDir = path.join(getNodesBasePath(), osType);
        
        // Verifica se pelo menos uma versão existe
        if (!fs.existsSync(nodeDir)) {
          nodeDir = '';
        }
      } catch (e) {
        console.log('[TERMINAL] ⚠️ Não foi possível detectar Node.js portátil');
      }

      // Constrói o comando baseado no terminal preferido
      let command;
      let env = { ...process.env };

      if (preferredTerminal) {
        // Usa o terminal preferido
        const terminal = preferredTerminal;
        
        console.log(`[TERMINAL] 🎯 Usando terminal preferido: ${terminal.name}`);
        
        // Adiciona Node portátil ao PATH se disponível
        if (nodeDir && fs.existsSync(nodeDir)) {
          env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH}`;
          console.log(`[TERMINAL] 🔧 Node.js portátil adicionado ao PATH`);
        }

        // Para Windows, simplifica para cmd.exe ou powershell
        if (os.platform() === 'win32') {
          // No Windows, constrói comando específico para cada terminal
          const terminalName = terminal.name.toLowerCase();
          console.log(`[TERMINAL] 🔍 Verificando nome do terminal (lowercase): ${terminalName}`);
          
          if (terminalName === 'powershell') {
            console.log(`[TERMINAL] ✓ Detectado PowerShell`);
            command = `powershell.exe`;
          } else if (terminalName === 'git bash') {
            console.log(`[TERMINAL] ✓ Detectado Git Bash`);
            command = `bash.exe`;
          } else if (terminalName === 'windows terminal') {
            console.log(`[TERMINAL] ✓ Detectado Windows Terminal`);
            command = `wt.exe`;
          } else if (terminalName.includes('wsl')) {
            console.log(`[TERMINAL] ✓ Detectado WSL`);
            command = `wsl.exe`;
          } else {
            // Padrão: CMD
            console.log(`[TERMINAL] ✓ Usando CMD como padrão`);
            command = 'cmd.exe';
          }
        } else {
          // Linux/Mac: constrói comandos específicos
          if (terminal.name === 'Terminal' || terminal.name === 'iTerm2') {
            command = `open -a "${terminal.name}" "${projectPath}"`;
          } else if (terminal.name === 'GNOME Terminal') {
            command = `gnome-terminal --working-directory="${projectPath}"`;
          } else if (terminal.name === 'Konsole') {
            command = `konsole --workdir "${projectPath}"`;
          } else if (terminal.name === 'xfce4-terminal') {
            command = `xfce4-terminal --working-directory="${projectPath}"`;
          } else if (terminal.name === 'Xterm') {
            command = `xterm -e "cd '${projectPath}' && bash"`;
          } else {
            // Fallback para terminal genérico
            command = `gnome-terminal --working-directory="${projectPath}"`;
          }
        }
      } else {
        // Usa terminal padrão do sistema
        console.log(`[TERMINAL] ⚙️ Usando terminal padrão do sistema`);
        
        // Adiciona Node portátil ao PATH se disponível
        if (nodeDir && fs.existsSync(nodeDir)) {
          env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH}`;
        }

        if (os.platform() === 'win32') {
          // Windows: cmd como padrão
          command = 'cmd.exe';
        } else if (os.platform() === 'darwin') {
          // macOS: Terminal padrão
          command = `open -a Terminal "${projectPath}"`;
        } else {
          // Linux: GNOME Terminal ou fallback
          command = `gnome-terminal --working-directory="${projectPath}"`;
        }
      }

      console.log(`[TERMINAL] 📋 Comando: ${command}`);
      console.log(`[TERMINAL] 📁 Caminho do projeto: ${projectPath}`);
      
      // Executa o comando com o ambiente customizado
      const { exec, spawn } = require('child_process');
      
      try {
        if (os.platform() === 'win32') {
          // Windows: construir comando correto para cada tipo
          console.log(`[TERMINAL] 🪟 Executando no Windows com start`);
          
          let startCmd;
          const terminalName = preferredTerminal ? preferredTerminal.name.toLowerCase() : '';
          
          if (terminalName === 'powershell') {
            // PowerShell
            console.log(`[TERMINAL] 📟 Abrindo PowerShell na pasta: ${projectPath}`);
            startCmd = `start powershell -NoExit -Command "cd '${projectPath}'"`;
          } else if (terminalName === 'git bash') {
            // Git Bash - precisa de tratamento especial
            console.log(`[TERMINAL] 📟 Abrindo Git Bash na pasta: ${projectPath}`);
            const bashPath = 'bash.exe';
            // Usa spawn para Git Bash com as variáveis corretas
            spawn(bashPath, ['--login', '-i'], {
              cwd: projectPath,
              env: { ...env, CHERE_INVOKING: '1' },
              detached: true,
              stdio: 'ignore'
            }).unref();
            
            console.log(`[TERMINAL] ✅ Terminal aberto com sucesso em: ${projectPath}`);
            return;
          } else if (terminalName === 'windows terminal') {
            // Windows Terminal
            console.log(`[TERMINAL] 📟 Abrindo Windows Terminal na pasta: ${projectPath}`);
            startCmd = `start wt -d "${projectPath}"`;
          } else if (terminalName.includes('wsl')) {
            // WSL
            console.log(`[TERMINAL] 📟 Abrindo WSL na pasta: ${projectPath}`);
            startCmd = `start wsl.exe`;
          } else {
            // CMD (padrão)
            console.log(`[TERMINAL] 📟 Abrindo CMD na pasta: ${projectPath}`);
            startCmd = `start cmd /k "cd /d ${projectPath}"`;
          }
          
          console.log(`[TERMINAL] 📝 Comando executado: ${startCmd}`);
          exec(startCmd, { env });
        } else {
          // Linux/Mac: usa comando direto
          console.log(`[TERMINAL] 🐧 Executando no ${os.platform() === 'darwin' ? 'macOS' : 'Linux'}`);
          exec(command, { env });
        }
      } catch (execError) {
        console.error(`[TERMINAL] ❌ Erro ao executar comando:`, execError);
      }

      console.log(`[TERMINAL] ✅ Terminal aberto com sucesso em: ${projectPath}`);
      
    } catch (error) {
      console.error(`[TERMINAL] ❌ Erro ao abrir terminal:`, error);
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

  // Handler para abrir URL externa (onboarding)
  ipcMain.on('open-external', (event, url) => {
    console.log(`🌐 Abrindo URL externa: ${url}`);
    const { shell } = require('electron');
    shell.openExternal(url).catch(error => {
      console.error('Erro ao abrir URL externa:', error);
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

  // Função auxiliar para abrir arquivo com editor preferido
  async function openFileWithEditor(filePath, callback) {
    console.log(`📝 Abrindo arquivo: ${filePath}`);
    
    try {
      const config = loadConfig();
      const preferredIDE = config.preferredIDE || 'vscode';
      const ideConfig = IDE_CONFIG[preferredIDE];
      
      if (!ideConfig) {
        console.error(`❌ IDE não suportada: ${preferredIDE}`);
        // Fallback para VS Code
        await tryFallbackEditor(filePath, callback);
        return;
      }
      
      // Obtém o comando baseado no sistema operacional
      const platform = os.platform();
      let command = ideConfig.commands[platform];
      
      if (!command) {
        console.error(`❌ Comando não disponível para ${ideConfig.name} no ${platform}`);
        await tryFallbackEditor(filePath, callback);
        return;
      }
      
      // Substitui o placeholder {path} pelo caminho do arquivo
      command = command.replace('{path}', filePath);
      
      console.log(`💻 Tentando abrir arquivo com ${ideConfig.name}: ${command}`);
      
      // Função para tentar comandos múltiplos (separados por ||)
      const tryMultipleCommands = (commandString) => {
        return new Promise((resolve, reject) => {
          const commands = commandString.split(' || ').map(cmd => cmd.trim());
          let currentIndex = 0;
          
          const tryNext = () => {
            if (currentIndex >= commands.length) {
              reject(new Error('Todos os comandos falharam'));
              return;
            }
            
            const currentCommand = commands[currentIndex];
            console.log(`� Tentando comando ${currentIndex + 1}/${commands.length}: ${currentCommand}`);
            
            exec(currentCommand, (error, stdout, stderr) => {
              if (error) {
                console.log(`❌ Comando ${currentIndex + 1} falhou: ${error.message}`);
                currentIndex++;
                tryNext();
              } else {
                console.log(`✅ Arquivo aberto com sucesso usando ${ideConfig.name}`);
                resolve();
              }
            });
          };
          
          tryNext();
        });
      };
      
      // Primeiro tenta o comando principal
      try {
        await tryMultipleCommands(command);
        if (callback) callback(true);
      } catch (mainError) {
        console.log(`${ideConfig.name} não encontrado no PATH, buscando na máquina...`);
        
        // Procura a IDE dinamicamente na máquina
        const foundExecutable = await findIDEExecutable(ideConfig, platform);
        
        if (foundExecutable) {
          // Executa com o caminho encontrado
          const foundCommand = `"${foundExecutable}" "${filePath}"`;
          console.log(`💻 Executando com caminho encontrado: ${foundCommand}`);
          
          exec(foundCommand, (foundError) => {
            if (foundError) {
              console.log(`❌ Erro ao executar IDE encontrada: ${foundError.message}`);
              tryFallbackEditor(filePath, callback);
            } else {
              console.log(`✅ Arquivo aberto com ${ideConfig.name}!`);
              if (callback) callback(true);
            }
          });
        } else {
          console.log(`${ideConfig.name} não encontrado, usando fallback...`);
          await tryFallbackEditor(filePath, callback);
        }
      }
      
    } catch (error) {
      console.error(`❌ Erro ao abrir arquivo:`, error);
      await tryFallbackEditor(filePath, callback);
    }
  }

  // Função de fallback para abrir arquivo
  async function tryFallbackEditor(filePath, callback) {
    console.log('💾 Tentando abrir com editor padrão do sistema...');
    
    try {
      const { shell } = require('electron');
      const result = await shell.openPath(filePath);
      
      if (result) {
        console.error(`❌ Erro ao abrir arquivo com editor padrão: ${result}`);
        if (callback) callback(false);
      } else {
        console.log(`✅ Arquivo aberto com editor padrão do sistema: ${filePath}`);
        if (callback) callback(true);
      }
    } catch (shellError) {
      console.error(`❌ Erro ao abrir arquivo:`, shellError);
      if (callback) callback(false);
    }
  }

  // Handler para abrir projeto no editor de código
  ipcMain.on('open-project-in-editor', async (event, { projectPath, projectIndex, isPamp }) => {
    console.log(`💻 Abrindo projeto no editor: ${projectPath}`);
    
    try {
      // Verifica se o diretório existe
      if (!fs.existsSync(projectPath)) {
        console.error(`❌ Diretório não encontrado: ${projectPath}`);
        dialog.showErrorBox('Diretório não encontrado', 
          `O diretório do projeto não foi encontrado:\n${projectPath}\n\nVerifique se o caminho está correto.`);
        return;
      }
      
      // Carrega a configuração atual para obter a IDE preferida
      const config = loadConfig();
      const preferredIDE = config.preferredIDE || 'vscode';
      const ideConfig = IDE_CONFIG[preferredIDE];
      
      if (!ideConfig) {
        console.error(`❌ IDE não suportada: ${preferredIDE}`);
        dialog.showErrorBox('IDE não suportada', 
          `A IDE "${preferredIDE}" não é suportada.\nReverta para VS Code nas configurações.`);
        return;
      }
      
      // Obtém o comando baseado no sistema operacional
      const platform = os.platform();
      let command = ideConfig.commands[platform];
      
      if (!command) {
        console.error(`❌ Comando não disponível para ${ideConfig.name} no ${platform}`);
        dialog.showErrorBox('Comando não disponível', 
          `${ideConfig.name} não possui comando configurado para ${platform}.\nTente usar outra IDE.`);
        return;
      }
      
      // Substitui o placeholder {path} pelo caminho real
      command = command.replace('{path}', projectPath);
      
      console.log(`💻 Executando comando ${ideConfig.name}: ${command}`);
      
      // Função para tentar comandos múltiplos (separados por ||)
      const tryMultipleCommands = (commandString) => {
        return new Promise((resolve, reject) => {
          const commands = commandString.split(' || ').map(cmd => cmd.trim());
          let currentIndex = 0;
          
          const tryNext = () => {
            if (currentIndex >= commands.length) {
              reject(new Error('Todos os comandos falharam'));
              return;
            }
            
            const currentCommand = commands[currentIndex];
            console.log(`💻 Tentando comando ${currentIndex + 1}/${commands.length}: ${currentCommand}`);
            
            exec(currentCommand, (error, stdout, stderr) => {
              if (error) {
                console.log(`❌ Comando ${currentIndex + 1} falhou: ${error.message}`);
                currentIndex++;
                tryNext();
              } else {
                console.log(`✅ ${ideConfig.name} aberto com sucesso via comando ${currentIndex + 1}`);
                resolve();
              }
            });
          };
          
          tryNext();
        });
      };
      
      // Primeiro tenta o comando principal (pode ter múltiplos comandos com ||)
      try {
        await tryMultipleCommands(command);
      } catch (mainError) {
        console.log(`${ideConfig.name} não encontrado no PATH, buscando na máquina...`);
        
        // Procura a IDE dinamicamente na máquina
        const foundExecutable = await findIDEExecutable(ideConfig, os.platform());
        
        if (foundExecutable) {
          // Executa com o caminho encontrado
          const foundCommand = `"${foundExecutable}" "${projectPath}"`;
          console.log(`💻 Executando com caminho encontrado: ${foundCommand}`);
          
          exec(foundCommand, (foundError) => {
            if (foundError) {
              console.log(`❌ Erro ao executar IDE encontrada: ${foundError.message}`);
              openInExplorer();
            } else {
              console.log(`✅ ${ideConfig.name} aberto com sucesso!`);
            }
          });
        } else {
          console.log(`${ideConfig.name} não encontrado na máquina, abrindo no explorador...`);
          openInExplorer();
        }
      }

      // Função helper para abrir no explorador
      function openInExplorer() {
        let finalFallbackCommand;
        if (os.platform() === 'win32') {
          finalFallbackCommand = `start "" "${projectPath}"`;
        } else if (os.platform() === 'darwin') {
          finalFallbackCommand = `open "${projectPath}"`;
        } else {
          finalFallbackCommand = `xdg-open "${projectPath}"`;
        }
        
        console.log(`💻 Abrindo no explorador: ${finalFallbackCommand}`);
        
        exec(finalFallbackCommand, (finalError) => {
          if (finalError) {
            console.error(`❌ Erro ao abrir: ${finalError.message}`);
            dialog.showErrorBox('Erro ao abrir', 
              `Não foi possível abrir o projeto.\n\nVerifique se ${ideConfig.name} está instalado.\n\nCaminho: ${projectPath}`);
          } else {
            console.log(`✅ Pasta aberta no explorador: ${projectPath}`);
          }
        });
      }
      
    } catch (error) {
      console.error(`❌ Erro ao abrir projeto no editor:`, error);
      dialog.showErrorBox('Erro', `Erro inesperado ao tentar abrir o projeto:\n${error.message}`);
    }
  });

  // ===== HANDLERS PARA CONFIGURAÇÃO DE IDE =====
  // Handler para obter lista de IDEs disponíveis
  ipcMain.on('get-available-ides', (event) => {
    const ides = Object.keys(IDE_CONFIG).map(key => ({
      id: key,
      name: IDE_CONFIG[key].name,
      icon: IDE_CONFIG[key].icon
    }));
    
    event.reply('available-ides', ides);
  });

  // Handler para obter IDE atual
  ipcMain.on('get-current-ide', (event) => {
    const config = loadConfig();
    const preferredIDE = config.preferredIDE || 'vscode';
    
    event.reply('current-ide', {
      id: preferredIDE,
      name: IDE_CONFIG[preferredIDE]?.name || 'Visual Studio Code',
      icon: IDE_CONFIG[preferredIDE]?.icon || 'editor.png'
    });
  });

  // Handler para alterar IDE preferida
  ipcMain.on('set-preferred-ide', (event, { ideId }) => {
    console.log(`🔧 Alterando IDE preferida para: ${ideId}`);
    
    if (!IDE_CONFIG[ideId]) {
      console.error(`❌ IDE não suportada: ${ideId}`);
      event.reply('ide-change-error', { error: 'IDE não suportada' });
      return;
    }
    
    try {
      const config = loadConfig();
      config.preferredIDE = ideId;
      saveConfig(config);
      
      console.log(`✅ IDE alterada para: ${IDE_CONFIG[ideId].name}`);
      
      // Notifica a janela que fez a solicitação
      event.reply('ide-changed', {
        id: ideId,
        name: IDE_CONFIG[ideId].name,
        icon: IDE_CONFIG[ideId].icon
      });

      // Notifica TODAS as janelas sobre a mudança
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach(window => {
        if (window.webContents !== event.sender) {
          window.webContents.send('ide-changed', {
            id: ideId,
            name: IDE_CONFIG[ideId].name,
            icon: IDE_CONFIG[ideId].icon
          });
        }
      });
      
    } catch (error) {
      console.error(`❌ Erro ao salvar configuração de IDE:`, error);
      event.reply('ide-change-error', { error: error.message });
    }
  });

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

  // ============================================================================
  // ⚠️ HANDLER ANTIGO 'start-installation' REMOVIDO
  // ============================================================================
  // Este handler foi descontinuado pois tentava instalar Node.js globalmente
  // no sistema do usuário, o que não está alinhado com o sistema portátil.
  //
  // SISTEMA ATUAL: Use 'start-node-installation' que utiliza o NodeInstaller
  // para gerenciar Node.js portátil instalado localmente na pasta do executável.
  //
  // O código antigo foi removido nas linhas 5742-6438 (cerca de 700 linhas).
  // Commit anterior: [feature/0.0.9] caso precise recuperar o código.
  // ============================================================================

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

  // 🔍 SISTEMA DE NODE.JS PORTÁTIL
  // Com Node.js portátil, não precisamos verificar CLI global em background
  // A verificação é feita por projeto usando o Node configurado
  setTimeout(() => {
    console.log('✅ [PORTABLE] Sistema usando Node.js portátil - CLI gerenciado localmente');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('angular-info', { 
        version: 'Portátil (por projeto)', 
        warning: null,
        portable: true
      });
      console.log('📡 [PORTABLE] Interface notificada sobre sistema portátil');
    }
  }, 2000);
}

// Evento principal do aplicativo
// ⚡ INICIALIZAÇÃO OTIMIZADA ⚡
app.on('ready', async () => {
  // Carrega handlers IPC após Electron estar pronto
  console.log('[MAIN] Carregando handlers IPC...');
  require('./ipc-handlers');
  console.log('[MAIN] ✅ Handlers IPC carregados!');
  
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
  splashManager = new SplashManager();
  splashManager.createSplashWindow();
  
  // Aguarda 3 segundos antes de iniciar a aplicação principal
  setTimeout(initializeMainApp, 3000);

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
  // Limpa recursos do onboarding manager
  try {
    const { onboardingManager } = require('./ipc-handlers');
    if (onboardingManager) {
      onboardingManager.cleanup();
      console.log('[ONBOARDING] ✅ Recursos limpos');
    }
  } catch (error) {
    console.log('[ONBOARDING] ⚠️ Erro na limpeza:', error.message);
  }
  
  // Salva cache antes de fechar se o SplashManager existir
  if (splashManager) {
    splashManager.saveAppCache();
  }
  
  // Limpa cache antigo (mais de 24 horas)
  try {
    const cacheFile = path.join(app.getPath('userData'), 'app-cache.json');
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
  if (BrowserWindow.getAllWindows().length === 0) {
    if (!splashManager) {
      splashManager = new SplashManager();
    }
    splashManager.createSplashWindow();
    setTimeout(initializeMainApp, 3000);
  }
});

// ⚡ SISTEMA DE CACHE AUTOMÁTICO ⚡
// Atualiza cache periodicamente a cada 2 minutos quando a app estiver rodando
setInterval(() => {
  if (mainWindow && !mainWindow.isDestroyed() && splashManager) {
    splashManager.preloadCriticalData().catch(console.error);
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

