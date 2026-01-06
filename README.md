# Allerac-One

An AI-powered chat application with advanced features including document upload, vector search, conversation memory, and web search capabilities.

## Features

- 🤖 **AI Chat with Streaming** - Real-time streaming responses from OpenAI and Anthropic models
- 📄 **Document Upload** - Upload and process PDF documents with vector embeddings
- 🔍 **Vector Search** - Semantic search across uploaded documents
- 💾 **Conversation Memory** - Persistent chat history with Supabase
- 🌐 **Web Search** - Integrated Tavily web search tool for up-to-date information
- 📊 **Metrics & Monitoring** - Track AI usage and performance
- 🎨 **Modern UI** - Built with Next.js 14+, TypeScript, and Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI Providers**: 
  - GitHub Models (GPT-4o, GPT-4o-mini, o1-preview, o1-mini)
  - Ollama (Local LLMs - llama3.2, mistral, etc.)
- **Database**: Supabase (PostgreSQL)
- **Vector Storage**: Supabase pgvector
- **PDF Processing**: pdf-parse

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- **For GitHub Models**: GitHub Personal Access Token with Models access
- **For Ollama**: Ollama installed locally ([Download](https://ollama.ai))
- Tavily API key (optional, for web search)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd allerac-one
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy `.env.example` to `.env.local` and fill in your values:
   ```bash
   cp .env.example .env.local
   ```
   
   **Required variables:**
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `LLM_PROVIDER` - Choose "github" or "ollama"
   
   **For GitHub Models provider:**
   - `GITHUB_TOKEN` - Your GitHub Personal Access Token
   - `GITHUB_MODEL` - Model to use (e.g., "gpt-4o", "gpt-4o-mini")
   
   **For Ollama provider:**
   - `OLLAMA_BASE_URL` - Ollama API URL (default: http://localhost:11434)
   - `OLLAMA_MODEL` - Model to use (e.g., "llama3.2", "mistral")
   
   **Optional:**
   - `TAVILY_API_KEY` - Your Tavily API key for web search

4. **Set up Ollama (if using local LLMs)**
   
   Install Ollama from [ollama.ai](https://ollama.ai), then pull a model:
   ```bash
   ollama pull llama3.2
   # or
   ollama pull mistral
   ```

5. **Set up Supabase database**
   
   Run the SQL migration files in the `database/` folder in order:
   
   ```sql
   -- In your Supabase SQL editor, run these in order:
   01_create_chat_tables.sql
   02_create_documents_tables.sql
   03_create_memory_tables.sql
   04_create_tavily_cache_table.sql
   05_create_user_settings_table.sql
   06_setup_metrics_supabase.sql
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
allerac-one/
├── app/
│   └── chat/                    # Main chat application
│       ├── components/          # Chat UI components
│       │   └── DocumentUpload.tsx
│       ├── services/            # Business logic services
│       │   ├── llm.service.ts          # OpenAI/Anthropic integration
│       │   ├── supabase.service.ts     # Database operations
│       │   ├── cache.service.ts        # Caching layer
│       │   ├── metrics.service.ts      # Usage metrics
│       │   └── user-settings.service.ts
│       ├── tools/               # AI tools
│       │   ├── event.tools.ts
│       │   ├── guest.tools.ts
│       │   └── search-web.tool.ts
│       ├── constants.ts         # App constants
│       ├── types.ts             # TypeScript types
│       └── page.tsx             # Chat interface
├── lib/
│   ├── services/                # Shared services
│   │   ├── conversation-memory.service.ts
│   │   ├── document.service.ts
│   │   ├── embedding.service.ts
│   │   └── vector-search.service.ts
│   └── supabase.ts              # Supabase client
├── database/                    # SQL migration files
└── .env.example                 # Environment template
```

## Usage

### Chat Interface

Navigate to `/chat` to access the AI chat interface. You can:

- Have conversations with AI models (OpenAI or Anthropic)
- Upload PDF documents for context-aware responses
- Use web search to get up-to-date information
- View conversation history

### Document Upload

1. Click the upload button in the chat interface
2. Select a PDF file
3. The document will be processed and stored with vector embeddings
4. Ask questions about the document content

## Configuration

### AI Providers

The application supports two LLM providers:

#### 1. GitHub Models (Cloud)
- Free during preview with rate limits
- Models: GPT-4o, GPT-4o-mini, o1-preview, o1-mini
- Set `LLM_PROVIDER=github` in `.env.local`
- Requires `GITHUB_TOKEN` with Models access

#### 2. Ollama (Local)
- Run LLMs locally on your machine
- Models: llama3.2, mistral, phi, and many more
- Set `LLM_PROVIDER=ollama` in `.env.local`
- Requires Ollama running locally

### Switching Providers

To switch between providers, simply update your `.env.local`:

```bash
# Use GitHub Models
LLM_PROVIDER=github
GITHUB_TOKEN=your_token
GITHUB_MODEL=gpt-4o

# Or use Ollama
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
```

Restart your dev server after changing providers.

### Database Tables

The application uses the following Supabase tables:
- `chat_messages` - Conversation history
- `documents` - Uploaded document metadata
- `document_embeddings` - Vector embeddings for semantic search
- `conversation_memory` - Long-term conversation context
- `tavily_cache` - Cached web search results
- `user_settings` - User preferences
- `metrics` - Usage tracking

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

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Your Supabase anonymous key |
| `LLM_PROVIDER` | Yes | LLM provider: "github" or "ollama" |
| `GITHUB_TOKEN` | If using GitHub | GitHub Personal Access Token with Models access |
| `GITHUB_MODEL` | If using GitHub | Model name (e.g., gpt-4o, gpt-4o-mini) |
| `OLLAMA_BASE_URL` | If using Ollama | Ollama API URL (default: http://localhost:11434) |
| `OLLAMA_MODEL` | If using Ollama | Model name (e.g., llama3.2, mistral) |
| `TAVILY_API_KEY` | No | Tavily API key for web search |
| `NEXT_PUBLIC_APP_URL` | No | Application URL (default: http://localhost:3000) |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
