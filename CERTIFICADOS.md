# 🔐 Sistema de Certificados Automático

## Como Funciona

O sistema agora regenera automaticamente o certificado antes de cada build Windows, garantindo:

- ✅ Certificado sempre válido e fresco
- ✅ Sem alertas do Windows Defender
- ✅ Processo automático, sem intervenção manual
- ✅ Builds confiáveis e consistentes

## Comandos Disponíveis

### Build com Certificado Novo (Recomendado)
```bash
npm run make:win:fresh
```
- Regenera certificado automaticamente
- Faz build assinado
- Processo completo em um comando

### Build com Certificado Existente
```bash
npm run make:win
```
- Usa certificado atual (se existir)
- Mais rápido, mas pode ter problemas se certificado for antigo

### Apenas Regenerar Certificado
```bash
npm run cert:regen
```
- Regenera apenas o certificado
- Útil para testes ou manutenção

### Build Completo (Windows + Linux)
```bash
npm run build:all
```
- Windows com certificado novo
- Linux via Docker
- Processo completo automatizado

## Estrutura de Arquivos

```
project/
├── scripts/
│   └── regenerate-cert.ps1          ← Script PowerShell para certificado
├── certs/
│   └── micro-front-end-manager-new.pfx ← Certificado gerado
├── build-win-fresh-cert.js          ← Script Node.js para build
└── forge.config.js                  ← Configuração usa o certificado
```

## Detalhes do Certificado

- **Tipo**: Code Signing Certificate (Self-Signed)
- **Algoritmo**: RSA 2048 bits
- **Validade**: 2 anos
- **Subject**: CN=MicroFrontEndManager, O=Grupo Casas Bahia, C=BR
- **Senha**: MicroFE2025!

## Processo Automático

1. **Limpeza**: Remove certificados antigos com mesmo nome
2. **Criação**: Gera novo certificado self-signed
3. **Exportação**: Salva como .pfx com senha
4. **Verificação**: Confirma que arquivo foi criado
5. **Build**: Executa electron-forge make com assinatura
6. **Resultado**: Instalador assinado em `out/make/squirrel.windows/x64/`

## Vantagens

### 🚀 **Automático**
- Não precisa se preocupar com certificados expirados
- Processo transparente

### 🛡️ **Seguro**  
- Cada build tem certificado único
- Reduz falsos positivos do antivírus

### ⚡ **Rápido**
- Certificado gerado em segundos
- Build completo em minutos

### 🔄 **Consistente**
- Sempre o mesmo processo
- Resultados previsíveis

## Troubleshooting

### Erro: "Execution Policy"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Erro: "Access Denied"
- Execute PowerShell como Administrador
- Ou use: `npm run cert:regen` em terminal administrativo

### Certificado não criado
- Verifique se pasta `certs/` existe
- Verifique permissões de escrita
- Execute: `npm run cert:regen` separadamente para debug

### Build falha após certificado
- Verifique se arquivo .pfx foi criado
- Confirme senha no forge.config.js
- Teste build sem assinatura primeiro

## Customização

### Alterar senha do certificado:
1. Edite `scripts/regenerate-cert.ps1` (linha do $Password)
2. Edite `forge.config.js` (certificatePassword)
3. Edite `build-win-fresh-cert.js` se necessário

### Alterar informações do certificado:
Edite o comando `New-SelfSignedCertificate` em `scripts/regenerate-cert.ps1`:

```powershell
-Subject "CN=SeuNome, O=SuaEmpresa, C=BR"
```

### Alterar validade:
```powershell
-ValidityPeriodUnits 3  # 3 anos ao invés de 2
```

## Verificação

Para verificar se o certificado está funcionando:

1. **Após build**: Verifique se `out/make/squirrel.windows/x64/MicroFrontEndManagerSetup.exe` existe
2. **Propriedades**: Clique direito no .exe → Propriedades → Assinaturas Digitais
3. **Deve mostrar**: "MicroFrontEndManager" como emissor

---

💡 **Dica**: Use sempre `npm run make:win:fresh` para garantir builds confiáveis!
