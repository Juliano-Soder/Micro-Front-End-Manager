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

console.log('[IPC-HANDLERS] ✅ Handlers registrados com sucesso!');

module.exports = {
  // Exporta para verificação
  handlersLoaded: true
};
