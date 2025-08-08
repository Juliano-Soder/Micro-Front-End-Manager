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
    try {
        # Carrega o certificado e verifica validade real
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($OutputPath, $Password)
        $daysUntilExpiry = ($cert.NotAfter - (Get-Date)).TotalDays
        
        if ($daysUntilExpiry -gt 90) {
            Write-Host "Certificado existente ainda valido ($([math]::Round($daysUntilExpiry, 0)) dias restantes)" -ForegroundColor Green
            Write-Host "Valido ate: $($cert.NotAfter.ToString('dd/MM/yyyy HH:mm'))" -ForegroundColor Green
            Write-Host "Usando certificado: $OutputPath" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "Certificado expira em $([math]::Round($daysUntilExpiry, 0)) dias. Regenerando..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Erro ao verificar certificado existente. Regenerando..." -ForegroundColor Yellow
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
    
    # Versão mais robusta com parâmetros adequados para code signing
    $cert = New-SelfSignedCertificate `
        -Subject "CN=$CertName, O=Grupo Casas Bahia, C=BR" `
        -NotAfter (Get-Date).AddYears(2) `
        -KeyUsage DigitalSignature `
        -Type CodeSigningCert `
        -CertStoreLocation "Cert:\CurrentUser\My"

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
