const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

console.log('[IPC-HANDLERS] =============== INICIANDO CARREGAMENTO ===============');
console.log('[IPC-HANDLERS] ipcMain type:', typeof ipcMain);
console.log('[IPC-HANDLERS] ipcMain.handle type:', typeof ipcMain.handle);

// Verifica se ipcMain.handle está disponível
if (typeof ipcMain.handle !== 'function') {
  console.error('[IPC-HANDLERS] ❌ ERRO: ipcMain.handle NÃO É UMA FUNÇÃO!');
}

console.log('[IPC-HANDLERS] Carregando handlers de IPC...');

// TESTE: Handler para ping de IPC
try {
  ipcMain.handle('test-ipc-ping', (event, data) => {
    console.log(`[TEST-IPC] 📡 Ping recebido do renderer:`, data);
    console.log(`[TEST-IPC] ✅ IPC channel FUNCIONA!`);
    return { response: 'pong', serverTime: Date.now() };
  });
  console.log('[IPC-HANDLERS] ✅ Handler test-ipc-ping registrado');
} catch (err) {
  console.error('[IPC-HANDLERS] ❌ Erro ao registrar test-ipc-ping:', err);
}

// Instala CLI customizada
try {
  ipcMain.handle('install-custom-cli', async (event, { nodeVersion, nodeUrl, angularCmd }) => {
  console.log(`[CUSTOM-CLI] ==================== INICIANDO INSTALAÇÃO ====================`);
  console.log(`[CUSTOM-CLI] 📍 Handler disparado!`);
  console.log(`[CUSTOM-CLI] Node.js: ${nodeVersion}`);
  console.log(`[CUSTOM-CLI] URL: ${nodeUrl}`);
  console.log(`[CUSTOM-CLI] Angular: ${angularCmd}`);
  
  try {
    console.log(`[CUSTOM-CLI] ✅ Try block iniciado`);
    
    // Validar se já existe
    const nodeVersionConfig = require('./node-version-config');
    const nodesBasePath = nodeVersionConfig.getNodesBasePath();
    const nodeDir = path.join(nodesBasePath, 'windows', `node-v${nodeVersion}`);
    
    console.log(`[CUSTOM-CLI] Verificando se versão já existe em: ${nodeDir}`);
    
    if (fs.existsSync(nodeDir)) {
      console.log(`[CUSTOM-CLI] ❌ Versão já existe!`);
      return {
        success: false,
        message: `Node.js ${nodeVersion} já está instalado!`
      };
    }

    // Usar NodeInstaller para download e instalação
    const NodeInstallerClass = require('./node-installer');
    const installer = new NodeInstallerClass();
    
    console.log(`[CUSTOM-CLI] ✅ NodeInstaller instanciado`);
    
    // Define callback para logs que envia direto para a janela das CLIs
    installer.onLog = (message, isError = false) => {
      console.log(`[CUSTOM-CLI] ${isError ? '❌' : '✅'} ${message}`);
      if (event && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('custom-cli-log', { message, isError });
      }
    };
    
    // Define callback para progresso que envia direto para a janela das CLIs
    installer.onProgress = (percent, status) => {
      console.log(`[CUSTOM-CLI] 📊 Progresso: ${percent}% - ${status}`);
      if (event && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('custom-cli-progress', { percent, status });
      }
    };
    
    // Adicionar temporariamente a nova versão à configuração
    const customVersion = {
      version: nodeVersion,
      url: nodeUrl,
      angularCli: angularCmd.replace('npm install ', '')
    };

    console.log(`[CUSTOM-CLI] 📦 Iniciando download e instalação...`);
    
    // Chamar instalação personalizada
    await installer.installCustomVersion(customVersion);
    
    console.log(`[CUSTOM-CLI] ✅ Instalação concluída com sucesso!`);
    
    // 🔔 NOTIFICA TODAS AS JANELAS ABERTAS PARA ATUALIZAR LISTA DE VERSÕES DISPONÍVEIS
    try {
      const { BrowserWindow } = require('electron');
      const allWindows = BrowserWindow.getAllWindows();
      console.log(`[CUSTOM-CLI] 📢 Notificando ${allWindows.length} janela(s) para atualizar lista de nodes...`);
      
      allWindows.forEach((window, index) => {
        if (window && !window.isDestroyed()) {
          console.log(`[CUSTOM-CLI] 📤 Enviando notificação para janela ${index + 1}...`);
          window.webContents.send('node-versions-updated', {
            newVersion: nodeVersion,
            message: 'Nova versão do Node.js instalada com sucesso!'
          });
        }
      });
    } catch (notifyError) {
      console.error(`[CUSTOM-CLI] ⚠️ Erro ao notificar janelas:`, notifyError);
    }
    
    return {
      success: true,
      message: `Node.js ${nodeVersion} e Angular CLI instalados com sucesso!`
    };

  } catch (error) {
    console.error('[CUSTOM-CLI] ❌ Erro na instalação:', error);
    console.error('[CUSTOM-CLI] Stack:', error.stack);
    return {
      success: false,
      message: `Erro na instalação: ${error.message}`
    };
  } finally {
    console.log(`[CUSTOM-CLI] ==================== INSTALAÇÃO FINALIZADA ====================`);
  }
  });
  console.log('[IPC-HANDLERS] ✅ Handler install-custom-cli registrado');
} catch (err) {
  console.error('[IPC-HANDLERS] ❌ Erro ao registrar install-custom-cli:', err);
}

// ===== HANDLERS ONBOARDING =====
const OnboardingManager = require('./onboarding-manager');

// Reutiliza a instância global criada no main.js, ou cria uma nova se não existir
const onboardingManager = global.onboardingManager || new OnboardingManager();

// Garante que está disponível globalmente
if (!global.onboardingManager) {
  global.onboardingManager = onboardingManager;
  console.log('[IPC-HANDLERS] OnboardingManager criado e exposto globalmente');
} else {
  console.log('[IPC-HANDLERS] Reutilizando OnboardingManager global existente');
}

try {
  // Carregar projetos onboarding
  ipcMain.handle('load-onboarding-projects', async (event) => {
    console.log('[ONBOARDING] 📡 Carregando projetos onboarding...');
    try {
      const projects = onboardingManager.getProjectsStatus();
      console.log('[ONBOARDING] ✅ Projetos carregados:', projects.length);
      return { success: true, projects };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao carregar projetos:', error);
      return { success: false, error: error.message };
    }
  });

  // Clonar projeto onboarding
  ipcMain.handle('clone-onboarding-project', async (event, { projectName, targetPath }) => {
    console.log(`[ONBOARDING] 📡 Clonando projeto ${projectName}...`);
    
    try {
      // Se targetPath não foi fornecido, abre diálogo para usuário escolher
      if (!targetPath) {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: `Selecione onde clonar ${projectName}`,
          buttonLabel: 'Selecionar Pasta'
        });
        
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, error: 'Operação cancelada pelo usuário' };
        }
        
        targetPath = result.filePaths[0];
        console.log(`[ONBOARDING] 📁 Pasta selecionada: ${targetPath}`);
      }
      
      const cloneResult = await onboardingManager.cloneProject(
        projectName,
        targetPath,
        (progress) => {
          event.sender.send('onboarding-clone-progress', { projectName, progress });
        },
        (error) => {
          event.sender.send('onboarding-clone-error', { projectName, error });
        }
      );
      console.log('[ONBOARDING] ✅ Projeto clonado com sucesso');
      return { success: true, projectPath: cloneResult };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao clonar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  // Instalar dependências
  ipcMain.handle('install-onboarding-dependencies', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Instalando dependências do projeto ${projectName}...`);
    try {
      const result = await onboardingManager.installDependencies(
        projectName,
        (progress) => {
          event.sender.send('onboarding-install-progress', { projectName, progress });
        },
        (error) => {
          event.sender.send('onboarding-install-error', { projectName, error });
        }
      );
      console.log('[ONBOARDING] ✅ Dependências instaladas com sucesso');
      return { success: true, result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao instalar dependências:', error);
      return { success: false, error: error.message };
    }
  });

  // Maven Install (mvn clean install -DskipTests)
  ipcMain.handle('maven-install-onboarding', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 🔨 Executando Maven Install para ${projectName}...`);
    try {
      const result = await onboardingManager.mavenInstall(
        projectName,
        (message) => {
          event.sender.send('maven-install-progress', { projectName, message });
        },
        (error) => {
          event.sender.send('maven-install-error', { projectName, error });
        }
      );
      console.log('[ONBOARDING] ✅ Maven Install concluído');
      return { success: true, result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro no Maven Install:', error);
      return { success: false, error: error.message };
    }
  });

  // Run Maven Tests (mvn test)
  ipcMain.handle('run-onboarding-tests', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 🧪 Executando Maven Tests para ${projectName}...`);
    try {
      const result = await onboardingManager.runTests(
        projectName,
        (message) => {
          event.sender.send('maven-test-progress', { projectName, message });
        },
        (error) => {
          event.sender.send('maven-test-error', { projectName, error });
        }
      );
      console.log('[ONBOARDING] ✅ Maven Tests concluídos');
      return { success: true, result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro nos Maven Tests:', error);
      return { success: false, error: error.message };
    }
  });

  // Iniciar projeto onboarding
  ipcMain.handle('start-onboarding-project', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Iniciando projeto ${projectName}...`);
    try {
      await onboardingManager.startProject(
        projectName,
        (output) => {
          event.sender.send('onboarding-output', { projectName, output });
        },
        (error) => {
          event.sender.send('onboarding-error', { projectName, error });
        },
        () => {
          event.sender.send('onboarding-started', { projectName });
        }
      );
      console.log('[ONBOARDING] ✅ Projeto iniciado com sucesso');
      return { success: true };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao iniciar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  // Parar projeto onboarding (mata por porta também, igual ao PAS)
  ipcMain.handle('stop-onboarding-project', async (event, { projectName, port }) => {
    console.log(`[ONBOARDING] 📡 Parando projeto ${projectName} (porta: ${port})...`);
    try {
      const project = onboardingManager.onboardingProjects.find(p => p.name === projectName);
      const projectPort = port || (project ? project.port : null);
      
      // Para o projeto e mata por porta também
      const result = await onboardingManager.stopProject(projectName, projectPort);
      
      // Se ainda há processo rodando na porta, tenta matar
      if (projectPort) {
        await onboardingManager.killProcessByPort(projectPort);
      }
      
      // Enviar evento de projeto parado
      event.sender.send('onboarding-stopped', { projectName });
      
      console.log('[ONBOARDING] ✅ Projeto parado com sucesso');
      return { success: true, stopped: result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao parar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  // Cancelar projeto onboarding (mata durante startup, igual ao PAS)
  ipcMain.on('cancel-onboarding-project', async (event, { projectName, index, port }) => {
    console.log(`[ONBOARDING] 🛑 Cancelando projeto ${projectName} (índice: ${index}, porta: ${port})`);
    
    try {
      const project = onboardingManager.onboardingProjects.find(p => p.name === projectName);
      const projectPort = port || (project ? project.port : null);
      
      // Cancela o projeto (mata processo)
      const result = await onboardingManager.cancelProject(projectName, projectPort);
      console.log(`[ONBOARDING] ✅ Processo cancelado para ${projectName}`);
      
      // Envia confirmação de cancelamento para o frontend
      event.reply('onboarding-canceled', { 
        projectName, 
        index,
        message: `🛑 Projeto ${projectName} cancelado com sucesso!` 
      });
      
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao cancelar projeto ${projectName}:`, error);
      event.reply('onboarding-canceled', { 
        projectName, 
        index,
        message: `❌ Erro ao cancelar projeto: ${error.message}` 
      });
    }
  });

  // Definir caminho do projeto
  ipcMain.handle('set-onboarding-project-path', async (event, { projectName, projectPath }) => {
    console.log(`[ONBOARDING] 📡 Definindo caminho do projeto ${projectName}: ${projectPath}`);
    try {
      onboardingManager.setProjectPath(projectName, projectPath);
      console.log('[ONBOARDING] ✅ Caminho definido com sucesso');
      return { success: true };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao definir caminho:', error);
      return { success: false, error: error.message };
    }
  });

  // Obter caminho do projeto
  ipcMain.handle('get-onboarding-project-path', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Obtendo caminho do projeto ${projectName}...`);
    try {
      const projectPath = onboardingManager.getProjectPath(projectName);
      console.log(`[ONBOARDING] ✅ Caminho obtido: ${projectPath || 'não definido'}`);
      return { 
        success: true, 
        projectPath: projectPath,
        hasPath: !!projectPath
      };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao obter caminho:', error);
      return { success: false, error: error.message };
    }
  });

  // Obter versões disponíveis do Node.js
  ipcMain.handle('get-node-versions', async (event) => {
    console.log('[ONBOARDING] 📡 Obtendo versões disponíveis do Node.js...');
    try {
      // Lista versões baseada nas pastas disponíveis
      const nodeBasePath = path.join(__dirname, 'nodes', 'windows');
      const availableVersions = [];
      
      if (fs.existsSync(nodeBasePath)) {
        const folders = fs.readdirSync(nodeBasePath);
        folders.forEach(folder => {
          if (folder.startsWith('node-v') && folder.includes('-win-x64')) {
            const version = folder.replace('node-v', '').replace('-win-x64', '');
            availableVersions.push(version);
          }
        });
      }
      
      // Fallback para versões padrão se nenhuma for encontrada
      if (availableVersions.length === 0) {
        availableVersions.push('16.10.0', '18.18.2', '20.19.5');
      }
      
      console.log(`[ONBOARDING] ✅ Versões encontradas:`, availableVersions);
      return availableVersions;
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao obter versões do Node.js:', error);
      return ['16.10.0', '18.18.2', '20.19.5']; // Fallback
    }
  });

  // Configurar versão do Node.js para projeto onboarding
  ipcMain.handle('set-onboarding-node-version', async (event, { projectName, nodeVersion }) => {
    console.log(`[ONBOARDING] 🔧 Configurando Node.js v${nodeVersion} para ${projectName}...`);
    try {
      const result = onboardingManager.setNodeVersion(projectName, nodeVersion);
      console.log(`[ONBOARDING] ✅ Node.js v${nodeVersion} configurado para ${projectName}`);
      return result;
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao configurar Node.js para ${projectName}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Obter versão do Node.js para projeto onboarding
  ipcMain.handle('get-onboarding-node-version', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Obtendo versão Node.js para ${projectName}...`);
    try {
      const nodeVersion = onboardingManager.getNodeVersion(projectName);
      console.log(`[ONBOARDING] ✅ Node.js v${nodeVersion} para ${projectName}`);
      return { success: true, nodeVersion };
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao obter versão Node.js para ${projectName}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Obter versão do Java para projeto onboarding (busca do pom.xml no GitHub ou local)
  ipcMain.handle('get-onboarding-java-version', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Obtendo versão Java para ${projectName}...`);
    try {
      const javaVersion = await onboardingManager.getJavaVersion(projectName);
      if (javaVersion) {
        console.log(`[ONBOARDING] ✅ Java v${javaVersion} para ${projectName}`);
        return { success: true, javaVersion };
      } else {
        console.log(`[ONBOARDING] ⚠️ Versão Java não encontrada para ${projectName}`);
        return { success: true, javaVersion: null };
      }
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao obter versão Java para ${projectName}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Handler para obter projetos de Onboarding para configuração
  ipcMain.handle('get-onboarding-projects', async () => {
    try {
      console.log('[ONBOARDING] 📋 Obtendo projetos para configuração...');
      console.log('[ONBOARDING] 🔍 OnboardingManager existe?', !!onboardingManager);
      console.log('[ONBOARDING] 🔍 Tipo do onboardingManager:', typeof onboardingManager);
      
      if (!onboardingManager) {
        console.log('[ONBOARDING] ❌ OnboardingManager não existe!');
        return [];
      }
      
      // Teste direto do array
      console.log('[ONBOARDING] 🧪 Testando acesso direto ao array...');
      console.log('[ONBOARDING] 🧪 onboardingManager.onboardingProjects:', onboardingManager.onboardingProjects?.length || 'undefined');
      
      const projects = onboardingManager.getProjectsStatus();
      console.log('[ONBOARDING] 📋 Projetos encontrados:', projects?.length || 'undefined');
      
      // Log mais detalhado
      if (projects && projects.length > 0) {
        projects.forEach((project, index) => {
          console.log(`[ONBOARDING] 📦 Projeto ${index + 1}:`, {
            name: project.name,
            displayName: project.displayName,
            type: project.type,
            path: project.path,
            isInstalled: project.isInstalled,
            isRunning: project.isRunning
          });
        });
      } else {
        console.log('[ONBOARDING] ⚠️ Nenhum projeto encontrado - array vazio ou undefined');
        console.log('[ONBOARDING] ⚠️ Valor de projects:', projects);
      }
      
      return projects || [];
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao obter projetos:', error);
      return [];
    }
  });

  // Handler para obter configurações de Node.js dos projetos Onboarding
  ipcMain.handle('get-onboarding-node-configs', async () => {
    try {
      console.log('[ONBOARDING] ⚙️ Obtendo configurações Node.js...');
      const configs = onboardingManager.getNodeConfigurations();
      return configs;
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao obter configurações Node.js:', error);
      return {};
    }
  });

  // Handler para salvar configurações de Node.js dos projetos Onboarding
  ipcMain.handle('save-onboarding-node-configs', async (event, configs) => {
    try {
      console.log('[ONBOARDING] 💾 Salvando configurações Node.js:', configs);
      onboardingManager.saveNodeConfigurations(configs);
      return { success: true };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao salvar configurações Node.js:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para obter versões disponíveis do Node.js
  ipcMain.handle('get-available-node-versions', async () => {
    try {
      console.log('[ONBOARDING] 📦 Obtendo versões disponíveis do Node.js...');
      
      const { getNodesBasePath, getCurrentOS } = require('./node-version-config');
      const path = require('path');
      const fs = require('fs');
      
      const availableVersions = {};
      const nodesBasePath = getNodesBasePath();
      const currentOS = getCurrentOS();
      const osPath = path.join(nodesBasePath, currentOS);
      
      console.log(`[ONBOARDING] 🔍 Detectando versões em: ${osPath}`);
      
      // Verifica se o diretório existe
      if (!fs.existsSync(osPath)) {
        console.log('[ONBOARDING] ⚠️ Diretório de nodes não existe ainda');
        return availableVersions;
      }
      
      // Lista todos os diretórios no path do OS
      const entries = fs.readdirSync(osPath, { withFileTypes: true });
      
      entries.forEach(entry => {
        // Ignora arquivos e diretórios que não parecem ser do Node.js
        if (!entry.isDirectory() || entry.name === '.gitkeep') {
          return;
        }
        
        console.log(`[ONBOARDING] 🔍 Verificando pasta: ${entry.name}`);
        
        const folderPath = path.join(osPath, entry.name);
        
        // 🔍 PROCURA node.exe E npm.cmd (DIRETAMENTE OU EM SUBPASTAS)
        let nodeExePath = null;
        let npmPath = null;
        let actualFolderPath = folderPath;
        
        if (currentOS === 'windows') {
          // Tenta primeiro diretamente na pasta
          nodeExePath = path.join(folderPath, 'node.exe');
          npmPath = path.join(folderPath, 'npm.cmd');
          
          // Se não encontrar, procura em subpastas (para estruturas como node-v22.12.0/node-v22.12.0-win-x64/)
          if (!fs.existsSync(nodeExePath) || !fs.existsSync(npmPath)) {
            console.log(`[ONBOARDING]   ⚠️ Não encontrado diretamente, procurando em subpastas...`);
            
            try {
              const subfolders = fs.readdirSync(folderPath, { withFileTypes: true })
                .filter(item => item.isDirectory());
              
              for (const subfolder of subfolders) {
                const subfolderPath = path.join(folderPath, subfolder.name);
                const subNodeExe = path.join(subfolderPath, 'node.exe');
                const subNpmCmd = path.join(subfolderPath, 'npm.cmd');
                
                if (fs.existsSync(subNodeExe) && fs.existsSync(subNpmCmd)) {
                  nodeExePath = subNodeExe;
                  npmPath = subNpmCmd;
                  actualFolderPath = subfolderPath;
                  console.log(`[ONBOARDING] ✅ Node.js encontrado em subpasta: ${subfolder.name}`);
                  break;
                }
              }
            } catch (err) {
              console.log(`[ONBOARDING]   ❌ Erro ao ler subpastas: ${err.message}`);
            }
          }
        } else {
          // Linux/Mac: procura em bin/
          nodeExePath = path.join(folderPath, 'bin', 'node');
          npmPath = path.join(folderPath, 'bin', 'npm');
        }
        
        // Verifica se é uma instalação válida do Node.js
        const isValidNodeInstall = nodeExePath && npmPath && fs.existsSync(nodeExePath) && fs.existsSync(npmPath);
        
        if (isValidNodeInstall) {
          // Extrai a versão do nome da pasta
          const versionMatch = entry.name.match(/node-v([\d.]+)/i);
          
          if (versionMatch) {
            const version = versionMatch[1];
            
            console.log(`[ONBOARDING] ✅ Versão detectada: ${version} (pasta: ${entry.name})`);
            
            availableVersions[version] = {
              version: version,
              folderName: entry.name,
              label: `Node ${version}`,
              installed: true,
              path: actualFolderPath
            };
          }
        } else {
          console.log(`[ONBOARDING] ⚠️ Pasta ignorada (não tem node.exe/npm): ${entry.name}`);
        }
      });
      
      console.log(`[ONBOARDING] 📊 Total de versões detectadas: ${Object.keys(availableVersions).length}`);
      console.log('[ONBOARDING] 📋 Versões disponíveis:', Object.keys(availableVersions));
      
      return availableVersions;
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao obter versões Node.js:', error);
      return {};
    }
  });

  // Handler para mover projeto onboarding
  ipcMain.on('move-onboarding-project', async (event, { index, currentPath, projectName }) => {
    console.log(`[ONBOARDING] Iniciando processo de mover projeto: ${projectName} de ${currentPath}`);
    console.log(`[ONBOARDING] 🔍 Dados recebidos:`, { index, currentPath, projectName });
    console.log(`[ONBOARDING] 🔍 OnboardingManager existe?`, !!onboardingManager);
    console.log(`[ONBOARDING] 🔍 activeProcesses tipo:`, typeof onboardingManager.activeProcesses);
    
    try {
      // Verifica se o projeto está rodando
      const project = onboardingManager.onboardingProjects.find(p => p.name === projectName);
      console.log(`[ONBOARDING] 🔍 Projeto encontrado:`, !!project);
      
      if (project && onboardingManager.activeProcesses.has(projectName)) {
        console.log(`[ONBOARDING] ⚠️ Projeto está rodando, bloqueando move`);
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Erro: Não é possível mover o projeto enquanto ele estiver rodando. Pare o projeto primeiro.`, 
          success: false 
        });
        return;
      }

      console.log(`[ONBOARDING] 🔍 Projeto não está rodando, continuando...`);
      
      const { dialog } = require('electron');
      const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];

      console.log(`[ONBOARDING] 🔍 Dialog e mainWindow obtidos`);

      // Abre o dialog para selecionar a nova pasta
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: `Selecione o local para mover o projeto ${projectName}`,
        buttonLabel: 'Mover para este local'
      });

      console.log(`[ONBOARDING] 🔍 Resultado do dialog:`, result);

      if (result.canceled) {
        console.log('[ONBOARDING] Usuário cancelou a seleção da pasta');
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Operação cancelada pelo usuário.`, 
          success: false 
        });
        return;
      }

      const newBasePath = result.filePaths[0];
      const newProjectPath = path.join(newBasePath, path.basename(currentPath));
      
      console.log(`[ONBOARDING] Movendo projeto de ${currentPath} para ${newProjectPath}`);
      
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
          event.reply('move-onboarding-project-log', { 
            index, 
            message: `Operação cancelada: destino já existe.`, 
            success: false 
          });
          return;
        }

        // Se chegou aqui, usuário escolheu substituir - remove o destino existente
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Removendo projeto existente no destino...`, 
          success: false 
        });

        try {
          await removeDirectoryRecursive(newProjectPath, event, index, 'move-onboarding-project-log');
        } catch (removeError) {
          event.reply('move-onboarding-project-log', { 
            index, 
            message: `Erro ao remover destino existente: ${removeError.message}`, 
            success: false 
          });
          return;
        }
      }

      // Verifica se o caminho de origem existe
      if (!fs.existsSync(currentPath)) {
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Erro: O caminho de origem ${currentPath} não existe!`, 
          success: false 
        });
        return;
      }

      // Envia log de início
      event.reply('move-onboarding-project-log', { 
        index, 
        message: `Movendo projeto para ${newProjectPath}...`, 
        success: false 
      });

      // Usa fs nativo do Node.js para mover usando rename (mais rápido e confiável)
      try {
        await fs.promises.rename(currentPath, newProjectPath);
        
        console.log(`[ONBOARDING] Projeto movido com sucesso para: ${newProjectPath}`);
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Projeto movido com sucesso para: ${newProjectPath}`, 
          success: true 
        });

        // Atualiza o path do projeto no onboardingManager
        console.log(`[ONBOARDING] 🔍 Chamando setProjectPath com:`, { projectName, newProjectPath });
        const updateResult = onboardingManager.setProjectPath(projectName, newProjectPath);
        console.log(`[ONBOARDING] 🔍 Resultado setProjectPath:`, updateResult);
        
        console.log(`[ONBOARDING] Notificando frontend para atualizar: índice ${index}, novo path: ${newProjectPath}`);
        
        // Notifica o frontend para atualizar
        event.reply('update-onboarding-project-path', { index, path: newProjectPath });
        
        console.log(`[ONBOARDING] ✅ Move concluído com sucesso!`);
        
      } catch (renameError) {
        console.log(`[ONBOARDING] Rename falhou, tentando cópia + remoção: ${renameError.message}`);
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Rename falhou, tentando método alternativo...`, 
          success: false 
        });
        
        // Se rename falhar (provavelmente entre discos diferentes), usar cópia + remoção
        event.reply('move-onboarding-project-log', { 
          index, 
          message: `Movendo entre discos diferentes. Iniciando cópia de arquivos...`, 
          success: false 
        });
        
        try {
          await copyDirectoryRecursive(currentPath, newProjectPath, event, index, 'move-onboarding-project-log');
          
          event.reply('move-onboarding-project-log', { 
            index, 
            message: `Cópia concluída, removendo pasta original...`, 
            success: false 
          });
          
          // Remove a pasta original após cópia bem-sucedida
          await removeDirectoryRecursive(currentPath, event, index, 'move-onboarding-project-log');
          
          console.log(`[ONBOARDING] Projeto movido com sucesso para: ${newProjectPath}`);
          event.reply('move-onboarding-project-log', { 
            index, 
            message: `Projeto movido com sucesso para: ${newProjectPath}`, 
            success: true 
          });

          // Atualiza o path do projeto no onboardingManager
          console.log(`[ONBOARDING] 🔍 Chamando setProjectPath com:`, { projectName, newProjectPath });
          const updateResult = onboardingManager.setProjectPath(projectName, newProjectPath);
          console.log(`[ONBOARDING] 🔍 Resultado setProjectPath:`, updateResult);
          
          console.log(`[ONBOARDING] Notificando frontend para atualizar: índice ${index}, novo path: ${newProjectPath}`);
          
          // Notifica o frontend para atualizar
          event.reply('update-onboarding-project-path', { index, path: newProjectPath });
          
          console.log(`[ONBOARDING] ✅ Move concluído com sucesso!`);
          
        } catch (copyError) {
          throw copyError;
        }
      }

    } catch (error) {
      console.error('[ONBOARDING] Erro no processo de mover projeto:', error);
      event.reply('move-onboarding-project-log', { 
        index, 
        message: `Erro inesperado: ${error.message}`, 
        success: false 
      });
    }
  });

  // Handler para deletar projeto onboarding
  ipcMain.on('delete-onboarding-project', (event, { index, path, projectName }) => {
    console.log(`[ONBOARDING] Deletando projeto: ${projectName} no caminho: ${path}`);
    event.reply('delete-onboarding-project-log', { path, message: `Iniciando exclusão do projeto em ${path}...`, success: false, index });

    const { exec } = require('child_process');
    const os = require('os');
    const deleteCommand = os.platform() === 'win32' ? `rmdir /s /q "${path}"` : `rm -rf "${path}"`;

    exec(deleteCommand, (err, stdout, stderr) => {
      if (err) {
        console.error(`[ONBOARDING] Erro ao deletar o projeto: ${err.message}`);
        event.reply('delete-onboarding-project-log', { path, message: `Erro ao deletar o projeto: ${err.message}`, success: false, index });
        return;
      }

      console.log(`[ONBOARDING] Projeto deletado com sucesso: ${path}`);
      event.reply('delete-onboarding-project-log', { path, message: `Projeto deletado com sucesso: ${path}`, success: true, index });

      // Atualiza o path do projeto no onboardingManager (limpa o path)
      onboardingManager.setProjectPath(projectName, '');
      
      // Notifica o frontend para atualizar
      const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
      event.reply('update-onboarding-project-path', { index, path: '' });
      
      // Força um reload dos projetos onboarding para garantir sincronização
      setTimeout(() => {
        const projects = onboardingManager.getProjectsStatus();
        mainWindow.webContents.send('onboarding-projects-loaded', projects);
      }, 500);
    });
  });

  // Função auxiliar para copiar diretório recursivamente (onboarding)
  async function copyDirectoryRecursive(src, dest, event = null, index = null, logChannel = 'move-project-log') {
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
            event.reply(logChannel, { 
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

  // Função auxiliar para remover diretório recursivamente (onboarding)
  async function removeDirectoryRecursive(dirPath, event = null, index = null, logChannel = 'move-project-log') {
    const os = require('os');
    
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
      event.reply(logChannel, { 
        index, 
        message: `Removendo pasta original...`, 
        success: false 
      });
    }

    await removeRecursive(dirPath);
  }

  console.log('[IPC-HANDLERS] ✅ Handlers Onboarding registrados com sucesso!');
} catch (err) {
  console.error('[IPC-HANDLERS] ❌ Erro ao registrar handlers Onboarding:', err);
}

// ===== HANDLERS PARA SELEÇÃO DE TERMINAL =====
try {
  const TerminalDetector = require('./detect-terminals');
  let terminalDetector = null;

  // Detecta todos os terminais disponíveis
  ipcMain.handle('get-all-terminals', async (event) => {
    try {
      console.log('[TERMINALS] 🖥️ Detectando terminais disponíveis...');
      
      if (!terminalDetector) {
        terminalDetector = new TerminalDetector();
      }

      const terminals = await terminalDetector.detectAll();
      console.log('[TERMINALS] ✅ Terminais detectados:', terminals.map(t => t.name).join(', '));
      
      return terminals;
    } catch (error) {
      console.error('[TERMINALS] ❌ Erro ao detectar terminais:', error);
      return [];
    }
  });

  // Obtém o terminal preferido salvo
  ipcMain.handle('get-preferred-terminal', async (event) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      const configPath = path.join(app.getPath('userData'), 'config.json');
      
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(data);
        
        if (config.preferredTerminal) {
          console.log('[TERMINALS] 📌 Terminal preferido carregado:', config.preferredTerminal.name);
          return config.preferredTerminal;
        }
      }

      console.log('[TERMINALS] ℹ️ Nenhum terminal preferido salvo');
      return null;
    } catch (error) {
      console.error('[TERMINALS] ❌ Erro ao carregar terminal preferido:', error);
      return null;
    }
  });

  // Salva o terminal preferido
  ipcMain.handle('save-preferred-terminal', async (event, terminal) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      console.log('[TERMINALS] 📨 Recebido terminal para salvar:', terminal.name);
      
      const configPath = path.join(app.getPath('userData'), 'config.json');
      const dir = path.dirname(configPath);
      
      // Cria diretório se não existir
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Carrega config existente ou usa vazio
      let config = {};
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(data);
      }
      
      config.preferredTerminal = terminal;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      console.log('[TERMINALS] 💾 Terminal preferido salvo:', terminal.name);
      console.log('[TERMINALS] ✅ Retornando sucesso para o renderer');
      return { success: true };
    } catch (error) {
      console.error('[TERMINALS] ❌ Erro ao salvar terminal preferido:', error);
      throw error;
    }
  });

  // Event listener para fechar a janela de seleção de terminal
  ipcMain.on('close-select-terminal-window', () => {
    // Será tratado em main.js
    console.log('[TERMINALS] 🔔 Fechando janela de seleção de terminal');
  });

  // Handlers para retornar dados dos terminais (para o configs modal)
  ipcMain.on('get-all-terminals', async (event) => {
    try {
      console.log('[TERMINALS] 📨 Solicitação para obter todos os terminais (via send)');
      
      if (!terminalDetector) {
        terminalDetector = new TerminalDetector();
      }

      const terminals = await terminalDetector.detectAll();
      console.log('[TERMINALS] ✅ Enviando terminais:', terminals.map(t => t.name).join(', '));
      event.reply('available-terminals', terminals);
    } catch (error) {
      console.error('[TERMINALS] ❌ Erro ao detectar terminais:', error);
      event.reply('available-terminals', []);
    }
  });

  ipcMain.on('get-preferred-terminal', (event) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      console.log('[TERMINALS] 📨 Solicitação para obter terminal preferido (via send)');
      const configPath = path.join(app.getPath('userData'), 'config.json');
      
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(data);
        
        if (config.preferredTerminal) {
          console.log('[TERMINALS] 📌 Enviando terminal preferido:', config.preferredTerminal.name);
          event.reply('current-terminal', config.preferredTerminal);
          return;
        }
      }

      console.log('[TERMINALS] ℹ️ Nenhum terminal preferido salvo, enviando null');
      event.reply('current-terminal', null);
    } catch (error) {
      console.error('[TERMINALS] ❌ Erro ao carregar terminal preferido:', error);
      event.reply('current-terminal', null);
    }
  });

  // Obtém o estado do modo escuro
  ipcMain.handle('get-dark-mode-state', async (event) => {
    try {
      const { loadConfig } = require('./project-config-manager');
      // Tenta primeiro do config.json do projeto
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const configPath = path.join(app.getPath('userData'), 'config.json');
        
        if (fs.existsSync(configPath)) {
          const data = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(data);
          return config.darkMode || false;
        }
      } catch (e) {
        // Fallback
      }
      
      return false;
    } catch (error) {
      console.error('[DARK-MODE] ❌ Erro ao obter estado de dark mode:', error);
      return false;
    }
  });

  console.log('[IPC-HANDLERS] ✅ Handlers de Terminal registrados com sucesso!');
} catch (err) {
  console.error('[IPC-HANDLERS] ❌ Erro ao registrar handlers de Terminal:', err);
}

console.log('[IPC-HANDLERS] ✅ Handlers registrados com sucesso!');

module.exports = {
  // Exporta para verificação
  handlersLoaded: true,
  onboardingManager
};
