const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildWithFreshCert() {
    console.log('🔄 Iniciando build Windows com certificado renovado...\n');
    
    try {
        // Removido: Criação de estrutura nodes (não empacotada mais)
        // O usuário baixa as versões do Node.js via instalador interno do app
        
        // 1. Regenerar certificado
        console.log('🔐 Regenerando certificado...');
        const certScript = path.join(__dirname, 'scripts', 'regenerate-cert.ps1');
        
        execSync(`powershell -ExecutionPolicy Bypass -File "${certScript}"`, {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        
        console.log('✅ Certificado regenerado!\n');
        
        // 3. Verificar se o certificado foi criado
        const certPath = './certs/micro-front-end-manager-new.pfx';
        if (!fs.existsSync(certPath)) {
            throw new Error('Certificado não foi criado');
        }
        
        // 4. Fazer build
        console.log('🔨 Iniciando build para Windows...');
        const buildProcess = spawn('npm', ['run', 'make:win'], {
            stdio: 'inherit',
            shell: true,
            cwd: process.cwd()
        });
        
        buildProcess.on('close', (code) => {
            if (code === 0) {
                console.log('\n🎉 Build Windows concluído com sucesso!');
                console.log('📦 Instalador assinado disponível em: out/make/squirrel.windows/x64/');
                
                // Mostrar informações do certificado
                try {
                    const stats = fs.statSync(certPath);
                    console.log(`🔐 Certificado criado em: ${stats.birthtime.toLocaleString()}`);
                } catch (e) {
                    // Ignorar erro de stats
                }
            } else {
                console.error(`❌ Build falhou com código: ${code}`);
                process.exit(code);
            }
        });
        
        buildProcess.on('error', (err) => {
            console.error('❌ Erro no build:', err.message);
            process.exit(1);
        });
        
    } catch (error) {
        console.error('❌ Erro ao regenerar certificado:', error.message);
        console.log('\n💡 Dicas:');
        console.log('1. Execute como Administrador se necessário');
        console.log('2. Verifique se PowerShell permite execução de scripts');
        console.log('3. Execute: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser');
        process.exit(1);
    }
}

buildWithFreshCert();
