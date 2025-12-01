const { app } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const AdmZip = require('adm-zip');
const tar = require('tar');

/**
 * Gerenciador de instalação de Java e Maven portáteis
 */
class JavaInstaller {
  constructor() {
    this.platform = process.platform;
    this.arch = process.arch;
    this.javaBasePath = path.join(app.getAppPath(), 'java');
    this.mavenVersion = '3.9.11';
    
    // URLs de download do Microsoft Build of OpenJDK (mais rápido que Adoptium)
    this.javaDownloadUrls = {
      '25': {
        'win32-x64': 'https://aka.ms/download-jdk/microsoft-jdk-25-windows-x64.zip'
      },
      '21': {
        'win32-x64': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.5-windows-x64.zip',
        'darwin-x64': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.5-macOS-x64.tar.gz',
        'darwin-arm64': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.5-macOS-aarch64.tar.gz',
        'linux-x64': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.5-linux-x64.tar.gz'
      },
      '17': {
        'win32-x64': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.13-windows-x64.zip',
        'darwin-x64': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.13-macOS-x64.tar.gz',
        'darwin-arm64': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.13-macOS-aarch64.tar.gz',
        'linux-x64': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.13-linux-x64.tar.gz'
      }
    };

    // URLs de download do Maven
    this.mavenDownloadUrls = {
      'win32': `https://dlcdn.apache.org/maven/maven-3/${this.mavenVersion}/binaries/apache-maven-${this.mavenVersion}-bin.zip`,
      'darwin': `https://dlcdn.apache.org/maven/maven-3/${this.mavenVersion}/binaries/apache-maven-${this.mavenVersion}-bin.tar.gz`,
      'linux': `https://dlcdn.apache.org/maven/maven-3/${this.mavenVersion}/binaries/apache-maven-${this.mavenVersion}-bin.tar.gz`
    };
  }

  /**
   * Garante que a estrutura de pastas existe
   */
  ensureJavaDirectory() {
    const dirs = [
      this.javaBasePath,
      path.join(this.javaBasePath, 'jdk-17'),
      path.join(this.javaBasePath, 'jdk-21'),
      path.join(this.javaBasePath, 'jdk-25'),
      path.join(this.javaBasePath, 'maven')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[JAVA-INSTALLER] 📁 Criado diretório: ${dir}`);
      }
    });
  }

  /**
   * Detecta versão Java do pom.xml
   */
  detectJavaVersionFromPom(projectPath) {
    const pomPath = path.join(projectPath, 'pom.xml');
    
    if (!fs.existsSync(pomPath)) {
      console.log(`[JAVA-INSTALLER] ⚠️ pom.xml não encontrado em ${projectPath}`);
      return null;
    }

    try {
      const pomContent = fs.readFileSync(pomPath, 'utf-8');
      
      // Tenta encontrar <java.version>
      const javaVersionMatch = pomContent.match(/<java\.version>\s*([^<]+?)\s*<\/java\.version>/i);
      if (javaVersionMatch) {
        const version = javaVersionMatch[1].trim();
        console.log(`[JAVA-INSTALLER] ✅ Versão Java detectada no pom.xml: ${version}`);
        return version;
      }

      // Fallback: procura em <properties> com maven.compiler.source ou release
      const sourceMatch = pomContent.match(/<maven\.compiler\.source>\s*([^<]+?)\s*<\/maven\.compiler\.source>/i);
      if (sourceMatch) {
        const version = sourceMatch[1].trim();
        console.log(`[JAVA-INSTALLER] ✅ Versão Java detectada (compiler.source): ${version}`);
        return version;
      }

      const releaseMatch = pomContent.match(/<maven\.compiler\.release>\s*([^<]+?)\s*<\/maven\.compiler\.release>/i);
      if (releaseMatch) {
        const version = releaseMatch[1].trim();
        console.log(`[JAVA-INSTALLER] ✅ Versão Java detectada (compiler.release): ${version}`);
        return version;
      }

      console.log(`[JAVA-INSTALLER] ⚠️ Versão Java não encontrada no pom.xml`);
      return null;
    } catch (error) {
      console.error(`[JAVA-INSTALLER] ❌ Erro ao ler pom.xml:`, error);
      return null;
    }
  }

  /**
   * Verifica se Java está instalado
   */
  isJavaInstalled(version) {
    const javaDir = path.join(this.javaBasePath, `jdk-${version}`);
    
    // Windows
    if (this.platform === 'win32') {
      const javaExe = path.join(javaDir, 'bin', 'java.exe');
      return fs.existsSync(javaExe);
    }
    
    // Unix (Mac/Linux)
    const javaExe = path.join(javaDir, 'bin', 'java');
    return fs.existsSync(javaExe);
  }

  /**
   * Verifica se Maven está instalado
   */
  isMavenInstalled() {
    const mavenDir = path.join(this.javaBasePath, 'maven', `apache-maven-${this.mavenVersion}`);
    
    // Windows
    if (this.platform === 'win32') {
      const mvnCmd = path.join(mavenDir, 'bin', 'mvn.cmd');
      return fs.existsSync(mvnCmd);
    }
    
    // Unix
    const mvnCmd = path.join(mavenDir, 'bin', 'mvn');
    return fs.existsSync(mvnCmd);
  }

  /**
   * Download de arquivo com progresso (com suporte a redirect)
   */
  downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      console.log(`[JAVA-INSTALLER] 📥 Baixando de ${url}`);
      
      const file = fs.createWriteStream(destPath);
      let redirectCount = 0;
      const maxRedirects = 5;
      
      const doDownload = (downloadUrl) => {
        const urlObj = new URL(downloadUrl);
        const protocol = urlObj.protocol === 'https:' ? https : require('http');
        
        protocol.get(downloadUrl, (response) => {
          // Segue redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              reject(new Error('Muitos redirects'));
              return;
            }
            console.log(`[JAVA-INSTALLER] 🔀 Redirect ${redirectCount} para ${response.headers.location}`);
            file.close();
            fs.unlinkSync(destPath);
            return this.downloadFile(response.headers.location, destPath, onProgress)
              .then(resolve)
              .catch(reject);
          }

          if (response.statusCode !== 200) {
            file.close();
            fs.unlinkSync(destPath);
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          const totalBytes = parseInt(response.headers['content-length'], 10);
          let downloadedBytes = 0;
          let lastUpdate = Date.now();

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            
            // Atualiza progresso a cada 500ms para não sobrecarregar
            const now = Date.now();
            if (onProgress && totalBytes && (now - lastUpdate > 500)) {
              const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
              const speedMBps = ((downloadedBytes / 1024 / 1024) / ((now - lastUpdate) / 1000)).toFixed(1);
              onProgress(`📥 ${percent}% - ${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB (${speedMBps} MB/s)`);
              lastUpdate = now;
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log(`[JAVA-INSTALLER] ✅ Download concluído: ${destPath}`);
            if (onProgress) onProgress('✅ Download concluído');
            resolve(destPath);
          });
        }).on('error', (err) => {
          file.close();
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          reject(err);
        });
      };
      
      doDownload(url);
    });
  }

  /**
   * Extrai arquivo ZIP
   * @param {boolean} preserveRoot - Se true, mantém a pasta raiz do ZIP (para Maven)
   */
  async extractZip(zipPath, destDir, onProgress, preserveRoot = false) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[JAVA-INSTALLER] 📦 Extraindo ${zipPath}...`);
        if (onProgress) onProgress('📦 Extraindo arquivos...');

        const zip = new AdmZip(zipPath);

        if (preserveRoot) {
          // Maven: mantém estrutura original (apache-maven-3.9.11/)
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          zip.extractAllTo(destDir, true);
          console.log(`[JAVA-INSTALLER] ✅ Extração concluída (preservando estrutura)`);
        } else {
          // Java: remove pasta raiz
          const tempDir = path.join(destDir, 'temp-extract');
          
          // Extrai para pasta temporária
          zip.extractAllTo(tempDir, true);

          // Lista o conteúdo da pasta temporária
          const contents = fs.readdirSync(tempDir);
          
          // Se tem apenas 1 item e é uma pasta (estrutura com pasta interna)
          if (contents.length === 1) {
            const innerDir = path.join(tempDir, contents[0]);
            const stats = fs.statSync(innerDir);
            
            if (stats.isDirectory()) {
              // Move o conteúdo da pasta interna para o destino final
              const innerContents = fs.readdirSync(innerDir);
              innerContents.forEach(item => {
                const src = path.join(innerDir, item);
                const dest = path.join(destDir, item);
                fs.renameSync(src, dest);
              });
            } else {
              // É um arquivo único, move para o destino
              fs.renameSync(innerDir, path.join(destDir, contents[0]));
            }
          } else {
            // Múltiplos itens, move todos para o destino
            contents.forEach(item => {
              const src = path.join(tempDir, item);
              const dest = path.join(destDir, item);
              fs.renameSync(src, dest);
            });
          }
          
          // Remove pasta temporária
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`[JAVA-INSTALLER] ✅ Extração concluída`);
        }

        if (onProgress) onProgress('✅ Extração concluída');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Extrai arquivo TAR.GZ
   */
  async extractTarGz(tarPath, destDir, onProgress) {
    try {
      console.log(`[JAVA-INSTALLER] 📦 Extraindo ${tarPath}...`);
      if (onProgress) onProgress('📦 Extraindo arquivos...');

      await tar.x({
        file: tarPath,
        cwd: destDir
      });

      console.log(`[JAVA-INSTALLER] ✅ Extração concluída`);
      if (onProgress) onProgress('✅ Extração concluída');
    } catch (error) {
      throw error;
    }
  }

  /**
   * Baixa e instala Java
   */
  async installJava(version, onProgress) {
    const platformKey = `${this.platform}-${this.arch}`;
    const downloadUrl = this.javaDownloadUrls[version]?.[platformKey];

    if (!downloadUrl) {
      throw new Error(`Java ${version} não disponível para ${platformKey}`);
    }

    const javaDir = path.join(this.javaBasePath, `jdk-${version}`);
    const fileName = downloadUrl.split('/').pop();
    const downloadPath = path.join(this.javaBasePath, fileName);

    // Download
    await this.downloadFile(downloadUrl, downloadPath, onProgress);

    // Extração
    if (fileName.endsWith('.zip')) {
      await this.extractZip(downloadPath, javaDir, onProgress);
    } else if (fileName.endsWith('.tar.gz')) {
      await this.extractTarGz(downloadPath, javaDir, onProgress);
    }

    // Limpa arquivo baixado
    fs.unlinkSync(downloadPath);
    console.log(`[JAVA-INSTALLER] 🗑️ Arquivo temporário removido`);

    // Verifica instalação
    if (!this.isJavaInstalled(version)) {
      throw new Error(`Java ${version} instalado mas não encontrado`);
    }

    console.log(`[JAVA-INSTALLER] ✅ Java ${version} instalado com sucesso`);
    return true;
  }

  /**
   * Baixa e instala Maven
   */
  async installMaven(onProgress) {
    const downloadUrl = this.mavenDownloadUrls[this.platform];
    
    if (!downloadUrl) {
      throw new Error(`Maven não disponível para ${this.platform}`);
    }

    const mavenBaseDir = path.join(this.javaBasePath, 'maven');
    const fileName = downloadUrl.split('/').pop();
    const downloadPath = path.join(this.javaBasePath, fileName);

    // Download
    await this.downloadFile(downloadUrl, downloadPath, onProgress);

    // Extração (preserva estrutura apache-maven-3.9.11/)
    if (fileName.endsWith('.zip')) {
      await this.extractZip(downloadPath, mavenBaseDir, onProgress, true);
    } else if (fileName.endsWith('.tar.gz')) {
      await this.extractTarGz(downloadPath, mavenBaseDir, onProgress);
    }

    // Limpa arquivo baixado
    fs.unlinkSync(downloadPath);
    console.log(`[JAVA-INSTALLER] 🗑️ Arquivo temporário removido`);

    // Verifica instalação
    if (!this.isMavenInstalled()) {
      throw new Error(`Maven instalado mas não encontrado`);
    }

    console.log(`[JAVA-INSTALLER] ✅ Maven ${this.mavenVersion} instalado com sucesso`);
    return true;
  }

  /**
   * Garante que Java e Maven estão instalados
   */
  async ensureJavaAndMaven(projectPath, onProgress) {
    this.ensureJavaDirectory();

    // Detecta versão necessária
    const javaVersion = this.detectJavaVersionFromPom(projectPath);
    if (!javaVersion) {
      throw new Error('Não foi possível detectar a versão Java do projeto');
    }

    console.log(`[JAVA-INSTALLER] 🔍 Verificando Java ${javaVersion} e Maven...`);

    // Verifica e instala Java se necessário
    if (!this.isJavaInstalled(javaVersion)) {
      console.log(`[JAVA-INSTALLER] 📥 Java ${javaVersion} não encontrado, iniciando download...`);
      if (onProgress) onProgress(`📥 Baixando Java ${javaVersion}...\n`);
      await this.installJava(javaVersion, onProgress);
    } else {
      console.log(`[JAVA-INSTALLER] ✅ Java ${javaVersion} já instalado`);
      if (onProgress) onProgress(`✅ Java ${javaVersion} já instalado\n`);
    }

    // Verifica e instala Maven se necessário
    if (!this.isMavenInstalled()) {
      console.log(`[JAVA-INSTALLER] 📥 Maven não encontrado, iniciando download...`);
      if (onProgress) onProgress('📥 Baixando Maven...\n');
      await this.installMaven(onProgress);
    } else {
      console.log(`[JAVA-INSTALLER] ✅ Maven já instalado`);
      if (onProgress) onProgress('✅ Maven já instalado\n');
    }

    return javaVersion;
  }

  /**
   * Retorna caminhos para Java e Maven portáteis
   */
  getJavaAndMavenPaths(javaVersion) {
    const javaDir = path.join(this.javaBasePath, `jdk-${javaVersion}`);
    const mavenDir = path.join(this.javaBasePath, 'maven', `apache-maven-${this.mavenVersion}`);

    // Encontra diretório real do JDK (pode ter sufixo como jdk-21.0.6+7)
    let actualJavaDir = javaDir;
    if (fs.existsSync(javaDir)) {
      const contents = fs.readdirSync(javaDir);
      const jdkFolder = contents.find(name => name.startsWith('jdk'));
      if (jdkFolder) {
        actualJavaDir = path.join(javaDir, jdkFolder);
      }
    }

    const javaBin = this.platform === 'win32' 
      ? path.join(actualJavaDir, 'bin', 'java.exe')
      : path.join(actualJavaDir, 'bin', 'java');

    const mvnBin = this.platform === 'win32'
      ? path.join(mavenDir, 'bin', 'mvn.cmd')
      : path.join(mavenDir, 'bin', 'mvn');

    return {
      javaHome: actualJavaDir,
      javaBin,
      mvnBin,
      mavenHome: mavenDir
    };
  }
}

module.exports = JavaInstaller;
