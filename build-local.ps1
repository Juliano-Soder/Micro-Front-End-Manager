# 🚀 Script de Build Local Multi-Plataforma
# Execute com: .\build-local.ps1

Write-Host "🔥 Micro Front-End Manager - Build Multi-Plataforma" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Função para verificar se Docker está disponível
function Test-Docker {
    try {
        docker --version | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# Função para verificar se WSL está disponível
function Test-WSL {
    try {
        wsl --list --quiet | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

Write-Host ""
Write-Host "🖥️  Compilando para Windows (com certificado novo)..." -ForegroundColor Yellow
npm run make:win:fresh
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Windows build concluído!" -ForegroundColor Green
} else {
    Write-Host "❌ Erro no Windows build!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🐧 Verificando opções para Linux..." -ForegroundColor Yellow

# Opção 1: Docker (melhor opção)
if (Test-Docker) {
    Write-Host "🐳 Docker detectado! Compilando para Linux..." -ForegroundColor Green
    
    # Pull da imagem se não existir
    docker pull electronuserland/builder:wine
    
    # Build para Linux usando Docker
    docker run --rm `
        -v "${PWD}:/project" `
        -w /project `
        electronuserland/builder:wine `
        sh -c "npm ci && npm run make:linux"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Linux build concluído via Docker!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Erro no Linux build via Docker" -ForegroundColor Yellow
    }
}
# Opção 2: WSL (segunda opção)
elseif (Test-WSL) {
    Write-Host "🐧 WSL detectado! Tentando compilar via WSL..." -ForegroundColor Green
    
    try {
        wsl -e bash -c "cd /mnt/d/workdir/back-end/micro-front-end-manager && npm run make:linux"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Linux build concluído via WSL!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Erro no Linux build via WSL" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️  Erro ao usar WSL" -ForegroundColor Yellow
    }
}
# Sem opções para Linux
else {
    Write-Host "⚠️  Nem Docker nem WSL detectados" -ForegroundColor Yellow
    Write-Host "💡 Para compilar para Linux, instale:" -ForegroundColor Cyan
    Write-Host "   - Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Cyan
    Write-Host "   - Ou WSL2: wsl --install" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "📁 Arquivos gerados:" -ForegroundColor Cyan
if (Test-Path "out") {
    Get-ChildItem -Path "out\make" -Recurse -File | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "   📦 $($_.Name) ($size MB)" -ForegroundColor White
    }
} else {
    Write-Host "   ❌ Nenhum arquivo encontrado em out/" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 Build concluído!" -ForegroundColor Green
Write-Host "📂 Verifique a pasta 'out/make' para os instaladores" -ForegroundColor Cyan
