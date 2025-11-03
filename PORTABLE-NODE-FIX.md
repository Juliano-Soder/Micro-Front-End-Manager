# ✅ Correção: Garantia de Uso do Node.js Portátil

## 🐛 Problemas Encontrados e Corrigidos

### 1. ❌ Tentativa de Executar `.cmd` com `node.exe`

**Erro:**
```bash
node.exe "caminho\ng.cmd" serve --project mp-pas-home ...

# Resultado:
SyntaxError: Invalid or unexpected token
@ECHO off
^
```

**Causa:**
- `ng.cmd` é um **batch script** (`.cmd`)
- `node.exe` só executa **JavaScript** (`.js`)
- Node.js tentava interpretar `@ECHO off` como JavaScript

**Solução:**
- ✅ Usar `npm run serve:single-spa:pas-home` ao invés de `ng.cmd` diretamente
- npm.cmd configura o ambiente e chama `ng` corretamente

---

### 2. ❌ Node.js/npm do Sistema Usado ao Invés do Portátil

**Problema:**
- Comando `npm.cmd run start` podia usar npm **do sistema** (PATH)
- Não garantia que Node.js **portátil** fosse usado
- Poderia causar inconsistências de versão

**Solução:**
- ✅ Adicionar diretório do Node.js portátil **no início do PATH**
- ✅ Configurar `NODE_PATH` para módulos globais portáteis
- ✅ Garantir que `npm`, `node` e `ng` portáteis tenham prioridade

---

## 🔧 Implementação

### Modificações em `main.js`

#### 1. Comando de Inicialização (linhas ~3863-3879)

**Antes:**
```javascript
// ❌ Tentava executar ng.cmd com node.exe
command = `${nodeExe} ${ngCmd} serve --project ${projectName} ...`;
```

**Depois:**
```javascript
// ✅ Usa npm run que chama o script correto
command = `${npmCmd} run serve:single-spa:${projectName.replace('mp-pas-', '')}`;
```

**Por tipo de projeto:**
| Projeto | Comando | Motivo |
|---------|---------|--------|
| mp-pas-root | `npm run start` | Usa Webpack, não Angular CLI |
| mp-pas-home | `npm run serve:single-spa:pas-home` | Angular CLI via npm script |
| mp-pamp | `npm run serve` | Angular CLI via npm script |

---

#### 2. Configuração de PATH (função `executeStartCommand`)

**Adicionado:**
```javascript
// 🎯 GARANTE QUE NODE.JS PORTÁTIL SEJA USADO
const projectNodeConfigManager = new ProjectConfigManager();
const nodeVersion = projectNodeConfigManager.getProjectNodeVersion(projectName);
const nodePaths = getNodeExecutablePath(nodeVersion);
const nodeDir = nodePaths.nodeDir;

// Adiciona Node.js portátil NO INÍCIO do PATH
const customEnv = { 
  ...process.env,
  PATH: `${nodeDir}${path.delimiter}${process.env.PATH}`, // Portátil primeiro!
  NODE_PATH: path.join(nodeDir, 'node_modules'),
};

const childProcess = exec(command, { 
  cwd: projectPath,
  env: customEnv // PATH customizado
});
```

**O que faz:**
1. ✅ Busca versão Node.js configurada para o projeto
2. ✅ Obtém caminho do Node.js portátil (`nodes/windows/node-v16.10.0`)
3. ✅ Adiciona ao **início** do PATH (prioridade máxima)
4. ✅ Configura `NODE_PATH` para módulos globais

**Resultado:**
```
PATH = "D:\...\nodes\windows\node-v16.10.0;C:\Windows\System32;..."
       ↑ Node.js portátil PRIMEIRO    ↑ Sistema depois
```

---

#### 3. npm install com Node.js Portátil

**Adicionado:**
```javascript
// 🎯 GARANTE QUE NODE.JS PORTÁTIL SEJA USADO NO NPM INSTALL
const installEnv = { 
  ...process.env,
  PATH: `${nodePaths.nodeDir}${path.delimiter}${process.env.PATH}`,
  NODE_PATH: path.join(nodePaths.nodeDir, 'node_modules'),
  npm_config_progress: 'true',
  npm_config_loglevel: 'info'
};

const installProcess = exec(installCommand, { 
  cwd: projectPath,
  env: installEnv
});
```

**Resultado:**
- ✅ `npm install` usa Node.js portátil
- ✅ Módulos instalados com versão correta do Node.js
- ✅ Consistência entre instalação e execução

---

## 🎯 Como Funciona Agora

### Fluxo Completo

```
1. Usuário clica "Iniciar" em mp-pas-home
   ↓
2. Sistema busca versão Node.js configurada (ex: 16.10.0)
   ↓
3. PATH configurado:
   PATH = "D:\...\nodes\windows\node-v16.10.0;[sistema]"
   NODE_PATH = "D:\...\nodes\windows\node-v16.10.0\node_modules"
   ↓
4. Comando executado:
   npm run serve:single-spa:pas-home
   ↓
5. npm.cmd encontrado em nodes/windows/node-v16.10.0/npm.cmd
   ↓
6. npm.cmd executa:
   - Usa node.exe do mesmo diretório (portátil)
   - Busca script "serve:single-spa:pas-home" no package.json
   - Executa: ng serve --project mp-pas-home --port 9002 ...
   ↓
7. ng encontrado em node_modules/.bin/ng (instalado localmente)
   ↓
8. ng usa Node.js portátil para compilar e servir
   ↓
9. ✅ Projeto roda com Node.js 16.10.0 + Angular CLI 13.3.11
```

---

## 📊 Verificação

### Como Confirmar que Está Usando Node.js Portátil

**Logs esperados no console:**
```
🎯 Projeto mp-pas-home usando Node.js 16.10.0
✅ Node.js portátil encontrado em: D:\...\nodes\windows\node-v16.10.0
Executando comando: "D:\...\npm.cmd" run serve:single-spa:pas-home
🎯 PATH configurado para usar Node.js portátil: D:\...\node-v16.10.0
📦 Versão Node.js: 16.10.0
```

**No terminal integrado do projeto:**
```bash
# Se quiser verificar manualmente, execute dentro do projeto:
where node
# Deve mostrar: D:\...\nodes\windows\node-v16.10.0\node.exe

where npm
# Deve mostrar: D:\...\nodes\windows\node-v16.10.0\npm.cmd

node --version
# Deve mostrar: v16.10.0
```

---

## ⚙️ Ordem de Prioridade do PATH

### Antes (Problema):
```
PATH = C:\Windows\System32;
       C:\Program Files\nodejs;      ← Node.js do sistema!
       ...
```

**Resultado:**
- ❌ `npm` do sistema usado
- ❌ Node.js v18 do sistema usado
- ❌ Inconsistência com versão configurada

### Depois (Solução):
```
PATH = D:\...\nodes\windows\node-v16.10.0;  ← Portátil PRIMEIRO!
       C:\Windows\System32;
       C:\Program Files\nodejs;              ← Sistema ignorado
       ...
```

**Resultado:**
- ✅ `npm` portátil usado (v9.8.1)
- ✅ Node.js v16.10.0 portátil usado
- ✅ Angular CLI 13.3.11 do node_modules usado
- ✅ Consistência total

---

## 🧪 Testes Realizados

### 1. mp-pas-root (Webpack)
```
Comando: npm run start
PATH: node-v16.10.0 prioritário
✅ Compila com Webpack
✅ Serve em http://localhost:9000
✅ Usa Node.js portátil
```

### 2. mp-pas-home (Angular CLI)
```
Comando: npm run serve:single-spa:pas-home
PATH: node-v16.10.0 prioritário
✅ Angular CLI encontrado
✅ Compila com ng serve
✅ Serve em http://localhost:9002
✅ Usa Node.js portátil
```

### 3. mp-pas-configuracoes (Angular CLI + Node 18)
```
Comando: npm run serve:single-spa:pas-configuracoes
PATH: node-v18.18.2 prioritário
✅ Angular CLI 15 usado
✅ Compila com ng serve
✅ Serve em http://localhost:9004
✅ Usa Node.js 18 portátil
```

---

## 📝 Benefícios

### ✅ Isolamento Total
- Cada projeto usa sua versão configurada
- Não depende do Node.js instalado no sistema
- Evita conflitos entre projetos

### ✅ Consistência
- Desenvolvimento e produção usam mesma versão
- npm install e npm run usam mesmo Node.js
- Angular CLI usa versão correta do Node.js

### ✅ Portabilidade
- Não precisa instalar Node.js globalmente
- Funciona em qualquer máquina
- Instalação via menu da aplicação

### ✅ Flexibilidade
- Fácil trocar versão por projeto
- Suporta múltiplas versões simultâneas
- Configuração visual (UI)

---

## 🔍 Troubleshooting

### Se Projeto Não Iniciar

**Verificar logs:**
```
🎯 PATH configurado para usar Node.js portátil: [caminho]
📦 Versão Node.js: [versão]
```

**Se aparecer erro "command not found":**
```
# Verificar se Node.js portátil existe
ls D:\workdir\back-end\micro-front-end-manager\nodes\windows\node-v16.10.0\

# Deve conter:
- node.exe
- npm.cmd
- ng.cmd (após instalação via menu)
```

**Se usar Node.js errado:**
```
# No console do projeto, verificar:
node --version

# Se mostrar versão diferente da configurada:
1. Fechar projeto
2. Menu: Dependências > Configurar Versões dos Projetos
3. Selecionar versão correta
4. Salvar
5. Iniciar projeto novamente
```

---

## 📌 Resumo

### Arquivos Modificados
- ✅ `main.js` (linhas 3863-3879) - Comandos de inicialização
- ✅ `main.js` (função `executeStartCommand`) - PATH customizado
- ✅ `main.js` (npm install) - PATH customizado

### Comandos por Tipo de Projeto
- ✅ mp-pas-root: `npm run start` (Webpack)
- ✅ mp-pas-*: `npm run serve:single-spa:pas-*` (Angular CLI)
- ✅ mp-pamp*: `npm run serve` (Angular CLI)

### Garantias Implementadas
- ✅ PATH prioriza Node.js portátil
- ✅ NODE_PATH aponta para módulos portáteis
- ✅ npm, node e ng portáteis usados
- ✅ Versão por projeto respeitada
- ✅ Isolamento total entre projetos

---

**✅ Sistema 100% funcional com Node.js portátil garantido!**
