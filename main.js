const { app, BrowserWindow, ipcMain } = require('electron');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Menu } = require('electron');
const { spawn } = require('child_process');


const loginStateFile = path.join(__dirname, 'login-state.json');

// Salva o estado de login
function saveLoginState(isLoggedIn) {
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

function handleNpmLogin() {
  const mfePaths = projects
    .filter((project) => project.path && fs.existsSync(path.join(project.path, '.npmrc')))
    .map((project) => project.path);

  if (mfePaths.length === 0) {
    console.error('Nenhum projeto com arquivo .npmrc encontrado para login no npm.');
    mainWindow.webContents.send('log', { message: 'Erro: Nenhum projeto com arquivo .npmrc encontrado para login no npm.' });
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

  loginWindow.loadFile('login.html');

  loginWindow.webContents.once('did-finish-load', () => {
    loginWindow.webContents.send('start-npm-login', { projectPath, registry });
  });

  ipcMain.once('npm-login-complete', (event, { success, message }) => {
    if (success) {
      console.log('Login no npm realizado com sucesso.');
      mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
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

// Cria o menu da aplicação
const menuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Login npm',
        click: () => {
          handleNpmLogin(); // Chama a função handleNpmLogin ao clicar
        },
      },
      { role: 'quit' },
    ],
  },
];

// Define o menu
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

let mainWindow;
const projectsFile = path.join(__dirname, 'projects.txt');
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
  fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2), 'utf-8');
}

let projects = loadProjects();

app.on('ready', () => {
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

  ipcMain.on('login-success', () => {
    isLoggedIn = true;
    saveLoginState(isLoggedIn);
    mainWindow.webContents.send('log', { message: 'Logado no Nexus com sucesso!' });
  });

  ipcMain.on('load-login-state', (event) => {
    event.reply('login-state', isLoggedIn);
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
    event.reply('log', { path: projectPath, message: `Fazendo download do projeto: ${name}` });

    if (!fs.existsSync(workdir)) {
        console.log(`Criando diretório base: ${workdir}`);
        fs.mkdirSync(workdir, { recursive: true });
    }

    if (fs.existsSync(projectPath)) {
        console.log(`O projeto ${name} já existe em ${projectPath}.`);
        event.reply('log', { path: projectPath, message: `O projeto ${name} já existe em ${projectPath}.` });
        return;
    }

    exec(`git clone ${repoUrl} ${projectPath}`, (err, stdout, stderr) => {
        if (err) {
        console.error(`Erro ao clonar o repositório ${repoUrl}: ${err.message}`);
        event.reply('log', { path: projectPath, message: `Erro ao clonar o repositório ${repoUrl}: ${err.message}` });
        return;
        }

        console.log(`Projeto ${name} clonado com sucesso em ${projectPath}.`);
        event.reply('log', { path: projectPath, message: `Projeto baixado e disponível no caminho: ${projectPath}` });

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
        event.reply('log', { path: projectPath, message: 'Erro: Porta não definida.' });
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

  ipcMain.on('stop-project', (event, { projectPath, port }) => {
    console.log(`Parando projeto: ${projectPath} na porta: ${port}`);
    event.reply('status-update', { path: projectPath, status: 'stopping' }); // Atualiza para "Parando..."

    if (runningProcesses[projectPath]) {
        console.log(`Encerrando processo para ${projectPath}...`);
        runningProcesses[projectPath].kill();
        delete runningProcesses[projectPath];
        console.log(`Processo para ${projectPath} encerrado.`);
        event.reply('log', { path: projectPath, message: `Projeto parado na porta ${port}.` });
        event.reply('status-update', { path: projectPath, status: 'stopped' }); // Atualiza para "Parado"
    } else {
        if (os.platform() === 'win32') {
        // Localiza todos os processos relacionados à porta
        exec(`netstat -aon | findstr :${port}`, (err, stdout) => {
            if (err || !stdout) {
            event.reply('log', { path: projectPath, message: `Nenhum processo encontrado na porta ${port}.` });
            return;
            }

            // Extrai os PIDs dos processos
            const pids = stdout
            .split('\n')
            .map(line => line.trim().split(/\s+/).pop())
            .filter(pid => pid && !isNaN(pid));

            if (pids.length === 0) {
            event.reply('log', { path: projectPath, message: `Nenhum processo encontrado na porta ${port}.` });
            return;
            }

            // Itera sobre os PIDs e encerra cada processo
            pids.forEach(pid => {
            exec(`taskkill /PID ${pid} /F`, (killErr) => {
                if (killErr) {
                console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
                event.reply('log', { path: projectPath, message: `Erro ao encerrar o processo PID ${pid}: ${killErr.message}` });
                } else {
                console.log(`Processo PID ${pid} encerrado.`);
                event.reply('log', { path: projectPath, message: `Processo PID ${pid} encerrado.` });
                }
            });
            });

            // Atualiza o status para "Parado" após encerrar todos os processos
            event.reply('status-update', { path: projectPath, status: 'stopped' });
        });
        } else {
        // Comandos para Linux/Mac
        exec(`sudo lsof -i :${port}`, (err, stdout) => {
            if (err || !stdout) {
            event.reply('log', { path: projectPath, message: `Nenhum processo encontrado na porta ${port}.` });
            return;
            }

            // Extrai os PIDs dos processos
            const pids = stdout
            .split('\n')
            .slice(1) // Ignora o cabeçalho
            .map(line => line.trim().split(/\s+/)[1])
            .filter(pid => pid && !isNaN(pid));

            if (pids.length === 0) {
            event.reply('log', { path: projectPath, message: `Nenhum processo encontrado na porta ${port}.` });
            return;
            }

            // Itera sobre os PIDs e encerra cada processo
            pids.forEach(pid => {
                exec(`kill -9 ${pid}`, (killErr) => {
                    if (killErr) {
                    console.error(`Erro ao encerrar o processo PID ${pid}: ${killErr.message}`);
                    event.reply('log', { path: projectPath, message: `Erro ao encerrar o processo PID ${pid}: ${killErr.message}` });
                    } else {
                    console.log(`Processo PID ${pid} encerrado.`);
                    event.reply('log', { path: projectPath, message: `Processo PID ${pid} encerrado.` });
                    }
                });
            });

            // Atualiza o status para "Parado" após encerrar todos os processos
            event.reply('status-update', { path: projectPath, status: 'stopped' });
        });
        }
    }
  });

  function startProject(event, projectPath, port) {
    // Define o comando com base no nome do projeto
    const projectName = path.basename(projectPath); // Extrai o nome do projeto do caminho
    let command;

    // Ajusta o comando para projetos específicos
    if (projectName === 'mp-pas-root') {
      command = 'npm run start'; // Comando específico para o mp-pas-root
    } else if (projectName.startsWith('mp-pas-')) {
      command = `npm run serve:single-spa:${projectName.replace('mp-', '')}`;
    } else {
      command = 'npm run start'; // Comando padrão para outros projetos
    }

    console.log(`Executando comando: ${command} no caminho: ${projectPath}`);

    // Verifica se o diretório node_modules existe
    const nodeModulesPath = path.join(projectPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log(`Diretório node_modules não encontrado em ${projectPath}. Instalando dependências...`);
      event.reply('log', { path: projectPath, message: 'Instalando dependências com npm install...' });

      // Executa npm install
      const installProcess = exec('npm install', { cwd: projectPath });
      installProcess.stdout.on('data', (data) => {
        const cleanData = data.toString().trim();
        console.log(`[npm install] ${cleanData}`);
        event.reply('log', { path: projectPath, message: cleanData });
      });

      installProcess.stderr.on('data', (data) => {
        const cleanData = data.toString().trim();
        console.error(`[npm install] ${cleanData}`);
        event.reply('log', { path: projectPath, message: `Erro: ${cleanData}` });
      });

      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`Dependências instaladas com sucesso em ${projectPath}.`);
          event.reply('log', { path: projectPath, message: 'Dependências instaladas com sucesso.' });

          // Após instalar as dependências, inicia o projeto
          executeStartCommand(event, projectPath, command);
        } else {
          console.error(`Erro ao instalar dependências em ${projectPath}. Código: ${code}`);
          event.reply('log', { path: projectPath, message: `Erro ao instalar dependências. Código: ${code}` });
        }
      });
    } else {
      // Se node_modules já existir, inicia o projeto diretamente
      executeStartCommand(event, projectPath, command);
    }
  }

  function executeStartCommand(event, projectPath, command) {
    const process = exec(command, { cwd: projectPath });
    runningProcesses[projectPath] = process;

    process.stdout.on('data', (data) => {
      let cleanData;
      try {
        cleanData = removeAnsiCodes(data.toString().trim());
      } catch (err) {
        console.error('Erro ao limpar caracteres ANSI:', err);
        cleanData = data.toString().trim();
      }

      console.log(`[STDOUT] ${cleanData}`);
      event.reply('log', { path: projectPath, message: cleanData });

      // Detecta palavras-chave para atualizar o status
      if (
        cleanData.toLowerCase().includes('successfully') || 
        cleanData.includes('√ Compiled successfully.')
      ) {
        event.reply('status-update', { path: projectPath, status: 'running' });
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

      event.reply('log', { path: projectPath, message: `Erro: ${cleanData}` });
    });

    process.on('close', (code) => {
      delete runningProcesses[projectPath];
      if (code === 0) {
        event.reply('log', { path: projectPath, message: `Projeto iniciado com sucesso em ${projectPath}` });
      } else if (code) { // Apenas se houver código de erro
        event.reply('log', { path: projectPath, message: `O processo terminou com código ${code}` });
      } else {
        event.reply('status-update', { path: projectPath, status: 'stopped' }); // Atualiza para "Parado"
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
      event.reply('command-output', `Erro: ${data.toString()}`);
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

ipcMain.on('close-login-window', () => {
  if (terminalProcess) {
    terminalProcess.kill();
    terminalProcess = null;
  }
});

ipcMain.on('delete-project', (event, { index, path }) => {
  console.log(`Deletando projeto no caminho: ${path}`);
  event.reply('delete-project-log', { path, message: `Iniciando exclusão do projeto em ${path}...`, success: false });

  const deleteCommand = os.platform() === 'win32' ? `rmdir /s /q "${path}"` : `rm -rf "${path}"`;

  exec(deleteCommand, (err, stdout, stderr) => {
    if (err) {
      console.error(`Erro ao deletar o projeto: ${err.message}`);
      event.reply('delete-project-log', { path, message: `Erro ao deletar o projeto: ${err.message}`, success: false });
      return;
    }

    console.log(`Projeto deletado com sucesso: ${path}`);
    event.reply('delete-project-log', { path, message: `Projeto deletado com sucesso: ${path}`, success: true });

    projects[index].path = '';
    saveProjects(projects);
    event.reply('update-project', { index, path: '' });
  });
});
});