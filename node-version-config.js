const path = require('path');
const os = require('os');
const { app } = require('electron');

/**
 * Determina o diretório base para instalação do Node.js portátil
 * Em desenvolvimento: usa pasta dentro do projeto
 * Em produção Windows: usa pasta na raiz da instalação (mesma pasta do .exe)
 * Em produção Linux: usa pasta userData do usuário para evitar problemas de permissão
 */
function getNodesBasePath() {
  // Em desenvolvimento: usa pasta dentro do projeto
  if (!app.isPackaged) {
    return path.join(__dirname, 'nodes');
  }
  
  // Em produção: determina baseado no SO
  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows: usa pasta na raiz da instalação (mesma pasta do .exe)
    return path.join(path.dirname(app.getPath('exe')), 'nodes');
  } else {
    // Linux/Mac: usa pasta userData do usuário para evitar problemas de permissão
    return path.join(app.getPath('userData'), 'nodes');
  }
}

/**
 * Determina o SO atual
 */
function getCurrentOS() {
  const platform = os.platform();
  const arch = os.arch();
  
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  if (platform === 'darwin') {
    // Detecta Mac M1/M2 (ARM64) vs Intel (x64)
    return arch === 'arm64' ? 'mac-arm64' : 'mac';
  }
  return 'linux';
}

/**
 * Configurações de versões do Node.js disponíveis
 */
const NODE_VERSIONS = {
  '16.10.0': {
    version: '16.10.0',
    folderName: {
      windows: 'node-v16.10.0-win-x64',
      linux: 'node-v16.10.0-linux-x64',
      mac: 'node-v16.10.0-darwin-x64'
    },
    angularVersion: '13',
    angularPackage: '@angular/cli@13.3.11',
    urls: {
      windows: 'https://nodejs.org/download/release/v16.10.0/node-v16.10.0-win-x64.zip',
      linux: 'https://nodejs.org/download/release/v16.10.0/node-v16.10.0-linux-x64.tar.xz',
      mac: 'https://nodejs.org/download/release/v16.10.0/node-v16.10.0-darwin-x64.tar.gz'
    }
  },
  '18.18.2': {
    version: '18.18.2',
    folderName: {
      windows: 'node-v18.18.2-win-x64',
      linux: 'node-v18.18.2-linux-x64',
      mac: 'node-v18.18.2-darwin-x64'
    },
    angularVersion: '15',
    angularPackage: '@angular/cli@15.2.10',
    urls: {
      windows: 'https://nodejs.org/download/release/v18.18.2/node-v18.18.2-win-x64.zip',
      linux: 'https://nodejs.org/download/release/v18.18.2/node-v18.18.2-linux-x64.tar.xz',
      mac: 'https://nodejs.org/download/release/v18.18.2/node-v18.18.2-darwin-x64.tar.gz'
    }
  },
  '18.20.4': {
    version: '18.20.4',
    folderName: {
      windows: 'node-v18.20.4/node-v18.20.4-win-x64',
      linux: 'node-v18.20.4-linux-x64',
      mac: 'node-v18.20.4-darwin-x64'
    },
    angularVersion: '15',
    angularPackage: '@angular/cli@15.2.10',
    urls: {
      windows: 'https://nodejs.org/download/release/v18.20.4/node-v18.20.4-win-x64.zip',
      linux: 'https://nodejs.org/download/release/v18.20.4/node-v18.20.4-linux-x64.tar.xz',
      mac: 'https://nodejs.org/download/release/v18.20.4/node-v18.20.4-darwin-x64.tar.gz'
    }
  },
  '20.19.5': {
    version: '20.19.5',
    folderName: {
      windows: 'node-v20.19.5-win-x64',
      linux: 'node-v20.19.5-linux-x64',
      mac: 'node-v20.19.5-darwin-x64',
      'mac-arm64': 'node-v20.19.5-darwin-arm64'
    },
    angularVersion: '18',
    angularPackage: '@angular/cli@18.2.0',
    urls: {
      windows: 'https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip',
      linux: 'https://nodejs.org/dist/v20.19.5/node-v20.19.5-linux-x64.tar.xz',
      mac: 'https://nodejs.org/dist/v20.19.5/node-v20.19.5-darwin-x64.tar.gz',
      'mac-arm64': 'https://nodejs.org/dist/v20.19.5/node-v20.19.5-darwin-arm64.tar.gz'
    }
  }
};

/**
 * Versões padrão por projeto
 */
const DEFAULT_PROJECT_VERSIONS = {
  'mp-pas-configuracoes': '20.19.5',
  'mp-pas-root': '16.10.0',
  'mp-pamp': '16.10.0',
  // Adicione outros projetos conforme necessário
};

/**
 * Função para obter versão padrão de um projeto
 */
function getDefaultNodeVersion(projectName) {
  return DEFAULT_PROJECT_VERSIONS[projectName] || '16.10.0';
}

/**
 * Obtém o caminho do executável Node.js para uma versão específica
 */
function getNodeExecutablePath(nodeVersion, currentOS = null) {
  const os = currentOS || getCurrentOS();
  const nodesBasePath = getNodesBasePath();
  const versionConfig = NODE_VERSIONS[nodeVersion];
  
  if (!versionConfig) {
    throw new Error(`Versão do Node.js não configurada: ${nodeVersion}`);
  }
  
  // Suporte para folderName como string ou objeto
  const folderName = typeof versionConfig.folderName === 'object' 
    ? versionConfig.folderName[os] 
    : versionConfig.folderName;
  
  const nodeDir = path.join(nodesBasePath, os, folderName);
  
  if (os === 'windows') {
    return {
      nodeExe: path.join(nodeDir, 'node.exe'),
      npmCmd: path.join(nodeDir, 'npm.cmd'),
      ngCmd: path.join(nodeDir, 'ng.cmd'), // Após npm install -g, o ng.cmd fica na raiz
      nodeDir: nodeDir
    };
  } else {
    return {
      nodeExe: path.join(nodeDir, 'bin', 'node'),
      npmCmd: path.join(nodeDir, 'bin', 'npm'),
      ngCmd: path.join(nodeDir, 'bin', 'ng'),
      nodeDir: nodeDir
    };
  }
}

module.exports = {
  NODE_VERSIONS,
  DEFAULT_PROJECT_VERSIONS,
  getNodesBasePath,
  getCurrentOS,
  getDefaultNodeVersion,
  getNodeExecutablePath
};
