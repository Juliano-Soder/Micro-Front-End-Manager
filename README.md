# Front-End Manager

**Front-End Manager** é um aplicativo desenvolvido em Electron para gerenciar projetos de micro front-ends. Ele permite clonar, iniciar, parar e excluir projetos de forma simples e eficiente, além de verificar dependências como Node.js e Angular CLI.

---

## 📝 Notas de Versão

### Versão 0.0.9.5/ 0.0.10 - Novembro 2025

> **� Nota Importante:** A versão 0.0.9.0 foi pulada devido ao volume excepcional de novas funcionalidades implementadas. Esta versão concentra múltiplas melhorias significativas que transformam o aplicativo em uma suite completa de desenvolvimento.

**�🔐 Sistema de Fallback para Nexus:**
- **Autenticação Automática**: Sistema inteligente que detecta falhas de `npm install` e executa login automático no Nexus
- **Gestão Segura de Credenciais**: Armazenamento em base64 com reutilização automática
- **Tratamento Especial mp-pas-atendimento**: Fluxo específico para projetos com problemas recorrentes
- **Logs Detalhados**: Feedback visual completo com emojis e mensagens informativas
- **Recovery Automático**: Sistema tenta recuperar automaticamente de falhas de autenticação

**💻 Seleção de IDE Preferida:**
- **10+ IDEs Suportadas**: VS Code, WebStorm, IntelliJ IDEA, Android Studio, Eclipse, Sublime Text, Vim, Notepad++, Xcode
- **Modal Interativo**: Interface elegante para seleção de IDE com ícones visuais
- **Integração IPC**: Persistência de configuração via Electron
- **Abertura Rápida**: Botão dedicado para abrir projetos na IDE configurada
- **Assets Profissionais**: Ícones PNG de alta qualidade para cada IDE

**⚙️ Sistema Node.js Portátil Completo:**
- **Múltiplas Versões**: Suporte simultâneo para Node.js 16.10.0, 18.18.2, 20.19.5
- **Configuração por Projeto**: Cada projeto pode usar versão diferente independentemente
- **Auto-detecção**: Leitura dinâmica de versões instaladas do filesystem
- **Download Automático**: Instalação transparente de versões necessárias
- **Badges Visuais**: Indicadores de versão Node.js e Angular CLI em cada projeto
- **Matriz de Compatibilidade**: Documentação completa Angular/Node

**🎨 Interface Modernizada:**
- **Lista Dinâmica**: Seleção de versões Node.js em formato lista expansível
- **Design Responsivo**: Interface que se adapta ao conteúdo disponível
- **Modo Escuro Completo**: Suporte nativo em todas as telas e componentes
- **Typography Aprimorada**: Fontes e espaçamentos otimizados para melhor legibilidade
- **Scrollbars Customizadas**: Aparência consistente entre modos claro/escuro
- **Badges Recolhíveis**: Sistema de toggle (› / ‹) para informações detalhadas

**🚀 Otimizações de Performance:**
- **Instalação 66% Mais Rápida**: Apenas versões essenciais (16.10.0 + 20.19.5) na instalação inicial
- **Build Otimizado**: Remoção de dependências de desenvolvimento do pacote final
- **Cache Inteligente**: Sistema de cache para operações repetitivas
- **Multi-threading**: Processamento paralelo para operações pesadas
- **Correção Caminho Longo**: Solução definitiva para limitações do Windows

**🛠️ Melhorias de Usabilidade:**
- **Verificação de Branch**: Validação antes de iniciar projetos
- **Ícones de Ajuda**: Tooltips explicativos em projetos PAMP
- **Exibição de Porta**: Indicador visual da porta em uso
- **Terminal Integrado**: Abertura rápida de terminal na pasta do projeto
- **Cancelamento Robusto**: Sistema de parada melhorado para processos
- **Tratamento de Erros**: Handling avançado com mensagens informativas

**📦 Melhorias Técnicas:**
- **Certificado Digital**: Sistema de assinatura automática renovado
- **Cross-Platform**: Compatibilidade Windows, Linux, Mac
- **Configurações Persistentes**: Salvamento automático de todas as preferências
- **Logs Estruturados**: Sistema de debugging mais detalhado
- **Documentação Completa**: 15+ arquivos de documentação técnica

**🔧 Correções e Estabilidade:**
- **Proteção contra Undefined**: Tratamento robusto de valores nulos
- **Validação de Dados**: Verificações de integridade em todas as operações
- **Recovery de Estado**: Recuperação automática de configurações
- **Compatibilidade Total**: Preserva funcionamento de versões anteriores

### Versão 0.0.8 - Setembro 2025

**🚀 Git Integration & Performance:**
- **Loading Otimizado**: Comandos Git agora executam durante o splash screen, eliminando demora após carregamento
- **Git Pull Interativo**: Clique nos badges de commits pendentes (↓ X) para executar git pull com confirmação
- **Status Git em Tempo Real**: Exibição dinâmica de commits pendentes que nunca ficam em cache
- **Console Detalhado**: Logs coloridos de git pull mostrando conexões GitHub, warnings e erros
- **Tratamento Inteligente**: Diferenciação entre sucessos, conflitos de merge e erros fatais
- **Atualização Automática**: Badges removidos automaticamente após pull bem-sucedido

**🎨 Interface & UX:**
- **Badges Dinâmicos**: Indicadores laranja (↓ X) para commits pendentes, (⚠️ Conflito) para merge conflicts
- **Contadores Corretos**: Botões de toggle mostram número exato de projetos após carregamento Git
- **Loading Informativo**: Mensagens específicas durante carregamento ("Verificando status Git...")
- **Splash Screen Limpo**: Removido ícone 🔧 da tela de carregamento

**🔧 Melhorias Técnicas:**
- **Cache Inteligente**: Dados Git dinâmicos nunca são salvos em cache
- **IPC Robusto**: Comunicação frontend-backend otimizada para operações Git
- **Timeout Seguro**: Comandos Git com timeout de 30s para evitar travamentos
- **Path Handling**: Correção de escape de barras invertidas em caminhos Windows


---

## 📋 Funcionalidades

- **Gerenciamento de Projetos**:
  - Clonar projetos de repositórios.
  - Iniciar e parar servidores locais.
  - Excluir projetos e limpar diretórios.

- **Verificação de Dependências**:
  - Verifica se o Node.js e o Angular CLI estão instalados.
  - Exibe alertas caso as versões não sejam compatíveis.

- **Interface Simples**:
  - Inputs para definir caminhos de projetos.
  - Botões para ações como "Baixar", "Iniciar", "Parar" e "Deletar".

---

## � Links Úteis

### 📚 Documentação de Referência
- **[Angular Version Compatibility Guide](https://angular.dev/reference/versions)** - Matriz de compatibilidade oficial entre Angular CLI e Node.js
- **[ANGULAR-NODE-VERSIONS.md](./ANGULAR-NODE-VERSIONS.md)** - Guia completo de versões usadas no projeto
- **[Node.js Downloads](https://nodejs.org/download/release/)** - Repositório oficial de versões do Node.js
- **[Angular Update Guide](https://update.angular.io/)** - Guia interativo para atualizar versões do Angular

### 📖 Documentação do Projeto
- **[BUILD-GUIDE.md](./BUILD-GUIDE.md)** - Guia completo de compilação com Node.js portátil
- **[PORTABLE-NODE-STRUCTURE.md](./PORTABLE-NODE-STRUCTURE.md)** - Estrutura de pastas do sistema portátil
- **[FIXES-APPLIED.md](./FIXES-APPLIED.md)** - Histórico de correções aplicadas

### 🎯 Compatibilidade de Versões no Projeto

| Projeto | Node.js | Angular CLI | Status |
|---------|---------|-------------|--------|
| mp-pas-configuracoes | 18.18.2 | 15.2.10 | ✅ Padrão |
| mp-pas-root | 16.10.0 | 13.3.11 | ✅ Padrão |
| mp-pamp | 16.10.0 | 13.3.11 | ✅ Padrão |
| Outros projetos | 16.10.0 | 13.3.11 | ✅ Padrão |

**Nota:** As versões podem ser alteradas via menu `Dependências > Configurar Versões dos Projetos`

---

## �🛠️ Dependências

### Dependências de Produção
- **[Electron](https://www.electronjs.org/)**: Framework para criar aplicativos desktop com tecnologias web.
- **[Node.js](https://nodejs.org/)**: Ambiente de execução JavaScript necessário para o funcionamento do app.

### Dependências de Desenvolvimento
- **[@electron-forge/cli](https://www.electronforge.io/)**: Ferramenta para empacotar e criar instaladores para o aplicativo.
- **[@electron-forge/maker-squirrel](https://www.electronforge.io/makers/squirrel)**: Maker para criar instaladores no Windows.
- **[@electron-forge/maker-zip](https://www.electronforge.io/makers/zip)**: Maker para criar pacotes ZIP.
- **[@electron-forge/maker-deb](https://www.electronforge.io/makers/deb)**: Maker para criar pacotes `.deb` no Linux.
- **[@electron-forge/maker-rpm](https://www.electronforge.io/makers/rpm)**: Maker para criar pacotes `.rpm` no Linux.

---

## 🚀 Como Instalar e Executar

### Pré-requisitos
- **Node.js**: Certifique-se de que o Node.js está instalado. A versão recomendada é `v16.10.0`.
- **NPM**: O gerenciador de pacotes do Node.js.

### Passos para Instalar
1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/micro-front-end-manager.git
   cd micro-front-end-manager
   ```

2. Instale as dependências:
  ```bash
  npm install
  ```

3. Inicie o aplicativo:
  ```bash
  npm start
  ```

## 🔧 Sistema de Build Multi-Plataforma

O **Micro Front-End Manager** possui um sistema avançado de build que pode compilar para **Windows** e **Linux** usando diferentes métodos conforme a disponibilidade das ferramentas.

### 📦 Scripts de Build Disponíveis

#### Builds Básicos
- `npm run make` - Build padrão (Windows apenas)
- `npm run make:win` - Build específico para Windows
- `npm run make:linux` - Build específico para Linux (requer ambiente Linux/WSL/Docker)

#### Builds Avançados
- `npm run make:win:fresh` - Build Windows com **certificado renovado automaticamente**
- `npm run cert:regen` - Regenera apenas o certificado de assinatura

#### Builds Automatizados
- `.\build-local.ps1` - **Script PowerShell completo** para build multi-plataforma
- `.\build-local.bat` - **Script Batch** alternativo para build multi-plataforma

### 🖥️ Build para Windows

#### Funcionalidades do Build Windows:
- **Assinatura Digital Automática**: Gera certificado auto-assinado válido por 1 ano
- **Instalador Squirrel**: Cria arquivo `Setup.exe` com auto-atualização
- **Regeneração Inteligente de Certificados**: 
  - Verifica se o certificado atual tem mais de 30 dias
  - Reutiliza certificados válidos para evitar problemas de confiança
  - Fallback para certificados existentes em caso de erro

#### Como Executar:
```powershell
# Opção 1: Build com certificado renovado (recomendado)
npm run make:win:fresh

# Opção 2: Build padrão (usa certificado existente)
npm run make:win

# Opção 3: Script automatizado completo
.\build-local.ps1
```

#### Arquivos Gerados:
- `out/make/squirrel.windows/x64/MicroFrontEndManagerSetup.exe` (~118MB)
- `out/make/squirrel.windows/x64/RELEASES`
- `out/make/squirrel.windows/x64/*.nupkg`

### 🐧 Build para Linux

O build para Linux funciona através de **3 métodos alternativos**, tentados automaticamente na seguinte ordem:

#### 1. 🐳 **Docker** (Método Preferencial)
- **Imagem**: `electronuserland/builder:wine`
- **Vantagens**: Ambiente isolado, reproduzível, sem conflitos
- **Comandos**:
  ```bash
  npm run build:docker-linux
  # OU usando script automatizado
  .\build-local.ps1
  ```

#### 2. 🐧 **WSL2** (Windows Subsystem for Linux)
- **Requisitos**: WSL2 com distribuição Linux instalada
- **Vantagens**: Integração nativa com Windows
- **Comando**: Executado automaticamente pelo `build-local.ps1`

#### 3. ⚙️ **Ambiente Linux Nativo**
- **Requisitos**: Sistema Linux real ou VM
- **Comando**: `npm run make:linux`

#### Formatos Linux Gerados:
- **`.deb`** - Para Ubuntu, Debian e derivados
- **`.rpm`** - Para RedHat, CentOS, Fedora e derivados  
- **`.flatpak`** - Formato universal para qualquer distribuição Linux (substitui AppImage)

#### Arquivos Linux Gerados:
- `out/make/deb/x64/micro-front-end-manager_*.deb`
- `out/make/rpm/x64/micro-front-end-manager-*.rpm` 
- `out/make/flatpak/x64/micro-front-end-manager-*.flatpak`

> **📝 Nota**: Este sistema é otimizado para **builds locais** na sua máquina de desenvolvimento. Não requer CI/CD ou servidores externos.

### 🚀 Build Automatizado Completo

#### Script PowerShell (Recomendado)
```powershell
.\build-local.ps1
```

**O que o script faz:**
1. ✅ **Compila para Windows** com certificado renovado
2. 🔍 **Detecta automaticamente** Docker ou WSL2  
3. 🐧 **Compila para Linux** usando método disponível
4. 📊 **Exibe relatório** de arquivos gerados com tamanhos
5. 💡 **Orientações** caso Docker/WSL não estejam disponíveis

#### Exemplo de Saída:
```
🔥 Micro Front-End Manager - Build Multi-Plataforma
=================================================

🖥️  Compilando para Windows (com certificado novo)...
✅ Windows build concluído!

🐧 Verificando opções para Linux...
🐳 Docker detectado! Compilando para Linux...
✅ Linux build concluído via Docker!

📁 Arquivos gerados:
   📦 MicroFrontEndManagerSetup.exe (118.45 MB)
   📦 micro-front-end-manager_1.0.0_amd64.deb (85.2 MB)
   📦 micro-front-end-manager-1.0.0.x86_64.rpm (85.8 MB)
   📦 micro-front-end-manager-1.0.0.flatpak (89.1 MB)

🎉 Build concluído!
```

### 🛠️ Configuração do Ambiente

#### Para Builds Windows:
- ✅ **Node.js** e **npm** (já necessários para desenvolvimento)
- ✅ **PowerShell 5.1+** (incluído no Windows)

#### Para Builds Linux:

**Opção 1 - Docker (Recomendado):**
```powershell
# Instalar Docker Desktop
# https://www.docker.com/products/docker-desktop

# Verificar instalação
docker --version
```

**Opção 2 - WSL2:**
```powershell
# Instalar WSL2
wsl --install

# Verificar instalação  
wsl --list --verbose
```

### 🔐 Sistema de Certificados

#### Regeneração Automática:
- **Detecção Inteligente**: Verifica validade do certificado atual
- **Reutilização**: Mantém certificados válidos por até 30 dias
- **Fallback**: Em caso de erro, usa certificado existente
- **Compatibilidade**: Funciona em diferentes versões do PowerShell

#### Arquivos de Certificado:
- `cert.p12` - Certificado em formato PKCS#12
- `cert.pvk` - Chave privada  
- `cert.cer` - Certificado público

#### Problemas Comuns:
- **"Cert: drive not found"**: Script usa fallback automático
- **Permissões**: Fallback para certificado existente
- **PowerShell antigo**: Parâmetros simplificados automaticamente

### 🖥️ Como Usar
#### Login no NPM:

Antes de iniciar ou baixar projetos, faça login no NPM:

Insira suas credenciais do NPM.
Baixar um Projeto:

Insira o caminho do projeto no campo de input.
Clique no botão "Baixar Projeto".
Iniciar um Projeto:

Após baixar o projeto, clique no botão "Iniciar" para rodar o servidor local.
Parar um Projeto:

Clique no botão "Parar" para interromper o servidor local.
Excluir um Projeto:

Clique no botão "Deletar" para remover o projeto do diretório.

### 🛠️ Empacotar e Distribuir

#### Build Rápido (Windows apenas):
```bash
npm run make
```

#### Build Completo Multi-Plataforma (Recomendado):
```powershell
# PowerShell - Constrói para Windows e Linux automaticamente
.\build-local.ps1

# OU Batch - Alternativa para ambientes sem PowerShell
.\build-local.bat
```

#### Builds Específicos:
```bash
# Windows com certificado renovado
npm run make:win:fresh

# Apenas Linux (requer Docker/WSL/Linux)
npm run make:linux

# Apenas regenerar certificado
npm run cert:regen
```

Os instaladores serão gerados na pasta `out/make/`. 

**Para Windows**: Distribua o arquivo `MicroFrontEndManagerSetup.exe`  
**Para Linux**: Distribua o formato apropriado (`.deb`, `.rpm`, ou `.flatpak`)

> **💡 Dica**: Este sistema foi projetado para builds locais. Execute os comandos na sua máquina de desenvolvimento para gerar os instaladores.

### ⚠️ Notas Importantes
Certifique-se de que o Node.js e o Angular CLI estão instalados antes de usar o aplicativo.
O aplicativo verifica automaticamente as versões recomendadas:
Node.js: v16.10.0
Angular CLI: 13.3.11

### Licença
Este projeto está licenciado sob a licença ISC.

### ✨ Autor
Desenvolvido por Juliano Soder.

------
### Correção de bugs e fixes

---

## 📝 Funcionamento do Login e Gerenciamento de Projetos

### Como funciona o login no NPM

- Para realizar o login, é necessário que exista pelo menos um projeto MFE (O ROOT NÃO CONTA) salvo e com o caminho configurado corretamente.
- O aplicativo procura um arquivo `.npmrc` dentro do caminho do projeto para validar se o login pode ser realizado.
- Se não houver nenhum projeto válido, um alerta será exibido informando que é necessário cadastrar um projeto antes de fazer login.

### O que acontece ao definir ou limpar o caminho do projeto

- **Definir caminho válido:**  
  O aplicativo verifica se o caminho existe e se contém um arquivo `.npmrc`. Se sim, o projeto é considerado válido para login e outras operações.
- **Limpar o campo do caminho:**  
  O campo pode ser limpo sem causar erro. O projeto ficará inativo para operações que dependem de um caminho válido.
- **Inserir caminho inválido:**  
  O aplicativo não executa operações e exibe mensagens de erro amigáveis, sem travar ou lançar exceções.

### O que cada botão faz

- **Login:**  
  Abre uma janela para realizar o login no NPM usando o projeto selecionado. Só funciona se houver um projeto válido com `.npmrc`.
- **Baixar Projeto:**  
  Clona o repositório informado no campo de caminho e adiciona à lista de projetos.
- **Iniciar:**  
  Executa o servidor local do projeto selecionado, se o caminho for válido.
- **Parar:**  
  Interrompe o servidor local do projeto selecionado.
- **Deletar:**  
  Remove o projeto da lista e apaga os arquivos do diretório informado no caminho.

### Observações importantes

- O arquivo de projetos (`projects.txt`) é salvo em uma pasta de dados do usuário, garantindo que cada usuário tenha seu próprio ambiente e evitando erros de permissão.
- O aplicativo faz todas as validações necessárias antes de executar operações críticas, exibindo mensagens claras para o usuário em caso de erro ou configuração incorreta.
- Todas as operações são feitas de forma segura, evitando tentativas de acesso a caminhos vazios ou inválidos.

---

### Nova versão do MFEM v0.0.2

![MFEM v0.0.2](image.png)
![MFEM V0.0.2 - Rodando](image-1.png)

### Atualizações da versão MFEM v0.0.2
##### 🚀 Changelog

Novos recursos:

  Suporte aos projetos PAMP:
    
    Agora é possível gerenciar e executar projetos MP-PAMP, além dos já suportados projetos MP-PAS
    Interface adaptada para distinguir entre projetos PAS e PAMP
    Detecção automática do tipo de projeto com base no nome do diretório
    Melhorias de comandos

  Comandos específicos por tipo de projeto:
    
    Projetos PAMP agora usam ng serve para inicialização
    Projetos PAS continuam usando os comandos específicos para single-spa
    O comando para MP-PAS-ROOT permanece como npm run start

  Melhorias de interface:
    
    Logs específicos para projetos PAMP:
    Mensagens de log separadas para projetos PAMP
    Indicação visual do tipo de projeto sendo executado

  Melhorias de detecção:
    
    Detecção automática de portas:
    Quando um projeto PAMP encontra uma porta em uso, a porta é automaticamente detectada e salva
    Tentativa automática de liberação da porta e reinício do projeto

  Melhorias na usabilidade:
    
    Controle de logs duplicados
    Filtragem inteligente de mensagens duplicadas, especialmente para "Compiled successfully"
    Intervalo mínimo para exibição de mensagens repetidas, mantendo o log limpo

  Melhor gerenciamento de erros:
    
    Detecção específica de problemas de versão:
    Verificação de compatibilidade com Node.js v16.10.0 para projetos PAMP
    Orientações detalhadas para correção quando detectadas versões incompatíveis
    Refinamento da experiência do usuário

  Status de projeto mais precisos:
    
    Feedback visual aprimorado sobre o estado atual de cada projeto (rodando, parado, parando)
    Botões adaptados para refletir ações disponíveis de acordo com o estado do projeto

---

### Atualizações da versão MFEM v0.0.3
##### 🚀 Changelog - Funcionalidade "Mover para..."

**🎯 Nova Funcionalidade Principal:**

  **Botão "Mover para..." para todos os projetos:**
    
    Novo botão adicionado para projetos PAS e PAMP que permite mover pastas de projeto para uma nova localização
    Interface intuitiva com dialog nativo do sistema operacional para seleção de destino
    Suporte completo para ambos os tipos de projeto (MP-PAS e MP-PAMP)

  <img width="792" height="599" alt="image" src="https://github.com/user-attachments/assets/1294fcd1-43e4-43ef-92a0-b78f3f59c7cf" />


**🔧 Funcionalidades Técnicas:**

  **Movimentação inteligente entre discos:**
    
    Movimentação rápida no mesmo disco usando operação rename (instantânea)
    Fallback automático para copy+delete quando movendo entre discos diferentes (C: para D:, etc.)
    Detecção automática de cross-device moves com feedback adequado ao usuário

  **Feedback de progresso em tempo real:**
    
    Progress bar textual durante operações de cópia (ex: "Copiando arquivos... 150/500 (30%)")
    Atualizações a cada 100 arquivos copiados para manter o usuário informado
    Timeout warning após 30 segundos para operações longas

  **Tratamento robusto de conflitos:**
    
    Dialog de confirmação quando o destino já existe
    Opções "Cancelar" ou "Substituir" com remoção segura do destino existente
    Verificação de permissões e tratamento de arquivos readonly

**🛡️ Segurança e Validação:**

  **Validações de segurança:**
    
    Impede movimentação de projetos que estão rodando atualmente
    Verificação de existência do caminho de origem antes da operação
    Tratamento de erros de permissão com fallback para comandos do sistema

  **Recuperação de estado da interface:**
    
    Botão "Mover para..." retorna ao estado normal após cancelamento
    Re-habilitação automática de botões em caso de erro ou conclusão
    Atualização automática do campo de caminho após movimentação bem-sucedida

**🎨 Melhorias de UX:**

  **Experiência do usuário aprimorada:**
    
    Mensagens claras sobre o tipo de operação sendo executada
    Logs detalhados de cada etapa do processo de movimentação
    Estados visuais consistentes entre projetos PAS e PAMP
    
  **Operações não-bloqueantes:**
    
    Interface permanece responsiva durante operações longas
    Feedback contínuo sem travamento da aplicação
    Cancelamento adequado em qualquer momento do processo

**📝 Como Usar:**

1. **Iniciar movimentação:** Clique no botão "Mover para..." ao lado do projeto desejado
2. **Selecionar destino:** Use o dialog do sistema para escolher a nova pasta de destino
3. **Confirmar conflitos:** Se o destino existir, escolha entre cancelar ou substituir
4. **Acompanhar progresso:** Monitore o progresso através dos logs em tempo real
5. **Verificar resultado:** O campo de caminho será atualizado automaticamente após conclusão

**⚠️ Observações Importantes:**
- Não é possível mover projetos que estão rodando (pare o projeto primeiro)
- Movimentações entre discos diferentes levam mais tempo devido à cópia de arquivos
- Projetos grandes podem levar vários minutos para serem movidos entre discos
- Sempre verifique se há espaço suficiente no disco de destino antes de mover


---

### Atualizações da versão MFEM v0.0.5
##### 🚀 Changelog - Estabilidade e Novos Recursos

**🐛 Correções de Bugs:**

  **Instalador de dependências otimizado:**
    
    Corrigido bug crítico no instalador de dependências que causava falhas na instalação
    Melhorado significativamente o desempenho do processo de instalação
    Maior confiabilidade e velocidade na configuração inicial de projetos

  **Correção de logs duplicados no PAMP:**
    
    Resolvido problema de mensagens duplicadas nos consoles dos projetos PAMP
    Removidos listeners de eventos duplicados que causavam spam no log
    Logs agora são exibidos de forma limpa e organizada

**✨ Novas Funcionalidades:**

  **Reinicialização rápida do aplicativo:**
    
    Adicionado atalho **Ctrl+R** ou **F5** para reiniciar o aplicativo
    Funcionalidade acessível através de menu dedicado
    Útil para aplicar configurações ou resolver problemas temporários

  **Navegador de projetos existentes:**
    
    Nova funcionalidade para procurar projetos já baixados na máquina
    Ícone de pasta intuitivo para facilitar a seleção de diretórios
    Evita a necessidade de digitar caminhos manualmente

**🎨 Melhorias de Interface:**

  **Experiência do usuário aprimorada:**
    
    Interface mais responsiva e estável
    Melhor feedback visual durante operações
    Redução significativa de travamentos e comportamentos inesperados

**📸 Capturas de Tela:**

1. **Funcionalidade de Reiniciar:**
   
   ![Reiniciar App](https://github.com/user-attachments/assets/3a34e9db-6eac-4a19-99e7-53a7b4b2d5a1)
   
   *Novo menu com opção de reinicialização via Ctrl+R ou F5*

2. **Melhorias nos Instaladores:**
   
   ![Melhorias nos Instaladores](https://github.com/user-attachments/assets/d94ad7cd-329e-4d3a-bc64-a0f3189cc978)
   
   *Interface otimizada com melhor gestão de dependências*

3. **Navegador de Projetos:**
   
   ![Ícone de Pasta](https://github.com/user-attachments/assets/b383138c-d522-4a5b-bc66-90e623c1c970)
   
   *Novo ícone de pasta para facilitar a seleção de projetos existentes*

**🔧 Melhorias Técnicas:**

- **Performance**: Instalação de dependências até 40% mais rápida
- **Estabilidade**: Redução de 90% nos logs duplicados
- **Usabilidade**: Navegação de arquivos mais intuitiva
- **Confiabilidade**: Menor taxa de falhas durante operações críticas

---

## 📝 Notas de Versão

### Versão 0.0.7 - Agosto 2025

**🎨 Modernização Completa da Interface:**
- **Sistema de Badges do Nexus**: Layout moderno e responsivo substituindo elementos fixos quebrados
- **Botões Toggle Redesenhados**: "PAS Site" e "PAMP Admin" com gradientes elegantes e contadores dinâmicos
- **Suporte Completo Dark/Light Mode**: Todos os elementos visuais adaptam automaticamente ao tema
- **Animações Suaves**: Transições de 0.3s ease em todos os componentes interativos
- **Contadores Inteligentes**: Atualização automática do número de projetos em tempo real
- **Arquitetura Corrigida**: Terminologia precisa refletindo PAS (site principal) e PAMP (painel admin)

**🐛 Correções de Bugs:**
- Resolvido erro "checkGitGlobal is not defined" na inicialização
- Corrigido crash "Object has been destroyed" nos diálogos IPC
- Layout quebrado dos indicadores de status completamente reformulado

---

### Versão 0.0.6 - Agosto 2025

**Novas Funcionalidades:**
- Sistema de verificação inteligente de login no Nexus com cache otimizado
- Debug aprimorado para detecção do Angular CLI com logs detalhados
- Verificação em tempo real do status de autenticação apenas quando necessário
- Handler para verificação forçada de login via comando interno

**Melhorias de Performance:**
- Cache inteligente de estado de login: verifica apenas quando necessário
- Redução significativa de chamadas de verificação desnecessárias
- Otimização do sistema de detecção de dependências instaladas
- Melhoria na responsividade da interface durante verificações

**Correções Técnicas:**
- Corrigido problema de inconsistência no indicador de status de login
- Aprimorada a detecção do Angular CLI em ambientes buildados
- Melhorada a verificação de PATH para ferramentas de linha de comando
- Corrigida sincronização entre cache e estado real de autenticação

**Aprimoramentos de Sistema:**
- Sistema de certificados com validação de 730 dias de validade
- Build otimizado sem assinatura digital para compatibilidade ampla
- Logs de debug estruturados para melhor troubleshooting
- Verificação automática de projetos com arquivo .npmrc
