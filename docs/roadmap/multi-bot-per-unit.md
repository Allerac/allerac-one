# Multiple specialized bots inside one Allerac One Unit

**Status:** Accepted in part (see [Decisions from Gianclaudio](#decisions-from-gianclaudio-2026-11-27)); open questions in section 4

**Base:** `development` at `3ed958a` (migrations up to `157`)

This document is the design and phased implementation plan for supporting
several specialized bots inside a single Allerac Unit. The Unit stays the
deployment, trust, module and federation boundary. A bot is a lightweight,
database-defined persona inside it.

## 0. Goal

A single Allerac Unit should be able to host several specialized bots, in the same way a set of personal assistants works today (Agenda, Doctor, Compras, Nutrition, Trainer, Viagens, Emails, Career, Writer, and so on). The owner can do personal work on one personal Unit without deploying a new Unit for each persona.

Each bot needs its own:

1. name, emoji/avatar, persona and instructions;
2. enabled tools/modules (Doctor sees health, Compras does not);
3. memory scope (private by default, optionally shared with the rest of the Unit);
4. channels (for example its own Telegram bot);
5. routines (scheduled jobs);

and it must be **easy to add one**, without deploying a new Unit.

Today Allerac thinks in **Units** (one deployment each: main/personal, openworld, sales/web, santos, barcelona). Inside a Unit there is exactly one agent. This proposal makes the **Unit contain N bots**. The Unit stays the deployment, trust, module and federation boundary. A bot is a lightweight, DB-defined persona inside it.

---

## 1. Current state (what the code does today)

All paths are relative to the repo root, on `development` @ `3ed958a`.

### 1.1 The product direction is "one Unit = one agent"

The simplification work already on `development` (phases 1 to 5, migrations `145`–`155`) deliberately collapsed everything to a single agent per Unit:

- **Identity**: `unit_profile` is a singleton row (`CHECK (id = 1)`) with `display_name`, `emoji`, `role`, `description`, `instructions` (migrations `145_unit_profile.sql`, `150_unit_agent.sql`). Loader: `src/federation/unit-profile.repository.ts` (`loadSoulIdentity`, `loadChatSoulIdentity`, 30 s cache).
- **Tools/modules**: toggles in `unit_profile.agent_tool_settings` (JSONB, migration `151`). Logic in `src/app/services/agent/agent-tool-settings.ts` (capabilities = optional modules + core: notes, memory, jobs, tickets; heavy modules music/social default off). Applied in `resolveChatTools` (`src/app/services/chat/chat-tool-registry.ts`), **only when `domain === AGENT_DOMAIN` (`'chat'`)**.
- **Conversation**: one primary conversation per `(user, source, domain_slug, federation_principal_id)` (`chat_conversations.is_primary`, migration `153`; `src/app/services/chat/primary-conversation.ts`). Rolling compaction in `conversation_segments`. "New topic" markers.
- **Memory**: `src/app/services/memory/memory-scope.ts` says "one memory per agent". `domain_slug` stays only as a tag, and the `chat` agent reads **all** domains (`memoryReadDomain('chat') -> null`).
- **UI**: `/agents/self/agent` renders the local chat in the agents shell (`src/app/agents/_shell/LocalAgentClient.tsx`, `AgentShell.tsx`, `src/app/agents/[unit]/[agent]/page.tsx`). `/` redirects to `/agents`. Domain tabs and the `DomainChip` are hidden unless `ALLERAC_LEGACY_DOMAINS=true` (`src/lib/legacy-domains.ts`).
- **Federation**: a peer exposes agents by **slug** (`src/federation/env.ts`: `ALLERAC_SINGLE_AGENT` exposes only `chat`; otherwise `ALLERAC_FEDERATION_AGENTS`). `src/federation/agents.service.ts` answers asks as `(principal, agent slug)`. Home-side threads are keyed `(user, peer, agent_slug)` (`federated_threads`, migration `155`). Tools `list_peer_agents` / `ask_peer_agent` (`src/app/tools/federation.tool*.ts`).

### 1.2 What already supports "several agents" (the useful part)

`domain_slug` (TEXT) is already the **partition key of almost everything**. It is the natural seed for a bot key:

| Concern | Table / column | Notes |
|---|---|---|
| Conversations | `chat_conversations.domain_slug` (038), `is_primary` unique index (153) | one primary conversation per slug, per user |
| Memories / summaries | `conversation_summaries.domain_slug` (037); manual memories too (107 made `conversation_id` nullable) | tag today |
| RAG / notes docs | `documents.domain_slug` (037), `search_document_chunks(..., search_domain_slug)` | notes use slug `notes` |
| Semantic memory index | `knowledge_semantic_index.domain_slug` (139) | `CHECK (source_type IN ('memory'))`, so tickets can never be indexed |
| Learned instructions | `user_domain_instructions`, `domain_instructions`, versions (037, 108, 109) | per `(user, slug)`; the distiller writes per slug |
| Scheduled jobs (routines) | `scheduled_jobs.domain_slug` (037) | job runs with `domainSlug: job.domain_slug ?? 'jobs'` |
| Model per domain | `user_domain_model_settings(user_id, domain_slug)` (094) | **FK to `domains(slug)`** |
| Rate limits | `domain_rate_limit_settings` (129) | **FK to `domains(slug)`** |
| Background runs | `agent_runs.domain_slug` (095) | **FK to `domains(slug)`** |
| Skills | `skills`, `user_skills`, `telegram_bot_skills(bot_id -> telegram_bot_configs)`, `conversation_active_skills` (006) | skills are per **Telegram bot config**, not per agent |
| Telegram | `telegram_bot_configs` (005, many per user, encrypted token), `src/telegram-multi-bot.ts` hot-reloads N bots | but see 1.3 |

So the *shape* "many agents, each with its own conversation, memory tag, instructions, jobs and model" exists. It is expressed through the legacy `domains` concept, which we are retiring from the UI.

### 1.3 What is missing or blocking

1. **No bot entity.** Identity, instructions and tool settings are singleton columns on `unit_profile`. Domains are admin objects with routes, tiles and per-user access (`domains`, `user_domain_access`, `requireDomainAccess`, `assertDomainAccess`), not user-creatable personas.
2. **Tool gating is hardcoded to `'chat'`** (`resolveChatTools`, `AGENT_DOMAIN`). Any other slug gets the legacy domain behaviour.
3. **Memory is unified by design.** `memoryReadDomain` returns "all domains" for the chat agent. There is no private vs shared notion. A Compras bot would read Doctor's memories.
4. **Telegram cannot run several personas for one human.**
   - `telegram_chat_mapping` has `telegram_chat_id` as its **primary key** (migration 003). In a private chat the chat id equals the Telegram user id, and it is the **same for every bot token**. A second bot for the same human collides with the first mapping.
   - `getBotConfig` in `telegram-bot.service.ts` does `... LIMIT 1` per user.
   - `primaryConversationFor` hardcodes `domain: 'chat'`; `getChatConfig` sets `domainSlug: null` ("universal bot").
   - Telegram and job turns use `handleChatTurn` (`chat-handler.ts`), a **different pipeline from the web route** (`src/app/api/chat/route.ts`). `handleChatTurn` uses `TOOLS` + fixed additions and does **not** call `resolveChatTools`, so agent tool settings are not applied there at all.
5. **Skills are bound to Telegram bot configs** (`telegram_bot_skills.bot_id`), not to an agent.
6. **Soul text is generic.** `buildSoul` (`src/app/config/allerac-soul.ts`) always starts "You are <Unit name>, an Allerac unit" and tells the model to use health tools. Both must become per bot and capability-aware.
7. **Jobs run as the `jobs` domain** (`buildSoul('jobs', ...)`), not as a bot, and delivery channels are generic (`scheduled_jobs.channels`).
8. **No bot-to-bot communication inside a Unit.** Only Unit-to-Unit federation exists.
9. **UI**: the agents sidebar lists the local agent as one row (`SELF_UNIT`, `/agents/self/agent`). The route only accepts the literal `agent`.
10. **Access model**: a personal Unit normally has one admin user, so per-bot ACLs are not needed at first. `domainAccessSql` joins `domains`, so a slug that is not in `domains` is invisible to non-admins and visible to admins.

---

## 2. Proposed model

### 2.1 Principles

- **Unit = trust + deployment + module boundary. Bot = persona + scope inside it.** Federation, `ALLERAC_MODULES` and secrets stay per Unit. A bot can only use what the Unit allows.
- **Backward compatible.** The existing agent becomes the **default bot** with slug `chat`. Its conversations, federation thread keys, memories and jobs do not move.
- **Reuse `domain_slug` as the bot key** in the existing columns (no data rewrite). Bot slugs are validated against reserved domain slugs. A later cleanup may rename the column (phase 9, optional).
- **Bots are data, not code or deploys.** Creating a bot is one row plus (optionally) a Telegram token.
- **Private by default, share on purpose.** A new bot starts isolated.
- **Small PRs, each shippable alone**, with a flag until the whole path works.

### 2.2 The `bot` entity (table `unit_agents`)

User-facing word: **bot**. Table name `unit_agents` (the code already says "agent").

| Field | Meaning |
|---|---|
| `id`, `slug` | slug is the stable key stored in `domain_slug` columns (`doctor`, `agenda`, `compras`). Immutable after creation. Must not be a reserved or `domains` slug. |
| `display_name`, `emoji`, `avatar_url`, `role`, `description` | identity (same fields as `unit_profile`) |
| `instructions` | persona and rules, up to 8,000 chars (today 4,000 on `unit_profile`) |
| `is_default` | exactly one: slug `chat` |
| `enabled`, `sort_order`, `archived_at` | list management. Archive instead of delete, so history is never lost |
| `tool_settings` JSONB | same shape as `AgentToolSettings` (`modules`, `tools`, `skills` toggles), capped by `ALLERAC_MODULES` |
| `memory_mode` | `isolated` (own rows + unit-shared rows) or `none`. There is deliberately no mode that reads other bots' private rows (see 2.3) |
| `share_memories_by_default` | when true, memories this bot writes are `shared = true` unless the model or the user marks them private. Default false; true for the default bot, so it keeps today's behaviour |
| `can_call` TEXT[] | slugs of other local bots this bot may consult (handoff allowlist) |
| `model_id`, `model_provider`, `cloud_allowed` | optional model override. `cloud_allowed=false` pins the bot to local Ollama (useful for a Doctor bot on a local GPU server) |
| `default_skill_id` | optional default skill for new conversations |
| `federation_exposed` | default **false**. A bot is only listed to paired Units if the owner opts in |
| `template` | template id it was created from (informational) |
| `created_at`, `updated_at`, `updated_by` | audit |

`unit_profile` stays as the **Unit identity** used by federation and the Control Tower (the Unit's name, emoji and role). The default bot row is seeded from it. For slug `chat`, loaders fall back to `unit_profile` when no row exists, so mixed versions and rollbacks keep working.

Channels are not stored on the bot row. They point at it:

- `telegram_bot_configs.agent_id` (nullable = default bot): one Telegram token per bot, or the shared-router options in 2.6.
- `scheduled_jobs.domain_slug` already holds the owner bot's slug.

### 2.3 Memory scope: private vs shared, and "tickets never in RAG"

Today a memory row carries `domain_slug` as a tag only. Proposal:

- New column `shared BOOLEAN NOT NULL DEFAULT FALSE` on **every table that stores bot-scoped knowledge**: `conversation_summaries`, `knowledge_semantic_index` and `documents`. **Backfill `TRUE` for all existing rows in all three tables in the same migration**, because today the single agent already reads them all. If only one table is backfilled, an isolated bot finds a legacy memory through SQL but not through semantic search.
- The semantic index copies `shared` from its source row on every (re)index, and the "share" / "make private" actions update both rows in one transaction. A consistency test asserts the two flags never differ.
- Write side: a bot writes memories and documents tagged with **its own slug**. `shared` comes from the bot's `share_memories_by_default` (false for new bots, true for the default bot). The `create_memory` tool gets an optional `share_with_unit` flag that overrides it. The UI can promote one memory to shared ("share with all bots") or make it private.
- Read side, one helper replacing `memoryReadDomain` (`src/app/services/memory/memory-scope.ts`):
  - `isolated`: `domain_slug = <own slug> OR shared`
  - `none`: nothing
- **No bot reads another bot's private rows, including the default bot.** The default bot keeps today's behaviour because every legacy row is `shared = true` and its new memories are shared by default. But it does not see what Doctor stores privately. Otherwise "private by default" would not hold. If the owner wants a bot that sees everything, the honest way is to share those memories, not a read-everything mode.
- **Documents (RAG)** use the same filter: `domain_slug = <own slug> OR shared`, plus the notes vault (slug `notes`) for bots with the `notes` capability. Documents a bot uploads are private to it unless shared. `search_document_chunks(..., search_domain_slug)` gets the scope as a parameter instead of a single slug.
- Same filter must be applied at every read site. On `development` @ `3ed958a` there are **211 `domain_slug` references in 56 non-test source files** (425 references in 110 files if tests and migrations are counted). The important ones:
  - `knowledge-search.service.ts` and `chat-knowledge-context.ts`;
  - `conversation-memory.service.ts`;
  - `memory.tool.ts` and `memory.tool.definitions.ts`;
  - `instructions.tool.ts` and `domain-instructions.service.ts`;
  - `knowledge-graph.service.ts`, `note-related.service.ts`, `promote-memory.service.ts`;
  - `memory-index.service.ts`, and the v1 API (`api/v1/_lib/memories.ts`, `documents.ts`, `knowledge/search`).
  
  These need to be audited and covered by tests in one dedicated PR (PR 3).
- **Learned instructions** (`learn_instruction`) stay per `(user, slug)`: each bot learns its own rules. No cross-bot leakage by default.
- **Notes** are user data, not bot data. They stay one vault (slug `notes`, readable by bots that have the `notes` capability). Optional later: a per-bot notes folder or tag filter.
- **Health, email, music, social data** is user-level (Garmin, IMAP, ...). The isolation mechanism is **capability gating**: only bots with the `health` capability get health tools and data pages. Compras never sees health.
- **Tickets are never in RAG.** This stays enforced by the existing DB `CHECK (source_type IN ('memory'))` and by `KnowledgeSearchService` never reading `tickets`. Additional rules for bots:
  - `tickets` stays a core capability, **default off** for every bot. Only a deliberate "engineering" bot may enable it.
  - Handoff results (2.5) and bot-to-bot messages are never indexed as shared memory automatically.
  - PR 3 must verify and test ticket isolation in conversation summaries, memory rows and the semantic index, including when a bot has ticket tools enabled.

### 2.4 Chat UI: switch and create bots easily

- **Route**: `/agents/self/<slug>` (today it only accepts `agent`, which stays as an alias of `chat`). `LocalAgentClient` receives the bot and passes `domainSlug={slug}` to `ChatClient`, plus the bot's data pages (`agentDataPages(bot.tool_settings)` already takes settings as a parameter).
- **Sidebar** (`AgentShell`): one section "My bots" listing local bots (avatar, name, role, unread dot), then the paired Units as today. Unit-qualified keys in the UI: `self/<slug>`.
- **Switching**:
  - click in the sidebar;
  - a Cmd-K bot picker;
  - `@doctor ...` at the start of a message sends the message to that bot (client-side route, no model call);
  - on mobile, the bot list is the home screen (as the agents index already is).
- **Creating**: `+ New bot` opens a gallery of **templates**, then a one-screen form (name, emoji, role, instructions, capabilities, memory mode, model, Telegram yes/no). Templates are static data in the repo (`src/app/services/agent/bot-templates.ts`, translated through `src/i18n`), for example:

  | Template | Capabilities | Memory | Notes |
  |---|---|---|---|
  | Doctor | health, notes, memory | isolated | `cloud_allowed=false` suggested |
  | Agenda | jobs, notes, (calendar later) | isolated, shares by default | routines for reminders |
  | Compras | search, notes | isolated | read-only shopping |
  | Nutrition | health (read), notes | isolated | |
  | Trainer | health, notes | isolated | |
  | Viagens | search, notes | isolated | |
  | Emails | email | isolated | send needs explicit confirm |
  | Career / Writer | notes, search | isolated | |
  | Blank | core only | isolated | |

  Also: "Duplicate bot", and JSON **export/import** of a bot definition (identity, instructions, capability toggles, never memories, tokens or keys). Importing instructions from existing personal bots would be done through this, by pasting.
- **Edit** page per bot (reusing the Hub Settings "Agent" card from phase 1 of simplification): identity, instructions, capabilities, memory mode, `can_call`, model, federation exposure, archive.
- Later (PR 7b): the default bot, as the Manager, can create, edit and archive bots by conversation, always as a draft the owner confirms (see 2.5).

### 2.5 The default bot is the Manager (hand-off)

Decided 2026-11-27: **everything goes through the Manager. Bots never talk to each other.** The default bot (`chat`) is the Manager of the Unit's bots. The user can still open and talk to any bot directly, as today (`/agents/self/<slug>`, and later its Telegram bot); the Manager is an extra path, never a gate.

Topology is hub-and-spoke:

```
          user ──────────────┬──────────────┬─────────────┐
            │                │              │             │
            ▼                ▼              ▼             ▼
   chat (Manager) ──ask──▶ Doctor     Nutrition      Agenda   (each also reachable directly)
            ├──────ask──────────────────▶ │
            └──────ask─────────────────────────────────▶ │
   Doctor ✗ Nutrition: bots never call each other, nor back to the Manager
```

1. **Consult (tool `ask_agent`)**, a synchronous question from the Manager to one bot.
   - Offered **only to the default bot**. Bots never get `ask_agent`, so there are no loops and no injection path from one bot to another. `can_call` stays in the schema unused (kept for a possible future, owner-approved pair list); the Manager can consult every enabled, non-archived bot.
   - The Manager's soul lists the bots (name, emoji, role) so the model can choose, and it can ask several bots in one turn and merge the answers ("ask Doctor and Nutrition, then give me one plan").
   - Runs the target bot's normal chat turn (its soul, tools, memory scope and model; `cloudAllowed=false` is honoured) in a hand-off conversation owned by the Manager (like `tool-conversations.repository.ts` for peers), with the **restricted policy** used for federation (`ChatToolPolicy = 'federated'`): no shell, no send actions, no memory writes, no `ask_agent`.
   - Returns only the answer text. The Manager already reads every memory (2.3), so this exposes nothing new; the consulted bot's answer is not indexed as memory of either bot.
   - Depth 1 by construction, a per-turn cap (default 3 consults), a timeout per consult, and an audit row (caller, target, question, duration, status). The chat UI shows each consult as a collapsible tool step ("Asked Doctor: ..."), so the user sees what went where.
2. **Transfer (UI)**: the Manager can suggest "Continue with Gian Doctor", a button that switches to the bot's page with an optional one-paragraph summary as the first message. No hidden data flows. The user sees what is carried.
3. **Administration (PR 7b)**: tools for the Manager to list, propose, edit and archive bots. Every change is a **draft card the owner confirms** in the UI; the tool never writes `unit_agents` itself. Same validation as the API (slug rules, capability cap, `cloudAllowed`). Admin sessions only.

None of these mechanisms writes into another bot's memory, and none is available to public Units' bots (`PUBLIC_DOMAINS` guards stay).

### 2.6 Channels (Telegram) and routines

**Telegram.** Recommended: **one Telegram bot token per bot** (BotFather), because it matches the existing personal-bot experience: separate chats, separate names and avatars, separate notifications.

- `telegram_bot_configs.agent_id` selects the bot; `AlleracTelegramBot` receives `agentSlug` and `botConfigId` from `src/telegram-multi-bot.ts`.
- **`telegram_chat_mapping` must be keyed by `(bot_config_id, telegram_chat_id)`** (see 1.3 item 4). The old primary key on `telegram_chat_id` alone **must be dropped in the same PR**: while it exists, the second bot's mapping row for the same human fails on insert, so multi-bot Telegram cannot work. Two migrations, both in PR 5: `160` (additive: column, backfill, new unique index) and `161` (drop the old PK). The code that reads and writes by the new key ships in the same PR. All mapping queries (`telegram-bot.service.ts` lines ~129, ~142, ~170, ~190 today) are keyed by `(bot_config_id, telegram_chat_id)`.
- **Rollback**: the old code reads and updates by `telegram_chat_id` only, so it is safe only while each chat id has one row. The rollback script first keeps the default bot's row per chat id (deletes the others), then re-adds the PK. It is written and tested in PR 5, and a DB backup is taken before deploying.
- Remove the `LIMIT 1` config lookup. Use the config of the running bot instance.
- Telegram turns use the same pipeline as the web route (shared `resolveChatTools`, bot soul, memory scope). This is the biggest refactor in the Telegram PR, because `handleChatTurn` and the web route currently diverge.
- Primary conversation key is `(user, 'local', <bot slug>)`, so web and Telegram of the **same bot** continue one thread (as phase 4a already does for the default bot), and different bots never mix.

Alternatives for people who do not want 10 Telegram bots (can be added later, same data model):

- **A. Router bot**: one token, `/bot doctor` or an inline keyboard switches the active bot per chat (`telegram_chat_mapping.current_agent_slug`).
- **B. Forum group**: one private supergroup with Topics, one topic per bot, one token. Topic id maps to the bot.

**Routines.** Jobs already carry `domain_slug`. Changes:

- Job execution (`scheduled-jobs.service.ts` `runJobNow` and the scheduler path) resolves the owner bot: soul, tool settings, memory scope and model come from the bot (today it is `buildSoul('jobs', ...)`). Existing jobs with `jobs` or `chat` map to the default bot.
- The `schedule_task` / `create_job` tools set `domain_slug` to the calling bot automatically, so "remind me tomorrow" from Gian Agenda belongs to Gian Agenda.
- Delivery: `channels` of a job includes `telegram` -> delivered through the **owner bot's Telegram token** (not a generic one).
- UI: the bot's page shows its routines (filter on `domain_slug`).

### 2.7 Federation

- Default: **no bot is exposed to paired Units** (`federation_exposed=false`), except the default bot, which keeps behaving exactly as today under `ALLERAC_SINGLE_AGENT` / `ALLERAC_FEDERATION_AGENTS` until switched over.
- Later: `exposedAgentSlugs()` also includes bots with `federation_exposed=true`, and the agents listing returns each bot's name, emoji and role. Slugs are the thread keys already, so no protocol change (ask protocol stays v3).
- Health-type bots: a doc warning that exposing them to a peer means that peer's acting user can ask them questions under the `federated` tool policy.

### 2.8 Security and privacy summary

- Bots cannot exceed the Unit: `ALLERAC_MODULES` / `ALLERAC_PROFILE` stay the hard cap. Public Units (openworld, sales/web) keep `PUBLIC_DOMAINS` guards and do **not** get the bot feature (flag off by profile).
- Isolation is enforced in SQL filters at read sites, not only in prompts.
- Shell and executor tools stay admin-only (`canUserIdUseShell`) and are off for non-code bots.
- Terminals remain a local pilot that never runs on a public Unit (unchanged).
- `cloud_allowed=false` guarantees that a sensitive bot never sends prompts to a cloud provider. The model resolver rejects a cloud model for it.
- Bot definitions never contain secrets. Telegram tokens stay encrypted in `telegram_bot_configs` with `TELEGRAM_TOKEN_ENCRYPTION_KEY`. Export/import strips them.

---

## 3. Incremental plan (small PRs)

Order matters: **memory scoping lands before the "create bot" UI**, so nobody stores Doctor data in a bot that can leak into others. Every PR is behind `ALLERAC_BOTS` (default false) until PR 4, ships on santos/barcelona before napols, and keeps Units without bots behaving as today. Each PR needs Jest tests and, where it touches SQL, a pg integration test (DB Integration job).

### PR 1: Bot registry, no behaviour change (first PR)

**Scope**
- Migration `158_unit_agents.sql`, seeding the default bot `chat`. **As implemented**, the default bot's row does not copy identity, instructions or tool settings: they stay on `unit_profile` and are resolved at read time, so the two can never drift. The existing Settings "Agent" card keeps editing them. The repository rejects edits of those fields on the default bot (`default_agent_locked`).
- `src/app/services/agent/unit-agents.ts` (pure: zod schemas, slug validation, reserved slug list, resolution from the profile) and `unit-agents.repository.ts` (list, get by slug, create, update, archive/unarchive, 30 s cache like `unit-profile.repository.ts`). Creation also rejects any slug present in `domains`.
- `loadAgent(slug)`: the slug's bot when enabled and not archived, otherwise the default bot built from `unit_profile` (also when the table is not migrated). Never breaks chat, same pattern as `loadUnitProfileRow`.
- Read-only API: `GET /api/v1/unit/agents` (`?archived=true` for archived bots). **As implemented** it is admin-session only, like the other `/api/v1/unit/*` routes; no `unit:read` API-key scope exists yet, and no capability entry was added.
- **No call-site changes** in chat, Telegram or UI.

**Tests**: slug validation and reserved slugs; seeding from `unit_profile`; fallback when the table is absent; list ordering; the default bot is unique.
**Risk**: very low (additive table).

### PR 2: Bot-aware runtime (API only)

**Scope**
- The chat route and `assertDomainAccess` accept a bot slug that exists in `unit_agents` (admin only at first).
- `buildSoul`: identity from the bot ("You are Gian Doctor, one of the assistants of <Unit>"), capability-aware tool guidance (no health sentence when `health` is off), sibling list only when `can_call` is set.
- `resolveChatTools`: replace `domain === AGENT_DOMAIN` with "is a bot" and load that bot's `tool_settings`.
- Model resolution: `unit_agents.model_*` and `cloud_allowed` (new resolver branch, because `user_domain_model_settings` has an FK to `domains`).
- `getOrCreatePrimaryConversation({ domain: slug })`, which already works per slug.
- Relax the FKs that point to `domains(slug)` where bots need them (`agent_runs.domain_slug`), or skip the row for bots. Decide in the PR, see 4.
- Admin API `POST/PATCH /api/v1/unit/agents` (scope `unit:write`), no UI yet.

**Tests**: tool assembly per bot; soul output per bot; public domains unaffected; the default bot output is byte-identical to today.

**As implemented** (`src/app/services/agent/bot-runtime.ts`, `bot-request.ts`):
- Flag `ALLERAC_BOTS=true`. With it off, nothing is looked up and every path is unchanged. The write API answers `404 bots_disabled`.
- A request slug runs as a bot only if a non-default row exists. Non-admins get 403. Archived or disabled bots get 409. Any other slug keeps the legacy domain path, including `assertDomainAccess`.
- **Tools are explicit opt-in**: every capability not checked on the bot is off, even the ones on by default for the default bot (`explicitBotToolSettings`). The always-on core tools (`recall_memory`, `create_memory`, `search_knowledge`, `schedule_task`, `learn_instruction`) and the general tools (web search, date) stay. The pipeline already rejects calls to tools outside the offered list, which is the execution-time check.
- No shell, no federation tools, and no paired-Unit soul lines for bots yet.
- Model: the bot's `model_id` (must be a known model) overrides the per-domain or global choice. `cloud_allowed=false` fails the turn with 400 when the resolved model is not Ollama, instead of silently using the cloud. Bots get no fallback model.
- Soul: "You are <bot>, one of the assistants of <Unit>". The health guidance appears only with the `health` capability. Siblings are listed only from `can_call` (enabled, non-archived bots), as a hint to continue with them, because `ask_agent` lands in PR 7. Bot instructions replace the Unit's instructions; the user's learned rules for that slug still apply.
- **No migration.** `user_domain_model_settings` is not used for bot overrides; the model lives on the bot row. Background runs (`/api/agents`) return 400 for bots until the worker is bot-aware, so the `agent_runs` FK to `domains` is never hit.
- **Memory until PR 3**: reads use the bot slug (`memoryReadDomain` returns it unchanged), so a bot sees only memories tagged with its own slug, not the shared pool. PR 3 adds the shared rows.
- API: `POST /api/v1/unit/agents` and `PATCH /api/v1/unit/agents/[slug]` (`archived: true|false` archives or restores), plus `GET /api/v1/unit/agents/[slug]`. Admin session only.

### PR 3: Memory scope (private vs shared)

**Scope**
- Migration `159_memory_shared.sql`: `shared` on `conversation_summaries`, `knowledge_semantic_index` and `documents`, all backfilled `TRUE`; indexes. Migration `159` also adds `unit_agents.share_memories_by_default` (true for the default bot).
- `memory-scope.ts` -> `resolveMemoryScope(bot)`; apply at all read sites listed in 2.3, memories and documents; `create_memory.share_with_unit`; "share" / "make private" actions in the memory UI (`src/app/memory`) that update the summary and its index row together.
- Tickets regression tests (2.3).

**As implemented** (migration `159_bot_memory_scope.sql`, `src/app/services/memory/memory-scope.ts`):
- **Owner decision (2026-11-27): the default bot `chat` reads everything, other bots' private memories included.** Memory mode `all` is back (`isolated` / `all` / `none`), the default bot is locked to `all` and to sharing what it writes. This replaces the "no read-everything mode" proposal above.
- `shared` exists only on `conversation_summaries` and `documents`, with **`DEFAULT TRUE`**. Existing rows and everything `chat`, legacy domains and Telegram write stay shared with no backfill and no re-run risk. Only a bot writes `shared = false`, unless `share_memories_by_default` or `create_memory.share_with_unit` says otherwise. The semantic index needs no flag: memory vector search joins `conversation_summaries`.
- Read filter for an isolated bot: `domain_slug = <slug> OR shared`. Documents exclude shared notes; the notes vault is readable only with the `notes` capability.
- **Tool arguments cannot widen a bot's scope.** `recall_memory`, `search_memory`, `search_knowledge` and `create_memory` ignore `domain_slug` for a bot. `delete_memory` deletes only the bot's own rows. Bots get a `create_memory` definition without `domain_slug` and with `share_with_unit`; the default agent's tool definitions are unchanged.
- Conversation summaries written under a bot slug take the bot's `share_memories_by_default` on insert (never changed on re-summary).
- Not changed: `ConversationMemoryService` reads with a bot slug (used by the memory page and Telegram/jobs) stay own-slug only, so they are stricter, never wider. Peers keep the domain-scoped reach.
- `jest.setup.js` clears `ALLERAC_BOTS`, because `next/jest` loads the developer's `.env`.

**Tests**: pg integration test with two bots and three memory rows each (private, shared, legacy), through SQL **and** semantic search. Assert reads per mode, and that the default bot does not see another bot's private row. The same for documents. A flag-consistency test (summary vs semantic index). A ticket-output test. A federation test showing peers keep the previous domain-scoped reach.
**Risk**: highest of the series (56 non-test source files reference `domain_slug`). Keep the PR to read-filter changes only, and audit each site in the PR description.

### PR 4: UI, switch, create from template, edit

**Scope**
- `/agents/self/[slug]`, sidebar section "My bots", Cmd-K picker, `@bot` prefix routing.
- `+ New bot`: template gallery (`bot-templates.ts` plus i18n), form, edit page, archive, duplicate, JSON export/import.
- Per-bot data pages and per-bot settings in the Hub.
- Remove the `ALLERAC_BOTS` flag on personal Units only. Public profiles keep it off.

**As implemented (essential scope, owner choice 2026-11-27)**: `/agents/self/<slug>` (bot chat with a header bar: emoji, name, role, ⚙), `/agents/self/new` (template gallery plus form), `/agents/self/<slug>/settings` (edit, archive or restore), and a "My bots" sidebar section (admins, `ALLERAC_BOTS=true`). Templates: `src/app/services/agent/bot-templates.ts`. Components: `src/app/components/bots/`. Not in this round: Cmd-K picker, `@bot` routing, duplicate, JSON export/import. UI strings are English like the rest of the agents shell; i18n comes with the shell. The chat's model picker still shows the user's model, but a bot with its own model uses that one.

**Tests**: component tests for the picker and form; template schema test (every template validates and uses only known capabilities); a Playwright smoke in `e2e/` (create bot from template, send a message with the fake LLM).

### PR 5: Telegram per bot

**Scope**
- Migration `160_telegram_agent_binding.sql`: `telegram_bot_configs.agent_id`, `telegram_chat_mapping.bot_config_id` (backfilled), plus the new unique index.
- Migration `161_telegram_chat_mapping_drop_pk.sql`: drop the old PK on `telegram_chat_id` (required for two bots per human, see 2.6), with the tested rollback script.
- `telegram-multi-bot.ts` and `telegram-bot.service.ts`: pass `agentSlug`/`botConfigId`; every `telegram_chat_mapping` query keyed by `(bot_config_id, telegram_chat_id)`; remove `LIMIT 1` lookups; primary conversation per bot.
- **Route Telegram through the shared pipeline** (`resolveChatTools`, bot soul, memory scope) instead of the divergent `handleChatTurn` tool assembly. Do this as a separate refactor commit inside the PR, with before/after tests.
- UI: in Channels, "connect Telegram" on the bot page (token entered by the owner in the UI, never in chat).
- Migrate `telegram_bot_skills` -> optional `default_skill_id` (the old table keeps working in the meantime).

**Tests**: two bots, one human, same `telegram_chat_id`: both mapping rows insert, independent conversations and memories; the existing single-bot setup is unchanged after migration; the rollback script restores the old PK.
**Deploy note**: needs a restart of the `telegram` container on each Unit that is updated.

### PR 6: Routines per bot

**Scope**: job execution as the owner bot (soul, tools, memory, model); the job tools set `domain_slug` from the caller; delivery through the owner's Telegram token; per-bot routines list in the bot page. Backfill mapping of `jobs`/`chat` to the default bot (view or code-level, no data rewrite).
**Tests**: job runs with the right soul and tool set; an unknown slug falls back to the default bot; delivery picks the bot token.

### PR 7: Manager hand-off (consult and transfer)

**Scope** (see 2.5): `ask_agent` for the default bot only, the Manager soul listing the bots, per-turn cap, timeout and audit table, consult steps shown in the chat, and the "Continue with ..." transfer button. Reuses the `federated` tool policy and the `tool-conversations` pattern for continuity. Does not depend on PR 5 or PR 6, so it can ship before them.
**Tests**: only the default bot gets `ask_agent` (a bot request never does, even with tool arguments); archived and disabled bots cannot be consulted; the callee runs with its own soul, tools, memory scope and model and the restricted policy; no memory writes and nothing indexed from the consult; the cap and timeout hold; an audit row per consult; direct chat with each bot is unchanged.

### PR 7b: Manager administration (draft and confirm)

**Scope**: Manager tools to list bots and to propose create, edit and archive. Each proposal renders as a draft card (fields, capabilities, model) with Confirm and Discard; only Confirm calls the existing `/api/v1/unit/agents` endpoints. Admin sessions only, behind `ALLERAC_BOTS`.
**Tests**: the tool never writes `unit_agents`; the draft is validated with the same schemas as the API; the default bot's locked fields cannot be changed through a draft; non-admins never get the tools.

### PR 8: Federation exposure per bot

**Scope**: `federation_exposed` in `exposedAgentSlugs()` and the agents listing (name, emoji, role per bot). The Control Tower shows bots.
**Tests**: not exposed by default; exposed bots appear in `/api/v1/federation/agents`; protocol compatible with older peers.

### PR 9 (optional, later)

- Rename `domain_slug` -> `agent_slug` (with views for compatibility) once the domain concept is gone.
- Per-bot access for non-admin users (`unit_agent_access`), if a shared family Unit ever needs it.
- Notes folder or tag scope per bot.
- Remove the legacy domain code (simplification phase 7).

### Migration sketch (not final SQL)

```sql
-- 158_unit_agents.sql
CREATE TABLE IF NOT EXISTS unit_agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(63) NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  display_name  VARCHAR(100) NOT NULL,
  emoji         VARCHAR(16),
  avatar_url    TEXT,
  role          VARCHAR(200),
  description   VARCHAR(1000),
  instructions  TEXT CHECK (instructions IS NULL OR char_length(instructions) <= 8000),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  tool_settings JSONB   NOT NULL DEFAULT '{}'::jsonb,
  memory_mode   VARCHAR(12) NOT NULL DEFAULT 'isolated'
                CHECK (memory_mode IN ('isolated','none')),
  can_call      TEXT[]  NOT NULL DEFAULT '{}',
  model_id      TEXT,
  model_provider TEXT,
  cloud_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  default_skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  federation_exposed BOOLEAN NOT NULL DEFAULT FALSE,
  template      VARCHAR(63),
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_agents_default ON unit_agents (is_default) WHERE is_default;

-- Seed the default bot from the Unit profile (idempotent). It is `isolated`
-- like every bot; it keeps today's reach because all legacy rows are backfilled
-- `shared = true` in 159 and its own new memories are shared by default.
INSERT INTO unit_agents (slug, display_name, emoji, role, description, instructions,
                         is_default, tool_settings, memory_mode, federation_exposed)
SELECT 'chat', COALESCE(display_name, 'Allerac'), emoji, role, description, instructions,
       TRUE, agent_tool_settings, 'isolated', FALSE
FROM unit_profile WHERE id = 1
ON CONFLICT (slug) DO NOTHING;
-- (a Unit with no unit_profile row gets the default bot lazily from code)

-- 159_memory_shared.sql
ALTER TABLE unit_agents ADD COLUMN IF NOT EXISTS share_memories_by_default BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE unit_agents SET share_memories_by_default = TRUE WHERE is_default;

-- Existing rows in all three tables: visible to the unit, as today. Backfilled
-- together so SQL reads and semantic search agree.
-- The backfill runs only when the column is first added. A re-run must never
-- flip new private rows to shared, so a plain UPDATE is not safe here.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversation_summaries','knowledge_semantic_index','documents'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = t AND column_name = 'shared') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN shared BOOLEAN NOT NULL DEFAULT FALSE', t);
      EXECUTE format('UPDATE %I SET shared = TRUE', t);
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_scope
  ON conversation_summaries (user_id, domain_slug, shared);
CREATE INDEX IF NOT EXISTS idx_knowledge_semantic_index_scope
  ON knowledge_semantic_index (domain_slug, shared);
CREATE INDEX IF NOT EXISTS idx_documents_scope
  ON documents (domain_slug, shared);
-- From here on the indexer copies `shared` from the source row, and share /
-- make-private updates both rows in one transaction.

-- 160_telegram_agent_binding.sql (additive)
ALTER TABLE telegram_bot_configs ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES unit_agents(id) ON DELETE SET NULL;
ALTER TABLE telegram_chat_mapping ADD COLUMN IF NOT EXISTS bot_config_id UUID REFERENCES telegram_bot_configs(id) ON DELETE CASCADE;
-- backfill bot_config_id from the owner's single config, then:
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_chat_mapping_bot_chat
  ON telegram_chat_mapping (COALESCE(bot_config_id, '00000000-0000-0000-0000-000000000000'::uuid), telegram_chat_id);

-- 161_telegram_chat_mapping_drop_pk.sql (same PR as 160 and the code change)
-- Required: while this PK exists, a second bot cannot map the same human.
ALTER TABLE telegram_chat_mapping DROP CONSTRAINT IF EXISTS telegram_chat_mapping_pkey;
-- Rollback (tested in PR 5): keep the default bot's row per telegram_chat_id,
-- delete the others, then ADD PRIMARY KEY (telegram_chat_id).
```

Notes: migrations are idempotent (`IF NOT EXISTS`) and numbered after `157`. They never drop data, with one exception: the `161` rollback deletes extra Telegram mapping rows, which are routing rows only, not messages or memories. Existing rows keep their `domain_slug` values.

### First PR scope (the one to start with)

**PR 1 (registry), about 400 lines including tests.** It adds `unit_agents` and its repository, seeds the default bot, and exposes a read-only API. It changes **no** chat, Telegram or UI behaviour, so it is safe to deploy to santos, barcelona and napols in any order. It gives the next PRs a single place to read a bot from. Suggested neutral PR title: "Add a bot registry table and read API".

---

## 4. Risks and open questions for Gianclaudio

### Product decisions

Taken (see [Decisions from Gianclaudio](#decisions-from-gianclaudio-2026-11-27) below):

1. **Course change.** Confirmed: keep the simple default (one default bot, same screen) and add more bots **on demand**. This does not undo the simplification; it changes the wording of the roadmap.
2. **No pre-created bots.** The owner creates every bot by hand through the admin UI. Templates stay optional. Naming (for example `Gian Doctor` versus `Doctor`) is chosen at creation time.

Still open:

3. **Memory default.** Is "isolated by default, sharing is explicit" right? Or is a shared pool better by default, with isolation only for sensitive bots such as Doctor? (The proposal also removes any "read every bot" mode, so even the default bot does not see another bot's private memories. A shared-pool preference would be expressed as `share_memories_by_default = true` on those bots, not as a read override.)
4. **Telegram.** One Telegram bot per persona (recommended, closest to the existing personal-bot experience), a single router bot, or one forum group with a topic per bot? One per persona means a BotFather token per bot, entered by the owner in the UI.
5. **Sensitive bots and cloud models.** Should Doctor, Nutrition and Trainer be pinned to local models (`cloud_allowed=false`) once a local GPU server is available? Until then they would use a cloud model, or a small local model.
6. **Hand-off.** Decided 2026-11-27: everything goes through the Manager (the default bot), bots never talk to each other, and the user can still talk to every bot directly. See 2.5, PR 7 and PR 7b.
7. **Federation.** Should any personal bot ever be exposed to other Units? Default proposal: none, except the default bot as today.
8. **Importing existing instructions.** Should the create/import flow support pasting instructions from existing personal bots? Memories and history from those bots would not be migrated by this plan (a separate, optional task).

### Technical risks

- **Memory isolation is the riskiest PR** (56 non-test source files reference `domain_slug`). One missed read site leaks a private memory. Mitigation: dedicated PR, an audit checklist in the description, a pg integration test per read site, and no "create bot" UI until it has merged and been deployed.
- **Telegram refactor.** The Telegram path diverges from the web pipeline and ignores agent tool settings today. Unifying them is necessary, but it touches a live messaging channel. Mitigation: a separate commit, tests, and a staged rollout across Units.
- **Primary key change on `telegram_chat_mapping`** (a live table). The old PK must go in the same PR, because multi-bot Telegram is impossible while it exists. Mitigation: additive migration `160` first, PK drop in `161`, code keyed by the new key in the same deploy, a tested rollback script, and a backup before deploying.
- **Tool overload** (prompt size and cost) if many bots enable many tools. Mitigation: capability toggles per bot, heavy modules (music, social) default off, templates with few tools.
- **Slug collisions** with legacy domain slugs and routes. Mitigation: reserved list plus validation. Slugs are immutable.
- **`domains` FKs** (`user_domain_model_settings`, `domain_rate_limit_settings`, `agent_runs`) block using bot slugs directly. Options: relax the FKs for bots (migration), or keep bot settings only in `unit_agents`. Recommendation: the second for model settings and the first for `agent_runs` only. To be confirmed in the implementation pull request.
- **Non-admin users** cannot see slugs that are not in `domains` (`domainAccessSql`). Fine for a one-admin personal Unit. A shared family Unit needs `unit_agent_access` (PR 9).
- **Per-user vs per-unit bots.** Bots are **Unit-level** (like `unit_profile`) and data stays per user. If you want different people on the same Unit to have different bots, that needs an owner column and ACL. Not needed for a single-admin personal Unit.
- **Ticket isolation in summaries.** PR 3 must verify and test ticket isolation in conversation summaries, memory rows and the semantic index, including when a bot has ticket tools enabled.
- **Rollout.** Implementation pull requests stay small, in English, with neutral titles. Each is reviewable on its own. Production Units are updated independently after a pull request is merged.

### Suggested next step

The first implementation pull request is PR 1 (bot registry, no behaviour change).

## Decisions from Gianclaudio (2026-11-27)

- **Tools are selected per bot at creation time.** The create/edit bot form lists every tool/module enabled in the unit (e.g. health, music, email, notes, tickets); the bot can only see and call the tools explicitly checked. Templates only pre-select a default set (e.g. Doctor pre-selects health); everything is editable. Enforcement happens server-side in the bot-aware runtime (tool list filtered before the model call and re-checked on execution), for web chat, Telegram and jobs alike.
- **Only admins can create, edit or delete bots.** Enforced server-side on every bot-management API route (not just hidden in the UI); non-admin users can only chat with bots that exist.
- **No bots are seeded or pre-created** (besides the existing default agent becoming the default bot). Gianclaudio will create every bot by hand through the admin UI to test the whole flow; templates stay optional helpers only.
