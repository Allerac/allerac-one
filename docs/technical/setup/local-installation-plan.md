# Local Installation Plan - Private AI Agent

## Vision

Create a simple, automated way to install Allerac One on any local machine (mini-PC, home server, laptop), enabling anyone to have their own private AI agent running at home.

### Goals

1. **One-command installation** - Install everything with a single script
2. **Product-ready** - Polished enough to potentially sell as a "Private AI Agent"
3. **Multi-agent future** - Architecture that supports multiple agents communicating

---

## Phase 1: Simple Local Installation (Priority: High)

### Objective
Anyone can install Allerac One on a mini-PC with one command.

### Deliverables

#### 1.1 Install Script (`install.sh`)
```bash
curl -sSL https://install.allerac.ai/install.sh | bash
```

The script will:
- Detect OS (Ubuntu, Debian, macOS)
- Install Docker & Docker Compose
- Install Ollama
- Download recommended LLM model (e.g., llama3.2, mistral)
- Clone Allerac One repository
- Configure environment variables
- Start all services
- Print access URL (http://localhost:8080)

#### 1.2 `docker-compose.local.yml`
Simplified version without cloud dependencies:
- App (Next.js)
- Database (PostgreSQL + pgvector)
- Ollama (containerized option)
- Optional: Monitoring stack

#### 1.3 Local Configuration
- `.env.local.example` - Template for local setup
- Auto-generate encryption keys
- Default to Ollama models (no API keys needed)

#### 1.4 Documentation
- `docs/local-setup.md` - Step-by-step guide
- Hardware requirements
- Troubleshooting common issues

### Hardware Requirements (Minimum)
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32 GB |
| Storage | 50 GB SSD | 100 GB NVMe |
| GPU | Not required | NVIDIA RTX 3060+ |

### Estimated Effort: 1-2 days

---

## Phase 2: Product Polish (Priority: Medium)

### Objective
Make it feel like a real product, not just a dev project.

### Deliverables

#### 2.1 First-Run Setup Wizard
Web-based wizard on first access:
- Create admin account
- Choose language
- Select LLM model
- Configure basic settings
- Test AI connection

#### 2.2 System Dashboard
Local admin panel showing:
- System health (CPU, RAM, Disk)
- Ollama status and models
- Database stats
- Backup status

#### 2.3 Auto-Updates
- Check for new versions
- One-click update
- Rollback capability

#### 2.4 Backup to Local Drive
- Scheduled local backups
- Export/Import functionality
- USB drive backup option

### Estimated Effort: 3-5 days

---

## Phase 3: Multi-Agent Network (Priority: Future)

### Objective
Multiple Allerac agents in a home network that can communicate and collaborate.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Home Network                             │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Mini-PC #1  │    │  Mini-PC #2  │    │  Mini-PC #3  │   │
│  │  "Kitchen"   │    │  "Office"    │    │  "Bedroom"   │   │
│  │              │    │              │    │              │   │
│  │  ┌────────┐  │    │  ┌────────┐  │    │  ┌────────┐  │   │
│  │  │Allerac │  │◄──►│  │Allerac │  │◄──►│  │Allerac │  │   │
│  │  │ Agent  │  │    │  │ Agent  │  │    │  │ Agent  │  │   │
│  │  └────────┘  │    │  └────────┘  │    │  └────────┘  │   │
│  │      │       │    │      │       │    │      │       │   │
│  │  ┌────────┐  │    │  ┌────────┐  │    │  ┌────────┐  │   │
│  │  │ Ollama │  │    │  │ Ollama │  │    │  │ Ollama │  │   │
│  │  │(7B LLM)│  │    │  │(13B LLM)│ │    │  │(7B LLM)│  │   │
│  │  └────────┘  │    │  └────────┘  │    │  └────────┘  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│          │                   │                   │           │
│          └───────────────────┼───────────────────┘           │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │  Agent Discovery  │                     │
│                    │    (mDNS/Avahi)   │                     │
│                    └───────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Agent Features

#### 3.1 Agent Discovery
- Use mDNS (Avahi/Bonjour) for automatic discovery
- Agents announce themselves on the network
- Web UI shows all agents in the network

#### 3.2 Shared Memory
- Agents can share memories/knowledge
- Distributed vector database (or sync)
- Privacy controls (what to share)

#### 3.3 Task Delegation
- Route tasks to the best agent:
  - "Office" agent has more powerful GPU → complex tasks
  - "Kitchen" agent for quick responses
- Load balancing across agents

#### 3.4 Specialized Agents
Each agent could have specializations:
- Code assistant
- Research agent
- Creative writing
- Home automation

#### 3.5 Communication Protocol
Options to consider:
- REST API between agents
- WebSocket for real-time
- Message queue (Redis, RabbitMQ)
- gRPC for efficiency

### Estimated Effort: 2-4 weeks

---

## Technical Considerations

### Why Your Mini-PC Was Freezing

Common causes:
1. **RAM exhaustion** - LLMs need lots of memory
2. **Swap thrashing** - No swap or too small
3. **Thermal throttling** - Mini-PCs run hot
4. **Model too large** - 13B+ models on 16GB RAM

Solutions:
- Use smaller models (7B, quantized)
- Add swap space (at least 8GB)
- Ensure good ventilation
- Monitor with Grafana dashboard

### Recommended Mini-PCs for Local AI

| Device | Price | RAM | Notes |
|--------|-------|-----|-------|
| Beelink SER5 | ~$350 | 32GB | Good budget option |
| Intel NUC 13 | ~$600 | 64GB | Solid performance |
| NVIDIA Jetson | ~$500 | 16GB | GPU acceleration |
| Mac Mini M2 | ~$800 | 24GB | Best for Apple users |

### LLM Model Recommendations

| Model | VRAM/RAM | Quality | Speed |
|-------|----------|---------|-------|
| Llama 3.2 3B | 4GB | Good | Fast |
| Mistral 7B | 8GB | Great | Medium |
| Llama 3.1 8B | 10GB | Great | Medium |
| Mixtral 8x7B | 32GB | Excellent | Slow |

---

## Implementation Roadmap

### Week 1 (Phase 1)
- [ ] Create `install.sh` script
- [ ] Create `docker-compose.local.yml`
- [ ] Create `.env.local.example`
- [ ] Write `docs/local-setup.md`
- [ ] Test on Ubuntu 22.04
- [ ] Test on macOS

### Week 2 (Phase 1 + 2)
- [ ] Test on different hardware
- [ ] Fix freezing issues (swap, memory limits)
- [ ] Add health checks
- [ ] Create uninstall script

### Week 3-4 (Phase 2)
- [ ] First-run setup wizard
- [ ] System dashboard
- [ ] Local backup system
- [ ] Auto-update mechanism

### Future (Phase 3)
- [ ] Agent discovery protocol
- [ ] Inter-agent communication API
- [ ] Shared memory sync
- [ ] Multi-agent web UI

---

## Product Potential

### "Allerac Private AI" Product

**Target Market:**
- Privacy-conscious users
- Small businesses
- Developers
- Home automation enthusiasts

**Pricing Ideas:**
- Open source (free) - DIY installation
- Pre-configured hardware bundle ($500-1000)
- Support subscription ($10-20/month)

**Differentiators:**
- 100% private - no data leaves your home
- No API costs - runs on local hardware
- Multi-agent capable (unique feature)
- Memory that persists and learns

---

## Questions to Resolve

1. Should we containerize Ollama or keep it native?
2. What's the minimum viable LLM model to recommend?
3. How to handle users without technical knowledge?
4. Should we support Windows?
5. Cloud backup option for local installations?

---

## Next Steps

1. Review this plan
2. Prioritize features
3. Start with Phase 1 implementation
4. Test on your mini-PC to fix freezing issue
5. Iterate based on feedback
