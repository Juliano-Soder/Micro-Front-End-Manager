# Implementação de Tratamento de Erros do Nexus e npm install

## 📋 Resumo das Mudanças

Esta implementação adiciona um sistema robusto de fallback para problemas de autenticação no Nexus e erros no `npm install`, com tratamento especial para o projeto `mp-pas-atendimento`.

## 🎯 Problemas Resolvidos

### 1. **Erro no mp-pas-atendimento**
- **Sintoma**: Erro `npm verb unfinished npm timer reifyNode` durante o primeiro `npm install`
- **Causa**: Problemas de autenticação no Nexus e necessidade de configuração específica de registry
- **Solução**: Implementado fluxo especial que:
  1. Verifica login no Nexus
  2. Configura registry específico (`npm-marketplace`)
  3. Executa npm install
  4. Restaura registry padrão

### 2. **Login Manual Repetitivo**
- **Sintoma**: Usuários precisavam fazer login no Nexus manualmente toda vez
- **Solução**: Sistema de login silencioso com credenciais salvas em base64

### 3. **Falhas Silenciosas**
- **Sintoma**: npm install falhava mas aplicação não detectava que estava logado
- **Solução**: Verificação de login antes de cada npm install

## 📁 Arquivos Criados/Modificados

### ✨ Novo Arquivo: `npm-fallback-handlers.js`

Classe responsável por gerenciar fallbacks de erros relacionados ao npm e Nexus.

#### Principais Métodos:

1. **Gerenciamento de Credenciais**
   - `saveCredentials(username, password, email)` - Salva credenciais em base64
   - `loadCredentials()` - Carrega credenciais salvas
   - `hasStoredCredentials()` - Verifica se há credenciais salvas
   - `clearCredentials()` - Remove credenciais

2. **Autenticação**
   - `checkNexusLogin(projectPath, registry)` - Verifica se está logado no Nexus
   - `silentNexusLogin(projectPath, registry)` - Faz login silencioso usando credenciais salvas

3. **Gerenciamento de Registry**
   - `setNpmRegistry(projectPath, registry)` - Configura registry específico
   - `restoreDefaultRegistry(projectPath)` - Restaura registry padrão

4. **Tratamento Especial mp-pas-atendimento**
   - `handleMpPasAtendimentoInstall(projectPath, eventEmitter)` - Executa sequência completa de passos:
     1. Verifica login
     2. Valida autenticação
     3. Configura registry npm-marketplace
     4. Executa npm install
     5. Restaura registry padrão

5. **Detecção de Erros**
   - `isAjvError(errorOutput)` - Detecta erros específicos do ajv
   - `hasNodeModules(projectPath)` - Verifica se node_modules existe

### 🔧 Modificado: `main.js`

#### Adicionado:
- Import do `NpmFallbackHandlers`
- Instância global `npmFallbackHandlers`
- Função `executeNpmInstall()` - Executa npm install com tratamento de erros
- Verificação de login antes de npm install
- Tratamento especial para mp-pas-atendimento
- Detecção de erros específicos (ajv)
- Tentativa de continuar se node_modules existe mesmo com erro

#### Modificado:
- Handler `npm-login-complete` agora salva credenciais em base64
- Fluxo de npm install agora verifica login primeiro
- Adiciona fallback automático com login silencioso

### 🎨 Modificado: `login.html`

#### Adicionado:
- Captura de credenciais durante o login:
  - `capturedUsername`
  - `capturedPassword`
  - `capturedEmail`
- Envio de credenciais junto com evento `npm-login-complete`

## 🔄 Fluxo de Execução

### Fluxo Normal (Outros Projetos)

```
1. startProject() chamado
2. Verifica se node_modules existe
3. Se não existe:
   a. Verifica login no Nexus
   b. Se não logado:
      - Tenta login silencioso
      - Se falhar, abre janela de login manual
   c. Executa npm install
   d. Monitora saída para detectar erros
   e. Se erro do ajv mas node_modules existe, continua
   f. Se sucesso, inicia projeto
```

### Fluxo Especial (mp-pas-atendimento)

```
1. startProject() chamado
2. Verifica se node_modules existe
3. Se não existe:
   a. Detecta que é mp-pas-atendimento
   b. Executa handleMpPasAtendimentoInstall():
      i.   Verifica login no Nexus
      ii.  Se não logado, tenta login silencioso
      iii. Valida autenticação (npm whoami)
      iv.  Configura registry: npm-marketplace
      v.   Executa npm install
      vi.  Restaura registry padrão
   c. Se sucesso, inicia projeto
   d. Se falhar por falta de login, abre janela de login manual
```

## 🔐 Segurança

- **Credenciais em Base64**: Não é criptografia forte, mas oferece ofuscação básica
- **Armazenamento Local**: Arquivo `nexus-credentials.json` em `userData`
- **Limpeza**: Método `clearCredentials()` disponível para remover dados

⚠️ **Nota**: Base64 é apenas ofuscação. Para produção real, considere usar:
- Node.js keytar (sistema de credenciais do OS)
- Electron safeStorage API
- Criptografia assimétrica

## 📝 Logs e Debugging

Sistema de logs detalhados em todos os passos:

```javascript
console.log('🔍 Verificando login no Nexus...');
console.log('🔐 Tentando login silencioso...');
console.log('✅ Login silencioso realizado com sucesso');
console.log('🎯 Detectado mp-pas-atendimento, usando tratamento especial...');
console.log('📋 Passo 1: Verificando login no Nexus...');
// ... etc
```

Emojis facilitam identificação rápida do tipo de operação nos logs.

## 🧪 Teste Manual

### Para testar o fluxo completo:

1. **Limpar credenciais salvas**:
   - Ir em `%APPDATA%\<nome-app>\nexus-credentials.json` e deletar

2. **Testar mp-pas-atendimento sem node_modules**:
   - Deletar pasta `node_modules` do mp-pas-atendimento
   - Clicar em "Iniciar" no app
   - Verificar se:
     - Solicita login manual (primeira vez)
     - Salva credenciais após login
     - Executa sequência especial de passos
     - Restaura registry no final

3. **Testar login silencioso**:
   - Fechar app
   - Deletar `node_modules` novamente
   - Abrir app e tentar iniciar projeto
   - Verificar se faz login automático

4. **Testar outros projetos**:
   - Deletar `node_modules` de outro projeto (ex: mp-pas-navbar)
   - Iniciar projeto
   - Verificar se login silencioso funciona
   - Confirmar que não usa fluxo especial do mp-pas-atendimento

## 🔄 Compatibilidade

- ✅ Windows (PowerShell)
- ✅ Mantém compatibilidade com fluxo existente
- ✅ Não quebra projetos que já funcionam
- ✅ Fallback automático em caso de erro

## 🚀 Próximos Passos (Opcional)

1. **Melhorar segurança**: Usar `keytar` ou `safeStorage`
2. **UI de gerenciamento**: Tela para visualizar/limpar credenciais salvas
3. **Timeout configurável**: Permitir ajustar timeout de login
4. **Logs estruturados**: Salvar logs em arquivo para análise posterior
5. **Retry automático**: Tentar npm install X vezes antes de falhar

## 📚 Referências

- [npm login](https://docs.npmjs.com/cli/v8/commands/npm-login)
- [npm whoami](https://docs.npmjs.com/cli/v8/commands/npm-whoami)
- [npm config](https://docs.npmjs.com/cli/v8/commands/npm-config)
- [Node.js Child Process](https://nodejs.org/api/child_process.html)
- [Electron IPC](https://www.electronjs.org/docs/latest/api/ipc-main)

---

**Data de Implementação**: 30 de Outubro de 2025  
**Autor**: GitHub Copilot  
**Versão**: 0.0.9
