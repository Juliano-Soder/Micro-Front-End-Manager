const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * 🎬 SPLASH SCREEN & LOADING MANAGER
 * Gerencia toda a lógica de splash screen, loading e pré-carregamento de dados
 */
class SplashManager {
  constructor() {
    this.splashWindow = null;
    this.userDataPath = app.getPath('userData');
    this.cacheFile = path.join(this.userDataPath, 'app-cache.json');
    this.loginStateFile = path.join(this.userDataPath, 'login-state.json');
    
    // Cache global para dados da aplicação
    this.appCache = {
      projects: null,
      onboardingProjects: null,
      nodePortableInfo: null,
      loginState: null,
      lastUpdate: 0
    };
  }

  // ⚡ FUNÇÃO HELPER PARA LOGS COMPATÍVEIS COM WINDOWS ⚡
  safeLog(message, type = 'info') {
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

  // 💾 GESTÃO DE CACHE 💾
  
  /**
   * Carrega cache na inicialização
   */
  loadAppCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        const cacheAge = Date.now() - cacheData.timestamp;
        
        // Cache é válido por 5 minutos
        if (cacheAge < 5 * 60 * 1000) {
          this.appCache = { ...cacheData };
          this.safeLog('[CACHE] Cache carregado com sucesso');
          return true;
        }
      }
    } catch (error) {
      console.log('Cache não encontrado ou inválido, será regenerado');
    }
    return false;
  }

  /**
   * Salva cache (excluindo dados dinâmicos como commits pendentes)
   */
  saveAppCache() {
    try {
      // Remove dados dinâmicos que nunca devem ser cachados
      const cleanCache = { ...this.appCache };
      
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
      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      this.safeLog('[CACHE] Cache salvo com sucesso (dados dinâmicos excluídos)');
    } catch (error) {
      console.error('Erro ao salvar cache:', error);
    }
  }

  // ⚡ FUNÇÕES DE PRÉ-CARREGAMENTO ⚡
  
  /**
   * Pré-carrega todos os dados críticos
   */
  async preloadCriticalData() {
    this.safeLog('[ROCKET] Pre-carregando dados criticos...');
    const startTime = Date.now();
    
    try {
      // Carrega dados em paralelo
      const promises = [];
      
      // Se não temos cache válido, carrega os dados
      if (!this.appCache.projects) {
        promises.push(this.preloadProjects());
      }
      
      if (!this.appCache.onboardingProjects) {
        promises.push(this.preloadOnboardingProjects());
      }
      
      if (!this.appCache.nodePortableInfo) {
        promises.push(this.preloadNodePortableInfo());
      }
      
      if (!this.appCache.loginState) {
        promises.push(this.preloadLoginState());
      }
      
      // Executa todas as operações em paralelo
      await Promise.allSettled(promises);
      
      // Salva o cache atualizado
      this.saveAppCache();
      
      const loadTime = Date.now() - startTime;
      this.safeLog(`[LIGHTNING] Pre-carregamento concluido em ${loadTime}ms`);
      
    } catch (error) {
      console.error('Erro durante pré-carregamento:', error);
    }
  }

  /**
   * Pré-carrega projetos PAS/PAMP
   */
  async preloadProjects() {
    try {
      const projectsContent = await fs.promises.readFile('projects.txt', 'utf-8');
      const projectNames = projectsContent.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      // Não sobrescreve a variável projects global, apenas salva no cache
      this.appCache.projects = projectNames;
      console.log(`[FOLDER] ${projectNames.length} projetos carregados no cache para pre-carregamento`);
    } catch (error) {
      console.log('Arquivo projects.txt não encontrado, será criado quando necessário');
      this.appCache.projects = [];
    }
  }

  /**
   * Pré-carrega projetos Onboarding
   */
  async preloadOnboardingProjects() {
    try {
      console.log('[ONBOARDING] 📋 Pré-carregando projetos de Onboarding...');
      
      // Usa o OnboardingManager para carregar projetos
      const OnboardingManager = require('./onboarding-manager');
      const onboardingManager = new OnboardingManager();
      
            const onboardingProjects = global.onboardingManager.getProjectsStatus();
      
      // Salva no cache
      this.appCache.onboardingProjects = onboardingProjects;
      console.log(`[ONBOARDING] ✅ ${onboardingProjects.length} projetos Onboarding carregados no cache`);
      
    } catch (error) {
      console.error('[ONBOARDING] ❌ Erro ao pré-carregar projetos Onboarding:', error);
      this.appCache.onboardingProjects = [];
    }
  }

  /**
   * Pré-carrega informações do Node.js portátil
   */
  async preloadNodePortableInfo() {
    try {
      console.log('🔍 Verificando instalações de Node.js portátil...');
      
      return new Promise((resolve) => {
        // Verifica apenas Node.js portátil - não mais sistema global
        const NodeInstaller = require('./node-installer');
        const nodeInstaller = new NodeInstaller(null);
        
        const depsInstalled = nodeInstaller.checkDependenciesInstalled();
        
        console.log(`✅ Status Node.js portátil: ${depsInstalled ? 'instalado' : 'não instalado'}`);
        
        this.appCache.nodePortableInfo = {
          installed: depsInstalled,
          message: depsInstalled ? 'Node.js portátil instalado' : 'Node.js portátil não instalado',
          available: depsInstalled,
          portable: true,
          confirmed: true
        };
        
        resolve();
      });
    } catch (error) {
      console.error('Erro ao verificar Node.js portátil:', error);
      this.appCache.nodePortableInfo = {
        installed: false,
        message: 'Erro na verificação',
        available: false,
        portable: true,
        confirmed: false
      };
      return Promise.resolve();
    }
  }

  /**
   * Pré-carrega estado de login
   */
  async preloadLoginState() {
    try {
      if (fs.existsSync(this.loginStateFile)) {
        const data = await fs.promises.readFile(this.loginStateFile, 'utf-8');
        this.appCache.loginState = JSON.parse(data);
      } else {
        this.appCache.loginState = { isLoggedIn: false };
      }
    } catch (error) {
      this.appCache.loginState = { isLoggedIn: false };
    }
  }

  // 🎬 SPLASH SCREEN 🎬
  
  /**
   * Cria e exibe a splash screen
   */
  createSplashWindow() {
    this.safeLog('[TOOL] Criando splash screen...');
    this.splashWindow = new BrowserWindow({
      width: 520,
      height: 420,
      frame: false,
      alwaysOnTop: true,
      transparent: false,
      backgroundColor: '#1e1e1e',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      },
      icon: path.join(__dirname, 'OIP.ico'),
      show: true,
      center: true,
      resizable: false,
      skipTaskbar: true
    });

    this.safeLog('[FOLDER] Carregando splash.html...');
    
    const splashHtml = this.getSplashHTML();
    this.splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
    
    this.splashWindow.webContents.once('did-finish-load', () => {
      console.log('💡 Splash screen HTML carregado diretamente');
      this.splashWindow.focus();
      
      // Detecta e aplica o tema atual
      this.applyThemeToSplash();
    });

    this.splashWindow.on('closed', () => {
      this.splashWindow = null;
    });

    return this.splashWindow;
  }

  /**
   * Aplica tema à splash screen
   */
  applyThemeToSplash() {
    try {
      // Busca a função loadConfig do main
      const settingsPath = path.join(this.userDataPath, 'config.json');
      let config = { darkMode: false }; // Padrão claro
      
      if (fs.existsSync(settingsPath)) {
        config = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      }
      
      const isDarkMode = config.darkMode === true;
      console.log(`🎨 Aplicando tema na splash: ${isDarkMode ? 'escuro' : 'claro'} (config.darkMode: ${config.darkMode})`);
      
      // Aguarda um pouco para garantir que o DOM esteja pronto
      setTimeout(() => {
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
          this.splashWindow.webContents.send('apply-dark-mode', isDarkMode);
        }
      }, 200);
      
    } catch (error) {
      console.log('Erro ao aplicar tema na splash:', error);
    }
  }

  /**
   * Retorna o HTML da splash screen
   */
  getSplashHTML() {
    return `
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
                  overflow: hidden;
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
                  'Inicializando aplicação...',
                  'Carregando configurações...',
                  'Verificando Node.js portátil...',
                  'Verificando autenticação...',
                  'Carregando projetos PAS/PAMP...',
                  'Carregando projetos Onboarding...',
                  'Finalizando carregamento...'
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
  }

  /**
   * Notifica que a aplicação principal está pronta
   */
  notifyMainAppReady() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send('main-app-ready');
    }
  }

  /**
   * Fecha a splash screen
   */
  closeSplash() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.close();
      this.splashWindow = null;
    }
  }

  /**
   * Verifica se a splash screen está ativa
   */
  isSplashActive() {
    return this.splashWindow && !this.splashWindow.isDestroyed();
  }

  /**
   * Retorna o cache da aplicação
   */
  getAppCache() {
    return this.appCache;
  }

  /**
   * Define o cache da aplicação
   */
  setAppCache(cache) {
    this.appCache = { ...this.appCache, ...cache };
  }
}

module.exports = SplashManager;