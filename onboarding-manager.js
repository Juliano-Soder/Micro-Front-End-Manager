const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

/**
 * Gerenciador de projetos Onboarding
 * Responsável por gerenciar projetos específicos de onboarding/treinamento
 */
class OnboardingManager {
  constructor() {
    // Define o arquivo de configuração no AppData (igual aos outros projetos)
    this.userDataPath = app ? app.getPath('userData') : path.join(os.homedir(), 'AppData', 'Roaming', 'micro-front-end-manager');
    this.onboardingFile = path.join(this.userDataPath, 'onboarding-projects.txt');
    
    console.log('[ONBOARDING] 📁 Arquivo de configuração:', this.onboardingFile);
    this.onboardingProjects = [
      {
        name: 'mp-site-front',
        displayName: 'MP Site Front',
        url: 'https://github.com/viavarejo-internal/mp-site-front.git',
        type: 'react',
        startCommand: 'npm start',
        installCommand: 'npm install',
        port: 3000,
        description: 'Projeto React para onboarding - Site Front Via Varejo',
        nodeVersion: '16.10.0',
        defaultNodeVersion: '16.10.0', // Versão padrão definida
        usePortableNode: true, // Usar Node.js portátil
        cliRequired: false, // React não precisa de Angular CLI
        successPatterns: [
          /webpack.*compiled.*in.*ms/i,
          /No issues found/i
        ],
        dependencies: [
          '@emotion/react',
          '@emotion/styled', 
          '@headlessui/react',
          '@heroicons/react',
          '@mui/icons-material',
          '@mui/material',
          'react',
          'react-dom',
          'typescript',
          'react-scripts'
        ]
      }
    ];
    
    this.activeProcesses = new Map();
    this.projectPaths = new Map();
    
    // Carrega caminhos salvos do arquivo TXT no AppData
    this.loadProjectPaths();
  }

  /**
   * Carrega caminhos dos projetos do arquivo TXT (igual ao padrão existente)
   */
  loadProjectPaths() {
    try {
      console.log('[ONBOARDING] 📂 Tentando carregar configurações de:', this.onboardingFile);
      
      if (fs.existsSync(this.onboardingFile)) {
        const data = fs.readFileSync(this.onboardingFile, 'utf-8');
        const config = JSON.parse(data);
        
        if (config.projectPaths) {
          this.projectPaths = new Map(Object.entries(config.projectPaths));
          console.log('[ONBOARDING] ✅ Caminhos carregados:', config.projectPaths);
        }
      } else {
        console.log('[ONBOARDING] 📄 Arquivo de configuração não encontrado, criando novo...');
        // Garante que o diretório existe
        if (!fs.existsSync(this.userDataPath)) {
          fs.mkdirSync(this.userDataPath, { recursive: true });
        }
      }
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao carregar configuração:', error);
    }
  }

  /**
   * Define o caminho do projeto e persiste
   */
  setProjectPath(projectName, projectPath) {
    console.log(`[ONBOARDING] 📁 Definindo caminho para ${projectName}: ${projectPath}`);
    console.log(`[ONBOARDING] 📊 Estado atual do Map:`, Object.fromEntries(this.projectPaths));
    
    this.projectPaths.set(projectName, projectPath);
    console.log(`[ONBOARDING] 📊 Novo estado do Map:`, Object.fromEntries(this.projectPaths));
    
    // Persiste no arquivo de configuração
    console.log(`[ONBOARDING] 💾 Chamando saveProjectPaths()...`);
    this.saveProjectPaths();
    
    console.log(`[ONBOARDING] ✅ Caminho definido com sucesso`);
    return { success: true };
  }

  /**
   * Salva caminhos dos projetos em arquivo TXT no AppData (igual ao padrão existente)
   */
  saveProjectPaths() {
    try {
      console.log('[ONBOARDING] 💾 Tentando salvar configuração...');
      console.log('[ONBOARDING] 📁 Arquivo de destino:', this.onboardingFile);
      console.log('[ONBOARDING] 📊 Estado atual do Map:', Object.fromEntries(this.projectPaths));
      
      const config = {
        projectPaths: Object.fromEntries(this.projectPaths),
        lastUpdated: new Date().toISOString()
      };
      
      console.log('[ONBOARDING] 📋 Dados para salvar:', config);
      
      // Garante que o diretório existe
      if (!fs.existsSync(this.userDataPath)) {
        console.log('[ONBOARDING] 📁 Criando diretório:', this.userDataPath);
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      
      // Salva no AppData igual aos outros projetos
      fs.writeFileSync(this.onboardingFile, JSON.stringify(config, null, 2), 'utf-8');
      console.log('[ONBOARDING] ✅ Configuração salva com sucesso em:', this.onboardingFile);
      
      // Verifica se o arquivo foi realmente criado
      if (fs.existsSync(this.onboardingFile)) {
        console.log('[ONBOARDING] ✅ Arquivo confirmado como criado');
      } else {
        console.error('[ONBOARDING] ❌ Arquivo não foi criado!');
      }
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao salvar configuração:', error);
      console.error('[ONBOARDING] ❌ Stack trace:', error.stack);
    }
  }

  /**
   * Obtém caminho do projeto
   */
  getProjectPath(projectName) {
    return this.projectPaths.get(projectName) || null;
  }

  /**
   * Verifica se projeto está instalado
   */
  isProjectInstalled(projectName) {
    const projectPath = this.projectPaths.get(projectName);
    if (!projectPath) return false;
    
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    const packageJsonPath = path.join(projectPath, 'package.json');
    
    return fs.existsSync(nodeModulesPath) && fs.existsSync(packageJsonPath);
  }

  /**
   * Verifica se um projeto está rodando
   */
  isProjectRunning(projectName) {
    return this.activeProcesses.has(projectName);
  }

  /**
   * Obtém o caminho de um projeto
   */
  getProjectPath(projectName) {
    return this.projectPaths.get(projectName);
  }

  /**
   * Clona um projeto onboarding
   */
  async cloneProject(projectName, targetPath, onProgress, onError) {
    const project = this.onboardingProjects.find(p => p.name === projectName);
    if (!project) {
      throw new Error(`Projeto ${projectName} não encontrado`);
    }

    return new Promise((resolve, reject) => {
      const gitClone = spawn('git', ['clone', project.url, targetPath], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      gitClone.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (onProgress) onProgress(chunk);
      });

      gitClone.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        if (onProgress) onProgress(chunk);
      });

      gitClone.on('close', (code) => {
        if (code === 0) {
          this.setProjectPath(projectName, targetPath);
          resolve({ success: true, output });
        } else {
          const error = `Erro ao clonar projeto: ${errorOutput}`;
          if (onError) onError(error);
          reject(new Error(error));
        }
      });

      gitClone.on('error', (error) => {
        const errorMsg = `Erro ao executar git clone: ${error.message}`;
        if (onError) onError(errorMsg);
        reject(new Error(errorMsg));
      });
    });
  }

  /**
   * Instala dependências de um projeto
   */
  async installDependencies(projectName, onProgress, onError) {
    const projectPath = this.getProjectPath(projectName);
    if (!projectPath) {
      throw new Error(`Caminho do projeto ${projectName} não encontrado`);
    }

    return new Promise((resolve, reject) => {
      const npmInstall = spawn('npm', ['install'], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      npmInstall.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (onProgress) onProgress(chunk);
      });

      npmInstall.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        if (onProgress) onProgress(chunk);
      });

      npmInstall.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          const error = `Erro ao instalar dependências: ${errorOutput}`;
          if (onError) onError(error);
          reject(new Error(error));
        }
      });

      npmInstall.on('error', (error) => {
        const errorMsg = `Erro ao executar npm install: ${error.message}`;
        if (onError) onError(errorMsg);
        reject(new Error(errorMsg));
      });
    });
  }

  /**
   * Inicia um projeto onboarding
   */
  async startProject(projectName, onOutput, onError, onSuccess) {
    const project = this.onboardingProjects.find(p => p.name === projectName);
    const projectPath = this.getProjectPath(projectName);
    
    if (!project || !projectPath) {
      throw new Error(`Projeto ${projectName} não encontrado ou não configurado`);
    }

    // Verifica se já está rodando
    if (this.isProjectRunning(projectName)) {
      throw new Error(`Projeto ${projectName} já está rodando`);
    }

    // Libera a porta antes de iniciar (igual ao PAS)
    console.log(`[ONBOARDING] 🔌 Liberando porta ${project.port} antes de iniciar ${projectName}...`);
    await this.killPortBeforeStart(project.port, onOutput);

    return new Promise((resolve, reject) => {
      // Constrói comando com Node.js portátil
      const nodeVersion = project.nodeVersion || project.defaultNodeVersion || '16.10.0';
      const portableNodePath = this.getPortableNodePath(nodeVersion);
      
      let command, args;
      
      if (portableNodePath && fs.existsSync(portableNodePath)) {
        // Usa Node.js portátil
        console.log(`[ONBOARDING] 🚀 Usando Node.js portátil v${nodeVersion}: ${portableNodePath}`);
        
        if (os.platform() === 'win32') {
          // Windows: usa npm.cmd do Node portátil
          const npmPath = path.join(path.dirname(portableNodePath), 'npm.cmd');
          command = npmPath;
          args = ['start'];
        } else {
          // Linux/Mac: usa npm do Node portátil
          const npmPath = path.join(path.dirname(portableNodePath), 'npm');
          command = npmPath;
          args = ['start'];
        }
      } else {
        // Fallback para npm global
        console.log(`[ONBOARDING] ⚠️ Node.js portátil v${nodeVersion} não encontrado, usando npm global`);
        const [cmd, ...cmdArgs] = project.startCommand.split(' ');
        command = cmd;
        args = cmdArgs;
      }
      
      console.log(`[ONBOARDING] 🖥️ Executando: ${command} ${args.join(' ')}`);
      
      const spawnOptions = {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env }, // Mantém variáveis de ambiente
        shell: true // IMPORTANTE: No Windows, arquivos .cmd precisam de shell
      };
      
      const projectProcess = spawn(command, args, spawnOptions);

      this.activeProcesses.set(projectName, projectProcess);

      let hasStarted = false;
      let output = '';

      projectProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        if (onOutput) onOutput(chunk);

        // Verifica se o projeto startou com sucesso
        if (!hasStarted && this.checkStartupSuccess(project, chunk)) {
          hasStarted = true;
          if (onSuccess) onSuccess();
          resolve({ success: true, process: projectProcess });
        }
      });

      projectProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        if (onOutput) onOutput(chunk);

        // Verifica se há erro de porta em uso (igual ao PAS)
        if (chunk.includes('EADDRINUSE') || chunk.includes('port') && chunk.includes('already') || 
            chunk.includes('Something is already running on port')) {
          console.log(`[ONBOARDING] 🔌 Porta ${project.port} já está em uso, tentando liberar...`);
          
          if (onOutput) onOutput(`🔌 Porta ${project.port} já está em uso, liberando...`);
          
          // Para o processo atual
          projectProcess.kill();
          this.activeProcesses.delete(projectName);
          
          // Libera a porta e reinicia
          this.killPortBeforeStart(project.port, onOutput).then(() => {
            if (onOutput) onOutput(`🔄 Reiniciando ${projectName} após liberação da porta...`);
            
            // Reinicia o projeto após liberar a porta
            setTimeout(() => {
              this.startProject(projectName, onOutput, onError, onSuccess)
                .then(resolve)
                .catch(reject);
            }, 1500);
          });
          
          return; // Sai do handler atual
        }

        // Verifica se o projeto startou com sucesso (alguns logs vão para stderr)
        if (!hasStarted && this.checkStartupSuccess(project, chunk)) {
          hasStarted = true;
          if (onSuccess) onSuccess();
          resolve({ success: true, process: projectProcess });
        }
      });

      projectProcess.on('close', (code) => {
        this.activeProcesses.delete(projectName);
        
        if (code !== 0 && !hasStarted) {
          const error = `Processo encerrado com código ${code}`;
          if (onError) onError(error);
          reject(new Error(error));
        }
      });

      projectProcess.on('error', (error) => {
        this.activeProcesses.delete(projectName);
        const errorMsg = `Erro ao iniciar projeto: ${error.message}`;
        if (onError) onError(errorMsg);
        reject(new Error(errorMsg));
      });
    });
  }

  /**
   * Para um projeto onboarding
   */
  stopProject(projectName) {
    const projectProcess = this.activeProcesses.get(projectName);
    
    if (projectProcess) {
      // No Windows, usa taskkill para matar toda a árvore de processos
      if (os.platform() === 'win32') {
        exec(`taskkill /pid ${projectProcess.pid} /T /F`, (error) => {
          if (error) console.warn(`Aviso ao encerrar processo ${projectName}:`, error.message);
        });
      } else {
        projectProcess.kill('SIGTERM');
        
        // Se não morrer em 5 segundos, força com SIGKILL
        setTimeout(() => {
          if (!projectProcess.killed) {
            projectProcess.kill('SIGKILL');
          }
        }, 5000);
      }
      
      this.activeProcesses.delete(projectName);
      return true;
    }
    
    return false;
  }

  /**
   * Para todos os projetos onboarding
   */
  stopAllProjects() {
    const stoppedProjects = [];
    
    for (const projectName of this.activeProcesses.keys()) {
      if (this.stopProject(projectName)) {
        stoppedProjects.push(projectName);
      }
    }
    
    return stoppedProjects;
  }

  /**
   * Verifica se o projeto startou com sucesso baseado nos padrões de output
   */
  checkStartupSuccess(project, output) {
    return project.successPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Obtém status de todos os projetos onboarding
   */
  getProjectsStatus() {
    return this.onboardingProjects.map(project => ({
      name: project.name,
      displayName: project.displayName,
      type: project.type,
      description: project.description,
      isInstalled: this.isProjectInstalled(project.name),
      isRunning: this.isProjectRunning(project.name),
      path: this.getProjectPath(project.name),
      port: project.port
    }));
  }

  /**
   * Obtém caminho do Node.js portátil
   */
  getPortableNodePath(nodeVersion) {
    const baseDir = path.join(__dirname, 'nodes');
    const osDir = os.platform() === 'win32' ? 'windows' : 
                  os.platform() === 'darwin' ? 'mac' : 'linux';
    
    const nodeDir = path.join(baseDir, osDir, `node-v${nodeVersion}-${os.platform() === 'win32' ? 'win-x64' : 'linux-x64'}`);
    const nodeExe = os.platform() === 'win32' ? 'node.exe' : 'node';
    
    return path.join(nodeDir, nodeExe);
  }

  /**
   * Define versão do Node.js para projeto
   */
  setNodeVersion(projectName, nodeVersion) {
    console.log(`[ONBOARDING] 🔧 Definindo Node.js v${nodeVersion} para ${projectName}`);
    
    const project = this.onboardingProjects.find(p => p.name === projectName);
    if (project) {
      project.nodeVersion = nodeVersion;
      project.defaultNodeVersion = nodeVersion;
      
      // Salva configuração em arquivo
      this.saveNodeVersionConfig(projectName, nodeVersion);
      
      console.log(`[ONBOARDING] ✅ Node.js v${nodeVersion} definido e salvo para ${projectName}`);
      return { success: true };
    } else {
      console.error(`[ONBOARDING] ❌ Projeto ${projectName} não encontrado`);
      return { success: false, error: 'Projeto não encontrado' };
    }
  }

  /**
   * Salva configuração de versão do Node.js em arquivo
   */
  saveNodeVersionConfig(projectName, nodeVersion) {
    try {
      const configPath = path.join(this.appDataPath, 'onboarding-node-versions.json');
      let configs = {};
      
      // Carrega configurações existentes
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        configs = JSON.parse(configData);
      }
      
      // Atualiza configuração
      configs[projectName] = nodeVersion;
      
      // Salva arquivo
      fs.writeFileSync(configPath, JSON.stringify(configs, null, 2));
      console.log(`[ONBOARDING] 💾 Configuração Node.js salva em: ${configPath}`);
      
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao salvar configuração Node.js:`, error);
    }
  }

  /**
   * Carrega configuração de versão do Node.js do arquivo
   */
  loadNodeVersionConfig(projectName) {
    try {
      const configPath = path.join(this.appDataPath, 'onboarding-node-versions.json');
      
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const configs = JSON.parse(configData);
        return configs[projectName] || '16.10.0';
      }
      
      return '16.10.0'; // Padrão
      
    } catch (error) {
      console.error(`[ONBOARDING] ❌ Erro ao carregar configuração Node.js:`, error);
      return '16.10.0'; // Padrão
    }
  }

  /**
   * Obtém configuração do Node.js para projeto
   */
  getNodeVersion(projectName) {
    // Primeiro tenta carregar do arquivo
    const savedVersion = this.loadNodeVersionConfig(projectName);
    
    // Se encontrou configuração salva, usa ela
    if (savedVersion !== '16.10.0') {
      return savedVersion;
    }
    
    // Senão, verifica o projeto em memória
    const project = this.onboardingProjects.find(p => p.name === projectName);
    return project ? project.nodeVersion || project.defaultNodeVersion || '16.10.0' : '16.10.0';
  }

  /**
   * Limpa todos os recursos
   */
  cleanup() {
    this.stopAllProjects();
    this.activeProcesses.clear();
    this.projectPaths.clear();
  }

  /**
   * Libera porta antes de iniciar projeto (igual ao PAS)
   */
  async killPortBeforeStart(port, onOutput) {
    return new Promise((resolve) => {
      console.log(`[ONBOARDING] 🔌 Verificando e liberando porta ${port}...`);
      
      if (onOutput) {
        onOutput(`🔌 Liberando porta ${port} se estiver em uso...`);
      }
      
      const { exec } = require('child_process');
      
      exec(`npx kill-port ${port}`, (err, stdout, stderr) => {
        if (err) {
          console.log(`[ONBOARDING] ⚠️ Erro ao liberar porta ${port}:`, err.message);
          if (onOutput) {
            onOutput(`⚠️ Porta ${port} pode não estar em uso ou erro ao liberar: ${err.message}`);
          }
        } else {
          console.log(`[ONBOARDING] ✅ Porta ${port} liberada com sucesso`);
          if (onOutput) {
            onOutput(`✅ Porta ${port} liberada com sucesso!`);
          }
        }
        
        // Aguarda um pouco para garantir que a porta foi liberada
        setTimeout(() => {
          console.log(`[ONBOARDING] ⏱️ Aguardando liberação da porta ${port}...`);
          resolve();
        }, 1000);
      });
    });
  }
}

module.exports = OnboardingManager;