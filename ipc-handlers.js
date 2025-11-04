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
const onboardingManager = new OnboardingManager();

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
    console.log(`[ONBOARDING] 📡 Clonando projeto ${projectName} para ${targetPath}...`);
    try {
      const result = await onboardingManager.cloneProject(
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
      return { success: true, result };
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

  // Iniciar projeto onboarding
  ipcMain.handle('start-onboarding-project', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Iniciando projeto ${projectName}...`);
    try {
      const result = await onboardingManager.startProject(
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
      return { success: true, result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao iniciar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  // Parar projeto onboarding
  ipcMain.handle('stop-onboarding-project', async (event, { projectName }) => {
    console.log(`[ONBOARDING] 📡 Parando projeto ${projectName}...`);
    try {
      const result = onboardingManager.stopProject(projectName);
      
      // Enviar evento de projeto parado
      event.sender.send('onboarding-stopped', { projectName });
      
      console.log('[ONBOARDING] ✅ Projeto parado com sucesso');
      return { success: true, stopped: result };
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao parar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  // Cancelar projeto onboarding (igual ao PAS)
  ipcMain.on('cancel-onboarding-project', (event, { projectName, index }) => {
    console.log(`[ONBOARDING] 🛑 Cancelando projeto ${projectName} (índice: ${index})`);
    
    try {
      // Para o projeto se estiver rodando
      const result = onboardingManager.stopProject(projectName);
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

  console.log('[IPC-HANDLERS] ✅ Handlers Onboarding registrados com sucesso!');
} catch (err) {
  console.error('[IPC-HANDLERS] ❌ Erro ao registrar handlers Onboarding:', err);
}

console.log('[IPC-HANDLERS] ✅ Handlers registrados com sucesso!');

module.exports = {
  // Exporta para verificação
  handlersLoaded: true,
  onboardingManager
};
