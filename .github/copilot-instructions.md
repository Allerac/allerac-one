# Allerac-One Project Instructions

This is an AI-powered chat application built with Next.js 16+, TypeScript, and Tailwind CSS v4.

## Project Structure
- `app/` - Root directory (chat at /)
  - `page.tsx` - Main chat interface with authentication
  - `types.ts` - TypeScript interfaces
  - `clients/` - Client initialization (Supabase)
  - `components/` - React components (organized by domain)
    - `layout/` - Sidebar component
    - `chat/` - ChatHeader, ChatMessages, ChatInput
    - `memory/` - ConversationMemoriesView, CorrectAndMemorize, MemoriesModal, MemorySaveModal, MemorySettingsModal
    - `documents/` - DocumentUpload, DocumentsModal
    - `settings/` - TokenConfiguration
    - `auth/` - LoginModal, UserSettingsModal
  - `services/` - Core services (organized by domain)
    - `llm/` - LLM integration and model configurations
      - `llm.service.ts` - Unified LLM client (GitHub Models + Ollama)
      - `models.ts` - Model configurations
    - `database/` - Data persistence
      - `supabase.service.ts` - All Supabase operations
    - `chat/` - Chat functionality
      - `chat-message.service.ts` - Message sending with RAG, memory, tools
    - `memory/` - Conversation memory
      - `conversation-memory.service.ts` - Memory creation and retrieval
      - `memory-summary.service.ts` - Conversation summarization
    - `rag/` - Retrieval-augmented generation
      - `document.service.ts` - Document processing
      - `embedding.service.ts` - Vector embeddings
      - `vector-search.service.ts` - Semantic search
    - `infrastructure/` - Cross-cutting concerns
      - `cache.service.ts` - Query caching
      - `metrics-client.ts` - Metrics client initialization
      - `metrics.service.ts` - LLM usage metrics
    - `user/` - User management
      - `user-settings.service.ts` - User preferences
  - `tools/` - Function calling tools
    - `tools.ts` - Tool definitions
    - `search-web.tool.ts` - Tavily web search
- `database/` - Supabase migration files

## Key Features
- **Authentication**: Supabase Auth with email/password
- **Multi-Provider LLM**: 
  - GitHub Models (gpt-4o, gpt-4o-mini)
  - Ollama (local models like deepseek-r1:8b)
- **Configuration-Driven**: Model configs in `models.ts`, auto-detects provider
- **Document Processing**: PDF upload with vector embeddings
- **Vector Search**: pgvector for semantic search
- **Conversation Memory**: Automatic context retention
- **Web Search**: Tavily API integration with caching
- **Metrics Tracking**: LLM call monitoring via Supabase

## Technical Stack
- **Framework**: Next.js 16.1.1 with App Router, Turbopack
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL + pgvector)
- **Authentication**: Supabase Auth
- **LLM Providers**: GitHub Models API, Ollama
- **Document Processing**: pdf-parse, pdfjs-dist
- **Markdown**: react-markdown with remark-gfm

## Development Guidelines
- Use TypeScript for all new files
- Follow Next.js App Router conventions
- Keep services modular and testable
- **Organize by domain**: Components and services are organized by business domain (llm, database, chat, memory, rag, infrastructure, user)
- Store sensitive tokens in localStorage (configurable via UI)
- Use environment variables for service URLs
- Add new LLM models in `app/services/llm/models.ts`
- Configuration-driven approach (avoid hardcoded conditionals)
- Use dynamic imports for optional dependencies to avoid circular references

## Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
TAVILY_API_KEY=your_tavily_key
OLLAMA_BASE_URL=http://localhost:11434
```
llm/
## Adding New LLM Models
1. Add model config to `app/services/models.ts`:
```typescript
{
  id: 'model-name',
  name: 'Display Name',
  provider: 'github' | 'ollama',
  baseUrl: 'https://api.url',
  requiresToken: true | false
}
```
2. LLMService auto-detects provider - no code changes needed
