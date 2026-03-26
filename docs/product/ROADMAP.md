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

### Phase 1 — Invisible Skills ✅ DONE
- [x] Skills stored as .md files in /skills/ repo folder
- [x] Auto-synced to DB on deploy via SystemSkillsLoader
- [x] Auto-switch via keywords — user never selects manually
- [x] Remove skills combobox from chat UI
- [x] Added system skills: writer, analyst, chef, finance, health, search

### Phase 2 — Intent Detection ✅ DONE
- [x] Replace keyword-based auto-switch with LLM-based intent detection
  - Uses Ollama `deepseek-r1:1.5b` — fully local, no cloud dependency
  - Handles natural language intent, not just keyword matching
  - Strips `<think>...</think>` chain-of-thought before reading answer
  - Falls back to keyword matching if Ollama is unavailable
- [x] Skill selection is a background step — user never sees it
- [x] "Skill active" badge in ChatHeader — subtle, not a selector
- **Bug to fix:** `num_predict: 10 → 200` in `skills.service.ts` `detectIntent()` — deepseek-r1 needs ~200 tokens for chain-of-thought; current value cuts off response mid-think

### Phase 3 — Curated Knowledge per Domain
- [ ] Each system skill gets its own RAG document set
  - code.allerac.ai: official Node, React, Python, Go docs
  - recipes.allerac.ai: 50-100 curated culinary references
  - health.allerac.ai: medical guidelines + Garmin personal data
- [ ] RAG retrieval scoped per active skill (not global search)
- [ ] Quality over quantity: 50 curated sources > 10,000 generic

### Phase 3.5 — Domain Hub + Subroutes ✅ DONE
- [x] Hub screen at `/` — retro Windows 3.1 Program Manager UI
  - Boot animation on first login per session (sessionStorage `allerac_booted` flag)
  - Start menu with domain shortcuts + Settings + Logout
  - User Settings modal accessible from hub
- [x] Domain subroutes: `/code`, `/recipes`, `/finance`, `/health`, `/search`, `/write`
  - Each opens with sidebar minimized by default (`defaultSidebarCollapsed`)
  - Domain name shown in ChatHeader instead of "Allerac" (`domainName` prop)
  - Domain-specific sidebars: `/code` shows Workspace panel, `/health` shows Health panel
  - Pre-selected skill activated on first message in each domain
- [x] Desktop button in ChatHeader navigates back to hub (same tab)
- [x] My Allerac modal (Instructions | Memory | Tasks) replaces 3 separate modals
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
| writer.md | Writing, editing, tone | Live |
| analyst.md | Data analysis, research | Live |
| chef.md | Recipes, nutrition, cooking | Live |
| finance.md | Personal finance, investments | Live |
| health.md | Health & wellness | Live |
| search.md | Web research (force_tool: search_web) | Live |

## Upcoming Work

### Immediate Bug Fix
- [ ] `skills.service.ts` `detectIntent()`: change `num_predict: 10` → `num_predict: 200`
  - **Why:** deepseek-r1:1.5b uses `<think>...</think>` chain-of-thought (~100 tokens) before answering. With only 10 tokens, it gets cut off and returns empty string, falling back to keywords every time.

### Terminal-style Retro Chat UI (High Priority)
The big next feature. Replace the current chat interface with a Win95/CRT terminal aesthetic per domain.

**Vision:** Each domain chat looks like a terminal window from 1992, but answers with 2025 intelligence. The contrast IS the personality.

```
┌─────────────────────────────────────────────────────┐
│ 💻 Code Terminal                              _ □ x │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Allerac Code v1.0 — Ready.                         │
│  > how do I debounce in React?                      │
│                                                     │
│  Use useCallback + setTimeout:                      │
│                                                     │
│  const debounced = useCallback(                     │
│    debounce((val) => search(val), 300), []          │
│  );                                                 │
│                                                     │
│  > _                                                │
└─────────────────────────────────────────────────────┘
```

**Per-domain terminal personality:**
- `/code` → green text on black, monospace, `>` prompt, blinking cursor
- `/recipes` → warm amber on dark brown, `🍳 Chef >` prompt
- `/health` → blue-white on dark, `❤️ Health >` prompt
- `/finance` → green-on-black Matrix vibe, `$ Finance >` prompt

**Implementation plan:**
- [ ] New `ChatTerminal.tsx` component — replaces message bubbles with terminal lines
- [ ] Terminal window chrome: title bar, minimize/maximize (cosmetic), scrollback
- [ ] Monospace font: `JetBrains Mono` or `Courier New`
- [ ] Blinking cursor `▋` in input area
- [ ] Domain-specific color themes via CSS vars (`--terminal-bg`, `--terminal-fg`, `--terminal-prompt`)
- [ ] Markdown rendered as plain text with ASCII decorations (```code blocks as-is, **bold** → BOLD, etc.)
- [ ] Response streams character by character (typewriter effect, optional)
- [ ] "Boot sequence" per domain on first open: `Loading Chef module... ████████ 100%`

### Onboarding Tour
- [ ] First-time user overlay: sequential highlights
  1. Hub → "This is your Allerac Desktop"
  2. Domain icon → "Each domain has a specialized AI"
  3. Chat → "Just talk — Allerac routes to the right expert"
  4. My Allerac → "Your memory and instructions live here"
- [ ] Triggered once: `localStorage.getItem('allerac_onboarded')`
- [ ] Skip button always visible

### Memory & Documents by Domain (next architecture milestone)
See section above for full spec. Priority items:
- [ ] Add `domain` column to `documents` and `conversation_summaries` tables (migration)
- [ ] Scope RAG retrieval: global docs + active domain docs
- [ ] Scope memory loading: global summaries + active domain summaries
- [ ] Documents modal: Global / Code / Recipes / etc. tabs

### Hub UX Polish (~1-2 hours)
- [ ] More Win95 details: inset button shadows, dithered background texture
- [ ] Working clock in taskbar corner (real time)
- [ ] Window drag (cosmetic, no real multi-window)
- [ ] Hover: window title animates like a Win95 focus effect
- [ ] Mobile: icons reflow to 2-column, tap once to open
