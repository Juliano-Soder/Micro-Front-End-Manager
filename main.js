const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Menu } = require('electron');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const url = require('url');
const userDataPath = app.getPath('userData');

require('events').EventEmitter.defaultMaxListeners = 50;


const loginStateFile = path.join(userDataPath, 'login-state.json');

// Salva o estado de login
function saveLoginState(isLoggedIn) {
  const dir = path.dirname(loginStateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(loginStateFile, JSON.stringify({ isLoggedIn }), 'utf-8');
}

// Carrega o estado de login
function loadLoginState() {
  if (fs.existsSync(loginStateFile)) {
    const data = fs.readFileSync(loginStateFile, 'utf-8');
    return JSON.parse(data).isLoggedIn;
  }
  return false;
}

function checkNexusLoginStatus() {
  return new Promise((resolve) => {
    const mfePaths = projects
      .filter(
        (project) =>
          typeof project.path === 'string' &&
          project.path.trim() !== "" &&
          fs.existsSync(project.path) &&
          fs.existsSync(path.join(project.path, '.npmrc'))
      )
      .map((project) => project.path);

    if (mfePaths.length === 0) {
      console.log('Nenhum projeto com .npmrc encontrado para verificar login.');
      resolve({ isLoggedIn: false, reason: 'no-projects', username: null });
      return;
    }

    const projectPath = mfePaths[0];
    const npmrcPath = path.join(projectPath, '.npmrc');
    let registry = 'http://nexus.viavarejo.com.br/repository/npm-marketplace/';
    
    if (fs.existsSync(npmrcPath)) {
      const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
      if (npmrcContent.includes('https://')) {
        registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/';
      }
    }

    console.log(`Verificando status de login no registry: ${registry}`);

    // Primeiro tenta npm whoami
    exec(`npm whoami --registry=${registry}`, { cwd: projectPath, timeout: 10000 }, (whoamiErr, whoamiStdout, whoamiStderr) => {
      if (!whoamiErr && whoamiStdout && whoamiStdout.trim()) {
        const username = whoamiStdout.trim();
        console.log(`Login verificado via whoami: ${username}`);
        resolve({ isLoggedIn: true, reason: 'whoami-success', username: username, registry: registry });
        return;
      }

      console.log(`npm whoami falhou, tentando npm ping...`);
      
      // Se whoami falhar, tenta npm ping
      exec(`npm ping --registry=${registry}`, { cwd: projectPath, timeout: 10000 }, (pingErr, pingStdout, pingStderr) => {
        if (!pingErr && pingStdout && pingStdout.includes('PONG')) {
          console.log('npm ping bem-sucedido, mas usuário pode não estar logado');
          resolve({ isLoggedIn: false, reason: 'ping-success-no-auth', username: null, registry: registry });
          return;
        }

        console.log('Ambos whoami e ping falharam, usuário provavelmente não está logado');
        resolve({ isLoggedIn: false, reason: 'both-failed', username: null, registry: registry });
      });
    });
  });
}

function handleNpmLogin() {
  console.log('Iniciando verificação de status de login no Nexus...');
  
  // Mostra uma mensagem de "verificando" para o usuário
  mainWindow.webContents.send('log', { message: 'Verificando status de login no Nexus...' });

  checkNexusLoginStatus().then(({ isLoggedIn, reason, username, registry }) => {
    if (isLoggedIn) {
      // Usuário já está logado
      console.log(`Usuário já está logado no Nexus: ${username}`);
      mainWindow.webContents.send('log', { message: `✓ Você já está logado no Nexus como: ${username}` });
      
      // Salva o estado de login
      saveLoginState(true);
      
      // Mostra dialog informativo
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Login já realizado',
        message: `Você já está logado no Nexus!`,
        detail: `Usuário: ${username}\nRegistry: ${registry}\n\nNão é necessário fazer login novamente.`,
        buttons: ['OK']
      });
      
      return;
    }

    // Usuário não está logado, procede com o login
    console.log(`Login necessário. Motivo: ${reason}`);
    
    if (reason === 'no-projects') {
      mainWindow.webContents.send('log', { message: 'Erro: Nenhum projeto com arquivo .npmrc encontrado para login no npm.' });

      // Mostra um alerta nativo para o usuário
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Atenção',
        message: 'Você precisa ter pelo menos um projeto salvo e o caminho configurado corretamente antes de fazer login no npm.',
        buttons: ['OK']
      });
      return;
    }

    // Continua com o processo de login
    performNpmLogin(registry);
  }).catch((error) => {
    console.error('Erro ao verificar status de login:', error);
    mainWindow.webContents.send('log', { message: `Erro ao verificar login: ${error.message}. Prosseguindo com login...` });
    
    // Em caso de erro na verificação, procede com login usando lógica antiga
    performNpmLoginFallback();
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

  console.log(`Iniciando processo de login no registry: ${registry}`);
  mainWindow.webContents.send('log', { message: `Iniciando login no Nexus (${registry})...` });

  // Cria uma nova janela para o terminal
  const loginWindow = new BrowserWindow({
    width: 600,
    height: 400,
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

  loginWindow.webContents.once('did-finish-load', () => {
    loginWindow.webContents.send('start-npm-login', { projectPath, registry });
  });

  ipcMain.once('npm-login-complete', (event, { success, message }) => {
    if (success) {
      console.log('Login no npm realizado com sucesso.');
      mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
      saveLoginState(true);
    } else {
      console.error('Erro ao realizar login no npm:', message);
      mainWindow.webContents.send('log', { message: `Erro no login: ${message}` });
    }
    loginWindow.close();
  });

  ipcMain.on('close-login-window', () => {
    loginWindow.close();
  });
}

function performNpmLoginFallback() {
  // Lógica de fallback usando a implementação original
  const mfePaths = projects
    .filter(
      (project) =>
        typeof project.path === 'string' &&
        project.path.trim() !== "" &&
        fs.existsSync(project.path) &&
        fs.existsSync(path.join(project.path, '.npmrc'))
    )
    .map((project) => project.path);

  if (mfePaths.length === 0) {
    console.error('Nenhum projeto com arquivo .npmrc encontrado para login no npm.');
    mainWindow.webContents.send('log', { message: 'Erro: Nenhum projeto com arquivo .npmrc encontrado para login no npm.' });

    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Atenção',
      message: 'Você precisa ter pelo menos um projeto salvo e o caminho configurado corretamente antes de fazer login no npm.',
      buttons: ['OK']
    });
    return;
  }

  const projectPath = mfePaths[0];
  const npmrcPath = path.join(projectPath, '.npmrc');
  let registry = 'https://nexus.viavarejo.com.br/repository/npm-marketplace/';
  if (fs.existsSync(npmrcPath)) {
    const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
    if (npmrcContent.includes('http://')) {
      registry = 'http://nexus.viavarejo.com.br/repository/npm-marketplace/';
    }
  }

  performNpmLogin(registry);
}

// Cria o menu da aplicação
const menuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Reiniciar Aplicativo',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
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
            }
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Login npm',
        click: () => {
          handleNpmLogin(); // Chama a função handleNpmLogin ao clicar
        },
      },
      {
        label: 'Verificar Status Nexus',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('check-nexus-status');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Instalar Dependências',
        click: () => {
          handleInstallDependencies(); // Chama a função para instalar dependências
        },
      },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
];

// Define o menu
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// Função para instalar dependências
function handleInstallDependencies() {
  const installWindow = new BrowserWindow({
    width: 600,
    height: 400,
    modal: true,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
  });

  installWindow.loadFile('install.html');

  installWindow.webContents.once('did-finish-load', () => {
    console.log('A janela de instalação foi carregada.');
    installWindow.webContents.send('start-installation');
  });

  ipcMain.on('close-install-window', () => {
    installWindow.close();
  });
}

let mainWindow;
const projectsFile = path.join(userDataPath, 'projects.txt');
let runningProcesses = {}; // Armazena os processos em execução

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
    { name: 'mp-pas-atendimento', path: '', port: 9012 },
    { name: 'mp-pamp', path: '', port: 4200 },
    { name: 'mp-pamp-setup', path: '', port: '' },
    { name: 'mp-pamp-comercial', path: '', port: '' },
    { name: 'mp-pamp-vendas', path: '', port: '' },
    { name: 'mp-pamp-catalogo', path: '', port: '' },
    { name: 'mp-pamp-marketplace', path: '', port: '' }
  ];

  if (fs.existsSync(projectsFile)) {
    const data = fs.readFileSync(projectsFile, 'utf-8');
    if (data.trim()) {
      const savedProjects = JSON.parse(data);

      // Mescla os projetos salvos com os padrões
      return defaultProjects.map((defaultProject) => {
        const savedProject = savedProjects.find(
          (project) => project.name === defaultProject.name
        );
        return savedProject
          ? { ...defaultProject, ...savedProject } // Substitui os valores padrão pelos salvos
          : defaultProject; // Mantém os valores padrão
      });
    }
  }

  // Retorna apenas os projetos padrão se o arquivo não existir ou estiver vazio
  return defaultProjects;
}

// Função para salvar os projetos
function saveProjects(projects) {
  const dir = path.dirname(projectsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
}

let projects = loadProjects();
let startingProjects = new Set(); // Para controlar projetos que estão sendo iniciados

app.on('ready', () => {
  // Remove todos os listeners IPC existentes para evitar duplicação em caso de reinício
  ipcMain.removeAllListeners();
  
  // Não precisa remover listeners específicos após removeAllListeners()
  
  let isLoggedIn = loadLoginState();
  let nodeVersion = null;
  let nodeWarning = null;
  let angularVersion = null;
  let angularWarning = null;

  try {
    // Verifica se o Node.js está no PATH
    const isNodeInPath = process.env.PATH.split(path.delimiter).some((dir) => {
      const nodePath = path.join(dir, 'node' + (os.platform() === 'win32' ? '.exe' : ''));
      return fs.existsSync(nodePath);
    });

    if (isNodeInPath) {
      // Executa o comando `node -v` para obter a versão
      nodeVersion = execSync('node -v').toString().trim();
      if (nodeVersion !== 'v16.10.0') {
        nodeWarning = `A versão ideal do Node.js é v16.10.0. A versão atual é ${nodeVersion}, o que pode causar problemas.`;
      }
    } else {
      console.error('Node.js não está no PATH do sistema.');
      nodeVersion = null; // Indica que o Node.js não está disponível
    }
  
  // Verifica se o Angular CLI está instalado
  try {
    const angularOutput = execSync('ng version').toString();
    const angularCliMatch = angularOutput.match(/Angular CLI: (\d+\.\d+\.\d+)/);
    if (angularCliMatch) {
      angularVersion = angularCliMatch[1];
      if (angularVersion !== '13.3.11') {
        angularWarning = `A versão ideal do Angular CLI é 13.3.11. A versão atual é ${angularVersion}, o que pode causar problemas.`;
      }
    }
  } catch (err) {
    console.error('Angular CLI não está instalado:', err.message);
    angularVersion = null; // Indica que o Angular CLI não está disponível
  }
 } catch (err) {
   console.error('Erro ao verificar o Node.js ou Angular CLI:', err.message);
 }
  

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'OIP.ico'), // Define o ícone personalizado
  });

  mainWindow.loadFile('index.html');

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
    isLoggedIn = true;
    saveLoginState(isLoggedIn);
    mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
  });

  ipcMain.on('load-login-state', (event) => {
    // Primeiro retorna o estado salvo
    event.reply('login-state', isLoggedIn);
    
    // Depois faz uma verificação em background para atualizar se necessário
    checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username }) => {
      if (actualLoginStatus !== isLoggedIn) {
        // O status real é diferente do salvo, atualiza
        isLoggedIn = actualLoginStatus;
        saveLoginState(isLoggedIn);
        event.reply('login-state', isLoggedIn);
        
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
  });

  ipcMain.on('check-nexus-status', (event) => {
    mainWindow.webContents.send('log', { message: 'Verificando status do Nexus...' });
    
    checkNexusLoginStatus().then(({ isLoggedIn: actualLoginStatus, username, registry, reason }) => {
      if (actualLoginStatus) {
        mainWindow.webContents.send('log', { message: `✓ Conectado ao Nexus como: ${username}` });
        
        // Atualiza o estado salvo se necessário
        if (!isLoggedIn) {
          isLoggedIn = true;
          saveLoginState(isLoggedIn);
          event.reply('login-state', isLoggedIn);
        }
      } else {
        let message = '❌ Não conectado ao Nexus';
        switch (reason) {
          case 'no-projects':
            message += ' (nenhum projeto configurado)';
            break;
          case 'ping-success-no-auth':
            message += ' (servidor acessível, mas não autenticado)';
            break;
          case 'both-failed':
            message += ' (falha na comunicação)';
            break;
        }
        mainWindow.webContents.send('log', { message });
        
        // Atualiza o estado salvo se necessário
        if (isLoggedIn) {
          isLoggedIn = false;
          saveLoginState(isLoggedIn);
          event.reply('login-state', isLoggedIn);
        }
      }
    }).catch((error) => {
      mainWindow.webContents.send('log', { message: `Erro ao verificar Nexus: ${error.message}` });
    });
  });

  ipcMain.on('load-node-info', (event) => {
    event.reply('node-info', { version: nodeVersion, warning: nodeWarning });
  });

  ipcMain.on('load-angular-info', (event) => {
    event.reply('angular-info', { version: angularVersion, warning: angularWarning });
  });

  ipcMain.on('download-project', (event, { name, index }) => {
    const workdir = path.join('C:/', 'projetos'); // Caminho base para os projetos
    const projectPath = path.join(workdir, name);
    const repoUrl = `https://github.com/viavarejo-internal/${name}.git`;

    console.log(`Iniciando download do projeto: ${name}`);
    if (name.startsWith('mp-pamp')) {
      event.reply('pamp-log', { 
        path: projectPath, 
        message: `Fazendo download do projeto: ${name}`,
        index: index,
        name: name
      });
    } else {
      event.reply('log', { 
        path: projectPath, 
        message: `Fazendo download do projeto: ${name}`
      });
    }

    if (!fs.existsSync(workdir)) {
        console.log(`Criando diretório base: ${workdir}`);
        fs.mkdirSync(workdir, { recursive: true });
    }

    if (fs.existsSync(projectPath)) {
        console.log(`O projeto ${name} já existe em ${projectPath}.`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `O projeto pamp ${name} já existe em ${projectPath}.`,
            index: index,
            name: name 
          });
        } else {
          event.reply('log', { path: projectPath, message: `O projeto pas ${name} já existe em ${projectPath}.` });
        }
        return;
    }

    exec(`git clone ${repoUrl} ${projectPath}`, (err, stdout, stderr) => {
        if (err) {
        console.error(`Erro ao clonar o repositório ${repoUrl}: ${err.message}`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `Erro ao clonar o repositório ${repoUrl}: ${err.message}`,
            index: index,
            name: name
          });
        } else {
          event.reply('log', { path: projectPath, message: `Erro ao clonar o repositório ${repoUrl}: ${err.message}` });
        }
        return;
        }

        console.log(`Projeto ${name} clonado com sucesso em ${projectPath}.`);
        if (name.startsWith('mp-pamp')) {
          event.reply('pamp-log', { 
            path: projectPath, 
            message: `Projeto baixado e disponível no caminho: ${projectPath}`,
            index: index,
            name: name
          });
        } else {
          event.reply('log', { path: projectPath, message: `Projeto baixado e disponível no caminho: ${projectPath}` });
        }

        projects[index].path = projectPath;
        saveProjects(projects); // Atualiza o arquivo `projects.txt`
        event.reply('projects-loaded', projects); // Atualiza o frontend
    });
  });

  ipcMain.on('load-projects', (event) => {
    event.reply('projects-loaded', projects);
    // Verifica se o login automático deve ser exibido
    const noPathsConfigured = projects.every((project) => !project.path);
    if (!isLoggedIn && noPathsConfigured) {
      console.log('Nenhum login detectado e nenhum projeto configurado. Exibindo login automático.');
      mainWindow.webContents.send('show-login');
    }
  });

  ipcMain.on('update-project-path', (event, { index, path }) => {
    projects[index].path = path;
    saveProjects(projects);
  });

  ipcMain.on('start-project', (event, { projectPath, port }) => {
    console.log(`Iniciando projeto: ${projectPath} na porta: ${port}`);
    if (!port) {
        event.reply('log', { path: projectPath, message: '- Porta não definida.' });
        return;
    }

    // Derruba qualquer processo rodando na porta
    exec(`npx kill-port ${port}`, (err) => {
      if (err) {
        event.reply('log', { path: projectPath, message: `Erro ao liberar a porta ${port}: ${err.message}` });
        return;
      }
      event.reply('log', { path: projectPath, message: `Porta ${port} liberada. Iniciando projeto...` });
    
      // Aguarda 10 segundos antes de iniciar o projeto
      setTimeout(() => {
        startProject(event, projectPath, port);
      }, 10000);
    });
  });

  ipcMain.on('start-project-pamp', (event, { projectPath, port }) => {
    console.log(`Iniciando projeto: ${projectPath} na porta: ${port}`);
    if (!port) {
        event.reply('pamp-log', { path: projectPath, message: 'Porta ainda não definida.' });
        startProject(event, projectPath, port);
    }else {
      // Derruba qualquer processo rodando na porta
      exec(`npx kill-port ${port}`, (err) => {
        if (err) {
          event.reply('pamp-log', { path: projectPath, message: `Erro ao liberar a porta ${port}: ${err.message}` });
          return;
        }
        event.reply('pamp-log', { path: projectPath, message: `Porta ${port} liberada. Iniciando projeto...` });
      
        // Aguarda 10 segundos antes de iniciar o projeto
        setTimeout(() => {
          startProject(event, projectPath, port);
        }, 9000);
      });
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

    if (runningProcesses[projectPath]) {
      console.log(`Encerrando processo para ${projectPath}...`);
      runningProcesses[projectPath].kill();
      delete runningProcesses[projectPath];
      console.log(`Processo para ${projectPath} encerrado.`);

      // Envia o log e atualiza o status para "Parado"
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: `Projeto parado.`,
          index: projectIndex,
          name: projectName
        });
      } else {
        event.reply('log', { path: projectPath, message: `Projeto parado na porta ${port}.` });
      }
      
      // Atualiza a UI para indicar que o processo foi parado
      event.reply('status-update', { 
        path: projectPath, 
        status: 'stopped',
        isPamp: isPampProject,
        index: projectIndex
      });
    } else {
        if (os.platform() === 'win32') {
          // Localiza todos os processos relacionados à porta
          exec(`netstat -aon | findstr :${port}`, (err, stdout) => {
            if (err || !stdout) {
              const message = `Nenhum processo encontrado na porta ${port}.`;
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
              
              // Mesmo que não tenha encontrado processos, atualiza a UI
              event.reply('status-update', { 
                path: projectPath, 
                status: 'stopped',
                isPamp: isPampProject,
                index: projectIndex
              });
              return;
            }

              // Extrai os PIDs dos processos
              const pids = stdout
              .split('\n')
              .map(line => line.trim().split(/\s+/).pop())
              .filter(pid => pid && !isNaN(pid));

              if (pids.length === 0) {
                const message = `Nenhum processo encontrado na porta ${port}.`;
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
                return;
              }

            // Itera sobre os PIDs e encerra cada processo
            pids.forEach(pid => {
              exec(`taskkill /PID ${pid} /F`, (killErr) => {
                  if (killErr) {
                    console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
                    const message = `Erro ao encerrar o processo PID ${pid}: ${killErr.message}`;
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
                  } else {
                    console.log(`Processo PID ${pid} encerrado.`);
                    const message = `Processo PID ${pid} encerrado.`;
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
                  }
              });
            });

            // Após matar os processos, atualiza o status para "Parado"
            event.reply('status-update', { 
              path: projectPath, 
              status: 'stopped',
              isPamp: isPampProject,
              index: projectIndex
            });
          });
        } else {

          // Comandos para Linux/Mac
          exec(`sudo lsof -i :${port}`, (err, stdout) => {
              if (err || !stdout) {
                event.reply('log', { path: projectPath, message: `Nenhum processo encontrado na porta ${port}.` });
                const message = `Nenhum processo encontrado na porta ${port}.`;
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
                return;
              }

              // Extrai os PIDs dos processos
              const pids = stdout
              .split('\n')
              .slice(1) // Ignora o cabeçalho
              .map(line => line.trim().split(/\s+/)[1])
              .filter(pid => pid && !isNaN(pid));

              if (pids.length === 0) {
                const message = `Nenhum processo encontrado na porta ${port}.`;
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
                return;
              }

              // Itera sobre os PIDs e encerra cada processo
              pids.forEach(pid => {
                  exec(`kill -9 ${pid}`, (killErr) => {
                      if (killErr) {
                        console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
                        const message = `Erro ao encerrar o processo PID ${pid}: ${killErr.message}.`;
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
                      } else {
                        console.log(`Processo PID ${pid} encerrado.`);
                        const message = `Processo PID ${pid} encerrado.`;
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
                      }
                  });
              });

              // Atualiza o status para "Parado" após encerrar todos os processos
              event.reply('status-update', { 
                path: projectPath, 
                status: 'stopped',
                isPamp: isPampProject,
                index: projectIndex
              });
          });
        }
      }
  });

  function startProject(event, projectPath, port) {
    // Define o comando com base no nome do projeto
    const projectName = path.basename(projectPath); // Extrai o nome do projeto do caminho
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);
    let command;

    // Ajusta o comando para projetos específicos
    if (projectName === 'mp-pas-root') {
      command = 'npm run start'; // Comando específico para o mp-pas-root
    } else if (projectName.startsWith('mp-pas-')) {
      command = `npm run serve:single-spa:${projectName.replace('mp-', '')}`;
    } else if (isPampProject) {
      command = 'ng serve';
    } else {
      command = 'npm run start'; // Comando padrão para outros projetos
    }
    
    console.log(`Executando comando: ${command} no caminho: ${projectPath}`);

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
      console.log(`[DEBUG] node_modules NÃO existe, executando npm install`);

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

      // Executa npm install
      const installProcess = exec('npm install', { cwd: projectPath });
      installProcess.stdout.on('data', (data) => {
        const cleanData = data.toString().trim();
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
      });

      installProcess.stderr.on('data', (data) => {
        const cleanData = data.toString().trim();
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
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
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
          
          const errorMessage = `Erro ao instalar dependências. Código: ${code}`;
          
          if (isPampProject) {
            event.reply('pamp-log', { 
              path: projectPath, 
              message: errorMessage,
              index: projectIndex,
              name: projectName,
              error: true
            });
            
            // Resetar botões do projeto PAMP
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
            
            // Resetar botões do projeto PAS
            event.reply('process-error', { path: projectPath });
          }
        }
      });
    } else {
      // Se node_modules já existir, abre o console e inicia o projeto diretamente
      event.reply('show-console', { path: projectPath, index: projectIndex, isPamp: isPampProject });
      executeStartCommand(event, projectPath, command, port);
    }
  }

  function executeStartCommand(event, projectPath, command, port) {
    const process = exec(command, { cwd: projectPath });
    runningProcesses[projectPath] = process;

    // Determine se é um projeto PAMP pelo nome do diretório
    const projectName = path.basename(projectPath);
    const isPampProject = projectName.startsWith('mp-pamp');
    const projectIndex = projects.findIndex(p => p.path === projectPath);

    // Variáveis para rastreamento de porta em uso
    let portInUseDetected = false;
    let detectedPort = null;
    let portInUseTimer = null;
    // Variável para controle de mensagens "Compiled successfully" apenas
    let lastSuccessTime = 0;

    process.stdout.on('data', (data) => {
      let cleanData;
      try {
        cleanData = removeAnsiCodes(data.toString().trim());
      } catch (err) {
        console.error('Erro ao limpar caracteres ANSI:', err);
        cleanData = data.toString().trim();
      }

      // Controle especial para mensagens "Compiled successfully" para evitar spam
      if (cleanData.includes('Compiled successfully')) {
        const now = Date.now();
        if (now - lastSuccessTime < 2000) {
          return; // Ignora se a última mensagem de sucesso foi há menos de 2 segundos
        }
        lastSuccessTime = now;
      }

      console.log(`[STDOUT] ${cleanData}`);

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
              
              // Informa o usuário
              if (isPampProject) {
                event.reply('pamp-log', { 
                  path: projectPath, 
                  message: nextMessage,
                  index: projectIndex,
                  name: projectName
                });
              } else {
                event.reply('log', { path: projectPath, message: nextMessage });
              }
              
              // Inicia o projeto novamente após um breve intervalo
              setTimeout(() => {
                console.log(`Reiniciando projeto ${projectName} após liberação de porta`);
                startProject(event, projectPath, detectedPort);
              }, 2000);
            });
          }, 500);
          
          return;
        }
      }

      // Envia o log para o frontend - SEMPRE envia, removendo a lógica de duplicação problemática
      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: cleanData,
          index: projectIndex,
          name: projectName
        });
      } else {
        event.reply('log', { path: projectPath, message: cleanData });
      }

      // Detecta palavras-chave para atualizar o status 
      if (
        cleanData.toLowerCase().includes('successfully') || 
        cleanData.includes('√ Compiled successfully.') ||
        cleanData.includes('** Angular Live Development Server is listening on') ||
        cleanData.includes('✓ Compiled successfully') ||
        cleanData.includes('ÔêÜ Compiled successfully') ||
        cleanData.includes('webpack compiled successfully') ||
        cleanData.includes('webpack') && cleanData.includes('compiled successfully')
      ) {
        console.log(`Projeto detectado como rodando: ${projectPath}`);
        event.reply('status-update', { 
          path: projectPath, 
          status: 'running',
          isPamp: isPampProject,
          index: projectIndex 
        });
      }
    });

    process.stderr.on('data', (data) => {
      let cleanData;
      try {
        cleanData = removeAnsiCodes(data.toString().trim());
      } catch (err) {
        console.error('Erro ao limpar caracteres ANSI:', err);
        cleanData = data.toString().trim();
      }

      if (isPampProject) {
        event.reply('pamp-log', { 
          path: projectPath, 
          message: `- ${cleanData}`,
          index: projectIndex,
          name: projectName
        });
      } else {
        event.reply('log', { path: projectPath, message: `- ${cleanData}` });
      }
    });
    
    process.on('close', (code) => {
      delete runningProcesses[projectPath];
      
      // Remove proteção de início múltiplo
      const projectKey = `${projectPath}:${port || ''}`;
      startingProjects.delete(projectKey);
      console.log(`[DEBUG] Processo terminou, removido ${projectKey} da proteção`);
      
      // Adicione esta verificação para códigos de erro
      const isError = code !== 0 && code !== null;
      
      // Obter a versão atual do Node.js
      let nodeVersionInfo = '';
      try {
        nodeVersionInfo = execSync('node -v').toString().trim();
      } catch (err) {
        console.error('Erro ao obter versão do Node.js:', err);
        nodeVersionInfo = 'desconhecida';
      }
      
      // Verifica se é erro de sintaxe específico do Node.js em projetos PAMP
      const isNodeVersionError = code === 1 && 
                                isPampProject && 
                                nodeVersionInfo !== 'v16.10.0';
      
      // Mensagem base
      let message = code === 0 
        ? `Projeto iniciado com sucesso em ${projectPath}` 
        : isError 
            ? `O processo terminou com código de erro ${code}` 
            : '';
            
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
  let terminalProcess;

ipcMain.on('execute-command', (event, command) => {
  if (!terminalProcess) {
    // Inicializa o terminal real
    terminalProcess = spawn('cmd.exe', [], { shell: true });

    terminalProcess.stdout.on('data', (data) => {
      event.reply('command-output', data.toString());
    });

    terminalProcess.stderr.on('data', (data) => {
      event.reply('command-output', `- ${data.toString()}`);
    });

    terminalProcess.on('close', () => {
      terminalProcess = null;
    });
  }

  // Envia o comando para o terminal real
  if (terminalProcess) {
    terminalProcess.stdin.write(`${command}\n`);
    }
  });

  ipcMain.on('delete-project', (event, { index, path }) => {
    console.log(`Deletando projeto no caminho: ${path}`);
    event.reply('delete-project-log', { path, message: `Iniciando exclusão do projeto em ${path}...`, success: false, index });

    const deleteCommand = os.platform() === 'win32' ? `rmdir /s /q "${path}"` : `rm -rf "${path}"`;

    exec(deleteCommand, (err, stdout, stderr) => {
      if (err) {
        console.error(`Erro ao deletar o projeto: ${err.message}`);
        event.reply('delete-project-log', { path, message: `Erro ao deletar o projeto: ${err.message}`, success: false, index });
      }

      console.log(`Projeto deletado com sucesso: ${path}`);
      event.reply('delete-project-log', { path, message: `Projeto deletado com sucesso: ${path}`, success: true, index });

      projects[index].path = '';
      saveProjects(projects);
      event.reply('update-project', { index, path: '' });
    });
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

  ipcMain.once('start-installation', async (event) => {

    console.log('Iniciando instalação do Node.js e Angular CLI...');

    event.reply('installation-log', 'Iniciando instalação do Node.js e Angular CLI...');
    event.reply('installation-log', 'Passo 1: Verificando Node.js...');

    const sendLog = (message) => {
      console.log(message); // Log no console para depuração
      event.reply('installation-log', message); // Envia o log para a janela de instalação
    };
  
    const installNodeWindows = async () => {
      sendLog('Passo 1: Verificando Node.js...');
      
      // Primeira verificação: Node.js já está na versão correta?
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        sendLog(`Node.js encontrado: ${nodeVersion}`);
        if (nodeVersion === 'v16.10.0') {
          sendLog('✓ Node.js já está instalado na versão 16.10.0.');
          sendLog('Nenhuma ação necessária para o Node.js.');
          return Promise.resolve();
        } else {
          sendLog(`⚠️ Versão atual: ${nodeVersion} (recomendada: v16.10.0)`);
          sendLog('IMPORTANTE: Se você já tem projetos funcionando com esta versão,');
          sendLog('pode não ser necessário fazer upgrade. Prosseguindo com verificações...');
        }
      } catch {
        sendLog('Node.js não encontrado no PATH do sistema.');
      }

      // Segunda verificação: NVM está instalado?
      sendLog('Verificando se NVM (Node Version Manager) está disponível...');
      try {
        const nvmVersion = execSync('nvm version', { encoding: 'utf8' }).trim();
        sendLog(`✓ NVM encontrado: ${nvmVersion}`);
        
        // Se NVM existe, verifica se Node.js 16.10.0 já está instalado via NVM
        try {
          const nvmList = execSync('nvm list', { encoding: 'utf8' });
          if (nvmList.includes('16.10.0')) {
            sendLog('✓ Node.js 16.10.0 já está instalado via NVM.');
            sendLog('Ativando Node.js 16.10.0...');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 ativado com sucesso.');
            return Promise.resolve();
          } else {
            sendLog('Node.js 16.10.0 não encontrado. Instalando via NVM...');
            await execPromise('nvm install 16.10.0');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 instalado e ativado via NVM.');
            return Promise.resolve();
          }
        } catch (nvmListError) {
          sendLog('Erro ao listar versões do NVM. Tentando instalar Node.js 16.10.0...');
          try {
            await execPromise('nvm install 16.10.0');
            await execPromise('nvm use 16.10.0');
            sendLog('✓ Node.js 16.10.0 instalado e ativado via NVM.');
            return Promise.resolve();
          } catch (installError) {
            sendLog(`Erro ao instalar via NVM existente: ${installError.message}`);
            sendLog('Prosseguindo com método alternativo...');
          }
        }
      } catch {
        sendLog('NVM não encontrado no sistema.');
      }

      // Terceira verificação: Se Node.js existe mas não é a versão ideal
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        if (nodeVersion && nodeVersion !== 'v16.10.0') {
          sendLog('═══════════════════════════════════════════════════════════════');
          sendLog('⚠️  ATENÇÃO: Node.js já está instalado em uma versão diferente!');
          sendLog(`   Versão atual: ${nodeVersion}`);
          sendLog(`   Versão recomendada: v16.10.0`);
          sendLog('');
          sendLog('OPÇÕES DISPONÍVEIS:');
          sendLog('1. Manter a versão atual (pode funcionar para a maioria dos casos)');
          sendLog('2. Instalar NVM para gerenciar múltiplas versões');
          sendLog('3. Substituir por Node.js 16.10.0 (pode afetar outros projetos)');
          sendLog('');
          sendLog('Por segurança, mantendo a versão atual instalada.');
          sendLog('Se houver problemas, considere instalar o NVM manualmente.');
          sendLog('═══════════════════════════════════════════════════════════════');
          return Promise.resolve();
        }
      } catch {
        // Node.js não existe, prosseguir com instalação
      }

      // Quarta opção: Instalar NVM apenas se nada foi encontrado
      sendLog('');
      sendLog('Nenhuma instalação adequada do Node.js ou NVM foi encontrada.');
      sendLog('Iniciando instalação do NVM para gerenciamento de versões...');

      try {
        // Download e instalação do NVM (apenas se nada foi encontrado)
        const nvmDir = path.join(os.homedir(), 'nvm');
        sendLog(`Criando diretório NVM em: ${nvmDir}`);
        
        if (!fs.existsSync(nvmDir)) {
          fs.mkdirSync(nvmDir, { recursive: true });
        }

        const nvmZipUrl = 'https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-noinstall.zip';
        const nvmZipPath = path.join(os.tmpdir(), 'nvm-noinstall.zip');
        
        sendLog('Baixando NVM for Windows...');
        await downloadFileWithRetry(nvmZipUrl, nvmZipPath);
        
        sendLog('Extraindo NVM...');
        await extractZip(nvmZipPath, nvmDir);
        
        // Adicionar NVM ao PATH do usuário
        sendLog('Configurando NVM no PATH...');
        await addToUserPath(nvmDir);
        
        // Configurar NVM
        const settingsPath = path.join(nvmDir, 'settings.txt');
        const settingsContent = `root: ${nvmDir}\npath: ${path.join(nvmDir, 'nodejs')}\n`;
        fs.writeFileSync(settingsPath, settingsContent);
        
        sendLog('Aguardando configuração do PATH (10 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Instalar Node.js via NVM
        sendLog('Instalando Node.js 16.10.0 via NVM recém-instalado...');
        await execPromise(`"${path.join(nvmDir, 'nvm.exe')}" install 16.10.0`);
        await execPromise(`"${path.join(nvmDir, 'nvm.exe')}" use 16.10.0`);
        
        sendLog('✓ NVM e Node.js 16.10.0 instalados com sucesso.');
        
      } catch (error) {
        sendLog(`Erro na instalação via NVM: ${error.message}`);
        sendLog('Tentando instalação direta do Node.js como último recurso...');
        
        // Fallback: instalação direta (apenas se tudo falhar)
        const installerUrl = 'https://nodejs.org/dist/v16.10.0/node-v16.10.0-x64.msi';
        const installerPath = path.join(os.tmpdir(), 'node-v16.10.0-x64.msi');
        
        sendLog('Baixando instalador oficial do Node.js...');
        await downloadFileWithRetry(installerUrl, installerPath);
        
        sendLog('Executando instalador do Node.js... (Isso pode demorar alguns minutos)');
        sendLog('AVISO: Esta instalação pode substituir versões existentes do Node.js!');
        await execPromise(`msiexec /i "${installerPath}" /quiet /norestart`);
        
        sendLog('Aguardando finalização da instalação (30 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        sendLog('✓ Node.js instalado com sucesso via instalador MSI.');
      }
    };

    const installNodeLinux = async () => {
      sendLog('Detectado sistema Linux. Verificando Node.js...');
      
      // Verifica se Node.js já está instalado na versão correta
      try {
        const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
        sendLog(`Node.js encontrado: ${nodeVersion}`);
        if (nodeVersion === 'v16.10.0') {
          sendLog('✓ Node.js já está instalado na versão 16.10.0.');
          sendLog('Nenhuma ação necessária para o Node.js.');
          return Promise.resolve();
        } else {
          sendLog(`⚠️ Versão atual: ${nodeVersion} (recomendada: v16.10.0)`);
          sendLog('IMPORTANTE: Se você já tem projetos funcionando com esta versão,');
          sendLog('pode não ser necessário fazer upgrade. Prosseguindo com instalação...');
        }
      } catch {
        sendLog('Node.js não encontrado. Instalando Node.js 16.x...');
      }

      try {
        // Usar NodeSource repository para versão específica
        sendLog('Configurando repositório NodeSource...');
        await execPromise('curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -');
        
        sendLog('Instalando Node.js 16.x...');
        await execPromise('sudo apt-get install -y nodejs');
        
        sendLog('✓ Node.js instalado com sucesso no Linux.');
      } catch (error) {
        sendLog(`Erro na instalação no Linux: ${error.message}`);
        throw error;
      }
    };

    const installNode = () => {
      if (os.platform() === 'win32') {
        return installNodeWindows();
      } else {
        return installNodeLinux();
      }
    };
  
    const installAngular = async () => {
      sendLog('Passo 2: Verificando Angular CLI...');
      try {
        const angularVersion = execSync('ng version', { encoding: 'utf8' });
        sendLog(`Angular CLI encontrado: ${angularVersion.split('\n')[0]}`);
        if (angularVersion.includes('13.3.11')) {
          sendLog('Angular CLI já está instalado na versão 13.3.11.');
          return Promise.resolve();
        } else {
          sendLog('Versão diferente encontrada. Instalando versão 13.3.11...');
        }
      } catch {
        sendLog('Angular CLI não encontrado. Iniciando instalação...');
      }

      try {
        sendLog('Verificando se npm está disponível...');
        execSync('npm --version', { encoding: 'utf8' });
        sendLog('npm encontrado. Instalando Angular CLI...');
        
        // Primeiro desinstala versões existentes
        sendLog('Removendo versões anteriores do Angular CLI...');
        try {
          await execPromise('npm uninstall -g @angular/cli');
        } catch {
          // Ignora erro se não existir
        }
        
        sendLog('Instalando Angular CLI versão 13.3.11... (Isso pode demorar alguns minutos)');
        await execPromise('npm install -g @angular/cli@13.3.11');
        
        sendLog('Verificando instalação do Angular CLI...');
        const installedVersion = execSync('ng version', { encoding: 'utf8' });
        sendLog(`Angular CLI instalado com sucesso: ${installedVersion.split('\n')[0]}`);
        
      } catch (error) {
        throw new Error(`Erro ao instalar Angular CLI: ${error.message}`);
      }
    };

    console.log('Iniciando instalação do Node.js e Angular CLI...');
    sendLog('=== INSTALAÇÃO DE DEPENDÊNCIAS ===');
    sendLog('ATENÇÃO: Este processo pode demorar vários minutos.');
    sendLog('Mantenha a janela aberta e aguarde a conclusão.');
    sendLog('Você pode fechar esta janela a qualquer momento clicando no [X].');
    sendLog('');
  
    try {
      await installNode();
      sendLog('');
      sendLog('✓ Node.js configurado com sucesso!');
      sendLog('');
      
      await installAngular();
      sendLog('');
      sendLog('✓ Angular CLI configurado com sucesso!');
      sendLog('');
      
      sendLog('=== INSTALAÇÃO CONCLUÍDA ===');
      sendLog('Todas as dependências foram instaladas com sucesso!');
      sendLog('RECOMENDAÇÃO: Reinicie o aplicativo para garantir que as');
      sendLog('novas versões sejam reconhecidas corretamente.');
      sendLog('Você pode usar: Ctrl+R ou F5 ou Menu > File > Reiniciar Aplicativo');
      event.reply('installation-complete');
      
      // Mostra dialog sugerindo reinício após pequeno delay
      setTimeout(() => {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Instalação Concluída',
          message: 'Dependências instaladas com sucesso!',
          detail: 'Recomendamos reiniciar o aplicativo para garantir que as novas versões sejam reconhecidas corretamente.\n\nDeseja reiniciar agora?',
          buttons: ['Agora não', 'Reiniciar Agora'],
          defaultId: 1,
          cancelId: 0
        }).then((result) => {
          if (result.response === 1) {
            console.log('Reiniciando aplicativo após instalação...');
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
      }, 2000); // 2 segundos de delay para não interferir com o fechamento da janela de instalação
      
    } catch (err) {
      sendLog('');
      sendLog('❌ ERRO DURANTE A INSTALAÇÃO:');
      sendLog(`Detalhes: ${err.message}`);
      sendLog('');
      sendLog('SUGESTÕES:');
      sendLog('1. Verifique sua conexão com a internet');
      sendLog('2. Execute o aplicativo como administrador');
      sendLog('3. Desative temporariamente o antivírus');
      sendLog('4. Tente novamente em alguns minutos');
      sendLog('');
      sendLog('Se o problema persistir, você pode instalar manualmente:');
      sendLog('- Node.js 16.10.0: https://nodejs.org/dist/v16.10.0/');
      sendLog('- Angular CLI: npm install -g @angular/cli@13.3.11');
    }
  });

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
});