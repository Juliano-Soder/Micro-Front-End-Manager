# Script para exportar certificado
$thumbprint = "13A61491130851563975C2241DFA162F526451DE"
$cert = Get-ChildItem -Path "cert:\CurrentUser\My\$thumbprint"
$pwd = ConvertTo-SecureString -String "MicroFE2025!" -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath ".\certs\micro-front-end-manager-new.pfx" -Password $pwd

Write-Host "Certificado exportado com sucesso!"
