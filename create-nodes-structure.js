/**
 * Script para criar a estrutura de pastas nodes antes da compilação
 * Isso garante que a pasta existe no instalador, mesmo vazia
 */

const fs = require('fs');
const path = require('path');

// Diretório base
const baseDir = __dirname;
const nodesDir = path.join(baseDir, 'nodes');

// Estrutura de pastas a ser criada
const structure = {
  'windows': {},
  'linux': {},
  'mac': {}
};

console.log('🔨 Criando estrutura de pastas nodes...');

// Cria pasta nodes se não existir
if (!fs.existsSync(nodesDir)) {
  fs.mkdirSync(nodesDir, { recursive: true });
  console.log('✅ Pasta nodes/ criada');
} else {
  console.log('ℹ️  Pasta nodes/ já existe');
}

// Cria subpastas para cada sistema operacional
Object.keys(structure).forEach(osFolder => {
  const osPath = path.join(nodesDir, osFolder);
  
  if (!fs.existsSync(osPath)) {
    fs.mkdirSync(osPath, { recursive: true });
    console.log(`✅ Pasta nodes/${osFolder}/ criada`);
  } else {
    console.log(`ℹ️  Pasta nodes/${osFolder}/ já existe`);
  }
  
  // Cria arquivo .gitkeep para manter a pasta no git (opcional)
  const gitkeepPath = path.join(osPath, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '# Esta pasta é necessária para o Node.js portátil\n');
    console.log(`✅ Arquivo nodes/${osFolder}/.gitkeep criado`);
  }
});

// Cria arquivo README.md explicativo dentro de nodes/
const readmePath = path.join(nodesDir, 'README.md');
if (!fs.existsSync(readmePath)) {
  const readmeContent = `# 📦 Node.js Portátil

Esta pasta contém as versões portáteis do Node.js usadas pelo Micro Front-End Manager.

## 📁 Estrutura

\`\`\`
nodes/
├── windows/       # Versões do Node.js para Windows
├── linux/         # Versões do Node.js para Linux
└── mac/           # Versões do Node.js para macOS
\`\`\`

## 🔧 Instalação

As versões do Node.js podem ser instaladas de duas formas:

1. **Via menu da aplicação:**
   - Abra o Micro Front-End Manager
   - Menu: \`Dependências > Instalar Dependências Node.js\`
   - Aguarde o download e instalação automática

2. **Manual (avançado):**
   - Baixe o Node.js portátil do site oficial
   - Extraia para a pasta correspondente ao seu SO
   - Exemplo Windows: \`nodes/windows/node-v16.10.0/\`

## 📋 Versões Suportadas

- **Node 16.10.0** → Angular CLI 13.3.11
- **Node 18.18.2** → Angular CLI 15.2.10
- **Node 20.19.5** → Angular CLI 18.2.0

## ⚠️ Importante

- Não delete esta pasta
- Cada versão ocupa ~150MB após instalação
- Total esperado: ~450MB para as 3 versões

## 🔗 Links Úteis

- [Node.js Downloads](https://nodejs.org/download/release/)
- [Documentação completa](../PORTABLE-NODE-STRUCTURE.md)
`;

  fs.writeFileSync(readmePath, readmeContent);
  console.log('✅ Arquivo nodes/README.md criado');
} else {
  console.log('ℹ️  Arquivo nodes/README.md já existe');
}

console.log('\n🎉 Estrutura de pastas nodes criada com sucesso!');
console.log('📁 Localização:', nodesDir);
console.log('\n📝 Próximos passos:');
console.log('   1. Execute: npm run make');
console.log('   2. O instalador incluirá a pasta nodes/');
console.log('   3. Usuários podem instalar Node.js via menu da aplicação');
