# Release Notes - Versão 0.9.5

**Data de Lançamento:** Outubro 31, 2025

## 🔐 Sistema de Fallback para Nexus

### Autenticação Automática
- **Fallback Inteligente**: Quando o `npm install` falha, o sistema automaticamente tenta fazer login no Nexus
- **Credenciais Persistentes**: As credenciais são salvas de forma segura em base64 e reutilizadas
- **Processo Transparente**: O usuário vê feedback visual durante todo o processo de autenticação

### Tratamento de Projetos Problemáticos
- **mp-pas-atendimento**: Implementação específica para projetos com problemas recorrentes de autenticação
- **Logs Detalhados**: Console mostra cada etapa do processo de fallback e instalação
- **Recuperação Automática**: Sistema tenta recuperar automaticamente de falhas de autenticação

### Segurança
- **Encoding Base64**: Credenciais são codificadas antes de serem salvas
- **Limpeza Automática**: Dados sensíveis são limpos da memória após uso
- **Validação**: Verificação de estado de autenticação antes de cada operação

## ⚙️ Detecção Dinâmica de Versões Node.js

### Auto-detecção de Versões
- **Leitura do Sistema de Arquivos**: O sistema agora lê diretamente as versões instaladas
- **Eliminação de Hardcode**: Não há mais versões fixas no código
- **Detecção Automática**: Identifica versões por padrão de nome de pasta (`node-v16.10.0-win-x64`)

### Compatibilidade Cross-Platform
- **Windows**: Busca por `node.exe` e `npm.cmd`
- **Linux/Mac**: Busca por `bin/node` e `bin/npm`
- **Validação**: Verifica se é uma instalação válida do Node.js antes de listar

## 🎨 Interface de Lista Simplificada

### Nova Interface de Seleção
- **Lista Clicável**: Versões do Node.js agora aparecem em lista vertical
- **Expansão Inteligente**: Clicar em uma versão expande para mostrar opções de Angular CLI
- **Visual Limpo**: Interface mais organizada e intuitiva

### Melhorias de UX
- **Status Visual**: Ícones indicam se a versão está instalada (✅) ou não (⚠️)
- **Feedback Imediato**: Mudanças são aplicadas instantaneamente
- **Proteção de Dados**: Tratamento robusto contra valores undefined

## 🛠️ Melhorias Técnicas

### Robustez
- **Tratamento de Erros**: Melhor handling de casos onde dados podem estar ausentes
- **Fallbacks**: Nomes de versão com fallback para evitar "undefined"
- **Logs de Debug**: Sistema de logging mais detalhado para diagnóstico

### Performance
- **Carregamento Otimizado**: Versões são carregadas uma vez e reutilizadas
- **Renderização Eficiente**: Re-renderização apenas dos componentes necessários
- **Memória**: Melhor gestão de dados em memória

## 📋 Arquivos Modificados

### Novos Arquivos
- `npm-fallback-handlers.js` - Sistema de fallback para Nexus
- `NEXUS-FALLBACK-IMPLEMENTATION.md` - Documentação da implementação
- `RELEASE-NOTES-0.9.5.md` - Este arquivo

### Arquivos Modificados
- `main.js` - Detecção automática de versões Node.js e integração com fallback
- `project-configs.html` - Nova interface de lista e proteção contra undefined
- `login.html` - Captura e salvamento de credenciais
- `package.json` - Atualização da versão
- `package-lock.json` - Atualização da versão
- `README.md` - Documentação das novas funcionalidades

## 🔄 Migração e Compatibilidade

### Compatibilidade com Versões Anteriores
- **Configurações Existentes**: Todas as configurações de projetos são mantidas
- **Funcionalidades**: Todas as funcionalidades da versão 0.0.8 são preservadas
- **Interface**: Transição suave para a nova interface de lista

### Melhorias Automáticas
- **Detecção**: Versões são detectadas automaticamente na primeira execução
- **Fallback**: Sistema de fallback funciona retroativamente em projetos existentes
- **Configuração**: Nenhuma configuração manual necessária

## 🎯 Próximos Passos

### Funcionalidades Planejadas
- Sistema de notificações para atualizações de dependências
- Integração com mais registries npm privados
- Interface para gerenciamento de múltiplos registries
- Sistema de backup e restore de configurações

---

**Compatibilidade:** Windows 10/11, Node.js 16.10+, Angular CLI 15.2+
**Requisitos:** Electron 23+, npm 8+