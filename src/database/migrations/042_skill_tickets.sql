-- Migration 042: Tickets skill seed + domain binding

DO $$
DECLARE
  skill_id UUID := 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  skill_content TEXT := $SKILL$---
name: tickets
display_name: 🎫 Tickets
description: Manages the Allerac ticket system. Open, list, update, and resolve tickets via natural language.
category: workflow
keywords:
  - ticket
  - bug
  - task
  - issue
  - problema
  - tarefa
  - abrir ticket
  - criar ticket
  - listar tickets
  - resolver
  - fechar
  - reabrir
---

# Tickets

You manage the Allerac ticket system. Users can open, list, update, and resolve tickets via natural language.

## Intent Detection

Detect the user's intent from their message:

- **create** — "open a ticket", "create a ticket", "log a bug", "add a task", "there's a bug with..."
- **list** — "show tickets", "what's open", "list bugs", "pending tickets"
- **resolve** — "close ticket", "mark done", "ticket #X is fixed", "resolve ticket"
- **cancel** — "cancel ticket", "won't fix", "remove ticket"
- **status** — "what's the status of ticket", "show ticket #X"
- **reopen** — "reopen ticket", "it's still broken"

## Field Extraction for Create

From the user message, extract:
- **title** — concise description of the work (required)
- **description** — extra context if provided
- **type** — `bug` | `task` | `improvement` | `question` (infer from message; default `task`)
- **explicitUrgency** — `critical` | `high` | `medium` | `low` (only if user mentions urgency)

Urgency keyword mapping:
- "urgent", "asap", "blocking", "critical", "down", "broken" → `critical` or `high`
- "low priority", "whenever", "nice to have" → `low`

## Actions

Use the available server actions:
- `createTicket({ title, description, type, explicitUrgency, context: { source: 'chat', raw_message: '<original>' } })`
- `listTickets({ status?, type?, priorityLevel? })`
- `getTicket(id)`
- `updateTicket(id, { status, resolutionNotes, resolvedByType: 'user' })`

## Response Format

**After creating:** "Ticket opened: *[title]* (type · priority). I'll track it."
**After listing:** Show a compact table with ID prefix, title, status, priority.
**After resolving:** "Ticket *[title]* marked as resolved."
**Not found:** "I couldn't find that ticket. Try listing open tickets."

## Examples

User: "there's a bug where the login redirect fails after session timeout"
→ create: { title: "Login redirect fails after session timeout", type: "bug", explicitUrgency: null }

User: "open a high priority ticket to refactor the embedding service"
→ create: { title: "Refactor embedding service", type: "improvement", explicitUrgency: "high" }

User: "what bugs are open?"
→ list: { type: "bug", status: "open" }

User: "mark the login ticket as done"
→ update ticket matching "login": { status: "resolved", resolvedByType: "user" }
$SKILL$;
BEGIN
  IF EXISTS (SELECT 1 FROM skills WHERE id = skill_id) THEN
    UPDATE skills SET
      content      = skill_content,
      verified     = true,
      shared       = true,
      updated_at   = NOW()
    WHERE id = skill_id;
  ELSE
    INSERT INTO skills (
      id, user_id, name, display_name, description, content, category,
      verified, shared, version, learning_enabled, memory_scope, rag_integration
    ) VALUES (
      skill_id,
      NULL,
      'tickets',
      '🎫 Tickets',
      'Manages the Allerac ticket system. Open, list, update, and resolve tickets via natural language.',
      skill_content,
      'workflow',
      true,
      true,
      '1.0.0',
      false,
      'user',
      false
    );
  END IF;
END $$;

-- Register tickets domain (active by default)
INSERT INTO domains (slug, display_name, is_active)
VALUES ('tickets', 'Tickets', true)
ON CONFLICT (slug) DO NOTHING;

-- Bind tickets domain → tickets skill
INSERT INTO domain_skill_defaults (domain_slug, skill_id)
SELECT 'tickets', id FROM skills WHERE name = 'tickets' LIMIT 1
ON CONFLICT (domain_slug) DO UPDATE SET skill_id = EXCLUDED.skill_id, updated_at = NOW();
