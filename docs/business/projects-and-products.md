# Allerac Projects & Products Architecture

## Overview

Allerac's product line is supported by three distinct software projects, each serving a specific purpose in the ecosystem. This document explains the architecture, relationships, and deployment strategy.

---

## The Three Projects

### 1. allerac-one (Local Agent)

**Purpose**: Self-hosted AI agent for local deployment

**Architecture**:
```
allerac-one/
├── src/app/                    # Next.js application
│   ├── components/             # React UI components
│   ├── services/               # LLM, RAG, memory services
│   ├── api/                    # API routes (local only)
│   └── actions/                # Server actions
├── docker-compose.yml          # All-in-one local stack
│   ├── postgres (pgvector)     # Vector database
│   ├── ollama                  # Local LLM inference
│   └── nextjs                  # Web application
├── database/                   # SQL migrations
└── install.sh                  # Automated setup script
```

**Key Features**:
- 100% runs on user's hardware
- No cloud dependencies
- Pre-configured with Qwen 2.5 7B
- Single-tenant (one user per installation)
- Zero recurring costs (except electricity)

**Inference**: Local Ollama (models stored on disk)

**Database**: PostgreSQL with pgvector (local Docker)

**Deployment**: User's hardware (mini PC, Mac Mini, regular PC)

**License**: Open Source (MIT)

**Supports Products**:
- Allerac Lite (hardware)
- Allerac Home (hardware)
- Allerac Pro (hardware)

---

### 2. allerac-cloud (SaaS Frontend)

**Purpose**: Multi-tenant cloud service frontend

**Architecture**:
```
allerac-cloud/
├── src/app/                    # Next.js application
│   ├── components/             # React UI (80% shared with allerac-one)
│   ├── services/               # Multi-tenant services
│   ├── api/                    # API routes (cloud)
│   │   ├── chat/               # Calls allerac-server
│   │   ├── documents/          # RAG document management
│   │   ├── auth/               # Multi-tenant authentication
│   │   └── billing/            # Stripe integration
│   └── actions/                # Server actions
├── database/                   # Multi-tenant schema
│   ├── users                   # User accounts
│   ├── conversations           # Chat history (per user)
│   ├── documents               # Uploaded docs (per user)
│   ├── vectors                 # Embeddings (per user)
│   └── quotas                  # Usage limits
└── .env
    ├── ALLERAC_SERVER_URL      # Points to allerac-server
    ├── DATABASE_URL            # Managed PostgreSQL
    └── STRIPE_API_KEY          # Payment processing
```

**Key Features**:
- Multi-tenant architecture (thousands of users)
- Managed infrastructure
- Web-based (no installation)
- Quotas and billing
- Cloud backup and sync

**Inference**: Delegated to allerac-server (via HTTP API)

**Database**: Managed PostgreSQL (Supabase, Google Cloud SQL, or similar)

**Deployment**: Vercel, Railway, or Google Cloud Run

**License**: Source-available (frontend open, backend private)

**Supports Products**:
- Allerac Cloud Starter
- Allerac Cloud Personal
- Allerac Cloud Pro

---

### 3. allerac-server (Inference Hub)

**Purpose**: Centralized LLM inference service

**Architecture**:
```
allerac-server/
├── src/
│   ├── api/
│   │   ├── inference.ts        # POST /v1/chat/completions
│   │   └── health.ts           # GET /health
│   ├── services/
│   │   ├── llm-router.ts       # Routes to vLLM or GitHub API
│   │   ├── quota-manager.ts    # Rate limiting & billing
│   │   ├── metrics-tracker.ts  # Usage analytics
│   │   └── cache.ts            # Redis caching
│   ├── workers/
│   │   └── vllm-worker.py      # Optional: local vLLM serving
│   └── db/
│       └── schema.sql          # Only stores quotas/metrics
├── docker-compose.yml
│   ├── api-server              # Node.js/TypeScript
│   ├── redis                   # Caching & rate limiting
│   ├── postgres                # Quotas only
│   └── vllm (optional)         # GPU inference
└── .env
    └── GITHUB_MODELS_API_KEY   # For Phase 1
```

**Key Features**:
- Stateless (no conversation history)
- Horizontal scaling
- Multi-provider support (GitHub API, vLLM, future: OpenAI, Anthropic)
- Per-user quotas
- Automatic failover

**API Contract**:
```typescript
POST /v1/chat/completions
{
  "userId": "uuid",
  "model": "qwen-7b",
  "messages": [...],
  "stream": false
}

Response:
{
  "choices": [...],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

**Inference Evolution**:

**Phase 1** (Months 1-3): GitHub Models API Proxy
- Zero GPU costs
- Pay-per-token
- Fast to deploy
- Validates demand

**Phase 2** (Months 4-6): Hybrid vLLM + GitHub
- 2x L4 GPUs for small models (7B, 8B)
- GitHub API for large models (70B)
- 50% cost reduction

**Phase 3** (Months 7+): Full vLLM
- 4x L40 GPUs for all models
- Maximum margins (70%+)
- Full control

**Database**: Minimal (only quotas and metrics, no user data)

**Deployment**: Google Cloud Run (Phase 1) → VM with GPUs (Phase 2+)

**License**: Proprietary (core competitive advantage)

**Supports Products**: All Allerac Cloud tiers

---

## Product-to-Project Mapping

| Product | Frontend | Database | Inference | Notes |
|---------|----------|----------|-----------|-------|
| **Allerac Lite** | allerac-one | Local PostgreSQL | Local Ollama | Ships pre-installed on N100 mini PC |
| **Allerac Home** | allerac-one | Local PostgreSQL | Local Ollama | Ships pre-installed on i5/32GB PC |
| **Allerac Pro** | allerac-one | Local PostgreSQL | Local Ollama | Ships pre-installed on i7/64GB PC |
| **Cloud Starter** | allerac-cloud | Cloud PostgreSQL | allerac-server | €9/month, 1M tokens |
| **Cloud Personal** | allerac-cloud | Cloud PostgreSQL | allerac-server | €29/month, 10M tokens |
| **Cloud Pro** | allerac-cloud | Cloud PostgreSQL | allerac-server | €79/month, 50M tokens |

---

## Communication Flow

### Local Deployment (allerac-one)
```
User Browser
    ↓
Next.js (localhost:3000)
    ↓
Ollama API (localhost:11434)
    ↓
Local LLM Models
```
**All traffic stays on local machine.**

---

### Cloud Deployment (allerac-cloud + allerac-server)
```
User Browser
    ↓
allerac-cloud (allerac.cloud)
    ↓ (saves to DB)
Cloud PostgreSQL (user data, vectors)
    ↓
allerac-cloud /api/chat
    ↓ (HTTP request)
allerac-server (inference.allerac.cloud)
    ↓ (checks quota)
Redis (rate limiting)
    ↓ (routes request)
┌────────────┴──────────────┐
↓                           ↓
vLLM (our GPUs)     GitHub Models API
↓                           ↓
Qwen 7B, DeepSeek 8B       GPT-4, large models
```

**User data stays in allerac-cloud database. Inference is stateless.**

---

## Code Reuse Strategy

### Shared Components (80% overlap)
These components can be copied from allerac-one to allerac-cloud with minimal changes:

- `ChatMessages.tsx` - Message rendering
- `ChatInput.tsx` - Input interface
- `ChatHeader.tsx` - Header UI
- `ConversationMemoriesView.tsx` - Memory display
- `DocumentUpload.tsx` - RAG document upload
- `MemoriesModal.tsx` - Memory management

### Different Components (20% unique)

**allerac-one only**:
- `TokenConfiguration.tsx` - User configures own API keys
- Ollama integration service
- Local-only auth (no multi-tenant)

**allerac-cloud only**:
- Multi-tenant auth (Supabase Auth or similar)
- Billing dashboard (Stripe integration)
- Usage/quota display
- Team management (future)

### Shared Services
These can be extracted to a shared package later:

- RAG document processing
- Vector embedding logic
- Conversation memory algorithms
- Markdown rendering

---

## Development Workflow

### Local Development

**Step 1**: Test allerac-one
```bash
cd allerac-one
docker compose up
# Access at localhost:3000
# Validates: UI, RAG, memory, local inference
```

**Step 2**: Test allerac-server locally
```bash
cd allerac-server
docker compose up
# Access at localhost:8000
# Validates: Inference API, quotas, GitHub proxy
```

**Step 3**: Test allerac-cloud locally
```bash
cd allerac-cloud
export ALLERAC_SERVER_URL=http://localhost:8000
npm run dev
# Access at localhost:3001
# Validates: Multi-tenant, cloud integration
```

---

### Deployment Pipeline

**allerac-one**:
- No deployment needed (users run locally)
- GitHub releases with install.sh
- Docker images on Docker Hub (optional)

**allerac-server**:
- Phase 1: Docker → Google Cloud Run (auto-scaling)
- Phase 2+: Docker → GCP VM with GPUs (manual scaling)
- CI/CD: GitHub Actions → Cloud Run

**allerac-cloud**:
- Vercel (recommended) or Railway
- Connects to managed PostgreSQL (Supabase)
- CI/CD: GitHub push → Auto-deploy

---

## Validation Plan (3 Months)

### Month 1: Local Validation
- ✅ allerac-one already works
- [ ] Test on N100 mini PC (Allerac Lite prototype)
- [ ] Optimize for low-power hardware
- [ ] Document setup for non-technical users

### Month 2: Cloud Backend
- [ ] Create allerac-server (GitHub API proxy)
- [ ] Deploy to Google Cloud Run
- [ ] Implement quota system
- [ ] Test with 10 beta users

### Month 3: Cloud Frontend
- [ ] Create allerac-cloud (copy from allerac-one)
- [ ] Multi-tenant database schema
- [ ] Integrate Stripe
- [ ] Launch with 20 paying users

**Success Criteria**: 20 users paying €9-29/month = €380-580 MRR after 3 months

---

## Repository Structure

### Option A: Monorepo (Recommended for now)
```
allerac/
├── allerac-one/           # Local agent (open source)
├── allerac-cloud/         # SaaS frontend (source-available)
├── allerac-server/        # Inference hub (proprietary)
└── README.md              # Main documentation
```

### Option B: Separate repos (Later, when scaling)
```
github.com/allerac/allerac-one      (public)
github.com/allerac/allerac-cloud    (private or public)
github.com/allerac/allerac-server   (private)
```

**Recommendation**: Start with monorepo for faster iteration. Split later when needed.

---

## Security & Privacy Model

### allerac-one (Local)
- **Data Location**: User's hardware only
- **API Keys**: User-owned (GitHub, OpenAI optional)
- **Network**: Can run 100% offline
- **Privacy**: Maximum (nothing leaves the machine)

### allerac-cloud + allerac-server
- **Data Location**: 
  - User data (conversations, docs) → allerac-cloud database
  - Inference requests → allerac-server (stateless, no storage)
- **API Keys**: Allerac-owned (users don't need their own)
- **Network**: HTTPS only, encrypted at rest
- **Privacy**: 
  - No training on user data
  - No sharing with third parties
  - Optional: EU-only data residency
  - Compliance: GDPR-ready

---

## Technology Stack Summary

| Component | allerac-one | allerac-cloud | allerac-server |
|-----------|-------------|---------------|----------------|
| **Frontend** | Next.js 16 | Next.js 16 | N/A |
| **Backend** | Next.js API | Next.js API | Node.js/TypeScript |
| **Database** | PostgreSQL (local) | PostgreSQL (cloud) | PostgreSQL (minimal) |
| **Vector DB** | pgvector (local) | pgvector (cloud) | N/A |
| **Inference** | Ollama | allerac-server | vLLM / GitHub API |
| **Cache** | In-memory | Redis (cloud) | Redis |
| **Auth** | Simple (single-user) | Supabase Auth | JWT validation |
| **Billing** | N/A | Stripe | Quota enforcement |
| **Deployment** | Docker | Vercel | Cloud Run / GPU VM |

---

## Next Steps

### Immediate (Week 1-2)
1. Validate allerac-one on N100 mini PC
2. Document pain points and optimizations needed
3. Create first batch of 5 Allerac Lite units

### Short-term (Month 1-2)
1. Build allerac-server MVP (GitHub API proxy)
2. Deploy to Cloud Run
3. Test with 10 beta users

### Medium-term (Month 3-4)
1. Build allerac-cloud MVP
2. Multi-tenant database schema
3. Stripe integration
4. Launch public beta

### Long-term (Month 5-6)
1. Deploy vLLM with GPUs
2. Reduce inference costs by 50%
3. Scale to 100+ users
4. Partnership with mini PC manufacturers

---

**Document Version**: 1.0  
**Last Updated**: February 14, 2026  
**Related**: [business-plan.md](./business-plan.md)
