# 🚀 Guia de Build Local Multi-Plataforma

Este guia explica como fazer build da aplicação localmente na sua máquina Windows.

## 📋 Pré-requisitos

- Node.js 16+ 
- npm
- **Para Linux**: Docker Desktop OU WSL2

## 🖥️ Plataformas Suportadas

### Windows
- **Formato**: `.exe` (instalador Squirrel)
- **Certificado**: Assinado automaticamente para evitar Windows Defender

### Linux
- **Ubuntu/Debian**: `.deb`
- **CentOS/Fedora**: `.rpm`  
- **Universal**: `.AppImage`

## 🔨 Como Fazer Build

### Opção 1: Script Automático (Recomendado)
```bash
# PowerShell (mais completo)
.\build-local.ps1

# Ou CMD/Batch (mais simples)  
build-local.bat
```

### Opção 2: Comandos Manuais

#### Build apenas Windows
```bash
npm run make:win
```

#### Build Linux (requer Docker)
```bash
# Instalar Docker Desktop primeiro
# Então executar:
npm run build:docker-linux

# Ou builds específicos:
npm run make:linux-deb     # Apenas .deb
npm run make:linux-rpm     # Apenas .rpm  
npm run make:linux-appimage # Apenas .AppImage
```

## 🐳 Configuração Docker (Para Linux)

### 1. Instalar Docker Desktop
- Download: https://www.docker.com/products/docker-desktop
- Instalar e iniciar o Docker Desktop
- Verificar: `docker --version`

### 2. Fazer Build
```bash
npm run build:docker-linux
```

## 🐧 Alternativa: WSL2 (Para Linux)

### 1. Instalar WSL2
```powershell
wsl --install
```

### 2. Configurar no WSL
```bash
# Dentro do WSL
cd /mnt/d/workdir/back-end/micro-front-end-manager
npm install
npm run make:linux
```

## 📁 Estrutura de Output

Após o build, os arquivos ficam em:
```
out/
├── make/
│   ├── squirrel.windows/
│   │   └── x64/
│   │       ├── MicroFrontEndManagerSetup.exe  ← Instalador Windows
│   │       └── *.nupkg
│   ├── deb/
│   │   └── x64/
│   │       └── *.deb                          ← Ubuntu/Debian
│   ├── rpm/
│   │   └── x64/
│   │       └── *.rpm                          ← CentOS/Fedora
│   └── appimage/
│       └── x64/
│           └── *.AppImage                     ← Linux Universal
```

## 🐧 Instalação no Linux

### Ubuntu/Debian (.deb)
```bash
sudo dpkg -i micro-front-end-manager_*.deb
sudo apt-get install -f  # Se houver dependências faltando
```

### CentOS/Fedora (.rpm)
```bash
sudo rpm -i micro-front-end-manager-*.rpm
# ou
sudo dnf install micro-front-end-manager-*.rpm
```

### AppImage (Universal)
```bash
chmod +x MicroFrontEndManager-*.AppImage
./MicroFrontEndManager-*.AppImage
```

## 🔧 Troubleshooting

### Erro de Cross-Platform
Se tentar fazer build para Linux no Windows:
```
Error: Cannot build for linux on win32
```

**Soluções**:
1. Use Docker: `npm run build:docker-linux`
2. Use GitHub Actions (push para repo)
3. Use uma VM Linux ou WSL2

### Dependências Faltando (Linux)
```bash
# Ubuntu/Debian
sudo apt-get install libnss3-dev libatk-bridge2.0-dev libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxss1 libasound2

# CentOS/Fedora  
sudo dnf install nss atk at-spi2-atk libdrm libXcomposite libXdamage libXrandr mesa-libgbm libXss alsa-lib
```

## 🚀 Release Automático

Para criar um release automático:

1. Crie uma tag:
```bash
git tag v0.0.4
git push origin v0.0.4
```

2. O GitHub Actions irá:
   - Fazer build para todas as plataformas
   - Criar um release com os arquivos
   - Disponibilizar para download

## 📝 Notas

- **Windows**: Certificado auto-assinado para evitar alertas
- **Linux**: Testado em Ubuntu 20.04+ e CentOS 8+
- **Tamanho**: ~150MB (inclui runtime do Electron)
- **Arquitetura**: x64 (64-bit)
