# Melhorias no Sistema de Inicialização/Parada de Projetos Onboarding

## Resumo das Mudanças

Implementado o mesmo comportamento de controle de processos usado no PAS e PAMP para o menu de projetos Onboarding. Agora é possível:

1. **Iniciar um projeto novamente** - Se já está rodando, mata o processo anterior automaticamente
2. **Cancelar a inicialização** - Durante o startup, cancela o processo e limpa a UI (agora com verificação anti-duplicação)
3. **Parar o projeto** - Busca o processo pela porta e mata ele, não apenas pela referência em memória

## Arquivos Modificados

### 1. `onboarding-manager.js`

#### Constructor (linha 11)
- **Mudança**: Adicionado novo Map para rastrear cancelamentos:
  ```javascript
  this.cancelledProjects = new Set(); // Projetos que foram cancelados
  ```
- **Benefício**: Previne que o processo continue iniciando após cancelamento

#### Método: `startProject()` (linha 274)
- **Mudança 1**: Ao invés de lançar erro se o projeto já está rodando, agora:
  - Detecta que o projeto está rodando
  - Mata o processo anterior usando `stopProject()`
  - Aguarda 1 segundo para garantir a limpeza
  - Então tenta iniciar o novo processo
- **Mudança 2**: Antes de fazer `spawn`, verifica se foi cancelado:
  ```javascript
  if (this.cancelledProjects.has(projectName)) {
    console.log(`Projeto ${projectName} foi cancelado, não iniciando processo`);
    this.cancelledProjects.delete(projectName);
    reject(new Error(`Projeto ${projectName} foi cancelado`));
    return;
  }
  ```
- **Mudança 3**: Remove flag de cancelamento quando processo inicia com sucesso
- **Benefício**: Permite reinicializar o projeto sem erro e sem reiniciar acidentalmente após cancelamento

#### Método: `stopProject()` (linha 492) - ASYNC
- **Mudança**: Transformado em método async que:
  - Mata o processo conhecido em memória
  - Se receber uma porta, também tenta matar processos na porta especificada
  - Aguarda a conclusão da busca por porta
- **Benefício**: Garante que o processo seja morto mesmo se a referência for perdida

#### Novo Método: `killProcessByPort()` (linha 524)
- **Implementação**: Busca e mata processos usando porta:
  - **Windows**: Usa `netstat -aon | findstr :PORT` para encontrar PIDs
  - **Linux/Mac**: Usa `lsof -ti :PORT` para encontrar PIDs
  - Mata cada processo encontrado com `taskkill /PID /T /F` (Windows) ou `kill -9 PID` (Linux/Mac)
- **Retorna**: Promise que resolve quando todos os processos foram processados
- **Benefício**: Permite matar processos que podem estar perdidos do registro em memória

#### Método: `cancelProject()` (linha 620) - ASYNC
- **Mudança 1**: Marca projeto como cancelado:
  ```javascript
  this.cancelledProjects.add(projectName);
  ```
- **Mudança 2**: Depois mata o processo com a porta
- **Benefício**: Impede que novo processo seja iniciado após cancelamento

#### Método: `stopAllProjects()` (linha 631) - ASYNC
- **Mudança**: Transformado em async para aguardar `stopProject()` de cada projeto
- **Limpa flags de cancelamento** para cada projeto parado
- **Benefício**: Garante parada correta de todos os projetos

#### Limpeza de Flags (linha 466-468, 480-482)
- **Mudança**: Handlers 'close' e 'error' agora limpam `cancelledProjects.delete(projectName)`
- **Benefício**: Garante que a flag seja limpa quando o processo finaliza

### 2. `ipc-handlers.js`

#### Handler: `stop-onboarding-project` (linha 217) - ASYNC
- **Mudança**: Agora aceita parâmetro `port` e:
  - Tenta parar o projeto com a porta
  - Depois tenta matar novamente por porta (segurança extra)
  - Aguarda conclusão antes de responder
- **IPC Call**: `await ipcRenderer.invoke('stop-onboarding-project', { projectName, port })`
- **Benefício**: Parada mais robusta

#### Handler: `cancel-onboarding-project` (linha 242) - ASYNC
- **Mudança**: Agora aceita parâmetro `port` e:
  - Chama `cancelProject()` async (que marca como cancelado)
  - Aguarda a conclusão antes de responder
- **IPC Call**: `ipcRenderer.send('cancel-onboarding-project', { projectName, index, port })`
- **Benefício**: Cancelamento robusto durante startup COM VERIFICAÇÃO anti-duplicação

### 3. `index.html`

#### Função: `stopOnboardingProject()` (linha 1391)
- **Mudança**: Agora passa a `port` para o handler
- **Benefício**: Stop robusto por porta

#### Button Click Handler: "Cancelar" (linha 2803)
- **Mudança**: Agora passa `port` quando envia cancelamento
- **Benefício**: Cancelamento robusto durante startup

## Fluxo de Funcionamento

### Cenário 1: Iniciar novamente (já rodando)
1. Usuário clica "Iniciar" enquanto projeto está rodando
2. Frontend envia `start-onboarding-project`
3. Backend detecta que `isProjectRunning(projectName)` é true
4. Backend mata processo anterior: `stopProject(projectName, project.port)`
5. Backend mata processo na porta: `killPortBeforeStart(port)`
6. Backend verifica `cancelledProjects.has(projectName)` - não foi cancelado
7. Backend inicia novo processo com `spawn()`
8. Frontend atualiza UI

### Cenário 2: Cancelar durante startup
1. Usuário clica "Iniciar" - começa inicialização
2. Frontend envia `start-onboarding-project` - startProject() aguardando no meio das operações
3. Usuário clica "Cancelar" ANTES do novo processo ser spawned
4. Frontend envia `cancel-onboarding-project` com porta
5. Backend chama `cancelProject(projectName, port)`:
   - Adiciona à `cancelledProjects`
   - Mata processos conhecidos
6. Backend continua em `startProject()` - chega em spawn()
7. **VERIFICA**: `if (this.cancelledProjects.has(projectName))` - TRUE!
8. **REJEITA** a promise sem fazer spawn
9. Frontend recebe erro/cancelamento
10. UI volta ao estado inicial

**NOVO COMPORTAMENTO**: Projeto NÃO inicia após cancelamento ✅

### Cenário 3: Parar projeto
1. Usuário clica "Parar" enquanto projeto está rodando
2. Frontend envia `stop-onboarding-project` com porta
3. Backend chama `stopProject(projectName, port)`
4. Backend mata processo por PID
5. Backend mata processos na porta (segurança)
6. Frontend atualiza UI

## Testes Recomendados

1. ✅ Iniciar um projeto onboarding
2. ✅ Clicar em "Iniciar" novamente - deve matar processo anterior e iniciar novo
3. ✅ **NOVO**: Iniciar projeto e imediatamente clicar "Cancelar" - deve parar SEM continuar inicializando
4. ✅ Iniciar projeto, esperar subir, clicar "Parar" - deve parar corretamente
5. ✅ Verificar que não apareça mais "Projeto XXX já está rodando"
6. ✅ Verificar que após cancelar, o novo processo NÃO continua iniciando
7. ✅ Verificar logs no console para confirmação de operações

## Compatibilidade

- **Windows**: Usa `netstat`, `findstr`, `taskkill`
- **Linux/Mac**: Usa `lsof`, `kill`
- **Node.js**: Continua usando `spawn` para iniciar processos

## Melhorias Chave

1. **Anti-duplicação**: Flag `cancelledProjects` previne spawn após cancelamento
2. **Busca por porta**: Mata processos mesmo se referência for perdida
3. **Async/Await**: Garante operações ordenadas e completadas
4. **Limpeza de flags**: Flags são limpas em todos os casos (sucesso, erro, close)
5. **Dupla segurança**: Stop mata por PID E por porta

