# Domains

A **domain** is a focused AI workspace with its own identity, memory, and behaviour. Each domain lives at its own URL (e.g. `/recipes`, `/finance`) and gives the user a context-specific experience without exposing configuration or other users' data.

## Concept

Think of a domain as a room in a house. The house (Allerac) provides shared infrastructure — database, LLM, memory engine — but each room has its own furniture, rules and purpose. A conversation in the kitchen (Recipes) stays in the kitchen; the study (Finance) has different books on the shelves.

```
Allerac One
├── /chat      — General assistant, hub for all conversations
├── /code      — Programmer mode, shell access
├── /recipes   — Chef & nutrition
├── /finance   — Financial advisor
├── /health    — Health & wellness (Garmin integration)
├── /write     — Content creator
└── /social    — Instagram manager
```

## Domain Reference

| Slug | Name | Status | Icon | Default Skill | External API |
|------|------|--------|------|---------------|--------------|
| [chat](chat.md) | Chat | Active | 💬 | — (auto-detect) | None |
| [code](code.md) | Code | Active | 💻 | programmer | Git / Node / Python |
| [social](social.md) | Social | Active | 📸 | social | Instagram Graph API |
| [health](health.md) | Health | Active | ❤️ | health | Garmin Connect |
| [design](design.md) | Design | Active | 🎨 | design | None |
| [search](search.md) | Search | Active | 🔍 | search | Tavily API |
| [email](email.md) | Email | Active | ✉️ | — | IMAP / SMTP |
| [write](write.md) | Write | Active | ✍️ | writer | None |
| [tickets](tickets.md) | Tickets | Active | 🎫 | tickets | GitHub API |
| [recipes](recipes.md) | Recipes | Inactive | 🍳 | chef | None |
| [finance](finance.md) | Finance | Inactive | 💰 | finance | None |

## What a domain owns

| Layer | Stored as | Scoped by |
|---|---|---|
| Conversations | `chat_conversations.domain_slug` | per domain |
| Memory (summaries) | `conversation_summaries.domain_slug` | per domain |
| Documents (RAG) | `documents.domain_slug` | per domain |
| Scheduled tasks | `scheduled_jobs.domain_slug` | per domain |
| User instructions | `user_domain_instructions` | per user per domain |
| Default skill | `domain_skill_defaults` | per domain |

## The Chat domain

`/chat` is intentionally different — it acts as the **hub**. It loads conversations from all domains in the sidebar, giving the admin a unified view of everything. Other domains show only their own conversations.

## Domain isolation

Users assigned to a domain can only access that domain. The `requireDomainAccess(slug)` middleware enforces this at the page level. Admins have access to all domains plus the hub desktop.

```typescript
// Every domain page follows this pattern
export default async function RecipesPage() {
  const user = await requireDomainAccess('recipes');
  const skill = await getDomainSkillDefault('recipes');
  return <ChatClient defaultSkillName={skill?.skill_name} domainName="Recipes" isAdmin={user.is_admin} />;
}
```

## Domain slug

The slug is a lowercase string (`'chat'`, `'recipes'`, `'finance'`…) used as metadata across all scoped tables. It is **not** a foreign key to a domains table — memory exists independently. If a domain is removed, its data persists and can be reassigned.

## Relationship with Skills

Every domain has an optional **default skill** stored in `domain_skill_defaults`. When a user starts a new conversation in that domain, the skill is automatically activated. The user can switch skills within a conversation without changing the domain default.

```
domain_slug  →  skill_id  →  { system_prompt, tools[] }
  'recipes'  →  chef      →  "You are a professional chef…"  +  [search_web, get_today_info]
  'code'     →  programmer →  "You are a senior engineer…"  +  [execute_shell, search_web]
```

Admins change domain→skill bindings from the hub: **Start → Domains**.

## Relationship with Tools

Tools are the AI's capabilities (web search, shell, health data, Instagram…). They are assigned **per skill**, not per domain. A domain gets tools indirectly through its default skill.

See [skills.md](./skills.md) for the full tool assignment model.

## My Allerac (per-domain user settings)

Each domain has its own **My Allerac** panel (accessible from the chat header). It contains:

- **Instructions** — free-text system prompt override the user writes for themselves, layered on top of the skill's prompt
- **Memory** — conversation summaries scoped to this domain
- **Documents** — uploaded files used for RAG, scoped to this domain
- **Tasks** — scheduled jobs that run in the context of this domain

## Database tables

```sql
-- Conversations scoped to a domain
ALTER TABLE chat_conversations ADD COLUMN domain_slug TEXT;

-- Memory scoped to a domain
ALTER TABLE conversation_summaries ADD COLUMN domain_slug TEXT;
ALTER TABLE documents              ADD COLUMN domain_slug TEXT;
ALTER TABLE scheduled_jobs         ADD COLUMN domain_slug TEXT;

-- Per-user per-domain instructions
CREATE TABLE user_domain_instructions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  domain_slug TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  UNIQUE(user_id, domain_slug)
);

-- Default skill per domain (admin-configurable)
CREATE TABLE domain_skill_defaults (
  domain_slug TEXT PRIMARY KEY,
  skill_id    UUID REFERENCES skills(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
