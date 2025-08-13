    // Instalação do Git no Windows
    const installGitWindows = async () => {
      try {
        sendLog('🪟 Detectado sistema Windows');
        
        // Função helper para aguardar confirmação do usuário
        const waitForUserConfirmation = (message) => {
          return new Promise((resolve) => {
            sendLog(message);
            sendLog('Digite "s" ou pressione Enter para continuar, ou qualquer outra tecla para pular:');
            
            // Cria interface de readline para capturar input do usuário
            const readline = require('readline');
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });
            
            rl.question('', (answer) => {
              rl.close();
              const shouldContinue = !answer || answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim' || answer === '';
              if (shouldContinue) {
                sendLog('✅ Continuando com a instalação...');
              } else {
                sendLog('⏭️ Pulando esta etapa...');
              }
              resolve(shouldContinue);
            });
          });
        };
        
        // Verifica se winget está disponível
        let hasWinget = false;
        let hasChoco = false;
        
        try {
          sendLog('🔍 Verificando se winget está instalado...');
          await execPromise('winget --version');
          sendLog('✅ winget encontrado!');
          hasWinget = true;
        } catch (wingetError) {
          sendLog('❌ winget não encontrado');
        }
        
        // Verifica se chocolatey está disponível
        if (!hasWinget) {
          try {
            sendLog('🔍 Verificando se chocolatey está instalado...');
            await execPromise('choco --version');
            sendLog('✅ chocolatey encontrado!');
            hasChoco = true;
          } catch (chocoError) {
            sendLog('❌ chocolatey não encontrado');
          }
        }
        
        // Se nenhum gerenciador está disponível, oferece instalação
        if (!hasWinget && !hasChoco) {
          sendLog('');
          sendLog('🛠️ Nenhum gerenciador de pacotes encontrado (winget/chocolatey)');
          sendLog('Para instalar o Git automaticamente, precisamos de um gerenciador de pacotes.');
          sendLog('');
          sendLog('Opções disponíveis:');
          sendLog('1. winget (recomendado - moderno e integrado ao Windows)');
          sendLog('2. chocolatey (alternativa popular)');
          sendLog('');
          
          // Tenta instalar winget primeiro
          const shouldInstallWinget = await waitForUserConfirmation('🔄 Deseja instalar o winget (Microsoft App Installer)?');
          
          if (shouldInstallWinget) {
            try {
              sendLog('📥 Instalando winget (Microsoft App Installer)...');
              sendLog('Isso pode levar alguns minutos...');
              
              // Método 1: Tenta via Microsoft Store (mais confiável)
              try {
                sendLog('🏪 Abrindo Microsoft Store...');
                await execPromise('start ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1');
                sendLog('ℹ️ Microsoft Store aberta para instalar "App Installer".');
                sendLog('Após a instalação na Store, volte aqui.');
                
                const continueAfterStore = await waitForUserConfirmation('✅ Instalou o App Installer via Microsoft Store?');
                if (continueAfterStore) {
                  // Verifica se winget agora está disponível
                  await execPromise('winget --version');
                  sendLog('✅ winget instalado e funcionando!');
                  hasWinget = true;
                } else {
                  throw new Error('Usuário não confirmou instalação via Store');
                }
                
              } catch (storeError) {
                sendLog('⚠️ Método via Store não funcionou, tentando download direto...');
                
                // Método 2: Download direto do pacote
                try {
                  const downloadWingetCommand = [
                    '$ProgressPreference = "SilentlyContinue"',
                    'Write-Output "Baixando Microsoft App Installer..."',
                    '$url = "https://github.com/microsoft/winget-cli/releases/latest/download/Microsoft.DesktopAppInstaller_8wekyb3d8bbwe.msixbundle"',
                    '$output = "$env:TEMP\\Microsoft.DesktopAppInstaller.msixbundle"',
                    'Invoke-WebRequest -Uri $url -OutFile $output -UseBasicParsing',
                    'Write-Output "Instalando Microsoft App Installer..."',
                    'Add-AppxPackage -Path $output',
                    'Write-Output "winget instalado com sucesso!"'
                  ].join('; ');
                  
                  await execPromise(`powershell -ExecutionPolicy Bypass -Command "${downloadWingetCommand}"`);
                  
                  // Verifica se a instalação funcionou
                  await execPromise('winget --version');
                  sendLog('✅ winget instalado com sucesso via download direto!');
                  hasWinget = true;
                } catch (downloadError) {
                  throw new Error(`Falha no download: ${downloadError.message}`);
                }
              }
              
            } catch (wingetInstallError) {
              sendLog(`❌ Falha na instalação do winget: ${wingetInstallError.message}`);
              sendLog('');
              sendLog('💡 Instalação manual do winget:');
              sendLog('1. Método 1 (Recomendado):');
              sendLog('   • Abra a Microsoft Store');
              sendLog('   • Procure por "App Installer"');
              sendLog('   • Instale ou atualize o App Installer');
              sendLog('');
              sendLog('2. Método 2 (Download direto):');
              sendLog('   • Acesse: https://aka.ms/getwinget');
              sendLog('   • Baixe e instale o arquivo .msixbundle');
              sendLog('');
              sendLog('3. Após a instalação, reinicie este processo');
              sendLog('');
            }
          }
          
          // Se winget falhou, tenta chocolatey
          if (!hasWinget) {
            const shouldInstallChoco = await waitForUserConfirmation('🔄 winget não disponível. Deseja instalar o chocolatey?');
            
            if (shouldInstallChoco) {
              try {
                sendLog('📥 Instalando chocolatey...');
                sendLog('Isso pode levar alguns minutos...');
                
                const installChocoCommand = [
                  'Set-ExecutionPolicy Bypass -Scope Process -Force',
                  '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072',
                  'iex ((New-Object System.Net.WebClient).DownloadString("https://community.chocolatey.org/install.ps1"))'
                ].join('; ');
                
                await execPromise(`powershell -ExecutionPolicy Bypass -Command "${installChocoCommand}"`);
                sendLog('✅ chocolatey instalado com sucesso!');
                hasChoco = true;
                
                // Recarrega PATH para chocolatey
                sendLog('🔄 Recarregando variáveis de ambiente...');
                process.env.PATH = process.env.PATH + ';C:\\ProgramData\\chocolatey\\bin';
                
              } catch (chocoInstallError) {
                sendLog(`❌ Erro na instalação do chocolatey: ${chocoInstallError.message}`);
                sendLog('💡 Instalação manual do chocolatey:');
                sendLog('1. Abra PowerShell como Administrador');
                sendLog('2. Execute: Set-ExecutionPolicy Bypass -Scope Process -Force');
                sendLog('3. Execute: iex ((New-Object System.Net.WebClient).DownloadString("https://chocolatey.org/install.ps1"))');
                sendLog('4. Reinicie este processo');
              }
            }
          }
        }
        
        // Agora tenta instalar Git com o gerenciador disponível
        sendLog('');
        sendLog('📥 Tentando instalar Git...');
        
        if (hasWinget) {
          try {
            sendLog('🔄 Instalando Git via winget...');
            await execPromise('winget install --id Git.Git -e --source winget --silent');
            sendLog('✅ Git instalado com sucesso via winget!');
            return true;
          } catch (wingetGitError) {
            sendLog(`⚠️ Falha na instalação via winget: ${wingetGitError.message}`);
            hasWinget = false; // Marca como não disponível para próxima tentativa
          }
        }
        
        if (hasChoco) {
          try {
            sendLog('🔄 Instalando Git via chocolatey...');
            await execPromise('choco install git -y');
            sendLog('✅ Git instalado com sucesso via chocolatey!');
            return true;
          } catch (chocoGitError) {
            sendLog(`⚠️ Falha na instalação via chocolatey: ${chocoGitError.message}`);
          }
        }
        
        // Se chegou aqui, todos os métodos falharam
        sendLog('');
        sendLog('❌ Instalação automática do Git falhou');
        sendLog('💡 Instalação manual recomendada:');
        sendLog('');
        sendLog('📋 OPÇÕES DE INSTALAÇÃO MANUAL:');
        sendLog('1. Site oficial: https://git-scm.com/download/win');
        sendLog('2. Via Microsoft Store: procure "Git"');
        sendLog('3. Via GitHub Desktop (inclui Git): https://desktop.github.com/');
        sendLog('');
        sendLog('⚠️ Após a instalação manual:');
        sendLog('• Reinicie o Micro Front-End Manager');
        sendLog('• Ou adicione Git ao PATH do sistema');
        sendLog('');
        
        return false;
        
      } catch (error) {
        sendLog(`❌ Erro crítico na instalação do Git no Windows: ${error.message}`);
        return false;
      }
    };
