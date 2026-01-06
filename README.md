# Allerac-One

An AI-powered chat application with authentication, multi-provider LLM support, document processing, vector search, conversation memory, and web search capabilities.

## Features

- 🔐 **Authentication** - Supabase Auth with email/password login
- 🤖 **Multi-Provider LLM** - Support for GitHub Models and Ollama (local models)
- ⚙️ **Configuration-Driven** - Easy model management via UI, auto-detects provider
- 📄 **Document Upload** - Upload and process PDF documents with vector embeddings
- 🔍 **Vector Search** - Semantic search across uploaded documents using pgvector
- 💾 **Conversation Memory** - Automatic context retention with Supabase
- 🌐 **Web Search** - Integrated Tavily web search tool with caching
- 📊 **Metrics & Monitoring** - Track LLM usage and performance
- 🎨 **Modern UI** - Built with Next.js 16, TypeScript, and Tailwind CSS v4

## Tech Stack

- **Framework**: Next.js 16.1.1 (App Router, Turbopack)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS v4
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL + pgvector)
- **LLM Providers**: 
  - GitHub Models API (gpt-4o, gpt-4o-mini)
  - Ollama (deepseek-r1:8b, llama, mistral, etc.)
- **Document Processing**: pdf-parse, pdfjs-dist
- **Markdown Rendering**: react-markdown with remark-gfm

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- **For GitHub Models**: GitHub Personal Access Token (configured via UI)
- **For Ollama**: Ollama installed locally ([Download](https://ollama.ai))
- Tavily API key (optional, for web search - configured via UI)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/allerac-one.git
   cd allerac-one
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   
   ```bash
   # Required - Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Optional - Ollama (if using local models)
   OLLAMA_BASE_URL=http://localhost:11434
   
   # Optional - Tavily (if using web search, can also be set in UI)
   TAVILY_API_KEY=your_tavily_api_key
   ```

4. **Set up Supabase authentication**
   
   Follow the instructions in [AUTHENTICATION.md](AUTHENTICATION.md) to configure email/password authentication.

5. **Set up Supabase database**
   
   Run the SQL migration files in the `database/` folder in your Supabase SQL editor, in order:
   
   ```sql
   01_create_chat_tables.sql
   02_create_documents_tables.sql
   03_create_memory_tables.sql
   04_create_tavily_cache_table.sql
   05_create_user_settings_table.sql
   06_setup_metrics_supabase.sql
   ```

6. **Set up Ollama (optional, for local models)**
   
   Install Ollama from [ollama.ai](https://ollama.ai), then pull a model:
   ```bash
   ollama pull deepseek-r1:8b
   # or
   ollama pull llama3.2
   ```

7. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
allerac-one/
├── app/
│   ├── page.tsx                 # Main chat interface (root /)
│   ├── types.ts                 # TypeScript interfaces
│   ├── clients/
│   │   └── supabase.ts          # Supabase client initialization
│   ├── services/                # Core services
│   │   ├── models.ts            # LLM model configurations
│   │   ├── llm.service.ts       # Unified LLM client (GitHub + Ollama)
│   │   ├── supabase.service.ts  # Database operations
│   │   ├── conversation-memory.service.ts
│   │   ├── document.service.ts
│   │   ├── embedding.service.ts
│   │   ├── vector-search.service.ts
│   │   ├── cache.service.ts     # Query caching
│   │   ├── metrics.service.ts   # LLM usage tracking
│   │   └── user-settings.service.ts
│   ├── tools/                   # Function calling tools
│   │   ├── tools.ts             # Tool definitions
│   │   └── search-web.tool.ts   # Tavily web search
│   └── components/
│       └── DocumentUpload.tsx
├── database/                    # Supabase SQL migrations
├── .github/
│   └── copilot-instructions.md  # AI assistant instructions
└── .env.local                   # Environment variables
```

## Usage

### First Time Setup

1. **Create an account** - Use email/password to sign up
2. **Configure tokens** (Settings → API Keys):
   - Add your GitHub token for GitHub Models
   - Add Tavily API key for web search (optional)
3. **Select a model** from the dropdown (GitHub Models or Ollama)

### Chat Interface

The chat interface at `/` (root) allows you to:

- Have conversations with AI models
- Upload PDF documents for context-aware responses
- Use web search for up-to-date information
- View conversation history
- Switch between different LLM models
- Toggle dark/light mode

### Adding New Models

To add a new LLM model, edit `app/services/models.ts`:

```typescript
export const MODELS: Model[] = [
  {
    id: 'model-name',
    name: 'Display Name',
    provider: 'github' | 'ollama',
    baseUrl: 'https://api.url',
    requiresToken: true | false
  },
  // ... existing models
];
```

The LLMService automatically detects the provider - no code changes needed!

## Configuration

### Model Selection

The application supports multiple LLM providers through a unified configuration system:

**Available Models:**
- **gpt-4o** - GitHub Models (latest GPT-4 Omni)
- **gpt-4o-mini** - GitHub Models (faster, cost-effective)
- **deepseek-r1:8b** - Ollama (local reasoning model)
- *Add more models in `app/services/models.ts`*

**Switching Models:**
- Select from the model dropdown in the UI
- Provider is auto-detected based on model configuration
- Tokens are stored in localStorage (configured via UI)

### API Keys Configuration

API keys can be configured in two ways:

1. **Via UI** (Recommended):
   - Click Settings → API Keys
   - Enter your tokens (stored in localStorage)

2. **Via Environment**:
   - Add to `.env.local` as fallback
   - UI configuration takes precedence

### Database Tables

The application uses the following Supabase tables:
- `chat_messages` - Conversation history
- `documents` - Uploaded document metadata
- `document_embeddings` - Vector embeddings for semantic search (pgvector)
- `conversation_memory` - Long-term conversation context
- `tavily_cache` - Cached web search results
- `user_settings` - User preferences and API keys
- `llm_metrics` - LLM usage tracking and monitoring

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Your Supabase anonymous key |
| `OLLAMA_BASE_URL` | No | Ollama API URL (default: http://localhost:11434) |
| `TAVILY_API_KEY` | No | Tavily API key for web search (can also be set in UI) |

**Note**: GitHub tokens are configured via UI and stored in localStorage, not environment variables.

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Documentation

- [AUTHENTICATION.md](AUTHENTICATION.md) - Supabase authentication setup
- [LLM_SETUP.md](LLM_SETUP.md) - LLM provider configuration guide
- [.github/copilot-instructions.md](.github/copilot-instructions.md) - Project guidelines for AI assistants

## Architecture

**Configuration-Driven Design:**
- Models defined in `app/services/models.ts`
- Provider auto-detection (no hardcoded conditionals)
- UI-first token management with localStorage
- Fallback to environment variables

**Key Services:**
- `LLMService` - Unified interface for GitHub Models + Ollama
- `SupabaseService` - Database operations with RLS
- `ConversationMemoryService` - Automatic context retention
- `VectorSearchService` - Semantic search via pgvector
- `MetricsService` - LLM usage tracking

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [GitHub Models](https://github.com/marketplace/models)
- [Ollama Documentation](https://ollama.ai/docs)
- [Tavily API](https://tavily.com)

## Deploy on Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new):

1. Push your code to GitHub
2. Import your repository in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OLLAMA_BASE_URL` (if using Ollama)
   - `TAVILY_API_KEY` (optional)
4. Deploy!

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
