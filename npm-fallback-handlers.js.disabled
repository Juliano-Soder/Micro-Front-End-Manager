const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Classe para gerenciar fallbacks de erros relacionados ao npm e Nexus
 */
class NpmFallbackHandlers {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'nexus-credentials.json');
  }

  /**
   * Obtém o caminho do npm portátil instalado
   */
  getPortableNpmPath() {
    try {
      const nodeVersionConfig = require('./node-version-config');
      const currentOS = nodeVersionConfig.getCurrentOS();
      const nodesBasePath = nodeVersionConfig.getNodesBasePath();
      
      const osFolderMap = {
        'windows': 'windows',
        'linux': 'linux',
        'mac': 'mac',
        'mac-arm64': 'mac'
      };
      
      const osFolder = osFolderMap[currentOS] || 'windows';
      const nodesFolderPath = path.join(nodesBasePath, osFolder);
      
      if (!fs.existsSync(nodesFolderPath)) {
        console.error(`❌ Pasta de nodes não encontrada: ${nodesFolderPath}`);
        return null;
      }
      
      const folders = fs.readdirSync(nodesFolderPath);
      
      for (const folder of folders) {
        const folderPath = path.join(nodesFolderPath, folder);
        
        if (!fs.statSync(folderPath).isDirectory()) {
          continue;
        }
        
        if (currentOS === 'windows') {
          let npmPath = path.join(folderPath, 'npm.cmd');
          if (fs.existsSync(npmPath)) {
            console.log(`✅ npm portátil encontrado: ${npmPath}`);
            return npmPath;
          }
          
          const subfolders = fs.readdirSync(folderPath);
          for (const subfolder of subfolders) {
            const subfolderPath = path.join(folderPath, subfolder);
            if (fs.statSync(subfolderPath).isDirectory()) {
              npmPath = path.join(subfolderPath, 'npm.cmd');
              if (fs.existsSync(npmPath)) {
                console.log(`✅ npm portátil encontrado: ${npmPath}`);
                return npmPath;
              }
            }
          }
        } else {
          const npmPath = path.join(folderPath, 'bin', 'npm');
          if (fs.existsSync(npmPath)) {
            console.log(`✅ npm portátil encontrado: ${npmPath}`);
            return npmPath;
          }
        }
      }
      
      console.error(`❌ Nenhum npm portátil encontrado`);
      return null;
    } catch (error) {
      console.error(`❌ Erro ao procurar npm portátil:`, error);
      return null;
    }
  }

  /**
   * Codifica credenciais em base64
   */
  encodeCredentials(username, password, email) {
    const credentials = {
      username: Buffer.from(username).toString('base64'),
      password: Buffer.from(password).toString('base64'),
      email: Buffer.from(email).toString('base64'),
      savedAt: new Date().toISOString()
    };
    return credentials;
  }

  /**
   * Decodifica credenciais de base64
   */
  decodeCredentials(encodedCredentials) {
    try {
      return {
        username: Buffer.from(encodedCredentials.username, 'base64').toString('utf8'),
        password: Buffer.from(encodedCredentials.password, 'base64').toString('utf8'),
        email: Buffer.from(encodedCredentials.email, 'base64').toString('utf8'),
        savedAt: encodedCredentials.savedAt
      };
    } catch (error) {
      console.error('❌ Erro ao decodificar credenciais:', error);
      return null;
    }
  }

  /**
   * Salva credenciais do Nexus em base64
   */
  saveCredentials(username, password, email) {
    try {
      const encoded = this.encodeCredentials(username, password, email);
      fs.writeFileSync(this.configPath, JSON.stringify(encoded, null, 2), 'utf8');
      console.log('✅ Credenciais salvas com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar credenciais:', error);
      return false;
    }
  }

  /**
   * Carrega credenciais salvas
   */
  loadCredentials() {
    try {
      if (fs.existsSync(this.configPath)) {
        const encoded = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        return this.decodeCredentials(encoded);
      }
      return null;
    } catch (error) {
      console.error('❌ Erro ao carregar credenciais:', error);
      return null;
    }
  }

  /**
   * Remove credenciais salvas
   */
  clearCredentials() {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        console.log('✅ Credenciais removidas');
      }
      return true;
    } catch (error) {
      console.error('❌ Erro ao remover credenciais:', error);
      return false;
    }
  }

  /**
   * Verifica se há credenciais salvas
   */
  hasStoredCredentials() {
    return fs.existsSync(this.configPath);
  }

  /**
   * Verifica se está logado no Nexus
   */
  async checkNexusLogin(projectPath, registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/') {
    return new Promise((resolve) => {
      console.log(`🔍 Verificando login no Nexus para ${projectPath}`);
      
      const npmPath = this.getPortableNpmPath();
      
      if (!npmPath) {
        console.error('❌ npm portátil não encontrado para verificação de login');
        resolve({ isLoggedIn: false, username: null });
        return;
      }
      
      // Para Windows, precisa usar cmd /c para executar .cmd files corretamente
      const nodeVersionConfig = require('./node-version-config');
      const currentOS = nodeVersionConfig.getCurrentOS();
      const whoamiCommand = currentOS === 'windows' 
        ? `cmd /c "${npmPath}" whoami --registry=${registry}`
        : `"${npmPath}" whoami --registry=${registry}`;
      
      console.log(`🔍 Executando comando: ${whoamiCommand}`);
      
      exec(whoamiCommand, { cwd: projectPath, timeout: 30000 }, (error, stdout, stderr) => {
        if (!error && stdout && stdout.trim()) {
          const username = stdout.trim();
          console.log(`✅ Logado no Nexus como: ${username}`);
          resolve({ isLoggedIn: true, username });
        } else {
          console.log('❌ Não está logado no Nexus');
          console.log('Erro:', error?.message);
          console.log('stderr:', stderr);
          resolve({ isLoggedIn: false, username: null });
        }
      });
    });
  }

  /**
   * Faz login silencioso no Nexus usando credenciais salvas
   */
  async silentNexusLogin(projectPath, registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/') {
    const credentials = this.loadCredentials();
    
    if (!credentials) {
      console.log('⚠️ Nenhuma credencial salva encontrada');
      return { success: false, reason: 'no-credentials' };
    }

    console.log(`🔐 Tentando login silencioso no Nexus...`);
    
    const npmPath = this.getPortableNpmPath();
    
    if (!npmPath) {
      console.error('❌ npm portátil não encontrado para login silencioso');
      return { success: false, reason: 'npm-not-found' };
    }
    
    console.log(`✅ Usando npm portátil para login: ${npmPath}`);
    
    return new Promise((resolve) => {
      // Timeout de segurança
      const loginTimeout = setTimeout(() => {
        console.error('⏰ Timeout no login silencioso (60s)');
        
        // Tenta limpar o script temporário
        try {
          const tempScriptPath = path.join(projectPath, '.npm-login-temp.js');
          if (fs.existsSync(tempScriptPath)) {
            fs.unlinkSync(tempScriptPath);
          }
        } catch (e) {
          console.error('⚠️ Erro ao limpar script após timeout:', e);
        }
        
        resolve({ success: false, reason: 'timeout', error: 'Login silencioso excedeu 60 segundos' });
      }, 60000); // 60 segundos
      
      // Cria um script temporário para fazer login automático
      const loginScript = `
        const { spawn } = require('child_process');
        const registry = '${registry}';
        const username = '${credentials.username}';
        const password = '${credentials.password}';
        const email = '${credentials.email}';
        const npmPath = '${npmPath.replace(/\\/g, '\\\\')}';
        
        const npmLogin = spawn(npmPath, ['login', '--registry=' + registry], {
          cwd: '${projectPath.replace(/\\/g, '\\\\')}',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let step = 0;
        
        npmLogin.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('NPM:', output);
          
          if (output.includes('Username:') && step === 0) {
            npmLogin.stdin.write(username + '\\n');
            step = 1;
          } else if (output.includes('Password:') && step === 1) {
            npmLogin.stdin.write(password + '\\n');
            step = 2;
          } else if (output.includes('Email:') && step === 2) {
            npmLogin.stdin.write(email + '\\n');
            step = 3;
          }
        });
        
        npmLogin.stderr.on('data', (data) => {
          console.error('NPM Error:', data.toString());
        });
        
        npmLogin.on('close', (code) => {
          process.exit(code);
        });
      `;

      const tempScriptPath = path.join(projectPath, '.npm-login-temp.js');
      fs.writeFileSync(tempScriptPath, loginScript, 'utf8');

      exec(`node "${tempScriptPath}"`, { cwd: projectPath, timeout: 60000 }, (error, stdout, stderr) => {
        // Limpa o timeout
        clearTimeout(loginTimeout);
        
        // Remove script temporário
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          console.error('⚠️ Erro ao remover script temporário:', e);
        }

        if (!error) {
          console.log('✅ Login silencioso realizado com sucesso');
          resolve({ success: true });
        } else {
          console.error('❌ Erro no login silencioso:', error.message);
          resolve({ success: false, reason: 'login-failed', error: error.message });
        }
      });
    });
  }

  /**
   * Configura registry específico para npm
   */
  async setNpmRegistry(projectPath, registry) {
    return new Promise((resolve) => {
      console.log(`🔧 Configurando registry: ${registry}`);
      
      const npmPath = this.getPortableNpmPath();
      
      if (!npmPath) {
        console.error('❌ npm portátil não encontrado para configurar registry');
        resolve({ success: false, error: 'npm não encontrado' });
        return;
      }
      
      // Para Windows, precisa usar cmd /c para executar .cmd files corretamente
      const nodeVersionConfig = require('./node-version-config');
      const currentOS = nodeVersionConfig.getCurrentOS();
      const configCommand = currentOS === 'windows' 
        ? `cmd /c "${npmPath}" config set registry ${registry}`
        : `"${npmPath}" config set registry ${registry}`;
      
      console.log(`🔧 Executando comando: ${configCommand}`);
      
      exec(configCommand, { cwd: projectPath }, (error, stdout, stderr) => {
        if (!error) {
          console.log(`✅ Registry configurado: ${registry}`);
          resolve({ success: true });
        } else {
          console.error(`❌ Erro ao configurar registry:`, error.message);
          console.error('stderr:', stderr);
          resolve({ success: false, error: error.message });
        }
      });
    });
  }

  /**
   * Restaura registry padrão do npm
   */
  async restoreDefaultRegistry(projectPath) {
    return this.setNpmRegistry(projectPath, 'https://registry.npmjs.org/');
  }

  /**
   * Tratamento especial para mp-pas-atendimento
   * Segue os passos descritos pelo colega
   */
  async handleMpPasAtendimentoInstall(projectPath, eventEmitter = null) {
    console.log('🎯 Iniciando tratamento especial para mp-pas-atendimento');
    
    const steps = [];
    const log = (message) => {
      console.log(message);
      steps.push(message);
      if (eventEmitter) {
        eventEmitter.send('log', { path: projectPath, message });
      }
    };

    try {
      // Passo 1: Verificar se está logado
      log('📋 Passo 1: Verificando login no Nexus...');
      const loginStatus = await this.checkNexusLogin(projectPath);
      
      if (!loginStatus.isLoggedIn) {
        log('⚠️ Não está logado no Nexus');
        
        // Tenta login silencioso
        if (this.hasStoredCredentials()) {
          log('🔐 Tentando login silencioso com credenciais salvas...');
          const silentLoginResult = await this.silentNexusLogin(projectPath);
          
          if (!silentLoginResult.success) {
            log('❌ Login silencioso falhou. É necessário fazer login manual.');
            return { 
              success: false, 
              reason: 'login-required', 
              steps,
              message: 'Login manual no Nexus é necessário'
            };
          }
          
          log('✅ Login silencioso realizado com sucesso');
        } else {
          log('❌ Nenhuma credencial salva. É necessário fazer login manual.');
          return { 
            success: false, 
            reason: 'login-required', 
            steps,
            message: 'Login manual no Nexus é necessário'
          };
        }
      } else {
        log(`✅ Já logado como: ${loginStatus.username}`);
      }

      // Passo 2: Validar se está logado
      log('📋 Passo 2: Validando autenticação...');
      const validationResult = await this.checkNexusLogin(
        projectPath,
        'https://nexus.viavarejo.com.br/repository/npm-marketplace/'
      );
      
      if (!validationResult.isLoggedIn) {
        log('❌ Validação de login falhou');
        return { 
          success: false, 
          reason: 'validation-failed', 
          steps,
          message: 'Falha na validação de login'
        };
      }
      
      log(`✅ Validação bem-sucedida: ${validationResult.username}`);

      // Passo 3: Configurar registry específico para npm-marketplace
      log('📋 Passo 3: Configurando registry npm-marketplace...');
      const setRegistryResult = await this.setNpmRegistry(
        projectPath,
        'https://nexus.viavarejo.com.br/repository/npm-marketplace/'
      );
      
      if (!setRegistryResult.success) {
        log('❌ Erro ao configurar registry');
        return { 
          success: false, 
          reason: 'registry-config-failed', 
          steps,
          message: 'Falha ao configurar registry'
        };
      }
      
      log('✅ Registry configurado com sucesso');

      // Passo 4: Executar npm install
      log('📋 Passo 4: Instalando dependências...');
      
      // Obtém o caminho do npm portátil
      const npmPath = this.getPortableNpmPath();
      
      if (!npmPath) {
        log('❌ npm portátil não encontrado para instalação');
        return { 
          success: false, 
          reason: 'npm-not-found', 
          steps,
          message: 'npm portátil não encontrado'
        };
      }
      
      log(`✅ Usando npm portátil: ${npmPath}`);
      
      // Para Windows, precisa usar cmd /c para executar .cmd files corretamente
      const nodeVersionConfig = require('./node-version-config');
      const currentOS = nodeVersionConfig.getCurrentOS();
      const installCommand = currentOS === 'windows' 
        ? `cmd /c "${npmPath}" install --verbose`
        : `"${npmPath}" install --verbose`;
      
      log(`🔧 Executando: ${installCommand}`);
      
      const installResult = await new Promise((resolve) => {
        exec(installCommand, { 
          cwd: projectPath, 
          maxBuffer: 1024 * 1024 * 50,
          timeout: 600000 // 10 minutos
        }, (error, stdout, stderr) => {
          if (error) {
            log(`❌ Erro durante npm install: ${error.message}`);
            resolve({ success: false, error: error.message, stdout, stderr });
          } else {
            log('✅ npm install concluído com sucesso');
            resolve({ success: true, stdout, stderr });
          }
        });
      });

      if (!installResult.success) {
        log('❌ npm install falhou');
        // Mesmo com falha, tenta restaurar registry
        await this.restoreDefaultRegistry(projectPath);
        return { 
          success: false, 
          reason: 'install-failed', 
          steps,
          message: 'Falha ao instalar dependências',
          error: installResult.error
        };
      }

      // Passo 5: Restaurar registry global
      log('📋 Passo 5: Restaurando registry padrão...');
      const restoreResult = await this.restoreDefaultRegistry(projectPath);
      
      if (!restoreResult.success) {
        log('⚠️ Aviso: Não foi possível restaurar registry padrão');
      } else {
        log('✅ Registry padrão restaurado');
      }

      log('🎉 Processo completo! mp-pas-atendimento configurado com sucesso.');
      
      return { 
        success: true, 
        steps,
        message: 'Instalação concluída com sucesso'
      };

    } catch (error) {
      log(`❌ Erro inesperado: ${error.message}`);
      
      // Tenta restaurar registry mesmo em caso de erro
      try {
        await this.restoreDefaultRegistry(projectPath);
      } catch (e) {
        console.error('Erro ao restaurar registry:', e);
      }
      
      return { 
        success: false, 
        reason: 'unexpected-error', 
        steps,
        message: error.message,
        error: error.stack
      };
    }
  }

  /**
   * Detecta se o erro é relacionado ao ajv (erro específico mencionado)
   */
  isAjvError(errorOutput) {
    return errorOutput.includes('npm verb unfinished npm timer reifyNode') &&
           errorOutput.includes('ajv');
  }

  /**
   * Detecta se node_modules foi criado mesmo com erro
   */
  hasNodeModules(projectPath) {
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    return fs.existsSync(nodeModulesPath);
  }
}

module.exports = NpmFallbackHandlers;
