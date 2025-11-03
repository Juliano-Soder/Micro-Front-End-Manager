# Sistema de Node.js Portátil

## 📋 Visão Geral

Este projeto agora utiliza um sistema de **Node.js Portátil** que permite:

- ✅ Cada projeto usar sua própria versão do Node.js e Angular CLI
- ✅ Não depender do Node.js instalado globalmente na máquina
- ✅ Gerenciar múltiplas versões simultaneamente
- ✅ Instalação automática e gerenciamento simplificado

## 🎯 Versões Disponíveis

| Versão Node.js | Angular CLI | Projetos Padrão |
|----------------|-------------|-----------------|
| **16.10.0** | 13.3.11 | mp-pas-root, mp-pamp, etc. |
| **18.18.2** | 15.2.10 | mp-pas-configuracoes |
| **20.19.5** | 18.2.0 | Projetos futuros |

## 📁 Estrutura de Diretórios

### Em Desenvolvimento
```
micro-front-end-manager/
├── nodes/                          ← Node.js portátil (NÃO commitado)
│   └── windows/
│       ├── node-v16.10.0-win-x64/
│       │   ├── node.exe
│       │   ├── npm.cmd
│       │   └── node_modules/
│       │       └── @angular/cli@13/
│       ├── node-v18.18.2-win-x64/
│       └── node-v20.19.5-win-x64/
│
├── node-version-config.js          ← Configurações de versões
├── node-installer.js               ← Gerenciador de instalação
├── project-config-manager.js       ← Gerenciador de projetos
└── project-configs.html            ← UI de configuração
```

### Em Produção (Após Build)
```
C:\Program Files\Micro Front-End Manager\
├── Micro Front-End Manager.exe
├── nodes/                          ← Node.js portátil
│   └── windows/
│       └── (mesma estrutura)
└── resources/
    └── app/
```

## 🚀 Como Usar

### Primeira Execução

1. **Abra o aplicativo**
2. Se as dependências não estiverem instaladas, você verá a mensagem:
   ```
   ⚠️ Falta instalar as dependências.
   Use a opção do menu "Instalar Dependências Node.js"
   ```
3. **Clique em**: `Dependências > Instalar Dependências Node.js`
4. Aguarde o download e instalação (pode levar alguns minutos)
5. ✅ Pronto! As dependências estão instaladas

### Configurar Versões por Projeto

1. **Clique em**: `Configurações > Configurações de Projetos`
2. Selecione a versão do Node.js para cada projeto:
   - **Node 16** → Angular CLI 13
   - **Node 18** → Angular CLI 15
   - **Node 20** → Angular CLI 18
3. As alterações são salvas automaticamente

### Executar Projetos

Funciona normalmente! Cada projeto usará automaticamente sua versão configurada do Node.js.

## 🔧 Arquivos de Configuração

### `node-version-config.js`
Define as versões disponíveis e suas URLs de download:

```javascript
const NODE_VERSIONS = {
  '16.10.0': {
    version: '16.10.0',
    angularVersion: '13',
    angularPackage: '@angular/cli@13.3.11',
    urls: {
      windows: 'https://nodejs.org/download/release/v16.10.0/node-v16.10.0-win-x64.zip',
      // ...
    }
  },
  // ...
};
```

### `project-node-versions.json` (Gerado automaticamente)
Armazena as versões configuradas para cada projeto:

```json
{
  "mp-pas-root": "16.10.0",
  "mp-pas-configuracoes": "18.18.2",
  "mp-pamp": "16.10.0"
}
```

### `settings.json` (Gerado automaticamente)
Armazena o estado da instalação:

```json
{
  "dependenciesInstalled": true,
  "lastInstallDate": "2025-10-14T10:30:00.000Z"
}
```

## 🛠️ Para Desenvolvedores

### Adicionar Nova Versão do Node.js

1. Edite `node-version-config.js`:

```javascript
'22.0.0': {
  version: '22.0.0',
  folderName: 'node-v22.0.0-win-x64',
  angularVersion: '19',
  angularPackage: '@angular/cli@19.0.0',
  urls: {
    windows: 'https://nodejs.org/download/release/v22.0.0/node-v22.0.0-win-x64.zip',
    linux: 'https://nodejs.org/download/release/v22.0.0/node-v22.0.0-linux-x64.tar.xz',
    mac: 'https://nodejs.org/download/release/v22.0.0/node-v22.0.0-darwin-x64.tar.gz'
  }
}
```

2. Atualize `DEFAULT_PROJECT_VERSIONS` se necessário
3. Execute "Instalar Dependências Node.js" novamente

### Estrutura de Código

#### `NodeInstaller` (node-installer.js)
- `checkDependenciesInstalled()` - Verifica instalação
- `installNodeVersion(version)` - Instala versão específica
- `installAllVersions()` - Instala todas as versões
- `downloadFile(url, path)` - Download com progresso
- `extractZip(zipPath, extractPath)` - Extração de ZIP
- `installAngularCLI()` - Instala Angular CLI

#### `ProjectConfigManager` (project-config-manager.js)
- `getProjectNodeVersion(projectName)` - Obtém versão
- `setProjectNodeVersion(projectName, version)` - Define versão
- `getAllConfigs()` - Retorna todas configurações
- `saveConfigs()` - Persiste no arquivo

#### Integração no `main.js`

```javascript
// Obtém versão do Node.js para projeto
const nodeVersion = projectConfigManager.getProjectNodeVersion(projectName);

// Obtém caminhos do executável
const nodePaths = getNodeExecutablePath(nodeVersion);

// Constrói comandos
const nodeExe = `"${nodePaths.nodeExe}"`;
const npmCmd = `"${nodePaths.npmCmd}"`;
const ngCmd = `"${nodePaths.ngCmd}"`;

// Executa comando com Node.js portátil
const command = `${nodeExe} ${ngCmd} serve --port ${port}`;
```

## 🐛 Troubleshooting

### "Node.js não está instalado"
- Execute: `Dependências > Instalar Dependências Node.js`
- Verifique se a pasta `nodes/windows/` existe e contém as versões

### "Erro ao extrair arquivo"
- No instalador, você verá opção para baixar novamente
- Digite 'S' para confirmar o re-download
- O ZIP corrompido será substituído

### Projeto não inicia
1. Verifique a versão configurada: `Configurações > Configurações de Projetos`
2. Confirme instalação: `Dependências > Instalar Dependências Node.js`
3. Verifique logs no console do projeto

### Instalação lenta
- É normal! Downloads podem levar 5-10 minutos dependendo da conexão
- Node.js + Angular CLI juntos têm ~30-50MB por versão
- A instalação do Angular CLI pode levar alguns minutos

## 📝 Notas Importantes

### Git Ignore
A pasta `nodes/` está no `.gitignore` e **NÃO** deve ser commitada:
```gitignore
# Node.js Portátil - NÃO commitar binários
nodes/
.node-portable/
.npm-cache/
```

### Build do Electron
O Electron Forge precisa ser configurado para incluir a pasta `nodes/` no executável compilado.

Em `forge.config.js`:
```javascript
module.exports = {
  // ...
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        // Inclui nodes/ no instalador
        extraResources: [
          './nodes'
        ]
      }
    }
  ]
};
```

### Permissões
- A pasta `nodes/` precisa de permissões de leitura/escrita
- Em produção, fica ao lado do executável
- Windows: Geralmente em `C:\Program Files\...\`
- Instalador deve garantir permissões corretas

## 🎯 Roadmap

- [ ] Suporte para Linux e macOS
- [ ] Cache inteligente de downloads
- [ ] Verificação de integridade (checksums)
- [ ] Atualização automática de versões
- [ ] Limpeza de versões não utilizadas
- [ ] Backup e restauração de configurações

## 📚 Recursos

- [Node.js Downloads](https://nodejs.org/download/release/)
- [Angular CLI Releases](https://github.com/angular/angular-cli/releases)
- [Electron Forge Documentation](https://www.electronforge.io/)
- [adm-zip Documentation](https://github.com/cthackers/adm-zip)

---

**Desenvolvido por**: Juliano Soder  
**Versão**: 0.0.9  
**Data**: Outubro 2025
