# 🔗 Links de Referência - Node.js e Angular

## 📊 Compatibilidade de Versões

### Angular Version Compatibility Guide
**URL:** https://angular.dev/reference/versions

Este link oficial da Angular mostra:
- ✅ Compatibilidade entre versões do Angular CLI e Node.js
- ✅ Suporte de longo prazo (LTS)
- ✅ Fim de suporte de versões antigas
- ✅ Recomendações de atualização

**Exemplo de uso:**
```
Angular CLI 13.x → Node.js 12.20+, 14.15+, 16.10+
Angular CLI 15.x → Node.js 14.20+, 16.13+, 18.10+
Angular CLI 18.x → Node.js 18.13+, 20.9+
```

---

## 📦 Versões Usadas no Projeto

### Node 16.10.0 + Angular CLI 13.3.11
- **Node.js:** v16.10.0
- **Angular CLI:** 13.3.11
- **Angular Core:** 13.x
- **npm:** 7.x (atualizado para 9.x após instalação Angular CLI)
- **Projetos:** 
  - mp-pas-root
  - mp-pas-navbar
  - mp-pas-home
  - mp-pas-marketplace
  - mp-pas-financeiro
  - mp-pas-vendas
  - mp-pas-catalogo
  - mp-pas-logistica
  - mp-pas-comercial
  - mp-pas-via-performance
  - mp-pas-atendimento
  - mp-pamp
  - mp-pamp-setup
  - mp-pamp-comercial
  - mp-pamp-vendas
  - mp-pamp-catalogo
  - mp-pamp-marketplace

**Links:**
- Node.js: https://nodejs.org/download/release/v16.10.0/
- Angular CLI 13: https://www.npmjs.com/package/@angular/cli/v/13.3.11

---

### Node 18.18.2 + Angular CLI 15.2.10
- **Node.js:** v18.18.2
- **Angular CLI:** 15.2.10
- **Angular Core:** 15.x
- **npm:** 9.x
- **Projetos:**
  - mp-pas-configuracoes (padrão)

**Links:**
- Node.js: https://nodejs.org/download/release/v18.18.2/
- Angular CLI 15: https://www.npmjs.com/package/@angular/cli/v/15.2.10

---

### Node 20.19.5 + Angular CLI 18.2.0
- **Node.js:** v20.19.5
- **Angular CLI:** 18.2.0
- **Angular Core:** 18.x
- **npm:** 10.x
- **Projetos:** (para projetos futuros)

**Links:**
- Node.js: https://nodejs.org/download/release/v20.19.5/
- Angular CLI 18: https://www.npmjs.com/package/@angular/cli/v/18.2.0

---

## 🔧 Configuração de Versões

### Arquivo: `node-version-config.js`

Define versões padrão por projeto:

```javascript
const DEFAULT_PROJECT_VERSIONS = {
  'mp-pas-configuracoes': '18.18.2',  // Angular CLI 15
  'mp-pas-root': '16.10.0',           // Angular CLI 13
  'mp-pamp': '16.10.0',               // Angular CLI 13
  // Outros projetos usam 16.10.0 por padrão
};
```

### Como Alterar Versão de um Projeto

**Via Interface:**
1. Menu: `Dependências > Configurar Versões dos Projetos`
2. Selecionar projeto
3. Escolher versão do Node (16/18/20)
4. Salvar

**Via Código:**
```javascript
// Editar node-version-config.js
DEFAULT_PROJECT_VERSIONS['nome-do-projeto'] = '18.18.2';
```

---

## 📚 Documentação Oficial

### Node.js
- **Site oficial:** https://nodejs.org/
- **Downloads:** https://nodejs.org/download/release/
- **Documentação:** https://nodejs.org/docs/
- **Changelog:** https://github.com/nodejs/node/blob/main/CHANGELOG.md

### Angular
- **Site oficial:** https://angular.dev/
- **CLI:** https://angular.dev/tools/cli
- **Versões e Compatibilidade:** https://angular.dev/reference/versions
- **Update Guide:** https://update.angular.io/
- **Release Schedule:** https://angular.dev/reference/releases

### npm
- **Site oficial:** https://www.npmjs.com/
- **Documentação:** https://docs.npmjs.com/
- **CLI Commands:** https://docs.npmjs.com/cli/v9/commands

---

## 🔍 Verificar Versões Instaladas

### No Terminal do Projeto

```bash
# Node.js
node --version

# npm
npm --version

# Angular CLI
ng version
```

### Via Aplicação

1. Abrir projeto
2. Ver logs no terminal integrado
3. Buscar por: `Executando comando: "D:\...\nodes\windows\node-v16.10.0\npm.cmd"`

---

## ⚠️ Notas de Compatibilidade

### Warnings Comuns (NORMAIS)

**npm WARN cli**
```
npm WARN cli npm v9.8.1 does not support Node.js v16.10.0
```
**Causa:** npm foi atualizado durante instalação do Angular CLI  
**Impacto:** Nenhum, funciona perfeitamente  
**Solução:** Ignorar (ou atualizar Node 16.10 → 16.20)

### Incompatibilidades Reais

**Angular CLI 13 com Node.js 20+**
```
ERROR: This version of CLI requires Node.js v12.20, v14.15, v16.10, or v18.0+
```
**Solução:** Usar Node.js 16.10.0 para Angular CLI 13

**Angular CLI 18 com Node.js 16**
```
ERROR: This version requires Node.js v18.13+ or v20.9+
```
**Solução:** Usar Node.js 20.19.5 para Angular CLI 18

---

## 🔄 Matriz de Compatibilidade

| Angular CLI | Node.js Mínimo | Node.js Recomendado | npm | Status |
|-------------|----------------|---------------------|-----|--------|
| 13.3.11 | 12.20+ | **16.10.0** ✅ | 7.x | LTS Encerrado |
| 15.2.10 | 14.20+ | **18.18.2** ✅ | 9.x | LTS Ativo |
| 18.2.0 | 18.13+ | **20.19.5** ✅ | 10.x | Atual |

---

## 📝 Como Adicionar Nova Versão

1. **Baixar Node.js portátil:**
   ```
   https://nodejs.org/download/release/v<version>/node-v<version>-win-x64.zip
   ```

2. **Adicionar em `node-version-config.js`:**
   ```javascript
   '22.0.0': {
     version: '22.0.0',
     folderName: 'node-v22.0.0-win-x64',
     angularVersion: '19',
     angularPackage: '@angular/cli@19.0.0',
     urls: { ... }
   }
   ```

3. **Instalar via menu:**
   - `Dependências > Instalar Dependências Node.js`

4. **Configurar projeto:**
   - `Dependências > Configurar Versões dos Projetos`
   - Selecionar novo Node 22

---

## 🆘 Suporte e Troubleshooting

### Verificar Compatibilidade Antes de Atualizar

1. **Acessar:** https://angular.dev/reference/versions
2. **Encontrar sua versão do Angular**
3. **Ver versões Node.js compatíveis**
4. **Planejar migração se necessário**

### Ferramentas Úteis

- **Angular Update Guide:** https://update.angular.io/
  - Gera guia personalizado para atualização
  - Mostra breaking changes
  - Recomenda passos seguros

- **Node.js Release Schedule:** https://nodejs.org/en/about/previous-releases
  - Mostra status LTS
  - Datas de fim de suporte
  - Recomendações de versão

---

## 📌 Link Rápido

**🔗 PRINCIPAL: https://angular.dev/reference/versions**

Mantenha este link como referência para:
- ✅ Verificar compatibilidade antes de atualizar
- ✅ Escolher versão do Node.js para novo projeto
- ✅ Resolver problemas de versão
- ✅ Planejar migrações futuras

---

*Última atualização: Outubro 2025*
