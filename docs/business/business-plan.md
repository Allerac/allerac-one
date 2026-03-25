# Allerac Business Plan

## Executive Summary

Allerac is a dual-model AI platform offering both local and cloud-based AI agents. The core value proposition is **privacy-first AI** with the flexibility to choose between owning your hardware (local) or managed cloud services.

### Target Market
- Privacy-conscious individuals and businesses
- Users tired of subscription fatigue ($20/month for ChatGPT, Copilot, etc.)
- Technical users wanting local AI without cloud dependencies
- SMBs needing private AI agents for internal use

### Competitive Advantage
1. **Hybrid Model**: Local hardware + Cloud services (not either/or)
2. **Zero Lock-in**: Self-hosted software, bring your own hardware
3. **Full Stack Control**: From hardware to inference to application layer
4. **Open Core**: Community-driven development, enterprise features on top

---

## Product Lines

### Local Hardware Line

#### Allerac Lite
**Target**: Entry-level users, small workloads  
**Specifications**:
- CPU: Intel N100 (4-core, 6W TDP)
- RAM: 16GB DDR4
- Storage: 256GB NVMe SSD
- Power: ~15W idle, ~30W load
- Form factor: Mini PC (120x120x50mm)

**Capabilities**:
- Runs models up to 7B parameters
- Inference speed: ~5-10 tokens/second
- 24/7 operation cost: ~€3/month electricity
- Pre-installed: Allerac One + Qwen 2.5 7B + DeepSeek R1 1.5B

**Price**: €149

**Margins**:
- Hardware cost: €110
- Software/setup: €10
- Gross margin: €29 (~19%)

---

#### Allerac Home
**Target**: Daily users, home office, small teams  
**Specifications**:
- CPU: Intel i5-13400 or AMD Ryzen 5 7600
- RAM: 32GB DDR4
- Storage: 512GB NVMe SSD
- Power: ~25W idle, ~65W load
- Form factor: Mini PC or compact desktop

**Capabilities**:
- Runs models up to 13B parameters
- Inference speed: ~10-20 tokens/second
- Multi-user support (3-5 concurrent users)
- Pre-installed: Allerac One + Qwen 2.5 14B + Mistral 7B + DeepSeek R1 8B

**Price**: €349

**Margins**:
- Hardware cost: €280
- Software/setup: €10
- Gross margin: €59 (~17%)

---

#### Allerac Pro
**Target**: Power users, small businesses, developers  
**Specifications**:
- CPU: Intel i7-13700 or AMD Ryzen 7 7700X
- RAM: 64GB DDR5
- Storage: 1TB NVMe SSD
- Power: ~35W idle, ~125W load
- Optional: NVIDIA RTX 4060 Ti 16GB (external eGPU)

**Capabilities**:
- Runs models up to 30B parameters (70B with eGPU)
- Inference speed: ~20-30 tokens/second (GPU: 50-80 tokens/s)
- Multi-user support (10+ concurrent users)
- Pre-installed: Allerac One + Llama 3.3 70B + Qwen 2.5 14B + Command R+ 35B

**Price**: €599 (base) / €999 (with eGPU)

**Margins**:
- Hardware cost: €480 / €800
- Software/setup: €15
- Gross margin: €104 (~17%) / €184 (~18%)

---

### Cloud Services Line

#### Allerac Cloud Starter
**Target**: Casual users, evaluation, non-technical users  
**Specifications**:
- Shared VM infrastructure
- Monthly quota: 1M tokens (~500 conversations)
- Models: Qwen 2.5 7B, DeepSeek R1 8B, Llama 3.2 3B
- Storage: 5GB for documents/memory
- Support: Community (Discord/Forum)

**Price**: €9/month (€99/year)

**Unit Economics**:
- Infrastructure cost: ~€2/user/month (shared L4 GPU, 10 users/GPU)
- Gross margin: €7 (~78%)
- Break-even: 22 users

---

#### Allerac Cloud Personal
**Target**: Professional users, daily drivers, privacy-conscious  
**Specifications**:
- Dedicated VM resources
- Monthly quota: 10M tokens (~3000 conversations)
- Models: All models up to 14B (Qwen, Mistral, Llama, DeepSeek)
- Storage: 50GB for documents/memory
- Features: Priority inference, custom fine-tuning, API access
- Support: Email (48h response)

**Price**: €29/month (€299/year)

**Unit Economics**:
- Infrastructure cost: ~€8/user/month (dedicated L4 slice)
- Gross margin: €21 (~72%)
- Break-even: 19 users

---

#### Allerac Cloud Pro
**Target**: Power users, businesses, API integration  
**Specifications**:
- Dedicated GPU resources
- Monthly quota: 50M tokens (~10,000 conversations)
- Models: All models including 70B+ (Llama 3.3 70B, Command R+ 104B)
- Storage: 200GB for documents/memory
- Features: Custom models, multi-agent orchestration, SSO, dedicated support
- Support: Priority email + Slack channel (24h response)

**Price**: €79/month (€799/year)

**Unit Economics**:
- Infrastructure cost: ~€25/user/month (A100 40GB, 2-3 users/GPU)
- Gross margin: €54 (~68%)
- Break-even: 11 users

---

## Allerac Server (Inference Infrastructure)

### Architecture Overview

```
Users → allerac.cloud → Allerac Server (LLM Router)
                            ↓
                    ┌───────┴────────┐
                    ↓                ↓
              vLLM (Local GPU)   GitHub Models API
              ├─ Qwen 7B         (Fallback/Scale)
              ├─ DeepSeek 8B
              └─ Llama 70B
```

### Phase 1: GitHub Models API Proxy (Months 1-3)
**Goal**: Validate demand without GPU investment

**Infrastructure**:
- Google Cloud Run (Node.js/TypeScript)
- PostgreSQL (user quotas, billing)
- Redis (rate limiting, cache)
- Stripe (payments)

**Cost Structure**:
- Cloud Run: €20/month (up to 100 users)
- Database: €15/month
- GitHub Models API: Variable (€0.002-0.015 per 1K tokens)
- Total fixed: €35/month + variable tokens

**Key Metrics to Track**:
- Monthly Active Users (MAU)
- Average tokens per user
- GitHub API costs vs revenue
- When to switch: GitHub costs > €500/month = Time for own GPU

---

### Phase 2: Hybrid (vLLM + GitHub) (Months 4-6)
**Goal**: Reduce token costs, increase margins

**Infrastructure**:
- 2x NVIDIA L4 GPUs (Google Cloud): €300/month
- vLLM serving Qwen 7B + DeepSeek 8B
- GitHub Models API for 70B models only

**Cost Structure**:
- L4 GPUs: €300/month (handles 30-50 users on small models)
- GitHub API: ~€200/month (only large models)
- Other infra: €50/month
- Total: €550/month

**Capacity**: 50-100 users before next scaling point

---

### Phase 3: Full vLLM (Months 7-12)
**Goal**: Maximum margins, full control

**Infrastructure**:
- 4x NVIDIA L40 GPUs: €1600/month
- vLLM serving all models (7B to 70B)
- GitHub API as backup only

**Cost Structure**:
- L40 GPUs: €1600/month (handles 200+ users)
- Backup API: €50/month
- Other infra: €100/month
- Total: €1750/month

**Capacity**: 200-300 users

---

## Revenue Projections

### Year 1 (Conservative)

| Month | Cloud Users | Hardware Sales | MRR | Hardware Revenue | Total |
|-------|-------------|----------------|-----|------------------|-------|
| 1-2   | 10          | 2              | €90 | €600             | €780  |
| 3-4   | 25          | 5              | €225| €1,500           | €1,950|
| 5-6   | 50          | 8              | €450| €2,400           | €3,300|
| 7-8   | 100         | 12             | €900| €3,600           | €5,400|
| 9-10  | 150         | 15             | €1,350| €4,500         | €7,350|
| 11-12 | 200         | 20             | €1,800| €6,000         | €9,600|

**Year 1 Total**: €29,780 revenue

**Costs Year 1**:
- Infrastructure: €6,000
- Hardware COGS: €15,000
- Marketing: €3,000
- Operations: €2,000
- **Total**: €26,000

**Year 1 Profit**: €3,780

---

### Year 2 (Growth)

**Assumptions**:
- 400 cloud users by month 12 (MRR: €3,600)
- 40 hardware units/month average (€14,000/month)
- Revenue: €211,200
- COGS: €130,000
- Gross Profit: €81,200 (38% margin)

---

## Customer Acquisition Strategy

### Phase 1: Community Building (Months 1-3)
- Launch on Product Hunt, Hacker News, Reddit (r/LocalLLaMA, r/selfhosted)
- Create content: "Privacy-first AI", "Escape subscription hell"
- Discord community
- Open source Allerac One (GitHub stars = credibility)
- Target: 1,000 Discord members, 500 GitHub stars

### Phase 2: Content Marketing (Months 4-6)
- YouTube: Setup guides, comparisons (vs ChatGPT, vs Mac Mini)
- Blog: Technical deep dives (vLLM, RAG, local inference)
- Partnerships: Mini PC manufacturers (Beelink, Minisforum)
- Target: 5,000 monthly visitors

### Phase 3: Paid Acquisition (Months 7-12)
- Google Ads: "Private AI", "Local ChatGPT"
- Affiliate program: 20% commission on hardware, 10% on cloud
- Reseller program: B2B sales through system integrators
- Target: 10,000 monthly visitors, 2% conversion

---

## Competitive Landscape

| Competitor | Model | Pricing | Allerac Advantage |
|------------|-------|---------|-------------------|
| ChatGPT | Cloud SaaS | $20/month | Privacy, no vendor lock-in |
| GitHub Copilot | Cloud SaaS | $10/month | Full agent, not just code |
| Ollama | Open source | Free | Integrated UI, cloud option |
| AnythingLLM | Open source | Free/$50/month | Better UX, hardware option |
| Mac Mini M4 | Hardware | €1,400+ | Much cheaper hardware |
| Cloud GPU (Vast.ai) | IaaS | €200+/month | Pre-configured, easier |

**Unique Position**: Only player offering hardware + software + cloud as integrated ecosystem.

---

## Key Risks & Mitigations

### Risk 1: Large players (Google, Microsoft) offer free local AI
**Mitigation**: Focus on privacy + zero telemetry. They can't offer true local-first due to business model.

### Risk 2: Hardware margins too low
**Mitigation**: Real money is in cloud subscriptions (70% margin). Hardware is customer acquisition.

### Risk 3: GPU costs too high
**Mitigation**: Start with GitHub API proxy. Only invest in GPUs when revenue justifies it.

### Risk 4: Open source competitors
**Mitigation**: Allerac One is also open source. Compete on UX + managed cloud + hardware integration.

---

## Next Steps (Implementation Roadmap)

### Month 1-2: Foundation
- [ ] Create allerac-server repository
- [ ] Deploy GitHub API proxy to Cloud Run
- [ ] Launch landing page (allerac.cloud)
- [ ] Integrate Stripe for cloud subscriptions
- [ ] First 10 beta users on Cloud Starter (free)

### Month 3-4: Hardware Validation
- [ ] Order 10x N100 mini PCs (Allerac Lite prototypes)
- [ ] Create automated setup script
- [ ] Sell 5 units to early adopters
- [ ] Collect feedback, iterate

### Month 5-6: Scale Cloud
- [ ] Hit 50 paying cloud users
- [ ] Deploy vLLM with L4 GPUs
- [ ] Reduce GitHub API costs by 50%
- [ ] Launch affiliate program

### Month 7-12: Growth
- [ ] Launch Allerac Home and Pro hardware
- [ ] Partner with 1-2 mini PC manufacturers
- [ ] Expand to US market
- [ ] Launch Allerac Cloud Pro tier

---

## Success Metrics (12 Months)

- **MRR**: €3,000+ (200+ cloud subscribers)
- **Hardware**: 15+ units/month
- **Community**: 5,000+ Discord members, 2,000+ GitHub stars
- **Profitability**: Cash-flow positive by month 10
- **Customer Satisfaction**: NPS > 50

---

**Document Version**: 1.0  
**Last Updated**: February 14, 2026  
**Next Review**: March 2026
