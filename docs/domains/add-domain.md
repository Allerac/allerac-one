# How to add a new domain

A domain is a scoped workspace for a specific use case (e.g. Design, Finance, Tickets). Each domain has:
- A **page route** (`/design`, `/finance`, etc.)
- A **skill** that acts as the system prompt for that domain's AI assistant
- A **DB entry** linking domain → skill

## Checklist

- [ ] 1. Create the skill file (`skills/<name>.md`)
- [ ] 2. Create the migration (`src/database/migrations/<NNN>_domain_<name>.sql`)
- [ ] 3. Create the page route (`src/app/<name>/page.tsx`)
- [ ] 4. Register in `HubClient.tsx`
- [ ] 5. Register in `DomainSkillsModal.tsx`
- [ ] 6. Rebuild and deploy

---

## Step 1 — Create the skill file

Create `skills/<name>.md`. The frontmatter fields control how the skill behaves:

```markdown
---
name: design                     # unique slug, matches domain slug
display_name: 🎨 Design          # shown in UI
description: One-line summary.   # shown in skill picker
category: design                 # groups skills in the library
domain: design                   # ← auto-binds this skill to the domain on startup
version: 1.0.0
---

# Your skill system prompt here
```

**Key rule:** `domain: <slug>` in the frontmatter is all you need for the DB binding — the `SystemSkillsLoader` handles it automatically on app startup. No need to seed the skill in the migration.

If the skill needs specific tools, add a `tools:` list in the frontmatter (not yet parsed — use `skill_tools` table). For now, tools are assigned via the admin UI (Domain Skills modal) or directly in the DB.

---

## Step 2 — Create the migration

Only the domain registration goes in the migration. The skill content is loaded from the `.md` file by `SystemSkillsLoader` on startup.

Create `src/database/migrations/<NNN>_domain_<name>.sql`:

```sql
-- Migration NNN: <Name> domain
INSERT INTO domains (slug, display_name, is_active)
VALUES ('<name>', '<Display Name>', true)
ON CONFLICT (slug) DO NOTHING;
```

> The `domain_skill_defaults` binding is handled automatically by `SystemSkillsLoader` via the `domain:` frontmatter field — no need to add it here.

---

## Step 3 — Create the page route

Create `src/app/<name>/page.tsx`. You have two options:

### Option A — Generic chat interface (fast)

Use this when the domain is purely conversational with no custom UI needs.

```typescript
import { requireDomainAccess } from '@/app/lib/domain-access';
import { getDomainSkillDefault } from '@/app/actions/skills';
import ChatClient from '../chat/ChatClient';

export default async function <Name>Page() {
  const user = await requireDomainAccess('<name>');
  const skill = await getDomainSkillDefault('<name>');
  return <ChatClient defaultSkillName={skill?.skill_name} defaultSidebarCollapsed domainName="<Display Name>" isAdmin={user.is_admin} />;
}
```

### Option B — Custom domain page (when the domain has its own UI)

Use this when the domain needs a specific layout or visual experience (like the Design canvas, or the Tickets board).

**`src/app/<name>/page.tsx`** — server component, handles auth:
```typescript
import { requireDomainAccess } from '@/app/lib/domain-access';
import <Name>Client from './<Name>Client';

export default async function <Name>Page() {
  const user = await requireDomainAccess('<name>');
  return <<Name>Client userId={user.id} />;
}
```

**`src/app/<name>/<Name>Client.tsx`** — client component, the actual UI:
```typescript
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MODELS } from '@/app/services/llm/models';

export default function <Name>Client({ userId }: { userId: string }) {
  const [selectedModel, setSelectedModel] = useState('qwen2.5:3b');

  // Read user's saved model preference (same as chat)
  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) setSelectedModel(saved);
  }, []);

  const sendMessage = async (text: string) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationId: null,
        model: selectedModel,
        provider: MODELS.find(m => m.id === selectedModel)?.provider || 'ollama',
        defaultSkillName: '<name>',
        domain: '<name>',
      }),
    });
    // Read SSE stream: data: {"type":"token","content":"..."}
    // data: {"type":"done","conversationId":"..."}
    // data: {"type":"error","message":"..."}
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'token') { /* append event.content */ }
        if (event.type === 'done')  { /* event.conversationId */ }
      }
    }
  };

  return (
    <div>
      {/* your custom UI here */}
    </div>
  );
}
```

See `src/app/design/DesignClient.tsx` for a complete real-world example (canvas + chat panel, dark/light mode, SVG rendering).

---

## Step 4 — Register in HubClient

Add an entry to `DOMAINS_ALL` in `src/app/hub/HubClient.tsx`:

```typescript
const DOMAINS_ALL = [
  // ... existing entries ...
  { id: '<name>', label: '<Label>', icon: '<emoji>', path: '/<name>', desc: '<Short description>' },
];
```

---

## Step 5 — Register in DomainSkillsModal

Add the same entry to `DOMAINS` in `src/app/components/hub/DomainSkillsModal.tsx`:

```typescript
const DOMAINS = [
  // ... existing entries ...
  { slug: '<name>', label: '<Label>', icon: '<emoji>' },
];
```

---

## Step 6 — Rebuild and deploy

```bash
docker compose build --no-cache app
docker compose up -d --force-recreate --no-deps migrations
docker compose up -d --force-recreate --no-deps app
```

The migration registers the domain, and on startup the app syncs the skill content and creates the `domain_skill_defaults` binding automatically.

---

## Assign access to users

After deploying, go to **Admin → Users**, select the user, and assign the new domain. Non-admin users only see domains they have been granted access to.

---

## Common pitfalls

| Problem | Cause | Fix |
|---|---|---|
| System prompt shows placeholder text | Migration seeded a skill row with no `source_file`; loader created a second row | Run the DB fix below |
| Domain not in hub or modal | Forgot to add to `DOMAINS_ALL` / `DOMAINS` | Steps 4 and 5 |
| `/design` redirects to `/login?error=no-access` | User has no domain access assigned | Admin → Users → assign domain |
| Skill content not updating | `SystemSkillsLoader` conflict on `source_file` — check for duplicate rows | `SELECT id, name, source_file FROM skills WHERE name = '<name>'` |

### DB fix for duplicate skill rows

If a migration accidentally seeded a placeholder skill before `SystemSkillsLoader` ran:

```sql
-- Find the correct row (has real content and source_file set)
SELECT id, name, LEFT(content, 60), source_file FROM skills WHERE name = '<name>';

-- Update domain binding to the correct UUID
UPDATE domain_skill_defaults SET skill_id = '<correct-uuid>' WHERE domain_slug = '<name>';

-- Copy skill_tools to the correct UUID
INSERT INTO skill_tools (skill_id, tool_name)
SELECT '<correct-uuid>', tool_name FROM skill_tools WHERE skill_id = '<placeholder-uuid>'
ON CONFLICT DO NOTHING;

-- Remove placeholder
DELETE FROM skill_tools WHERE skill_id = '<placeholder-uuid>';
DELETE FROM skills WHERE id = '<placeholder-uuid>';
```
