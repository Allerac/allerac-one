# Allerac One — Brainstorm & Future Ideas

A collection of ideas explored in conversation. Not a roadmap — just possibilities worth remembering.

---

## 1. LLM-Based Skill Auto-Detection

**Status:** Partially implemented (keyword-based today)
**Effort:** Medium

### Problem
Today skills activate via exact keyword matching. "quero uma receita" works, "algo gostoso para o jantar" doesn't — even though the intent is the same.

### Idea
Before processing each message, make a fast LLM call with the list of available skills and the user's message. The LLM returns which skill to activate (or none). Use a small/fast model (local Ollama) to keep latency low.

```
User message → quick LLM call → "activate: recipes-skill" → respond with that context
```

### Why it matters
Non-technical users never configure keywords. Their mother just types naturally and the right skill activates automatically. Specificity is what makes LLMs truly useful — a focused skill delivers much better results than a generic assistant.

---

## 2. Skill Library (Global Skills for All Users)

**Status:** Backend ready, UI missing
**Effort:** Small–Medium

### What exists today
Skills with `user_id = NULL` are already global — available to all users. Fields `verified` and `shared` exist. Seeds already include Personal Assistant, Code Reviewer, Research Assistant, Health Coach.

### What's missing
A discovery UI. Users can't browse and activate global skills today.

### Idea
- Programmers create skills via SQL seeds → available to everyone
- Users open a "Skill Library" → see available skills with descriptions
- One click to activate → no configuration needed
- Optional: customize after activation

### The non-technical user angle
Your mother doesn't write system prompts. But she would click "Recipes" and start using it immediately. The skill creator (programmer) does the hard work once — every user benefits automatically.

---

## 3. Multi-Instance Communication (Federated Agents)

**Status:** Idea only
**Effort:** Large — but infrastructure already exists

### The fascination
Two allerac-one instances (e.g. `app.allerac.ai` and `chat.allerac.ai`) already run independently, each with its own memories, documents, skills and LLM. What if they could talk to each other?

### How it could work
Each instance is already exposed via Cloudflare Tunnel with a chat API. One instance could call another like a user — passing a message, receiving a response.

```
User on app.allerac.ai: "help me with health and work planning"
    → skill detects chat.allerac.ai specializes in health
    → delegates health question to chat.allerac.ai
    → combines both responses
    → replies to user
```

### What's needed
1. **Inter-instance auth** — shared secret or JWT (same pattern as health-worker)
2. **Instance registry** — each node knows what other nodes exist and their specialties
3. **Delegate skill** — instructs the LLM to call another node when appropriate

### Why it's compelling
Each instance has deep context about its domain (documents, memories, skills). A network of specialized instances would be far more capable than one generic instance — without the complexity of traditional multi-agent frameworks. The user experience stays simple: one chat interface, but the answer can come from a collaboration of specialized nodes.

### Connection to agents concept
This is essentially distributed agents — each allerac-one instance is an agent with its own world. The difference from complex agent frameworks: it uses infrastructure that already exists (HTTP, Cloudflare, JWT auth) and the LLM orchestration happens naturally via skills.

---

## 4. Garmin Auth via Cloudflare Worker

**Status:** Fully designed, ready to implement if needed
**Document:** `docs/garmin-auth-worker-proposal.md`

### Problem
Cloud provider IPs (Azure, GCP, AWS) get rate-limited by Garmin's SSO during login/MFA. Sync (which uses a saved OAuth token) works fine — only the initial login is affected.

### Solution
Move only the auth flow to a Cloudflare Worker (edge IPs, diverse and rotating). Sync stays on the VM health-worker unchanged. No new infrastructure — already use Cloudflare.

### When to implement
Only if IP rate limiting becomes a recurring problem. Current setup works correctly under normal usage (one login per user, periodic sync).

---

## 5. Super-Agents as Public Subdomains

**Status:** Idea only
**Effort:** Large — but a natural extension of idea #3

### The concept
Each subdomain is a pre-configured, publicly available specialized agent maintained by Allerac:

```
recipes.allerac.ai    → culinary skill + recipe knowledge base
health.allerac.ai     → health skill + Garmin integration
politics.allerac.ai   → political analysis skill + web search
code.allerac.ai       → coding skill + documentation RAG
```

### How it connects to the personal instance
A user on `chat.allerac.ai` (their private instance) could transparently delegate to any super-agent:

```
User: "give me a healthy recipe for tonight"
    → chat.allerac.ai detects culinary + health intent
    → calls recipes.allerac.ai and health.allerac.ai
    → combines: recipe that fits the user's Garmin health data
    → responds as if it knew everything natively
```

### Why it's powerful
- Each super-agent has laser-focused documents, memories and skills for its domain
- Response quality is far superior to a generic assistant
- The user doesn't know (or need to know) they're talking to multiple nodes
- Allerac maintains the super-agents — users benefit automatically

### Business model angle
- `chat.allerac.ai` — personal, private instance per user
- `recipes.allerac.ai` — public Allerac super-agent, available to all
- Users connect their personal instance to super-agents they find useful
- Super-agents can also be community-created, not just Allerac-maintained

### The bigger picture
This is the agent era made simple. Instead of users configuring complex multi-agent pipelines, they just use subdomains. The orchestration is invisible. The experience is just: "it knows everything about cooking AND knows my health data."

---

## 6. RAG vs Fine-tuning for Super-Agents

**Status:** Idea / Architecture decision
**Conclusion:** RAG wins for knowledge, fine-tuning is for behavior

### The question
For `recipes.allerac.ai` with 1000+ culinary books — is RAG performant enough, or is fine-tuning a better approach?

### RAG wins for knowledge

| | RAG | Fine-tuning |
|---|---|---|
| Add new books | Immediate upload | Retrain the model (hours/days) |
| Cost | pgvector already exists | GPU cluster + engineering time |
| Updates | Real-time | New training cycle |
| Transparency | Cites source ("page 42 of book X") | Can't explain where it learned from |
| Errors | Easy to fix (edit the document) | Hard — it's baked into the model |
| Works with local Ollama | ✅ | ❌ |

**Fine-tuning only makes sense to change model behavior, not to inject knowledge.** Example: making the model always respond in a structured recipe format with a specific tone — not for adding culinary knowledge.

### Quality over quantity

10,000 books would be counterproductive. RAG retrieves the N most relevant chunks per query. With 10,000 books of mixed quality, the LLM gets contradictory information ("this book says 180°C, this says 200°C...") and quality drops.

**50 curated books > 10,000 generic books.**

A book by Joel Robuchon is worth more than 500 mediocre ones. Tested and validated recipes beat random internet scraping every time.

### The winning stack per super-agent

| Super-agent | Ideal curation |
|---|---|
| recipes.allerac.ai | 50–100 reference books per cuisine |
| health.allerac.ai | Official medical guidelines + user's Garmin data |
| politics.allerac.ai | Primary sources + real-time web search |
| code.allerac.ai | Official language and framework documentation |

Web search complements RAG for recent or very specific content. Curated RAG guarantees the quality baseline.

### The real differentiator

```
50 curated books
+ user memories ("no gluten", "family of 4")
+ web search for seasonal/trending recipes
─────────────────────────────────────────────
= better result than any chatbot with 1M recipes
```

This is what the best professional AI products do — it's not about who has the most data, it's about who has the **right** data. And the personal context layer (user memories + health data) is what no public ChatGPT or Claude can replicate.

### The architecture insight
This is specialization architecture, not training. The distinction is fundamental:
- **Training** = changing what the model knows at its core (expensive, slow, rigid)
- **Specialization** = choosing the right knowledge + context + behavior for a domain (cheap, fast, flexible)

allerac-one's stack (pgvector + RAG + skills + memories) is already built for this.

---

## 7. Shared Workspace & Desktop Files

**Status:** Decision made — not implementing for now
**Effort:** Medium

### The question
Should domain workspaces (Code, Finance, Analyze, etc.) share the same file storage? And should files appear as folders on the Win95 desktop?

### Context
Today the Workspace feature exists only in `/code`. The idea was to surface it as a shared filesystem across all domains — files created in Finance could be used in Analyze, etc. And potentially expose this as folder icons on the hub desktop (Win95 metaphor).

### Decision: Documents (RAG) already solves the main use case
The most valuable "shared context" use case — e.g. a document describing a company that should be available to Finance, Write, Analyze, Health — is already solved by **My Allerac → Memory → Documents**. Documents uploaded there are indexed per `user_id` with no domain distinction, so they're already globally available via RAG across all domains.

The distinction between the two mechanisms:
- **Documents (RAG)** → passive knowledge, injected automatically into context. Best for reference material: company descriptions, personal context, domain knowledge.
- **Workspace (files)** → active artifacts, created and manipulated by the user. Best for outputs: a CSV generated in Finance, a report written in Write, a script from Code.

### When it would make sense
Workspace becomes compelling when cross-domain workflows produce outputs that feed into other domains. Example:
- Finance generates a CSV analysis → saves to Workspace
- Analyze opens the same CSV → continues the work
- Write references the data → drafts a report

### Why not now
The current priority is UX clarity (domains, hub, sidebar). Shared Workspace adds infrastructure complexity (file permissions per domain? shared storage? desktop icons?) that isn't justified until there's a clear cross-domain workflow that users actually hit.

---

## Notes

- The core differentiator of allerac-one is **deep personal context** — the more the system knows the user, the more useful it becomes. No public ChatGPT or Claude can offer this.
- Complexity should never reach the user. Your mother should be able to use it.
- Every idea here should be evaluated against: "would a non-technical person benefit from this without knowing it exists?"
