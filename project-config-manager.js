const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDefaultNodeVersion } = require('./node-version-config');

class ProjectConfigManager {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'project-node-versions.json');
    this.configs = this.loadConfigs();
  }

  /**
   * Carrega configurações de versões dos projetos
   */
  loadConfigs() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configurações:', error);
    }
    
    return {};
  }

  /**
   * Salva configurações
   */
  saveConfigs() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.configs, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('❌ Erro ao salvar configurações:', error);
      return false;
    }
  }

  /**
   * Obtém versão do Node.js para um projeto
   */
  getProjectNodeVersion(projectName) {
    if (this.configs[projectName]) {
      return this.configs[projectName];
    }
    
    // Retorna versão padrão
    return getDefaultNodeVersion(projectName);
  }

  /**
   * Define versão do Node.js para um projeto
   */
  setProjectNodeVersion(projectName, nodeVersion) {
    this.configs[projectName] = nodeVersion;
    return this.saveConfigs();
  }

  /**
   * Obtém todas as configurações
   */
  getAllConfigs() {
    return { ...this.configs };
  }

  /**
   * Remove configuração de um projeto
   */
  removeProjectConfig(projectName) {
    delete this.configs[projectName];
    return this.saveConfigs();
  }
}

module.exports = ProjectConfigManager;
