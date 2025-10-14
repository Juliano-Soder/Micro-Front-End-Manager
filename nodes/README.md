# 📦 Node.js Portátil

Esta pasta contém as versões portáteis do Node.js usadas pelo Micro Front-End Manager.

## 📁 Estrutura

```
nodes/
├── windows/       # Versões do Node.js para Windows
├── linux/         # Versões do Node.js para Linux
└── mac/           # Versões do Node.js para macOS
```

## 🔧 Instalação

As versões do Node.js podem ser instaladas de duas formas:

1. **Via menu da aplicação:**
   - Abra o Micro Front-End Manager
   - Menu: `Dependências > Instalar Dependências Node.js`
   - Aguarde o download e instalação automática

2. **Manual (avançado):**
   - Baixe o Node.js portátil do site oficial
   - Extraia para a pasta correspondente ao seu SO
   - Exemplo Windows: `nodes/windows/node-v16.10.0/`

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
