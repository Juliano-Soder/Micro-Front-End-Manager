const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const AdmZip = require('adm-zip');
const tar = require('tar');
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
    this.onProgress = null; // Callback para progresso
    this.onLog = null; // Callback para logs
  }

  /**
   * Define a referência de mainWindow (útil quando criado sem janela)
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Verifica se as dependências do Node.js estão instaladas
   */
  checkDependenciesInstalled() {
    try {
      const osPath = path.join(this.nodesBasePath, this.currentOS);
      
      console.log('[DEPENDENCY CHECK] ====== INICIANDO VERIFICAÇÃO ======');
      console.log('[DEPENDENCY CHECK] Base path:', this.nodesBasePath);
      console.log('[DEPENDENCY CHECK] Current OS:', this.currentOS);
      console.log('[DEPENDENCY CHECK] OS path:', osPath);
      console.log('[DEPENDENCY CHECK] OS path exists?', fs.existsSync(osPath));
      
      // Verifica se o diretório existe e não está vazio
      if (!fs.existsSync(osPath)) {
        console.log('[DEPENDENCY CHECK] ❌ OS path não existe');
        return false;
      }
      
      const contents = fs.readdirSync(osPath);
      console.log('[DEPENDENCY CHECK] Contents:', contents);
      
      if (contents.length === 0 || (contents.length === 1 && contents[0] === '.gitkeep')) {
        console.log('[DEPENDENCY CHECK] ❌ Diretório vazio ou só tem .gitkeep');
        return false;
      }
      
      // Verifica se pelo menos uma versão está instalada completamente
      let hasValidInstallation = false;
      let versionsChecked = [];
      
      for (const version of Object.keys(NODE_VERSIONS)) {
        try {
          console.log(`[DEPENDENCY CHECK] ===== Verificando versão ${version} =====`);
          const nodePaths = getNodeExecutablePath(version, this.currentOS);
          console.log(`[DEPENDENCY CHECK] Node exe path: ${nodePaths.nodeExe}`);
          console.log(`[DEPENDENCY CHECK] Node exe exists?`, fs.existsSync(nodePaths.nodeExe));
          console.log(`[DEPENDENCY CHECK] NPM cmd path: ${nodePaths.npmCmd}`);
          console.log(`[DEPENDENCY CHECK] NPM cmd exists?`, fs.existsSync(nodePaths.npmCmd));
          
          versionsChecked.push({
            version,
            nodeExists: fs.existsSync(nodePaths.nodeExe),
            npmExists: fs.existsSync(nodePaths.npmCmd)
          });
          
          if (fs.existsSync(nodePaths.nodeExe) && fs.existsSync(nodePaths.npmCmd)) {
            hasValidInstallation = true;
            console.log(`[DEPENDENCY CHECK] ✅ Versão ${version} COMPLETA encontrada!`);
            break;
          } else {
            console.log(`[DEPENDENCY CHECK] ⚠️ Versão ${version} incompleta`);
          }
        } catch (error) {
          console.log(`[DEPENDENCY CHECK] ⚠️ Erro na versão ${version}:`, error.message);
          versionsChecked.push({
            version,
            error: error.message
          });
          // Versão não instalada, continua verificando
        }
      }
      
      console.log('[DEPENDENCY CHECK] Versões verificadas:', versionsChecked);
      console.log('[DEPENDENCY CHECK] ====== Resultado final:', hasValidInstallation, '======');
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
    // Primeiro tenta enviar via callback
    if (this.onLog) {
      this.onLog(message, isError);
    }
    
    // Depois tenta enviar via mainWindow
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
    // Primeiro tenta enviar via callback
    if (this.onProgress) {
      this.onProgress(percent, status);
    }
    
    // Depois tenta enviar via mainWindow
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
          try {
            fs.unlinkSync(outputPath);
          } catch (unlinkError) {
            console.error('Erro ao deletar arquivo durante erro de download:', unlinkError);
          }
          reject(err);
        });
        
      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Extrai arquivo (ZIP, TAR.XZ, TAR.GZ)
   */
  async extractArchive(archivePath, extractPath) {
    return new Promise((resolve, reject) => {
      try {
        const fileName = path.basename(archivePath);
        const fileExt = path.extname(archivePath).toLowerCase();
        
        this.sendLog(`📦 Extraindo ${fileName}...`);
        this.sendProgress(0, 'Extraindo arquivo...');
        
        if (fileExt === '.zip') {
          // Extração ZIP (Windows)
          const zip = new AdmZip(archivePath);
          zip.extractAllTo(extractPath, true);
          this.sendLog(`✅ Extração completa - Finalizando instalação...`);
          this.sendProgress(100, 'Extração completa - Finalizando instalação...');
          resolve();
        } else if (fileName.endsWith('.tar.xz') || fileName.endsWith('.tar.gz')) {
          // Extração TAR (Linux/Mac)
          tar.extract({
            file: archivePath,
            cwd: extractPath,
            strip: 1 // Remove o diretório raiz do tar
          }).then(() => {
            this.sendLog(`✅ Extração completa - Finalizando instalação...`);
            this.sendProgress(100, 'Extração completa - Finalizando instalação...');
            resolve();
          }).catch(reject);
        } else {
          reject(new Error(`Formato de arquivo não suportado: ${fileName}`));
        }
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Método legado para compatibilidade
   */
  async extractZip(zipPath, extractPath) {
    return this.extractArchive(zipPath, extractPath);
  }

  /**
   * Instala Angular CLI em uma versão específica do Node.js
   */
  async installAngularCLI(nodePaths, angularPackage, nodeVersion) {
    return new Promise((resolve, reject) => {
      this.sendLog(`📦 Instalando Angular CLI ${angularPackage}...`);
      
      const { exec } = require('child_process');
      
      // Comando simplificado - apenas executa o npm.cmd diretamente
      const fullCommand = `"${nodePaths.npmCmd}" install -g ${angularPackage}`;
      
      this.sendLog(`🔧 Executando: ${fullCommand}`);
      this.sendLog(`📁 Diretório: ${nodePaths.nodeDir}`);
      
      const options = {
        cwd: nodePaths.nodeDir,
        env: {
          ...process.env,
          PATH: `${nodePaths.nodeDir};${process.env.PATH}`
        },
        timeout: 300000, // 5 minutos
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        windowsHide: true
      };
      
      const installProcess = exec(fullCommand, options);
      
      let hasEnded = false;
      
      // Captura saída em tempo real
      installProcess.stdout?.on('data', (data) => {
        this.sendLog(data.toString().trim());
      });
      
      installProcess.stderr?.on('data', (data) => {
        this.sendLog(data.toString().trim());
      });
      
      installProcess.on('close', (code) => {
        if (hasEnded) return;
        hasEnded = true;
        
        if (code === 0) {
          this.sendLog(`✅ Angular CLI instalado com sucesso!`);
          resolve();
        } else {
          this.sendLog(`❌ Instalação falhou com código ${code}`, true);
          reject(new Error(`Instalação falhou com código ${code}`));
        }
      });
      
      installProcess.on('error', (error) => {
        if (hasEnded) return;
        hasEnded = true;
        
        this.sendLog(`❌ Erro na instalação: ${error.message}`, true);
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
      this.sendLog(`📦 Arquivo já existe, tentando extrair...`);
      
      try {
        await this.extractArchive(zipPath, extractPath);
        
        // Tenta instalar Angular CLI
        const nodePaths = getNodeExecutablePath(version, this.currentOS);
        await this.installAngularCLI(nodePaths, versionConfig.angularPackage, version);
        
        // Remove ZIP após extração bem-sucedida (com proteção de erro)
        try {
          fs.unlinkSync(zipPath);
          this.sendLog(`🗑️ Arquivo ZIP removido`);
        } catch (unlinkError) {
          this.sendLog(`⚠️ Não foi possível remover ZIP: ${unlinkError.message}`, false);
        }
        
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
    await this.extractArchive(zipPath, extractPath);
    
    // Instala Angular CLI
    const nodePaths = getNodeExecutablePath(version, this.currentOS);
    await this.installAngularCLI(nodePaths, versionConfig.angularPackage, version);
    
    // Remove ZIP após extração bem-sucedida (com proteção de erro)
    try {
      fs.unlinkSync(zipPath);
      this.sendLog(`🗑️ Arquivo ZIP removido`);
    } catch (unlinkError) {
      this.sendLog(`⚠️ Não foi possível remover ZIP: ${unlinkError.message}`, false);
    }
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
      try {
        fs.unlinkSync(zipPath);
        this.sendLog(`🗑️ ZIP antigo removido`);
      } catch (unlinkError) {
        this.sendLog(`⚠️ Não foi possível remover ZIP antigo: ${unlinkError.message}`, false);
      }
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
    
    console.log('[DEBUG] installAllVersions iniciado');
    this.isInstalling = true;
    
    try {
      this.sendLog('🚀 Iniciando instalação das dependências essenciais...');
      this.sendProgress(5, 'Iniciando...');
      
      this.sendLog(`📂 Diretório base: ${this.nodesBasePath}`);
      this.sendLog(`💻 Sistema operacional: ${this.currentOS}`);
      
      console.log('[DEBUG] Sobre to install Node.js 16.10.0');
      
      // Instala Node.js 16.10.0 (versão base para projetos legados)
      this.sendLog('\n=== Node.js 16.10.0 + Angular CLI 13 ===');
      this.sendProgress(20, 'Instalando Node.js 16.10.0...');
      await this.installNodeVersion('16.10.0');
      
      console.log('[DEBUG] Node.js 16.10.0 instalado, iniciando 20.19.5');
      
      // Instala Node.js 20.19.5 (versão moderna recomendada)
      this.sendLog('\n=== Node.js 20.19.5 + Angular CLI 18 ===');
      this.sendProgress(60, 'Instalando Node.js 20.19.5...');
      await this.installNodeVersion('20.19.5');
      
      console.log('[DEBUG] Versões essenciais instaladas com sucesso');
      
      this.sendLog('\n✅ Versões essenciais do Node.js instaladas!');
      this.sendLog('💡 Outras versões podem ser instaladas individualmente via menu.');
      this.sendProgress(100, 'Instalação completa');
      
      // Notifica instalação completa
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('installation-complete', { 
          success: true, 
          message: 'Versões essenciais instaladas! Outras versões disponíveis via menu.' 
        });
      }
      
      return true;
      
    } catch (error) {
      console.error('[DEBUG] Erro durante installAllVersions:', error);
      this.sendLog(`\n❌ Erro durante a instalação: ${error.message}`, true);
      this.sendProgress(0, 'Erro na instalação');
      
      // Notifica erro
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('installation-complete', { 
          success: false, 
          message: error.message 
        });
      }
      
      throw error;
      
    } finally {
      this.isInstalling = false;
      console.log('[DEBUG] installAllVersions finalizado');
    }
  }

  /**
   * Instala uma versão customizada do Node.js e Angular CLI
   */
  async installCustomVersion(customVersion) {
    if (this.isInstalling) {
      throw new Error('Já existe uma instalação em andamento');
    }

    this.isInstalling = true;
    
    try {
      console.log(`[CUSTOM] Iniciando instalação customizada do Node.js ${customVersion.version}`);
      this.sendLog(`🚀 Iniciando instalação do Node.js ${customVersion.version}...`);
      
      // Cria diretório para a versão customizada
      const versionDir = path.join(this.nodesBasePath, this.currentOS, `node-v${customVersion.version}`);
      
      console.log(`[CUSTOM] Verificando diretório: ${versionDir}`);
      
      if (fs.existsSync(versionDir)) {
        throw new Error(`Versão ${customVersion.version} já está instalada`);
      }
      
      console.log(`[CUSTOM] Criando diretório...`);
      this.sendLog(`📁 Criando diretório...`);
      fs.mkdirSync(versionDir, { recursive: true });
      console.log(`[CUSTOM] Diretório criado: ${versionDir}`);
      this.sendLog(`✅ Diretório criado`);
      
      // Faz download do Node.js
      console.log(`[CUSTOM] Iniciando download de: ${customVersion.url}`);
      this.sendLog(`📥 Iniciando download do Node.js...`);
      
      // Extrai o nome do arquivo da URL
      const urlParts = customVersion.url.split('/');
      const zipFileName = urlParts[urlParts.length - 1];
      const downloadPath = path.join(versionDir, zipFileName);
      
      console.log(`[CUSTOM] Caminho de download: ${downloadPath}`);
      await this.downloadFile(customVersion.url, downloadPath);
      
      // Extrai o arquivo
      console.log(`[CUSTOM] Extraindo arquivo...`);
      this.sendLog(`📦 Extraindo arquivo...`);
      await this.extractArchive(downloadPath, versionDir);
      
      // Remove arquivo baixado
      console.log(`[CUSTOM] Removendo arquivo baixado...`);
      fs.unlinkSync(downloadPath);
      this.sendLog(`🗑️ Arquivo temporário removido`);
      
      // Instala Angular CLI
      console.log(`[CUSTOM] Instalando Angular CLI: ${customVersion.angularCli}`);
      this.sendLog(`⚙️ Instalando Angular CLI...`);
      
      // Encontra o caminho correto do npm (pode estar em subpasta após extração do ZIP)
      let npmPath = null;
      let nodeExePath = null;
      
      // Procura pelos arquivos em subpastas
      const findNodeFiles = (dir) => {
        console.log(`[DEBUG] findNodeFiles: Procurando em ${dir}`);
        try {
          const files = fs.readdirSync(dir);
          console.log(`[DEBUG] findNodeFiles: Arquivos encontrados:`, files);
          for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              console.log(`[DEBUG] findNodeFiles: Verificando pasta ${fullPath}`);
              // Verifica se npm.cmd está nessa pasta
              if (this.currentOS === 'windows') {
                const npmInDir = path.join(fullPath, 'npm.cmd');
                const nodeInDir = path.join(fullPath, 'node.exe');
                console.log(`[DEBUG] findNodeFiles: Verificando ${npmInDir} e ${nodeInDir}`);
                if (fs.existsSync(npmInDir) && fs.existsSync(nodeInDir)) {
                  console.log(`[DEBUG] findNodeFiles: ✅ ENCONTRADO! Retornando:`, { npm: npmInDir, node: nodeInDir, dir: fullPath });
                  return { npm: npmInDir, node: nodeInDir, dir: fullPath };
                }
              } else {
                const npmInDir = path.join(fullPath, 'bin/npm');
                const nodeInDir = path.join(fullPath, 'bin/node');
                if (fs.existsSync(npmInDir) && fs.existsSync(nodeInDir)) {
                  return { npm: npmInDir, node: nodeInDir, dir: fullPath };
                }
              }
              
              // Recursivamente procura em subpastas
              const result = findNodeFiles(fullPath);
              if (result) return result;
            }
          }
        } catch (error) {
          console.log(`[DEBUG] findNodeFiles: Erro ao ler ${dir}:`, error.message);
        }
        console.log(`[DEBUG] findNodeFiles: Não encontrado em ${dir}`);
        return null;
      };
      
      const nodeFiles = findNodeFiles(versionDir);
      console.log(`[DEBUG] nodeFiles result:`, nodeFiles);
      if (nodeFiles) {
        npmPath = nodeFiles.npm;
        nodeExePath = nodeFiles.node;
        console.log(`[CUSTOM] Encontrado npm em: ${npmPath}`);
        console.log(`[CUSTOM] Encontrado node em: ${nodeExePath}`);
        console.log(`[CUSTOM] Diretório do Node: ${nodeFiles.dir}`);
        console.log(`[CUSTOM] Encontrado node em: ${nodeExePath}`);
      } else {
        console.warn(`[CUSTOM] ⚠️ Não foi possível encontrar npm/node, usando caminhos padrão`);
        npmPath = this.currentOS === 'windows' 
          ? path.join(versionDir, 'npm.cmd')
          : path.join(versionDir, 'bin/npm');
        nodeExePath = this.currentOS === 'windows' 
          ? path.join(versionDir, 'node.exe')
          : path.join(versionDir, 'bin/node');
      }
      
      // Monta os caminhos do Node para a versão customizada
      const nodePaths = {
        nodeDir: nodeFiles ? nodeFiles.dir : versionDir,
        nodeExe: nodeExePath,
        npmCmd: npmPath
      };
      
      await this.installAngularCLI(nodePaths, customVersion.angularCli, customVersion.version);
      
      console.log(`[CUSTOM] ✅ Node.js ${customVersion.version} instalado com sucesso!`);
      this.sendLog(`✅ Instalação concluída com sucesso!`);
      return true;
      
    } catch (error) {
      console.error(`[CUSTOM] Erro na instalação customizada:`, error);
      this.sendLog(`❌ Erro na instalação: ${error.message}`, true);
      throw error;
    } finally {
      this.isInstalling = false;
    }
  }
}

module.exports = NodeInstaller;
