const { spawn } = require('child_process');
const path = require('path');

// Script para fazer build Linux usando Docker no Windows
async function buildLinux() {
  console.log('🐧 Iniciando build para Linux usando Docker...');
  
  // Verificar se Docker está disponível
  const checkDocker = spawn('docker', ['--version'], { shell: true });
  
  checkDocker.on('error', () => {
    console.error('❌ Docker não encontrado!');
    console.log('\n💡 Para fazer build Linux no Windows:');
    console.log('1. Instale Docker Desktop: https://www.docker.com/products/docker-desktop');
    console.log('2. Ou use WSL2: wsl --install');
    console.log('3. Ou faça build apenas para Windows: npm run make:win');
    process.exit(1);
  });

  checkDocker.on('close', (code) => {
    if (code !== 0) {
      console.error('❌ Docker não está funcionando corretamente');
      process.exit(1);
    }

    console.log('🐳 Docker encontrado! Baixando imagem...');
    
    // Pull da imagem primeiro
    const pull = spawn('docker', ['pull', 'electronuserland/builder:wine'], {
      stdio: 'inherit',
      shell: true
    });

    pull.on('close', (pullCode) => {
      if (pullCode !== 0) {
        console.error('❌ Erro ao baixar imagem Docker');
        process.exit(1);
      }

      console.log('🔨 Iniciando build...');
      
      const dockerCommand = [
        'run', '--rm',
        '-v', `${process.cwd()}:/project`,
        '-w', '/project',
        'electronuserland/builder:wine',
        'sh', '-c', 'npm ci && npm run make:linux'
      ];

      const docker = spawn('docker', dockerCommand, {
        stdio: 'inherit',
        shell: true
      });

      docker.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Build para Linux concluído com sucesso!');
          console.log('📦 Arquivos gerados em ./out/make/');
        } else {
          console.error(`❌ Build falhou com código: ${code}`);
        }
      });

      docker.on('error', (err) => {
        console.error('❌ Erro ao executar Docker:', err.message);
      });
    });
  });
}

buildLinux();
