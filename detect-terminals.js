/**
 * 🖥️ DETECTOR DE TERMINAIS DO SISTEMA
 * Detecta IDEs/Terminais disponíveis no sistema operacional
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TerminalDetector {
  constructor() {
    this.platform = os.platform();
    this.detectedTerminals = [];
  }

  /**
   * Detecta todos os terminais disponíveis
   */
  async detectAll() {
    this.detectedTerminals = [];

    if (this.platform === 'win32') {
      await this.detectWindowsTerminals();
    } else if (this.platform === 'darwin') {
      await this.detectMacTerminals();
    } else if (this.platform === 'linux') {
      await this.detectLinuxTerminals();
    }

    console.log(`[TERMINALS] Detectados ${this.detectedTerminals.length} terminais:`, 
      this.detectedTerminals.map(t => t.name).join(', '));

    return this.detectedTerminals;
  }

  /**
   * Detecta terminais no Windows
   */
  async detectWindowsTerminals() {
    const terminals = [
      {
        name: 'PowerShell',
        command: 'powershell.exe',
        args: ['-NoExit', '-Command', 'cd {path}'],
        description: 'PowerShell (padrão)',
        icon: '⚡',
        isDefault: true
      },
      {
        name: 'Command Prompt',
        command: 'cmd.exe',
        args: ['/k', 'cd /d {path}'],
        description: 'Command Prompt (cmd)',
        icon: '⬛'
      },
      {
        name: 'Git Bash',
        command: 'bash.exe',
        args: ['--login', '-i'],
        description: 'Git Bash (MINGW64)',
        icon: '🔧',
        envVars: { CHERE_INVOKING: '1' }
      },
      {
        name: 'Windows Terminal',
        command: 'wt.exe',
        args: ['-d', '{path}'],
        description: 'Windows Terminal (novo)',
        icon: '🔷'
      },
      {
        name: 'WSL (Bash)',
        command: 'wsl.exe',
        args: ['-d', 'Ubuntu', '--cd', '{path}'],
        description: 'WSL - Windows Subsystem for Linux',
        icon: '🐧'
      }
    ];

    // Verifica quais terminais estão disponíveis
    for (const terminal of terminals) {
      if (await this.isTerminalAvailable(terminal.command)) {
        this.detectedTerminals.push(terminal);
      }
    }

    // Se nenhum foi detectado, adiciona pelo menos o PowerShell (sempre disponível)
    if (this.detectedTerminals.length === 0) {
      this.detectedTerminals.push(terminals[0]); // PowerShell
    }
  }

  /**
   * Detecta terminais no macOS
   */
  async detectMacTerminals() {
    const terminals = [
      {
        name: 'Terminal',
        command: 'open',
        args: ['-a', 'Terminal', '{path}'],
        description: 'Terminal (padrão)',
        icon: '🖥️',
        isDefault: true
      },
      {
        name: 'iTerm2',
        command: 'open',
        args: ['-a', 'iTerm', '{path}'],
        description: 'iTerm2 (melhorado)',
        icon: '🔵'
      }
    ];

    for (const terminal of terminals) {
      // No macOS, Terminal e iTerm são sempre "disponíveis" se o app existir
      if (await this.isTerminalAvailable(terminal.command)) {
        this.detectedTerminals.push(terminal);
      }
    }

    // Se nenhum foi detectado, adiciona Terminal
    if (this.detectedTerminals.length === 0) {
      this.detectedTerminals.push(terminals[0]);
    }
  }

  /**
   * Detecta terminais no Linux
   */
  async detectLinuxTerminals() {
    const terminals = [
      {
        name: 'GNOME Terminal',
        command: 'gnome-terminal',
        args: ['--working-directory={path}'],
        description: 'GNOME Terminal (padrão)',
        icon: '🔴',
        isDefault: true
      },
      {
        name: 'Konsole',
        command: 'konsole',
        args: ['--workdir', '{path}'],
        description: 'Konsole (KDE)',
        icon: '🔵'
      },
      {
        name: 'Xterm',
        command: 'xterm',
        args: ['-e', 'bash', '-c', 'cd {path}; bash'],
        description: 'Xterm (clássico)',
        icon: '⬜'
      },
      {
        name: 'xfce4-terminal',
        command: 'xfce4-terminal',
        args: ['--working-directory={path}'],
        description: 'Xfce Terminal',
        icon: '🟠'
      }
    ];

    for (const terminal of terminals) {
      if (await this.isTerminalAvailable(terminal.command)) {
        this.detectedTerminals.push(terminal);
      }
    }

    // Se nenhum foi detectado, adiciona GNOME Terminal como fallback
    if (this.detectedTerminals.length === 0) {
      this.detectedTerminals.push(terminals[0]);
    }
  }

  /**
   * Verifica se um terminal está disponível no sistema
   */
  isTerminalAvailable(command) {
    return new Promise((resolve) => {
      const isWindows = this.platform === 'win32';
      const checkCommand = isWindows 
        ? `where ${command}` 
        : `which ${command}`;

      exec(checkCommand, (error) => {
        resolve(!error); // Se não houver erro, o comando existe
      });
    });
  }

  /**
   * Obtém o terminal padrão do sistema
   */
  getDefaultTerminal() {
    const defaultTerminals = this.detectedTerminals.filter(t => t.isDefault);
    
    if (defaultTerminals.length > 0) {
      return defaultTerminals[0];
    }

    return this.detectedTerminals.length > 0 ? this.detectedTerminals[0] : null;
  }

  /**
   * Obtém um terminal pelo nome
   */
  getTerminalByName(name) {
    return this.detectedTerminals.find(t => t.name === name);
  }
}

module.exports = TerminalDetector;
