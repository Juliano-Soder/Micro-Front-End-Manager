/**
 * SHARED SERVICES
 * Serviços compartilhados para evitar duplicação de código
 * Usado por PAS, PAMP e Onboarding
 */

class SharedServices {
  constructor() {
    this.ipcRenderer = require('electron').ipcRenderer;
    this.shell = require('electron').shell;
  }

  /**
   * Abre seletor de pasta do sistema
   * @param {string} inputId - ID do input para atualizar o caminho
   * @param {number} index - Índice do projeto (opcional)
   * @param {string} projectType - Tipo do projeto (pas, pamp, onboarding)
   * @param {Function} callback - Callback para executar após seleção (opcional)
   */
  async selectFolder(inputId, index = null, projectType = null, callback = null) {
    try {
      console.log('[SHARED-SERVICES] 📁 Abrindo seletor de pasta...');
      const result = await this.ipcRenderer.invoke('select-folder');
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        console.log('[SHARED-SERVICES] ✅ Pasta selecionada:', selectedPath);
        
        const input = document.getElementById(inputId);
        if (input) {
          input.value = selectedPath;
          
          // Simula blur para disparar validações
          const event = new Event('blur', { bubbles: true });
          input.dispatchEvent(event);
          
          // Executa callback se fornecido
          if (callback && typeof callback === 'function') {
            callback(selectedPath, index, projectType);
          }
          
          console.log('[SHARED-SERVICES] ✅ Input atualizado com sucesso');
        } else {
          console.warn('[SHARED-SERVICES] ⚠️ Input não encontrado:', inputId);
        }
      } else {
        console.log('[SHARED-SERVICES] ❌ Seleção cancelada pelo usuário');
      }
    } catch (error) {
      console.error('[SHARED-SERVICES] ❌ Erro ao selecionar pasta:', error);
    }
  }

  /**
   * Função para compatibilidade com PAS/PAMP - seleção via IPC send
   * @param {number} index - Índice do projeto
   * @param {string} projectName - Nome do projeto
   */
  async selectFolderLegacy(index, projectName) {
    try {
      console.log('[SHARED-SERVICES] 📁 Abrindo seletor (modo legacy)...');
      this.ipcRenderer.send('browse-project-folder', { index, projectName });
    } catch (error) {
      console.error('[SHARED-SERVICES] ❌ Erro no modo legacy:', error);
    }
  }

  /**
   * Abre projeto no editor atual
   * @param {string} projectPath - Caminho do projeto
   * @param {Object} currentIDE - IDE atual selecionada
   * @param {number} index - Índice do projeto (opcional)
   */
  async openInEditor(projectPath, currentIDE, index = 0) {
    try {
      if (projectPath && currentIDE) {
        console.log('[SHARED-SERVICES] 🖥️ Abrindo no editor:', projectPath);
        this.ipcRenderer.send('open-project-in-editor', {
          projectPath: projectPath,
          projectIndex: index,
          isPamp: false
        });
      }
    } catch (error) {
      console.error('[SHARED-SERVICES] Erro ao abrir no editor:', error);
    }
  }

  /**
   * Abre projeto no navegador
   * @param {number} port - Porta do projeto
   */
  openInBrowser(port) {
    try {
      if (port) {
        this.shell.openExternal(`http://localhost:${port}`);
      }
    } catch (error) {
      console.error('[SHARED-SERVICES] Erro ao abrir no navegador:', error);
    }
  }

  /**
   * Atualiza log de console
   * @param {string} logElementId - ID do elemento de log
   * @param {string} message - Mensagem para adicionar
   * @param {boolean} show - Se deve mostrar o log
   */
  updateLog(logElementId, message, show = true) {
    const logElement = document.getElementById(logElementId);
    if (logElement) {
      if (show) {
        logElement.style.display = 'block';
      }
      if (message) {
        // Usa textContent para preservar \n com white-space: pre-wrap
        const formattedMessage = message.endsWith('\n') ? message : `${message}\n`;
        logElement.textContent += formattedMessage;
        logElement.scrollTop = logElement.scrollHeight;
      }
    }
  }

  /**
   * Atualiza log na mesma linha (para progresso)
   * @param {string} logElementId - ID do elemento de log
   * @param {string} message - Mensagem para substituir a última linha
   */
  updateLogSameLine(logElementId, message) {
    const logElement = document.getElementById(logElementId);
    if (logElement) {
      logElement.style.display = 'block';
      
      // Divide o conteúdo em linhas e remove linhas vazias do final
      const lines = logElement.textContent.split('\n');
      
      // Remove linhas vazias do final
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }
      
      // Se a última linha não-vazia começa com emoji de download (📥), substitui
      // Senão, adiciona nova linha
      if (lines.length > 0 && lines[lines.length - 1].trim().startsWith('📥')) {
        lines[lines.length - 1] = message;
      } else {
        lines.push(message);
      }
      
      logElement.textContent = lines.join('\n');
      logElement.scrollTop = logElement.scrollHeight;
    }
  }

  /**
   * Limpa log de console
   * @param {string} logElementId - ID do elemento de log
   */
  clearLog(logElementId) {
    const logElement = document.getElementById(logElementId);
    if (logElement) {
      logElement.innerHTML = '';
    }
  }

  /**
   * Atualiza estado do botão
   * @param {string} buttonId - ID do botão
   * @param {string} text - Texto do botão
   * @param {boolean} disabled - Se deve desabilitar
   * @param {string} display - Estilo de display (none, inline-block, etc.)
   */
  updateButton(buttonId, text = null, disabled = null, display = null) {
    const button = document.getElementById(buttonId);
    if (button) {
      if (text !== null) button.innerHTML = text;
      if (disabled !== null) button.disabled = disabled;
      if (display !== null) button.style.display = display;
    }
  }

  /**
   * Obtém elemento por ID com fallback para múltiplos IDs
   * @param {Array} ids - Array de IDs para tentar
   * @returns {Element|null} - Elemento encontrado ou null
   */
  getElementByIds(ids) {
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) return element;
    }
    return null;
  }

  /**
   * Toggle de visibilidade de elementos
   * @param {string} elementId - ID do elemento
   * @param {boolean} visible - Se deve ser visível
   */
  toggleVisibility(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Configura estado de UI baseado no caminho do projeto
   * @param {string} projectPath - Caminho do projeto
   * @param {Object} elements - Objeto com IDs dos elementos
   * @param {number} index - Índice do projeto
   */
  updateUIBasedOnPath(projectPath, elements, index) {
    const hasPath = projectPath && projectPath.trim();
    
    // Elementos que aparecem COM caminho
    const showWithPath = ['move', 'delete', 'editor', 'terminal'];
    // Elementos que aparecem SEM caminho
    const hideWithPath = ['download'];
    
    showWithPath.forEach(key => {
      if (elements[key]) {
        this.toggleVisibility(elements[key], hasPath);
      }
    });
    
    hideWithPath.forEach(key => {
      if (elements[key]) {
        this.toggleVisibility(elements[key], !hasPath);
      }
    });
  }

  /**
   * Obtém ícone da IDE atual
   * @param {Object} currentIDE - IDE atual
   * @returns {string} - Caminho do ícone
   */
  getCurrentIDEIcon(currentIDE) {
    const iconName = currentIDE?.icon || 'vscode.png';
    return `assets/${iconName}`;
  }

  /**
   * Obtém ícone do terminal
   * @returns {string} - Caminho do ícone do terminal
   */
  getTerminalIcon() {
    return 'terminal.png';
  }

  /**
   * Formata badge de status
   * @param {string} text - Texto do badge
   * @param {string} color - Cor de fundo
   * @param {string} textColor - Cor do texto
   * @returns {string} - HTML do badge
   */
  createStatusBadge(text, color, textColor = 'white') {
    return `<span style="background: ${color}; color: ${textColor}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${text}</span>`;
  }

  /**
   * Gerencia operações assíncronas com UI feedback
   * @param {string} buttonId - ID do botão para desabilitar
   * @param {string} loadingText - Texto durante carregamento
   * @param {string} normalText - Texto normal
   * @param {Function} operation - Operação assíncrona
   * @param {string} logElementId - ID do log (opcional)
   */
  async handleAsyncOperation(buttonId, loadingText, normalText, operation, logElementId = null) {
    try {
      this.updateButton(buttonId, loadingText, true);
      if (logElementId) {
        this.clearLog(logElementId);
        this.updateLog(logElementId, '');
      }
      
      const result = await operation();
      return result;
    } catch (error) {
      if (logElementId) {
        this.updateLog(logElementId, `❌ Erro: ${error.message}`);
      }
      throw error;
    } finally {
      this.updateButton(buttonId, normalText, false);
    }
  }
}

// Instância global do serviço
const sharedServices = new SharedServices();