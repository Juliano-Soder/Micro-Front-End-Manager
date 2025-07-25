# 🚀 Build Rápido - Instruções

## Para compilar tudo de uma vez:

### Opção 1: Script Automático
```bash
.\build-local.ps1
```

### Opção 2: Comando npm
```bash
npm run build:all
```

## Para compilar separadamente:

### Apenas Windows (certificado renovado automaticamente)
```bash
npm run make:win:fresh
```

### Apenas Windows (sem renovar certificado)
```bash
npm run make:win
```

### Apenas Linux (requer Docker)
```bash
npm run build:docker-linux
```

### Apenas renovar certificado
```bash
npm run cert:regen
```

## Arquivos gerados:
- **Windows**: `out/make/squirrel.windows/x64/MicroFrontEndManagerSetup.exe`
- **Linux**: `out/make/deb/x64/*.deb`, `out/make/rpm/x64/*.rpm`, `out/make/appimage/x64/*.AppImage`

## Pré-requisitos:
- ✅ Node.js (já instalado)
- ✅ npm (já instalado)
- 🐳 Docker Desktop (para Linux builds) - https://www.docker.com/products/docker-desktop

---
📝 **Dica**: Use `.\build-local.ps1` - ele detecta automaticamente suas opções e compila tudo!
