# Micro Front-End Manager

**Micro Front-End Manager** é um aplicativo desenvolvido em Electron para gerenciar projetos de micro front-ends. Ele permite clonar, iniciar, parar e excluir projetos de forma simples e eficiente, além de verificar dependências como Node.js e Angular CLI.

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

## 🛠️ Dependências

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
Para criar um instalador do aplicativo, execute:
```bash
npm run make
```

O instalador será gerado na pasta make. Envie o arquivo Setup.exe para os usuários.

### ⚠️ Notas Importantes
Certifique-se de que o Node.js e o Angular CLI estão instalados antes de usar o aplicativo.
O aplicativo verifica automaticamente as versões recomendadas:
Node.js: v16.10.0
Angular CLI: 13.3.11

### Licença
Este projeto está licenciado sob a licença ISC.

### ✨ Autor
Desenvolvido por Juliano Soder.



