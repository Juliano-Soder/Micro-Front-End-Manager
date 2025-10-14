# 📦 Estrutura de Pastas - Node.js Portátil

## 🏗️ Desenvolvimento (Não Compilado)

Quando rodando via `npm start` ou diretamente do código:

```
D:\workdir\back-end\micro-front-end-manager\
├── main.js
├── package.json
├── nodes/                          ← Pasta com Node.js portátil
│   └── windows/
│       ├── node-v16.10.0/
│       │   ├── node.exe
│       │   ├── npm.cmd
│       │   ├── ng.cmd              ← Angular CLI instalado globalmente
│       │   └── node_modules/
│       ├── node-v18.18.2-win-x64/
│       │   ├── node.exe
│       │   ├── npm.cmd
│       │   ├── ng.cmd
│       │   └── node_modules/
│       └── node-v20.19.5-win-x64/
│           ├── node.exe
│           ├── npm.cmd
│           ├── ng.cmd
│           └── node_modules/
```

**Comando executado:**
```
"D:\workdir\back-end\micro-front-end-manager\nodes\windows\node-v16.10.0\npm.cmd" run start
```

---

## 📀 Produção (Após Compilação)

Quando instalado via instalador `.exe`:

### Estrutura no disco do usuário:

```
C:\Program Files\Micro Front End Manager\
├── Micro Front End Manager.exe     ← Executável principal (READ-ONLY)
├── resources/
│   └── app.asar                    ← Código compilado (READ-ONLY)
└── nodes/                          ← Pasta com Node.js portátil (READ/WRITE)
    └── windows/
        ├── node-v16.10.0/
        │   ├── node.exe
        │   ├── npm.cmd
        │   ├── ng.cmd
        │   └── node_modules/
        ├── node-v18.18.2-win-x64/
        │   ├── node.exe
        │   ├── npm.cmd
        │   ├── ng.cmd
        │   └── node_modules/
        └── node-v20.19.5-win-x64/
            ├── node.exe
            ├── npm.cmd
            ├── ng.cmd
            └── node_modules/
```

**Comando executado:**
```
"C:\Program Files\Micro Front End Manager\nodes\windows\node-v16.10.0\npm.cmd" run start
```

---

## 🔧 Como Funciona o Código

### `node-version-config.js` - Função `getNodesBasePath()`

```javascript
function getNodesBasePath() {
  // Em desenvolvimento: usa pasta dentro do projeto
  if (!app.isPackaged) {
    return path.join(__dirname, 'nodes');
  }
  
  // Em produção: usa pasta na raiz da instalação (mesma pasta do .exe)
  return path.join(path.dirname(app.getPath('exe')), 'nodes');
}
```

### Detecção Automática:

- `app.isPackaged = false` → **Desenvolvimento** → `__dirname/nodes`
- `app.isPackaged = true` → **Produção** → `C:\Program Files\...\nodes`

---

## 📦 Configuração do Instalador (Electron Forge)

### `forge.config.js`

Para incluir a pasta `nodes` no instalador, você precisa adicionar:

```javascript
module.exports = {
  packagerConfig: {
    asar: true,
    icon: './OIP.ico',
    // Inclui pasta nodes na compilação
    extraResource: [
      './nodes'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'micro_front_end_manager',
        // Configurações do instalador Windows
        setupIcon: './OIP.ico',
        loadingGif: './splash.png',
        // A pasta nodes será copiada para a raiz da instalação
      }
    }
  ]
};
```

---

## ⚠️ Importante: Permissões de Escrita

### Por que não usar `app.getPath('userData')`?

❌ **NÃO USAR** `C:\Users\<user>\AppData\Roaming\micro-front-end-manager\nodes`

**Motivos:**
1. Cada usuário teria sua própria cópia (desperdício de espaço - ~500MB por usuário)
2. Dificulta compartilhamento entre usuários
3. Backup mais complexo

✅ **USAR** `C:\Program Files\Micro Front End Manager\nodes`

**Vantagens:**
1. Uma única cópia para todos os usuários
2. Administrador instala uma vez
3. Backup simples (pasta nodes dentro da instalação)

### Como Garantir Permissão de Escrita?

O instalador precisa:
1. **Solicitar privilégios administrativos** (já configurado no Electron Forge)
2. **Dar permissões de escrita na pasta nodes** após instalação

Adicione no instalador (`.nsi` se usar NSIS ou Squirrel):

```nsis
# Dá permissões de escrita para usuários na pasta nodes
AccessControl::GrantOnFile "$INSTDIR\nodes" "(BU)" "FullAccess"
```

---

## 🧪 Testando a Estrutura

### Em Desenvolvimento:
```bash
npm start
# Verifica logs no console:
# [DEPENDENCY CHECK] Base path: D:\workdir\...\nodes
```

### Em Produção:
1. Compile: `npm run make`
2. Instale o `.exe` gerado
3. Abra console do DevTools (Ctrl+Shift+I)
4. Verifique logs:
```
[DEPENDENCY CHECK] Base path: C:\Program Files\Micro Front End Manager\nodes
```

---

## 📋 Checklist de Distribuição

- [ ] Compilar aplicação: `npm run make`
- [ ] Verificar se pasta `nodes` está incluída no instalador
- [ ] Testar instalação em máquina limpa
- [ ] Verificar permissões de escrita na pasta `nodes`
- [ ] Testar instalação de dependências via menu
- [ ] Verificar se projetos iniciam com Node.js correto
- [ ] Testar com múltiplos usuários Windows

---

## 🔄 Atualizações Futuras

Quando adicionar novas versões do Node.js:

1. Adicione em `node-version-config.js`:
```javascript
'22.0.0': {
  version: '22.0.0',
  folderName: 'node-v22.0.0-win-x64',
  angularVersion: '19',
  angularPackage: '@angular/cli@19.0.0',
  urls: { ... }
}
```

2. Usuários podem instalar via menu "Instalar Dependências Node.js"
3. Não precisa recompilar o aplicativo!

---

## 📝 Notas Adicionais

- **Tamanho da pasta nodes:** ~150MB por versão (total ~450MB para 3 versões)
- **Tempo de instalação:** 2-5 minutos dependendo da internet
- **Compatibilidade:** Windows 7+ (64-bit), Linux, macOS
- **Offline:** Após primeira instalação, funciona offline
