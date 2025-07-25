param(
    [string]$CertName = "MicroFrontEndManager",
    [string]$Password = "MicroFE2025!",
    [string]$OutputPath = "./certs/micro-front-end-manager-new.pfx"
)

Write-Host "Verificando certificado para build..." -ForegroundColor Cyan

$certsDir = Split-Path $OutputPath -Parent
if (!(Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir -Force | Out-Null
    Write-Host "Pasta certs criada" -ForegroundColor Green
}

# Verificar se já existe um certificado válido
if (Test-Path $OutputPath) {
    $existingFile = Get-Item $OutputPath
    $ageInDays = (Get-Date) - $existingFile.LastWriteTime
    
    if ($ageInDays.TotalDays -lt 30) {
        Write-Host "Certificado existente ainda valido ($([math]::Round($ageInDays.TotalDays, 1)) dias)" -ForegroundColor Green
        Write-Host "Usando certificado: $OutputPath" -ForegroundColor Green
        exit 0
    }
}

Write-Host "Tentando criar novo certificado..." -ForegroundColor Yellow

try {
    # Verificar se está executando como Administrador
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    
    if (!$isAdmin) {
        Write-Host "Aviso: Nao esta executando como Administrador" -ForegroundColor Yellow
        Write-Host "Tentando criar certificado mesmo assim..." -ForegroundColor Yellow
    }
    
    # Versão mais simples sem parâmetros problemáticos
    $cert = New-SelfSignedCertificate `
        -Subject "CN=$CertName" `
        -NotAfter (Get-Date).AddYears(2)

    Write-Host "Certificado criado: $($cert.Thumbprint)" -ForegroundColor Green

    $securePwd = ConvertTo-SecureString -String $Password -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $OutputPath -Password $securePwd -Force | Out-Null
    
    Write-Host "Certificado exportado para: $OutputPath" -ForegroundColor Green
    
    if (Test-Path $OutputPath) {
        $fileSize = [math]::Round((Get-Item $OutputPath).Length / 1KB, 2)
        Write-Host "Tamanho do arquivo: $fileSize KB" -ForegroundColor White
        Write-Host "Certificado regenerado com sucesso!" -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "Nao foi possivel criar novo certificado: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Se chegou aqui, tentar usar o certificado existente
if (Test-Path $OutputPath) {
    Write-Host "Usando certificado existente..." -ForegroundColor Yellow
    $fileSize = [math]::Round((Get-Item $OutputPath).Length / 1KB, 2)
    Write-Host "Certificado encontrado: $OutputPath ($fileSize KB)" -ForegroundColor Green
    exit 0
} else {
    Write-Host "ERRO: Nenhum certificado disponivel!" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUCOES:" -ForegroundColor Yellow
    Write-Host "1. Execute como Administrador: 'Executar como administrador'" -ForegroundColor Cyan
    Write-Host "2. Ou continue sem assinatura (menos seguro)" -ForegroundColor Cyan
    exit 1
}
