# Domain: Notes

**Slug:** `notes`  
**Route:** `/notes`  
**Icon:** 📝  
**Status:** Active  
**Default Skill:** `notes` (`skills/notes.md`)

---

## Vision

A personal knowledge base — the Allerac equivalent of Obsidian. The user accumulates notes, documentation, project references, and quick thoughts in one place. The AI has full access to this vault via RAG and can be reached from any surface (web, Telegram).

**Two core use cases:**

1. **Capture** — from any context, save something to the vault:
   > Telegram: "anota que preciso ligar pro dentista amanhã"  
   > Allerac saves a note tagged `task`, with due_date set

2. **Recall** — query the vault in natural language:
   > Chat: "o que tenho pra hoje?"  
   > Allerac calls `list_notes` with `due_on` = today and responds with relevant notes

---

## Architecture

### DB

```sql
CREATE TABLE user_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  title        TEXT,
  content      TEXT NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  source       TEXT DEFAULT 'chat',  -- 'chat' | 'telegram' | 'manual'
  due_date     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `document_id` FK links to the RAG `documents` table — when a GitHub token is present, notes are embedded via `text-embedding-3-small` for semantic search. Without a token, keyword search (`ILIKE`) is used as fallback.

Relevant migrations:
- `054_notes.sql` — creates `user_notes` table
- `055_telegram_link_bot_owner.sql` — migrates notes from virtual Telegram user to real web owner (runs once on servers where the bot owner's Telegram ID is in `allowed_telegram_ids`)
- `056_notes_due_date.sql` — adds `due_date TIMESTAMPTZ` column + index

### Services & Actions

| File | Purpose |
|------|---------|
| `src/app/services/notes/notes.service.ts` | CRUD + embedding on save. `listNotes` supports `due_on`, `due_before`, `overdue` filters. |
| `src/app/actions/notes.ts` | Server actions consumed by VaultPanel |

### Tools

All notes tools are injected globally in every domain/skill (not just Notes). This allows capturing and recalling notes from any conversation.

| Tool | Description |
|------|-------------|
| `save_note` | Save a note. Params: `content`, `title?`, `tags[]?`, `due_date?` (ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm) |
| `query_vault` | Semantic search (falls back to keyword). Returns top-N notes by relevance. |
| `list_notes` | List notes, optionally filtered by `tag`, `due_on`, `due_before`, or `overdue: true`. |
| `update_note` | Update content, title, tags, or due_date of an existing note. |
| `delete_note` | Delete a note by ID. |

Tool definitions live in `src/app/tools/notes.tool.definitions.ts` (no Node.js imports — browser-safe). Handlers in `src/app/tools/notes.tool.ts`.

Global injection is done in `src/app/api/chat/route.ts` — notes tools are always appended to `activeTools`, replacing any domain-level copies.

### UI

```
src/app/notes/
  page.tsx          ← server: requireDomainAccess('notes')
  NotesClient.tsx   ← client layout: vault panel + chat panel
  VaultPanel.tsx    ← split-view editor + note list
```

**Layout pattern:** two-column on desktop (vault left, chat right). Mobile uses tabs (`Vault` / `Chat`).

**VaultPanel split-view:** when a note is selected, the list narrows to 192px (desktop only) and the editor fills the remaining space. On mobile, opening a note goes full-screen with a `← Vault` back button.

**NoteEditor features:**
- Preview / Edit toggle (rendered with `react-markdown` + `remark-gfm`, manually styled without `@tailwindcss/typography`)
- Inline title and tag editing
- Due date picker (`<input type="date">`) — saves the due_date field
- Auto-save with 5s debounce; shows Unsaved / Saving… / Saved HH:MM status
- ✕ close button (desktop) / ← Vault back button (mobile)

**NoteRow due date badges:**
- 🔴 `ATRASADO` — overdue
- 🟡 `HOJE` — due today
- 🔵 `AMANHÃ` — due tomorrow
- Gray `dd MMM` — future date

---

## Telegram Integration

Bot owner's Telegram account maps to their real web `user_id` (via `telegram_bot_configs.allowed_telegram_ids`). Notes saved via Telegram appear in the web vault and vice versa.

Other Telegram users get isolated virtual accounts — their notes do not appear in the web vault.

See `src/app/services/telegram/telegram-bot.service.ts` → `getOrCreateVirtualUser` for the resolution logic.

---

## Implementation History

### Phase 1 — Data layer ✅
- Migration `054_notes.sql`: `user_notes` table
- `notes.service.ts`: CRUD + embedding + keyword fallback
- `notes.ts` actions: server actions for UI

### Phase 2 — AI tools ✅
- `notes.tool.ts` + `notes.tool.definitions.ts`
- `skills/notes.md`: system prompt
- Tools registered globally in `tools.ts` + `chat/route.ts`

### Phase 3 — Domain UI ✅
- `page.tsx`, `NotesClient.tsx`, `VaultPanel.tsx`
- Registered in `HubClient.tsx` → `DOMAINS_ALL` and `DomainSkillsModal.tsx`

### Phase 4 — Telegram ✅
- Notes tools in `chat-handler.ts`
- Bot owner → web user mapping fix (`getOrCreateVirtualUser`)
- Migration `055_telegram_link_bot_owner.sql` for existing servers

### Phase 5 — Polish ✅
- Split-view markdown editor in VaultPanel
- Mobile tabs (Vault / Chat)
- `due_date` field: date picker in editor, color-coded badges in list, AI tools (`due_on`, `due_before`, `overdue`)
- `update_note` tool added
- Notes tools available globally in all domains/skills

---

## Open Questions

- **File upload:** Paste a PDF or `.md` file directly into the vault (chunked + embedded as a note). Not yet implemented.
- **Folders:** Tags cover grouping by context (`projeto-x`, `pessoal`). Full folder hierarchy deferred until there's a clear need beyond tags.
