# Users

Allerac One supports multiple users, each with their own data, settings and domain access. The user model is designed for a **private-first, self-hosted** context: a small number of trusted people sharing one installation.

## User types

### Admin

The admin is the owner and operator of the Allerac instance. Admins have unrestricted access:

- Access to the **hub desktop** (`/hub`) — the control centre
- Access to **all domains** (`/chat`, `/code`, `/recipes`, `/finance`, `/health`, `/write`, `/social`)
- Access to **Configuration** (API keys, models, integrations)
- Access to **Domain Skills** management (assign skills and tools per domain)
- Access to the **Admin panel** (`/admin`) for user management
- Full memory across all domains

### Domain User

A domain user is assigned to one or more specific domains by the admin. They:

- Land directly in their domain on login — no hub, no desktop
- See only the conversations, memory and documents of their domain
- Cannot access configuration, other domains or the hub
- Have their own **My Allerac** per domain (personal instructions, memory, documents, tasks)

The header shows a user avatar button (initials circle) for language selection and logout. That is the only global UI element visible to domain users.

## Access control

Access is enforced server-side on every domain page via `requireDomainAccess(slug)`:

```typescript
export async function requireDomainAccess(slug: string) {
  // 1. Validate session
  // 2. Check user is active
  // 3. If not admin → check user has access to this specific domain
  // 4. Redirect to /login or /hub if unauthorized
  return user; // { id, name, email, is_admin, ... }
}
```

Admins pass all domain checks automatically. Domain users are checked against an access table.

## Data isolation

Each user's data is isolated by `user_id` at every layer:

| Data | Scoped by |
|---|---|
| Conversations | `user_id` + `domain_slug` |
| Memory summaries | `user_id` + `domain_slug` |
| Documents | `user_id` + `domain_slug` |
| Scheduled tasks | `user_id` + `domain_slug` |
| Instructions | `user_id` + `domain_slug` |
| Skills | `user_id` (or shared system skills) |
| Settings | `user_id` |

A domain user in Recipes sees only their own recipes conversations. Another user in Recipes sees only theirs.

## Relationship with domains

```
User (admin)
├── /chat    — sees all conversations from all domains
├── /code    — isolated memory, programmer skill
├── /recipes — isolated memory, chef skill
├── /finance — isolated memory, finance skill
├── /health  — isolated memory, health skill + Garmin data
├── /write   — isolated memory, writer skill
└── /social  — isolated memory, social skill + Instagram

User (domain user, assigned to /recipes)
└── /recipes — isolated memory, chef skill, personal instructions
               cannot navigate to /chat, /code, /finance…
```

## My Allerac (per user, per domain)

Every user has a **My Allerac** panel in each domain they have access to. It contains settings and data specific to that user in that domain:

- **Instructions** — personal system prompt addendum (layered on top of the skill)
- **Memory** — their conversation summaries for this domain
- **Documents** — their uploaded files for RAG in this domain
- **Tasks** — their scheduled jobs for this domain

Admins have a My Allerac for each domain independently. Changing instructions in `/recipes` does not affect `/finance`.

## User settings

Global settings (shared across all domains) live in `user_settings`:

- GitHub token (LLM access)
- Tavily API key (web search)
- Google API key
- Anthropic API key
- Location (for time-aware responses)
- Preferred LLM model
- Language / locale

These are managed from the **Settings** modal (available from the hub for admins, or from the avatar dropdown in any domain).

## Authentication

Authentication is session-based with bcrypt password hashing. Sessions are stored as signed cookies (`session_token`). There is no OAuth or external identity provider — this is intentional for a self-hosted, private-first system.

## Database

```sql
CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT,
  email                   TEXT UNIQUE NOT NULL,
  password_hash           TEXT NOT NULL,
  is_admin                BOOLEAN DEFAULT FALSE,
  is_active               BOOLEAN DEFAULT TRUE,
  onboarding_completed    BOOLEAN DEFAULT FALSE,
  completed_onboarding_tour BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Domain access assignments for non-admin users
CREATE TABLE user_domain_access (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_slug TEXT NOT NULL,
  PRIMARY KEY (user_id, domain_slug)
);
```
