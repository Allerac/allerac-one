# Allerac One

Private-first AI agent platform. Self-hosted, local LLM support via Ollama, with conversation memory and RAG.

## Quick Context

- **Stack:** Next.js 16, React 19, PostgreSQL 16 + pgvector, Tailwind CSS 4, Docker
- **Language:** TypeScript (strict)
- **Entry point:** `src/app/` (Next.js App Router)
- **Database:** `src/database/` (init.sql + migrations/)
- **Local deploy:** `docker-compose.local.yml`
- **i18n:** `src/i18n/` (multi-language support via next-intl)

## Project Structure

```
src/app/
  api/          # API routes (anthropic proxy, ollama proxy)
  actions/      # Server actions (chat, memory, auth, documents, backup, etc.)
  components/   # UI components (auth, chat, documents, memory, settings, system)
  services/     # Business logic
    llm/        # LLM provider abstraction (GitHub Models, Ollama)
    memory/     # Cross-conversation memory with summaries
    rag/        # Document embeddings and vector search
    auth/       # Authentication service
    crypto/     # Encryption for stored tokens
    database/   # DB connection and queries
    infrastructure/ # System metrics
  tools/        # AI function calling tools (web search)
  clients/      # Database client (pg pool)
```

## Key Patterns

- **LLM Providers:** Two providers - GitHub Models API (cloud) and Ollama (local). Configured in `services/llm/models.ts`
- **Embeddings:** Uses `text-embedding-3-small` (1536 dimensions) via GitHub Models for RAG
- **Vector Search:** pgvector with HNSW index, cosine distance
- **Memory:** Automatic conversation summarization with importance scoring and topic extraction
- **Auth:** Session-based with bcrypt password hashing
- **Server Actions:** All data mutations go through `actions/` files

## Rules

- Never commit `.env` files or secrets
- Use existing patterns before creating new abstractions
- All AI features must work offline with local Ollama models
- Database changes go in `src/database/migrations/` as numbered SQL files
- Use Tailwind CSS for styling, mobile-first with `sm:` breakpoints
- Keep components in their feature folder under `components/`

## Documentation

See `docs/` for detailed guides:

- `docs/architecture.md` - System design, data flow, and technical decisions
- `docs/security.md` - Security model, internet exposure, multi-agent auth
- `docs/local-setup.md` - Installation and setup guide
- `docs/local-installation-plan.md` - Roadmap (Phase 1-3)
- `docs/database-backup-restore.md` - Backup and restore procedures
