# Domain: Notes

**Slug:** `notes`  
**Route:** `/notes`  
**Icon:** 📝  
**Status:** Planned — not yet implemented  
**Default Skill:** `notes` (to be created at `skills/notes.md`)

---

## Vision

A personal knowledge base — the Allerac equivalent of Obsidian. The user accumulates notes, documentation, project references, and quick thoughts in one place. The AI has full access to this vault via RAG and can be reached from any surface (web, Telegram).

**Two core use cases:**

1. **Capture** — from any context, save something to the vault:
   > Telegram: "anota que preciso ligar pro dentista amanhã"  
   > Allerac saves a note tagged `task`, `tomorrow`

2. **Recall** — query the vault in natural language:
   > Telegram: "o que tenho pra hoje?"  
   > Allerac searches the vault and responds with relevant notes

**The power:** your project documentation, meeting notes, ideas, and tasks live in one place. You paste in a project's README, architecture doc, or API reference — and from then on the AI answers questions about it instantly, from chat or Telegram.

---

## How it differs from existing Documents (RAG)

The `documents` table already supports file uploads with vector search. Notes extends this with:

| Feature | Documents (today) | Notes (planned) |
|---------|-------------------|-----------------|
| UI visibility | Hidden (upload only) | Full vault view — list, search, edit, delete |
| Creation method | File upload only | Chat, Telegram, file upload, direct edit |
| Structure | Files with chunks | Notes with tags + optional project grouping |
| Telegram integration | None | `save_note` and `query_vault` tools available in Telegram |
| Quick capture | No | Yes — one-line notes without a file |

---

## Architecture Plan

### DB

New table `user_notes` — keeps notes separate from the general `documents` table so they have richer metadata (tags, source, title) while reusing the same `document_chunks` / vector search infrastructure.

```sql
CREATE TABLE user_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,
  content      TEXT NOT NULL,
  tags         TEXT[] DEFAULT '{}',
  source       TEXT DEFAULT 'chat',  -- 'chat' | 'telegram' | 'upload' | 'manual'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chunks reuse the existing document_chunks table via a nullable note_id FK
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES user_notes(id) ON DELETE CASCADE;
```

The `search_document_chunks` function already supports filtering by `user_id` and `domain_slug` — notes would pass `domain_slug = 'notes'` to scope searches.

### Tools (new)

| Tool | Description |
|------|-------------|
| `save_note` | Save a note to the vault. Params: `content`, `title?`, `tags[]?` |
| `query_vault` | Search the vault with a natural language query. Returns top-N relevant notes. |
| `list_notes` | List recent notes, optionally filtered by tag. |
| `delete_note` | Delete a note by ID. |

These tools reuse `EmbeddingService` (already exists at `src/app/services/rag/embedding.service.ts`) and `VectorSearchService` (`src/app/services/rag/vector-search.service.ts`).

### Services

| File | Purpose |
|------|---------|
| `src/app/services/notes/notes.service.ts` | CRUD + embedding on save |
| `src/app/tools/notes.tool.ts` | Tool definitions wrapping notes service |
| `src/app/actions/notes.ts` | Server actions for UI |

### UI (Pattern B)

```
src/app/notes/
  page.tsx          ← server: requireDomainAccess('notes')
  NotesClient.tsx   ← client layout: chat panel + vault panel
  VaultPanel.tsx    ← list of notes with search, tags, create, delete
```

The vault panel sits alongside the chat, similar to how `WorkspacePanel` works in the Code domain. The user can read/manage notes visually while also chatting with the AI about them.

### Skill (`skills/notes.md`)

```yaml
---
name: notes
display_name: 📝 Notes
description: Personal knowledge base — save and recall notes, docs, and project references.
category: productivity
domain: notes
version: 1.0.0
tools:
  - save_note
  - query_vault
  - list_notes
  - delete_note
  - search_web
  - get_today_info
---
```

System prompt focus: understands capture intent ("anota...", "lembra...", "salva..."), query intent ("o que tenho...", "me mostra...", "tem algo sobre..."), and handles both Portuguese and English naturally.

---

## Telegram Integration

The `notes` skill should be available in Telegram (not just the web). When the Telegram bot receives a message that matches capture or recall intent, it activates the notes skill and calls `save_note` or `query_vault`.

This works because:
- Telegram bot already resolves the user's `selected_model` from DB
- Skills are already activated per conversation
- The tools just need to be registered and the skill needs to be selectable in Telegram

No new Telegram infrastructure needed — just add the notes skill to the Telegram skill selector.

---

## Implementation Plan

### Phase 1 — Data layer ✅
- [x] Migration `054_notes.sql`: create `user_notes` table (domain registered as inactive)
- [x] `src/app/services/notes/notes.service.ts`: `createNote`, `searchNotes`, `keywordSearchNotes`, `listNotes`, `deleteNote`, `getAllTags`
- [x] `src/app/actions/notes.ts`: server actions for UI

### Phase 2 — AI tools ✅
- [x] `src/app/tools/notes.tool.ts`: `buildNotesTools` handler function
- [x] `src/app/tools/notes.tool.definitions.ts`: pure tool definitions (no Node.js imports — safe for browser bundle)
- [x] `skills/notes.md`: system prompt + frontmatter (auto-loaded by SystemSkillsLoader)
- [x] Tools registered in `TOOLS` array via `tools.ts` + injected in `src/app/api/chat/route.ts`

### Phase 3 — Domain UI ✅
- [x] `src/app/notes/page.tsx`: requireDomainAccess + Pattern B
- [x] `src/app/notes/NotesClient.tsx`: layout wrapper (vault panel + chat)
- [x] `src/app/notes/VaultPanel.tsx`: list, search, quick capture, tag filters, delete
- [x] Register in `HubClient.tsx` → `DOMAINS_ALL`
- [x] Register in `DomainSkillsModal.tsx` → `DOMAINS`

### Phase 4 — Telegram ✅
- [x] Notes tools added to `chat-handler.ts` tool execution block
- [x] `NOTES_TOOL_DEFINITIONS` included in global `TOOLS` — available in all Telegram conversations
- [ ] Activate domain for user + test end-to-end: "anota X" → `save_note` → "o que tenho pra hoje?" → `list_notes`

### Phase 5 — Polish
- [ ] File upload support in VaultPanel (PDF, MD, TXT → chunked + embedded as notes)
- [ ] Note editing inline in VaultPanel
- [ ] "Project" grouping (optional — tag-based is probably enough)

---

## Open Questions

- **Scope:** Should notes be scoped to the `notes` domain only, or should `query_vault` be available in all domains (e.g., ask about your project docs while in the Code domain)? → Likely start domain-scoped, open up later.
- **Deduplication:** If the user uploads the same doc twice, should we deduplicate? → Not critical for MVP.
- **Note vs Document:** Should uploads in other domains (chat, code) eventually be migrated to the notes vault? → Future consideration.
