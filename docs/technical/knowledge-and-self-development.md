# Allerac — Knowledge Base & Self-Development Vision

> Conversa: 2026-04-24

---

## Contexto

O objetivo é que o Allerac seja:
1. **Instalável em qualquer lugar** — Linux e Windows de forma confiável
2. **Auto-consciente** — sabe o que é, o que faz, e onde tudo está
3. **Capaz de se auto-desenvolver** — com a guia de um usuário, pode propor e aplicar mudanças em si mesmo

Containers são o que torna isso possível: isolamento, portabilidade, e a capacidade de reconstruir o próprio ambiente de forma segura e declarativa.

---

## O Problema da Documentação

A pasta `docs/` existia mas alguns documentos foram removidos por conterem informações sensíveis que não devem ir para o GitHub.

### Estratégia decidida: split por sensibilidade

| Tipo de doc | Onde fica |
|---|---|
| Visão geral, arquitetura pública | `docs/` no repo (GitHub) |
| Contexto para agentes de dev (Claude Code) | `CLAUDE.md` |
| Docs sensíveis / operacionais | `docs/private/` + `.gitignore` |
| Conhecimento rico para agentes Allerac | RAG no banco (pgvector) |
| Acesso externo avançado (futuro) | MCP Server |

### Por que o RAG não resolve tudo

O RAG do Allerac (pgvector) serve apenas para agentes **dentro** do Allerac. Agentes externos (ex: Claude Code rodando localmente) não têm acesso ao banco — só ao filesystem.

Para agentes externos acessarem o knowledge base do Allerac, as opções são:
- **Agora**: arquivos no disco (gitignored para o que for sensível)
- **Futuro**: MCP Server expondo o RAG via HTTP — Claude Code se conecta via `claude mcp add`

---

## Sobre um Serviço de Semantic Search Isolado

**Conclusão: não é necessário agora.**

O Allerac já tem pgvector + RAG funcionando. Isolar seria duplicar infraestrutura. O problema real é **acesso**, não capacidade de busca.

A solução mais enxuta seria adicionar um endpoint autenticado no próprio Allerac (ex: `POST /api/knowledge/search`) que expõe o RAG existente. Um serviço isolado só valeria se houvesse intenção de reusar a mesma base de conhecimento em sistemas completamente separados.

---

## Visão de Auto-Desenvolvimento

```
Usuário guia → Allerac entende o que é → propõe mudanças → aplica → reconstrói → valida
```

O Allerac funciona como um **agente de desenvolvimento auto-hospedado**. Para isso funcionar precisa de:

### O que já existe
- Docker Compose (`docker-compose.local.yml`) ✅
- RAG + pgvector (pode indexar o próprio código-fonte) ✅
- Memory system (conversas persistentes) ✅
- Install scripts Linux + Windows ✅

### O que falta (roadmap)
1. **Auto-conhecimento**: indexar o próprio código e docs no RAG
2. **Tool de escrita de código**: agente capaz de propor e aplicar mudanças em arquivos
3. **Tool de rebuild**: triggerar `docker compose build/up` de dentro do Allerac
4. **Install unificado e robusto**: Linux + Windows funcionando de forma confiável

### Ordem de execução
1. Primeiro: instalação confiável em Linux e Windows
2. Depois: ensinar o Allerac a se conhecer (docs + RAG sobre o próprio código)
3. Por fim: capacidade de auto-desenvolvimento guiado

---

## Review do Sistema de Instalação

### Arquitetura atual
- **Linux** → `install.sh` direto
- **Windows** → `install.ps1` → WSL2 + Ubuntu → mesmo `install.sh`

Abordagem DRY. Evita Docker Desktop (licensing + overhead de VM dupla).

### Mudanças recentes (pendentes de commit)
- WSL2 precisa de 8GB swap (era 4GB) — SIGBUS em pulls grandes
- `fix_docker_credentials_wsl` virou função separada, chamada na ordem certa
- Retry de `docker pull` até 3x — SIGBUS no WSL2 é intermitente

### Gaps identificados

| Problema | Impacto | Prioridade |
|---|---|---|
| RedHat/Fedora/CentOS detectado mas sem install | `install_docker` não tem case `redhat` — cai em erro | Médio |
| `fallocate` não funciona em btrfs | Swap falha silenciosamente | Baixo |
| macOS meio-suportado | Só instrui a instalar Docker Desktop manualmente | Baixo |
| RAM check não funciona para `redhat` | `TOTAL_RAM_GB` fica unset | Baixo |

### Nota sobre Windows
O `install.ps1` roda como `root` no WSL2 → Allerac fica em `/root/allerac-one`. Correto para device single-user (Lite/Home/Pro).

### Suporte atual por plataforma
| Plataforma | Status |
|---|---|
| Linux Debian/Ubuntu | ✅ Funciona |
| Windows (via WSL2) | ✅ Funciona |
| Linux RedHat/Fedora | ❌ Não implementado |
| macOS | ⚠️ Parcial |
| Windows nativo (sem WSL) | ❌ Fora de escopo (by design) |
