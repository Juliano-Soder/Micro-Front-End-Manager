# 🚀 Guia de Compilação - Micro Front-End Manager

## 📋 Visão Geral

Este documento explica como compilar o Front-End Manager com a estrutura de Node.js portátil incluída.

---

## 🔧 Estrutura Criada Automaticamente

Quando você compila o projeto, a seguinte estrutura é criada automaticamente:

```
nodes/
├── README.md           # Documentação para usuários finais
├── windows/
│   ├── .gitkeep       # Mantém pasta no git (vazia inicialmente)
│   ├── node-v16.10.0/          # ← Instalado pelo usuário via menu
│   │   ├── node.exe
│   │   ├── npm.cmd
│   │   ├── ng.cmd
│   │   └── node_modules/
│   ├── node-v18.18.2-win-x64/  # ← Instalado pelo usuário via menu
│   └── node-v20.19.5-win-x64/  # ← Instalado pelo usuário via menu
├── linux/
│   └── .gitkeep
└── mac/
    └── .gitkeep
```

**Importante:** As pastas estão **vazias inicialmente**. Os usuários instalam o Node.js via menu da aplicação.

---

## 🏗️ Como Funciona a Compilação

### 1️⃣ Script Automático (`create-nodes-structure.js`)

Este script é executado **automaticamente** antes de cada build:

```javascript
// Executado antes de:
npm run make         // → Chama premake hook
npm run package      // → Chama prepackage hook
npm run make:win
npm run make:linux
```

**O que ele faz:**
- ✅ Cria pasta `nodes/` se não existir
- ✅ Cria subpastas: `windows/`, `linux/`, `mac/`
- ✅ Adiciona arquivos `.gitkeep` (mantém pastas vazias no git)
- ✅ Cria `README.md` com instruções para usuários

### 2️⃣ Configuração Electron Forge (`forge.config.js`)

```javascript
packagerConfig: {
  asar: true,
  icon: './OIP',
  extraResource: [
    './nodes'  // ← Inclui pasta nodes no instalador
  ],
  // ...
}
```

**O que acontece:**
- A pasta `nodes/` é copiada **para fora do arquivo .asar**
- Fica ao lado do executável `.exe`
- Permite leitura/escrita (usuários podem instalar Node.js)

### 3️⃣ Build com Certificado Renovado (`build-win-fresh-cert.js`)

Processo completo:
```
1. 📁 Criar estrutura nodes/
2. 🔐 Regenerar certificado (validade 90 dias)
3. 🔨 Compilar aplicação
4. ✍️ Assinar executável e instalador
5. 📦 Gerar instalador final
```

---

## 🎯 Comandos de Compilação

### Windows (Recomendado)

```bash
# Build completo com certificado renovado + estrutura nodes
npm run make

# Ou explicitamente:
npm run make:win:fresh
```

### Linux (via Docker)

```bash
# Build para distribuições Linux
npm run build:docker-linux

# Ou individualmente:
npm run make:linux-deb     # Debian/Ubuntu (.deb)
npm run make:linux-rpm     # Fedora/RedHat (.rpm)
```

### Todas as Plataformas

```bash
# Build para Windows + Linux
npm run build:all
```

---

## 📦 Resultado da Compilação

### Estrutura Gerada em `out/`

```
out/
├── make/
│   └── squirrel.windows/
│       └── x64/
│           ├── MicroFrontEndManagerSetup.exe  ← Instalador para distribuir
│           └── micro_front_end_manager-0.0.8-full.nupkg
└── micro-front-end-manager-win32-x64/
    ├── micro-front-end-manager.exe
    ├── resources/
    │   └── app.asar  (código compilado - read-only)
    └── nodes/  ← Pasta criada automaticamente
        ├── README.md
        ├── windows/
        │   └── .gitkeep
        ├── linux/
        │   └── .gitkeep
        └── mac/
            └── .gitkeep
```

---

## 🔍 Verificação Pós-Build

### 1. Verificar Estrutura de Pastas

```bash
# Windows PowerShell
Get-ChildItem -Recurse out\micro-front-end-manager-win32-x64\nodes

# Deve mostrar:
# nodes\
# nodes\README.md
# nodes\windows\.gitkeep
# nodes\linux\.gitkeep
# nodes\mac\.gitkeep
```

### 2. Testar Instalador

```bash
# Executar instalador
.\out\make\squirrel.windows\x64\MicroFrontEndManagerSetup.exe
```

**Após instalação, verificar em:**
```
C:\Users\<usuario>\AppData\Local\micro_front_end_manager\
├── micro-front-end-manager.exe
└── nodes/  ← Deve existir com subpastas
```

### 3. Testar Instalação de Dependências

1. Abrir aplicação instalada
2. Menu: `Dependências > Instalar Dependências Node.js`
3. Aguardar instalação
4. Verificar que `nodes/windows/` agora tem:
   - `node-v16.10.0/`
   - `node-v18.18.2-win-x64/`
   - `node-v20.19.5-win-x64/`

---

## ⚙️ Scripts Disponíveis

| Script | Descrição | Quando Usar |
|--------|-----------|-------------|
| `npm run setup:nodes` | Cria estrutura nodes manualmente | Antes de development |
| `npm run make` | Build Windows completo | **Recomendado para produção** |
| `npm run make:win` | Build Windows simples | Desenvolvimento |
| `npm run make:win:fresh` | Build + certificado renovado | **Uso padrão** |
| `npm run make:linux` | Build Linux (todos formatos) | Distribuição Linux |
| `npm run make:linux-deb` | Build Debian/Ubuntu | Ubuntu, Mint, etc. |
| `npm run make:linux-rpm` | Build Fedora/RedHat | Fedora, CentOS, etc. |
| `npm run build:all` | Build Windows + Linux | Release completo |

---

## 🔐 Certificado de Código

### Validade

- **Duração:** 90 dias
- **Renovação:** Automática durante build via `build-win-fresh-cert.js`
- **Localização:** `certs/micro-front-end-manager-new.pfx`

### Por que 90 dias?

Certificados auto-assinados com validade curta:
- ✅ Reduzem falsos positivos de antivírus
- ✅ Melhoram confiança do Windows SmartScreen
- ✅ Facilitam auditoria de segurança

### Verificar Certificado

```powershell
# Ver informações do certificado
Get-PfxCertificate -FilePath .\certs\micro-front-end-manager-new.pfx
```

---

## 🐛 Solução de Problemas

### Erro: "nodes/ folder not found"

**Causa:** Script `create-nodes-structure.js` não executado

**Solução:**
```bash
# Criar estrutura manualmente
npm run setup:nodes

# Depois compilar
npm run make
```

### Erro: "extraResource not copied"

**Causa:** Pasta `nodes/` está em `.gitignore` e não existe

**Solução:**
```bash
# Verificar se pasta existe
ls nodes/

# Se não existir, criar:
npm run setup:nodes
```

### Instalador não inclui pasta nodes

**Causa:** `forge.config.js` não configurado

**Verificar:**
```javascript
// forge.config.js deve ter:
packagerConfig: {
  extraResource: ['./nodes']
}
```

### Usuário não consegue instalar Node.js

**Causa:** Permissões de escrita na pasta `nodes/`

**Verificar em produção:**
```
C:\Users\<user>\AppData\Local\micro_front_end_manager\nodes\
```

**Deve ter permissão de escrita** (geralmente automático no AppData\Local)

---

## 📊 Tamanhos Esperados

| Item | Tamanho |
|------|---------|
| Instalador `.exe` | ~100 MB |
| App instalado (sem nodes) | ~200 MB |
| Node.js v16.10.0 | ~150 MB |
| Node.js v18.18.2 | ~160 MB |
| Node.js v20.19.5 | ~170 MB |
| **Total (com 3 versões)** | ~680 MB |

---

## 🚀 Checklist de Release

- [ ] ✅ Executar `npm run setup:nodes` (ou será automático)
- [ ] ✅ Verificar pasta `nodes/` existe com subpastas
- [ ] ✅ Executar `npm run make` (build completo)
- [ ] ✅ Verificar certificado renovado (certs/micro-front-end-manager-new.pfx)
- [ ] ✅ Testar instalador gerado
- [ ] ✅ Verificar estrutura nodes/ no app instalado
- [ ] ✅ Testar instalação de dependências via menu
- [ ] ✅ Iniciar projeto e verificar uso de Node.js portátil
- [ ] ✅ Verificar logs: `"D:\...\nodes\windows\node-v16.10.0\npm.cmd"`
- [ ] ✅ Distribuir: `out/make/squirrel.windows/x64/MicroFrontEndManagerSetup.exe`

---

## 📝 Notas Adicionais

### Git e nodes/

O `.gitignore` está configurado para:
- ❌ **NÃO** commitar binários Node.js (grandes, ~150MB cada)
- ✅ **COMMITAR** estrutura de pastas vazias (.gitkeep)
- ✅ **COMMITAR** README.md dentro de nodes/

### Atualizações Futuras

Para adicionar Node.js 22+:
1. Editar `node-version-config.js`
2. Adicionar versão ao objeto `NODE_VERSIONS`
3. **Não precisa recompilar!** Usuários instalam via menu

### Multi-Plataforma

O sistema suporta:
- ✅ Windows (testado)
- ✅ Linux (estrutura criada)
- ✅ macOS (estrutura criada)

Cada plataforma tem sua pasta em `nodes/<os>/`

---

## 🔗 Documentação Relacionada

- [PORTABLE-NODE-STRUCTURE.md](./PORTABLE-NODE-STRUCTURE.md) - Estrutura detalhada
- [FIXES-APPLIED.md](./FIXES-APPLIED.md) - Histórico de correções
- [BUILD.md](./BUILD.md) - Guia de build original
- [RELEASE-NOTES-0.0.7.md](./RELEASE-NOTES-0.0.7.md) - Notas de release

---

## 🎯 Resultado Final

Após executar `npm run make`, você terá:

1. ✅ Instalador assinado digitalmente
2. ✅ Pasta `nodes/` incluída (vazia, pronta para instalação)
3. ✅ README.md explicativo para usuários
4. ✅ Estrutura multi-plataforma (Windows/Linux/Mac)
5. ✅ Sistema funcional de Node.js portátil

**Pronto para distribuição! 🎉**
