# Allerac One - Architecture

## Overview

Allerac One is a private-first AI agent that runs entirely on your own hardware. It provides a chat interface with conversation memory, document understanding (RAG), and web search - all while keeping data local.

```
+--------------------------------------------------+
|                   Browser UI                      |
|          (Next.js React, Tailwind CSS)            |
+--------------------------------------------------+
                        |
+--------------------------------------------------+
|               Next.js App Router                  |
|           (Server Actions + API Routes)           |
+--------------------------------------------------+
          |              |              |
+---------+----+ +-------+------+ +----+---------+
|   LLM Service| | Memory Service| | RAG Service  |
|  (multi-provider) | (summaries) | | (embeddings) |
+---------+----+ +-------+------+ +----+---------+
     |    |              |              |
     |    |       +------+------+       |
     v    v       v             v       v
+--------+ +----------+ +-----------------+
| Ollama | | GitHub   | | PostgreSQL      |
| (local)| | Models   | | + pgvector      |
+--------+ | (cloud)  | +-----------------+
           +----------+
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + Tailwind CSS 4 | UI with streaming chat |
| Framework | Next.js 16 (App Router) | SSR, API routes, server actions |
| Database | PostgreSQL 16 + pgvector | Data storage + vector similarity search |
| Local LLM | Ollama | Run LLMs locally (llama3.2, qwen2.5, deepseek-r1) |
| Cloud LLM | GitHub Models API | GPT-4o, Mistral Large via Azure inference |
| Embeddings | text-embedding-3-small | 1536-dim vectors for RAG |
| Search | Tavily API | Web search tool (optional) |
| i18n | next-intl | Multi-language support |
| Container | Docker + Docker Compose | Deployment and orchestration |
| Monitoring | Prometheus + Grafana | Optional metrics (profile: monitoring) |

## Data Flow

### Chat Message Flow

```
User types message
       |
       v
ChatComponent (client)
       |
       v
actions/chat.ts (server action)
       |
       +---> ConversationMemoryService.getRecentSummaries()
       |         (loads relevant past conversation context)
       |
       +---> VectorSearchService.search()
       |         (finds relevant document chunks via RAG)
       |
       +---> Build system prompt with memory + RAG context
       |
       v
LLM Service (services/llm/llm.service.ts)
       |
       +---> Ollama API (local) ---- or ----> GitHub Models API (cloud)
       |
       v
Streaming response back to client
       |
       +---> Tool calls (search_web) handled mid-stream
       |
       v
Message saved to chat_messages table
       |
       v
ConversationMemoryService.maybeSummarize()
       (auto-summarizes when conversation reaches threshold)
```

### RAG (Document) Flow

```
User uploads PDF/document
       |
       v
actions/documents.ts
       |
       v
DocumentService.process()
       |
       +---> Extract text from PDF
       +---> Split into chunks
       +---> Generate embeddings via EmbeddingService
       +---> Store chunks + vectors in document_chunks table
       |
       v
On chat query:
       |
       v
EmbeddingService.embed(query)
       |
       v
VectorSearchService.search(query_embedding)
       |
       +---> PostgreSQL: document_chunks <=> query_embedding (cosine distance)
       +---> Returns top-k most similar chunks
       |
       v
Chunks injected into LLM context as reference material
```

### Memory Flow

```
Conversation ends (or reaches N messages)
       |
       v
ConversationMemoryService.summarize()
       |
       +---> Send conversation to LLM for summarization
       +---> Extract: summary, key_topics[], importance_score, emotion
       +---> Store in conversation_summaries table
       |
       v
Next conversation starts:
       |
       v
ConversationMemoryService.getRecentSummaries()
       |
       +---> Load recent + high-importance summaries
       +---> Inject into system prompt as "past context"
       |
       v
AI has awareness of past conversations
```

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (id, email, password_hash, name) |
| `user_sessions` | Session tokens for auth |
| `user_settings` | Per-user config (API keys, system message) |
| `chat_conversations` | Conversation metadata (title, timestamps) |
| `chat_messages` | Individual messages (role, content) |
| `chat_settings` | Global settings (default system message) |

### AI/Memory Tables

| Table | Purpose |
|-------|---------|
| `documents` | Uploaded document metadata |
| `document_chunks` | Text chunks with vector embeddings (1536-dim) |
| `conversation_summaries` | AI-generated summaries with topics and importance |
| `tavily_cache` | Cached web search results (7-day TTL) |

### Metrics Tables

| Table | Purpose |
|-------|---------|
| `api_logs` | API call logging (endpoint, response time, errors) |
| `tokens_usage` | Token consumption per model/provider |

### Key Indexes

- `document_chunks.embedding` - HNSW index for fast vector search (cosine distance)
- `conversation_summaries.user_id` - Quick lookup of user memories
- `tavily_cache.query_hash` - Fast cache lookups

## LLM Provider Architecture

### Dual Provider System

The app supports two LLM provider types:

**1. GitHub Models (Cloud)**
- Uses Azure AI inference SDK (`@azure-rest/ai-inference`)
- Models: GPT-4o, GPT-4o Mini, Mistral Large, Ministral 3B
- Requires GitHub token (configured in user settings)
- Endpoint: `https://models.inference.ai.azure.com`

**2. Ollama (Local)**
- Uses Ollama npm package
- Models: qwen2.5:7b, deepseek-r1:1.5b, llama3.2 (configurable)
- No token required
- Proxied through `/api/ollama/` route

### Adding a New Model

Edit `src/app/services/llm/models.ts`:

```typescript
{
  id: 'model-id',           // Must match provider's model ID
  name: 'Display Name',
  icon: '🤖',
  description: 'Short description',
  provider: 'ollama',       // 'ollama' or 'github'
  baseUrl: '/api/ollama',   // '/api/ollama' for local, Azure URL for cloud
  requiresToken: false
}
```

## Authentication

### Flow

```
Register/Login
     |
     v
bcrypt.hash(password) --> stored in users.password_hash
     |
     v
Generate session token --> stored in user_sessions
     |
     v
Set HTTP-only cookie
     |
     v
Each request: validate session token
```

### Token Encryption

User API tokens (GitHub, Tavily) are encrypted at rest using AES encryption:

```
User enters token --> crypto.encrypt(token, ENCRYPTION_KEY) --> stored in user_settings
                                                                      |
On use: crypto.decrypt(encrypted_token, ENCRYPTION_KEY) <-------------+
```

## Docker Architecture

### Profiles

```bash
# Core only (app + db + migrations)
docker compose -f docker-compose.local.yml up -d

# With local LLM
docker compose -f docker-compose.local.yml --profile ollama up -d

# With monitoring
docker compose -f docker-compose.local.yml --profile monitoring up -d

# Full stack
docker compose -f docker-compose.local.yml --profile ollama --profile monitoring up -d
```

### Container Dependencies

```
db (pgvector:pg16)
  └─> migrations (postgres:16-alpine, runs once)
       └─> app (Next.js, port 8080)

ollama (ollama/ollama)           [profile: ollama]
  └─> ollama-setup (pulls model) [profile: ollama]

prometheus                       [profile: monitoring]
  └─> grafana                    [profile: monitoring]
node-exporter                    [profile: monitoring]
```

## Services Layer

| Service | File | Responsibility |
|---------|------|---------------|
| LLMService | `services/llm/llm.service.ts` | Provider abstraction, streaming |
| ConversationMemoryService | `services/memory/conversation-memory.service.ts` | Summarize and recall past conversations |
| EmbeddingService | `services/rag/embedding.service.ts` | Generate vector embeddings |
| VectorSearchService | `services/rag/vector-search.service.ts` | Similarity search on document chunks |
| DocumentService | `services/rag/document.service.ts` | PDF processing, chunking |
| AuthService | `services/auth/` | User auth, sessions |
| CryptoService | `services/crypto/` | Encrypt/decrypt API tokens |
| DatabaseService | `services/database/` | SQL queries, connection pool |
| InfrastructureService | `services/infrastructure/` | System metrics |
| Perceptron | `services/Perceptron.ts` | Binary classifier for memory vectors |

## Server Actions

All data mutations use Next.js Server Actions in `src/app/actions/`:

| Action File | Purpose |
|-------------|---------|
| `chat.ts` | Send messages, manage conversations |
| `memory.ts` | Get/create conversation summaries |
| `documents.ts` | Upload, process, delete documents |
| `auth.ts` | Login, register, logout, session validation |
| `user.ts` | User profile and settings |
| `setup.ts` | First-run setup |
| `tools.ts` | Execute AI tool calls (web search) |
| `backup.ts` | Database backup and restore |
| `system.ts` | System info, health checks |
| `updates.ts` | Check for updates |
| `metrics.ts` | API and token usage metrics |
| `rag.ts` | Manual RAG search |

## UI Components

Organized by feature in `src/app/components/`:

| Directory | Content |
|-----------|---------|
| `chat/` | Chat interface, message bubbles, model selector |
| `auth/` | Login, register forms |
| `documents/` | Document upload, list, viewer |
| `memory/` | Memory browser, summary cards |
| `settings/` | User settings, API key management |
| `system/` | System dashboard, health status |
| `setup/` | First-run setup wizard |
| `layout/` | Sidebar, navigation |

## Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Framework | Next.js App Router | Server actions, SSR, single deployment |
| Database | PostgreSQL + pgvector | Vector search without external service |
| Local LLM | Ollama | De facto standard, easy model management |
| Cloud LLM | GitHub Models | Free tier, multiple models, Azure infrastructure |
| Embeddings | text-embedding-3-small | Good quality at 1536 dims, fast |
| Auth | Custom (bcrypt + sessions) | Simple, no external auth dependency |
| Styling | Tailwind CSS | Utility-first, consistent, fast iteration |
| Deployment | Docker Compose | Single-command deploy, works everywhere |

## Future: Multi-Agent Network (Phase 3)

See `docs/security.md` for the multi-agent security model.

```
+-------------------+     mDNS      +-------------------+
|   Agent (Kitchen) | <-----------> |  Agent (Office)   |
|   - Local Ollama  |    mTLS       |  - Local Ollama   |
|   - Own Database  |               |  - Own Database   |
+-------------------+               +-------------------+
         \                                  /
          \            mTLS               /
           \                            /
        +-------------------+
        |  Agent (Bedroom)  |
        |  - Local Ollama   |
        |  - Own Database   |
        +-------------------+
```

Each agent:
- Runs independently with its own database and LLM
- Discovers peers via mDNS on the local network
- Shares memories selectively based on trust policies
- Authenticates via mutual TLS (mTLS)
