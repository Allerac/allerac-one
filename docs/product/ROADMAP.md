# Allerac Product Roadmap

## Core Philosophy
The user should never know what a skill is. Skills are internal infrastructure — the user just talks, Allerac routes to the right expert automatically. Like a taxi: the passenger says the destination, the driver handles the rest.

## Architecture Vision: Three Layers

```
Layer 1 — User
  Talks naturally. No configuration. No skill selection. No prompt engineering.

Layer 2 — Allerac Orchestration
  Detects intent → routes to the right agent/skill automatically
  User never sees this layer

Layer 3 — Super-Agents (future)
  Domain-specific agents with curated RAG + tuned prompts
  recipes.allerac.ai, health.allerac.ai, code.allerac.ai, finance.allerac.ai
```

## Roadmap

### Phase 1 — Invisible Skills (current)
- [x] Skills stored as .md files in /skills/ repo folder
- [x] Auto-synced to DB on deploy via SystemSkillsLoader
- [x] Auto-switch via keywords — user never selects manually
- [x] Remove skills combobox from chat UI
- [ ] Add more system skills (writer, analyst, chef)

### Phase 2 — Intent Detection (next)
- [ ] Replace keyword-based auto-switch with LLM-based intent detection
  - More robust than keyword matching
  - Handles multi-intent messages ("healthy recipe for someone who codes all day")
- [ ] Skill selection becomes a background inference step, not user action
- [ ] "Skill active" indicator visible but subtle (small badge, not a selector)

### Phase 3 — Curated Knowledge per Domain
- [ ] Each system skill gets its own RAG document set
  - code.allerac.ai: official Node, React, Python, Go docs
  - recipes.allerac.ai: 50-100 curated culinary references
  - health.allerac.ai: medical guidelines + Garmin personal data
- [ ] RAG retrieval scoped per active skill (not global search)
- [ ] Quality over quantity: 50 curated sources > 10,000 generic

### Phase 3.5 — Domain Hub + Subroutes
- [ ] Hub screen at `/` — entry point showing available domains
  - User chooses context: Code, Recipes, Finance, Health, Search, Write
  - Or just types freely — auto-routing kicks in
  - Design: simple grid of domain cards, plus a free-text input below
  ```
  What do you want to do today?
  [💻 Code]  [🍳 Recipes]  [🔍 Search]
  [💰 Finance]  [❤️ Health]  [✍️ Write]
  or just type...
  ```
- [ ] Domain subroutes: `/code`, `/recipes`, `/finance`, etc.
  - Each route = same app instance, different UI focus + skill pre-activated
  - `/code` → workspace sidebar visible by default, Programmer skill active
  - `/recipes` → clean minimal UI, Chef skill active
  - Zero infra overhead — just Next.js routes
- [ ] Migrate to subdomains later when domains need independent RAG/model/infra

### Memory & Documents Architecture (cross-domain)
**The principle: identity is global, context is local.**

```
GLOBAL (shared across all domains)
  Memory:    Who you are, life context, preferences
             Ex: "works as engineer", "lactose intolerant"
  Documents: Personal docs, CV, general references

DOMAIN-SCOPED (only loaded when domain is active)
  Memory:    Domain-specific history and preferences
             Ex: favorite recipes (recipes), active projects (code)
  Documents: Curated domain knowledge
             Ex: cookbooks (recipes), framework docs (code)
```

- [ ] Add `domain` field to `documents` and `conversation_summaries` tables
- [ ] RAG search scoped to: global docs + active domain docs (not all docs)
- [ ] Memory loading scoped to: global summaries + active domain summaries
- [ ] Documents modal shows domain tabs: Global / Code / Recipes / etc.
- [ ] Key benefit: vector search on 50 relevant docs >> search on 5000 mixed docs

### Phase 4 — Super-Agents as Subdomains (future)
- [ ] Each domain becomes a deployable sub-instance
  - recipes.allerac.ai — culinary agent, publicly available
  - health.allerac.ai — health agent with Garmin integration
  - code.allerac.ai — coding agent with documentation RAG
  - finance.allerac.ai — financial analysis agent
- [ ] Personal instance (chat.allerac.ai) orchestrates across super-agents transparently
  - "healthy recipe for tonight" → calls recipes + health → combines → single response
- [ ] User never knows multiple agents were involved
- [ ] Super-agents maintainable by Allerac OR community (like /skills/*.md but per-subdomain)

## Business Model (emerging)
- `chat.allerac.ai` — personal private instance per user
- `*.allerac.ai` — public Allerac super-agents, free or subscription
- Community super-agents — third-party domains plugging into the network
- Allerac maintains quality bar on curated knowledge per domain

## Key Insight
**The skill is not a feature. It is infrastructure.**
What differentiates Allerac from a generic LLM wrapper is not that users CAN configure skills — it's that Allerac already configured the best possible version, invisibly, for every domain.

A generic "programmer" prompt is good.
`code.allerac.ai` with official React/Node/Python docs curated and ranked — is exceptional.
The user gets the exceptional version without knowing it exists.

## Domain Hub UI — Retro Windows 3.1 Design

**The vibe:** Windows 3.1 Program Manager, but serving 2025 LLMs. The irony IS the personality.

### Visual References
- Background: `#C0C0C0` gray with dithering texture
- Window chrome: blue title bar (`#000080`), 1px black border, inset shadow buttons
- Typography: `Press Start 2P` (Google Fonts) or `MS Sans Serif` bitmap-style
- Icons: pixelated 32x32, each domain has its own retro icon
- Interaction: double-click to open (or single tap mobile)

### Layout
```
┌─────────────────────────────────────────┐
│ ▓ Allerac Program Manager          _ □ x│
├─────────────────────────────────────────┤
│ File  Options  Window  Help             │
├─────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │  💻  │  │  🍳  │  │  🔍  │          │
│  │      │  │      │  │      │          │
│  │ Code │  │Recip.│  │Search│          │
│  └──────┘  └──────┘  └──────┘          │
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │  💰  │  │  ❤️  │  │  ✍️  │          │
│  │      │  │      │  │      │          │
│  │Financ│  │Health│  │Write │          │
│  └──────┘  └──────┘  └──────┘          │
└─────────────────────────────────────────┘
```

### Implementation Plan
- [ ] Install `98.css` (npm) — faithful Windows 98/3.1 CSS recreation
- [ ] Create `src/app/hub/page.tsx` — the Program Manager screen
- [ ] Each domain = a draggable window icon, double-click navigates to `/code`, `/recipes`, etc.
- [ ] Title bar shows "Allerac Program Manager" with working minimize/close buttons (cosmetic)
- [ ] Menu bar: File / Options / Window / Help — easter eggs inside
- [ ] Mobile: tap once to open, icons reflow to 2-column grid
- [ ] Font: `Press Start 2P` from Google Fonts for titles, system font for body
- [ ] Current chat (`/`) becomes just another icon: "Chat" or "Terminal"
- [ ] Ambient detail: a fake clock in the corner showing real time (like the Win3.1 taskbar)
- [ ] On first load: a fake "boot sequence" — "Loading Allerac... ████████ 100%"

### Why this works
- Completely unexpected for an AI product — instant personality
- Nostalgic for developers (core audience)
- The retro aesthetic signals "this is different" without saying it
- 98.css is ~10kb — zero performance cost
- The irony: 1992 UI, 2025 intelligence

## Current System Skills
Located in `/skills/*.md` — edit via PR, auto-deployed.
| File | Domain | Status |
|------|--------|--------|
| programmer.md | Code & development | Live |

## Next Skills to Build
| File | Domain | Priority |
|------|--------|----------|
| writer.md | Writing, editing, tone | High |
| analyst.md | Data analysis, research | High |
| chef.md | Recipes, nutrition, cooking | Medium |
| finance.md | Personal finance, investments | Medium |
