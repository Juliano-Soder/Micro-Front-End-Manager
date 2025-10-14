const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const { 
  NODE_VERSIONS, 
  getNodesBasePath, 
  getCurrentOS,
  getNodeExecutablePath 
} = require('./node-version-config');

class NodeInstaller {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentOS = getCurrentOS();
    this.nodesBasePath = getNodesBasePath();
    this.isInstalling = false;
  }

  /**
   * Verifica se as dependências do Node.js estão instaladas
   */
  checkDependenciesInstalled() {
    try {
      const osPath = path.join(this.nodesBasePath, this.currentOS);
      
      console.log('[DEPENDENCY CHECK] Base path:', this.nodesBasePath);
      console.log('[DEPENDENCY CHECK] OS path:', osPath);
      console.log('[DEPENDENCY CHECK] OS path exists?', fs.existsSync(osPath));
      
      // Verifica se o diretório existe e não está vazio
      if (!fs.existsSync(osPath)) {
        console.log('[DEPENDENCY CHECK] ❌ OS path não existe');
        return false;
      }
      
      const contents = fs.readdirSync(osPath);
      console.log('[DEPENDENCY CHECK] Contents:', contents);
      
      if (contents.length === 0) {
        console.log('[DEPENDENCY CHECK] ❌ Diretório vazio');
        return false;
      }
      
      // Verifica se pelo menos uma versão está instalada completamente
      let hasValidInstallation = false;
      
      for (const version of Object.keys(NODE_VERSIONS)) {
        try {
          const nodePaths = getNodeExecutablePath(version, this.currentOS);
          console.log(`[DEPENDENCY CHECK] Verificando versão ${version}:`, nodePaths.nodeExe);
          console.log(`[DEPENDENCY CHECK] Existe?`, fs.existsSync(nodePaths.nodeExe));
          
          if (fs.existsSync(nodePaths.nodeExe)) {
            hasValidInstallation = true;
            console.log(`[DEPENDENCY CHECK] ✅ Versão ${version} encontrada!`);
            break;
          }
        } catch (error) {
          console.log(`[DEPENDENCY CHECK] ⚠️ Erro na versão ${version}:`, error.message);
          // Versão não instalada, continua verificando
        }
      }
      
      console.log('[DEPENDENCY CHECK] Resultado final:', hasValidInstallation);
      return hasValidInstallation;
      
    } catch (error) {
      console.error('❌ Erro ao verificar dependências:', error);
      return false;
    }
  }

  /**
   * Envia mensagem para o console do instalador
   */
  sendLog(message, isError = false) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('installer-log', { 
        message, 
        isError,
        timestamp: new Date().toISOString()
      });
    }
    console.log(isError ? `❌ ${message}` : `✅ ${message}`);
  }

  /**
   * Envia progresso do download
   */
  sendProgress(percent, status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('installer-progress', { 
        percent, 
        status 
      });
    }
  }

  /**
   * Baixa um arquivo com barra de progresso
   */
  async downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const fileName = path.basename(outputPath);
      
      this.sendLog(`📥 Baixando ${fileName}...`);
      
      protocol.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Segue redirecionamento
          return this.downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Falha no download: ${response.statusCode}`));
          return;
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        
        const fileStream = fs.createWriteStream(outputPath);
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          this.sendProgress(percent, `Baixando ${fileName}: ${percent}%`);
        });
        
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          this.sendLog(`✅ Download completo: ${fileName}`);
          this.sendProgress(100, `Download completo`);
          resolve();
        });
        
        fileStream.on('error', (err) => {
          fs.unlinkSync(outputPath);
          reject(err);
        });
        
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Extrai arquivo ZIP
   */
  async extractZip(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
      try {
        this.sendLog(`📦 Extraindo ${path.basename(zipPath)}...`);
        this.sendProgress(0, 'Extraindo arquivo...');
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractPath, true);
        
        this.sendLog(`✅ Extração completa`);
        this.sendProgress(100, 'Extração completa');
        resolve();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Instala Angular CLI em uma versão específica do Node.js
   */
  async installAngularCLI(nodePaths, angularPackage, nodeVersion) {
    return new Promise((resolve, reject) => {
      this.sendLog(`📦 Instalando Angular CLI ${angularPackage}...`);
      
      const npmCmd = this.currentOS === 'windows' 
        ? `"${nodePaths.npmCmd}"` 
        : nodePaths.npmCmd;
      
      const command = `${npmCmd} install -g ${angularPackage}`;
      
      this.sendLog(`🔧 Executando: ${command}`);
      
      const installProcess = exec(command, {
        cwd: nodePaths.nodeDir,
        maxBuffer: 1024 * 1024 * 10,
        timeout: 300000 // 5 minutos
      });
      
      installProcess.stdout.on('data', (data) => {
        this.sendLog(data.toString().trim());
      });
      
      installProcess.stderr.on('data', (data) => {
        this.sendLog(data.toString().trim());
      });
      
      installProcess.on('close', (code) => {
        if (code === 0) {
          this.sendLog(`✅ Angular CLI instalado com sucesso`);
          resolve();
        } else {
          reject(new Error(`Instalação falhou com código ${code}`));
        }
      });
      
      installProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Instala uma versão específica do Node.js
   */
  async installNodeVersion(version) {
    const versionConfig = NODE_VERSIONS[version];
    
    if (!versionConfig) {
      throw new Error(`Versão não configurada: ${version}`);
    }
    
    const url = versionConfig.urls[this.currentOS];
    if (!url) {
      throw new Error(`URL não disponível para ${this.currentOS}`);
    }
    
    const osPath = path.join(this.nodesBasePath, this.currentOS);
    const zipFileName = path.basename(url);
    const zipPath = path.join(osPath, zipFileName);
    const extractPath = osPath;
    
    // Cria diretório se não existir
    if (!fs.existsSync(osPath)) {
      fs.mkdirSync(osPath, { recursive: true });
      this.sendLog(`📁 Diretório criado: ${osPath}`);
    }
    
    // Verifica se já está instalado
    try {
      const nodePaths = getNodeExecutablePath(version, this.currentOS);
      if (fs.existsSync(nodePaths.nodeExe)) {
        this.sendLog(`✅ Node.js ${version} já está instalado`);
        return;
      }
    } catch (error) {
      // Não instalado, continua
    }
    
    // Verifica se o ZIP já existe
    if (fs.existsSync(zipPath)) {
      this.sendLog(`📦 Arquivo ZIP já existe, tentando extrair...`);
      
      try {
        await this.extractZip(zipPath, extractPath);
        
        // Tenta instalar Angular CLI
        const nodePaths = getNodeExecutablePath(version, this.currentOS);
        await this.installAngularCLI(nodePaths, versionConfig.angularPackage, version);
        
        // Remove ZIP após extração bem-sucedida
        fs.unlinkSync(zipPath);
        this.sendLog(`🗑️ Arquivo ZIP removido`);
        
        return;
        
      } catch (extractError) {
        this.sendLog(`❌ Erro ao extrair: ${extractError.message}`, true);
        this.sendLog(`\n⚠️ Deseja baixar o arquivo novamente e substituir o ZIP atual?`, false);
        this.sendLog(`Digite 'S' para Sim ou qualquer outra tecla para Não`, false);
        
        // Aguarda resposta do usuário (será implementado via IPC)
        throw new Error('EXTRACT_FAILED');
      }
    }
    
    // Baixa o arquivo
    await this.downloadFile(url, zipPath);
    
    // Extrai
    await this.extractZip(zipPath, extractPath);
    
    // Instala Angular CLI
    const nodePaths = getNodeExecutablePath(version, this.currentOS);
    await this.installAngularCLI(nodePaths, versionConfig.angularPackage, version);
    
    // Remove ZIP após extração bem-sucedida
    fs.unlinkSync(zipPath);
    this.sendLog(`🗑️ Arquivo ZIP removido`);
  }

  /**
   * Reinstala uma versão (após erro de extração)
   */
  async reinstallNodeVersion(version) {
    const versionConfig = NODE_VERSIONS[version];
    const osPath = path.join(this.nodesBasePath, this.currentOS);
    const zipFileName = path.basename(versionConfig.urls[this.currentOS]);
    const zipPath = path.join(osPath, zipFileName);
    
    // Remove ZIP existente
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      this.sendLog(`🗑️ ZIP antigo removido`);
    }
    
    // Reinstala
    await this.installNodeVersion(version);
  }

  /**
   * Instala todas as versões necessárias
   */
  async installAllVersions() {
    if (this.isInstalling) {
      this.sendLog('⚠️ Instalação já em andamento', true);
      return;
    }
    
    this.isInstalling = true;
    
    try {
      this.sendLog('🚀 Iniciando instalação das dependências...');
      this.sendLog(`📂 Diretório base: ${this.nodesBasePath}`);
      this.sendLog(`💻 Sistema operacional: ${this.currentOS}`);
      
      // Instala Node.js 16.10.0
      this.sendLog('\n=== Node.js 16.10.0 + Angular CLI 13 ===');
      await this.installNodeVersion('16.10.0');
      
      // Instala Node.js 18.18.2
      this.sendLog('\n=== Node.js 18.18.2 + Angular CLI 15 ===');
      await this.installNodeVersion('18.18.2');
      
      // Instala Node.js 20.19.5
      this.sendLog('\n=== Node.js 20.19.5 + Angular CLI 18 ===');
      await this.installNodeVersion('20.19.5');
      
      this.sendLog('\n✅ Todas as dependências foram instaladas com sucesso!');
      this.sendProgress(100, 'Instalação completa');
      
      return true;
      
    } catch (error) {
      this.sendLog(`\n❌ Erro durante a instalação: ${error.message}`, true);
      throw error;
      
    } finally {
      this.isInstalling = false;
    }
  }
}

module.exports = NodeInstaller;
