# Ambient Instructions, Memory, and Tasks

**Status:** Completed — 2026-08-02

**Depends on:** `ConversationMemoryService`, `scheduled-jobs` service, the domains/skills/skill_tools infrastructure, and the existing [add-domain guide](../domains/add-domain.md)

**Enables:** Removing manual Instructions/Memory/Tasks management from every domain, replacing it with agent-driven behavior learned from normal conversation

## Objective

Before this roadmap, `MyAlleracModal.tsx` gave every domain three manually-managed tabs:

- **Instructions** — a free-text system prompt the user writes and edits per domain (`user_domain_instructions`, via `actions/user.ts`).
- **Memory** — a viewer over auto-generated conversation summaries (`conversation_summaries`, via `actions/memory.ts` and `ConversationMemoryService`) plus RAG document upload.
- **Tasks** — a form-based CRUD over scheduled jobs (`scheduled_jobs`, via `actions/scheduled-jobs.ts`), duplicated inside every domain's modal even though a dedicated `jobs` domain already exists (migration `061_jobs_domain.sql`).

The goal is to remove all manual configuration. The user should only ever talk to Allerac; the system decides what to remember, what to codify as a standing instruction, and when to schedule something recurring. Two of these three concepts (Memory and Tasks) become their own **meta-domains** — informative, chat-capable, and exposed as tools any other domain's agent can call on demand. Instructions stays domain-local but becomes agent-authored, user-reviewable, and individually revocable.

## Known bug to fix first (independent of this redesign)

`ChatClient.tsx` derives `domain_slug` from the domain's **display name** (`domainName?.toLowerCase()`) instead of its real slug in some call sites. This works by coincidence for most domains but breaks for `write` (page passes `domainName="Content"`, which lowercases to `content` — a slug that matches no real domain). Memory saved from that domain is silently unretrievable. Fix this before building more domain-scoped features on top of the same pattern.

## Target model

### Instructions — agent-authored and user-reviewable

Instructions stay domain-local, but the user teaches Allerac through normal conversation rather than editing a system prompt. The global `learn_instruction(instruction, evidence?)` tool captures explicit durable rules immediately, while a background instruction distiller extracts implicit recurring preferences from correction memories and conversation summaries. Instructions are stored as structured, attributable records and materialized into the domain prompt. My Allerac is read-only except for revoking individual learned instructions.

### Memory — its own domain

Memory becomes a domain like `jobs` already is: a `domains` row, its own skill/persona ("You are the Memory assistant — help the user search, review, create, and delete memories"), and a real chat page, following the [add-domain guide](../domains/add-domain.md). This makes memory directly interactive — the user can ask it to find, create, or delete a memory (useful for debugging too), instead of only viewing a list.

It also becomes a cross-domain tool: `recall_memory(query, domain_slug?)`, callable by any domain's agent on demand. This replaces the current behavior in `chat-handler.ts` (~line 142), which unconditionally injects the user's 3 most recent summaries into every system message regardless of relevance.

### Tasks — centralized in the existing Jobs domain

The Tasks tab disappears from every domain's modal. A single cross-domain tool, `schedule_task(cron, prompt)`, becomes available to every domain; the caller auto-injects the current `domain_slug` — the agent never chooses or names a domain itself. The `jobs` domain page becomes the one place to see, edit, and delete scheduled tasks across all domains, using the `domain_slug` column that `scheduled_jobs` already has.

## Phased delivery

All five phases are complete. The lists below are retained as the implementation
record.

### Phase 1 — Fix the foundation ✅

1. Give every domain page an explicit `domainSlug` prop instead of deriving it from a display name; fix `write/page.tsx` and any other mismatched call site.
2. Migrate existing rows tagged `domain_slug = 'content'` to `'write'` (`conversation_summaries`, `documents`).
3. Determine how a tool becomes available to *every* domain regardless of `skill_tools` bindings (today tools appear to be assigned per-skill) — this is required by both `recall_memory` and `schedule_task` below.

### Phase 2 — Memory becomes a domain ✅

1. `skills/memory.md` with `domain: memory` frontmatter and a search/review/create/delete persona.
2. Migration registering the `memory` domain (mirror `061_jobs_domain.sql`).
3. `src/app/memory/page.tsx` (chat-only pattern), registered in `HubClient.tsx`, `DomainSkillsModal.tsx`, and `allerac-domains.ts`.
4. Domain-local tools: `search_memory`, `create_memory` (wraps `saveCorrectionMemory`), `delete_memory` (wraps `deleteSummary`).
5. Cross-domain tool `recall_memory(query, domain_slug?)`, available to all domains.
6. Remove the unconditional top-3-summary injection in `chat-handler.ts` once `recall_memory` is in place.
7. Decide where RAG document upload (currently the Memory tab's "Documents" sub-tab) lives going forward — folded into the Memory domain chat, or kept separate (see open questions).

### Phase 3 — Tasks centralized in Jobs ✅

1. Cross-domain tool `schedule_task(cron, prompt)`, auto-injecting the caller's current `domain_slug`.
2. Expand the `jobs` domain page into the full management surface (list/edit/delete across all domains, filter by `domain_slug`, view executions) — likely promoting what `ScheduledJobsModal` already renders inline.
3. Remove the Tasks tab from `MyAlleracModal.tsx`.

### Phase 4 — Instructions becomes agent-maintained ✅

1. Build the instruction distiller: read recent correction memories + summaries for a domain and add structured distilled instructions after summarized conversations.
2. Add global `learn_instruction`, with caller user/domain/conversation injected automatically.
3. Store structured instructions with source, evidence, provenance, status, and an audit trail; materialize active instructions into `user_domain_instructions`.
4. Make the Instructions tab read-only with per-instruction revocation.

### Phase 5 — Retire the three-tab modal ✅

1. Reduce `MyAlleracModal.tsx` to a lightweight learned-instructions review/revocation panel with links to Memory, Documents, and Jobs.
2. Redirect legacy Memory/Documents/Jobs events to their centralized routes.
3. Remove manual "save to memory" controls from shared chat inputs, headers, and conversation sidebars.

## Resolved decisions

- RAG document upload remains at `/memory/documents`.
- Universal tools are appended by the chat tool registry after skill filtering.
- `recall_memory`, `create_memory`, `schedule_task`, and `learn_instruction` are
  available across domains; global search and deletion remain centralized in
  Memory.
- `recall_memory` replaces unconditional recent-memory prompt injection.
- Explicit persistence language is routed deterministically: durable memory to
  `create_memory`, notes to `save_note`, time-bound reminders to `schedule_task`,
  and standing rules to `learn_instruction`.
- The instruction distiller runs after conversation summary creation. Moving it to
  a scheduled batch remains an optional optimization, not required functionality.
- The technical domain slug and route remain `memory` and `/memory`. The broader
  product evolution is documented separately in
  [Allerac Intelligence](allerac-intelligence.md).
- Manual save-to-memory controls and `MemorySaveModal` were removed. Memory creation
  now happens through conversation and API tools.

## Definition of done

- No domain has manual memory/task creation or a manual system-prompt editor; teaching happens through natural conversation, with learned instructions reviewable and revocable.
- The `write` domain slug bug is fixed and historical data corrected.
- `recall_memory` and `schedule_task` are available to every domain and used instead of always-on context injection / per-domain task forms.
- `MyAlleracModal.tsx`'s three-tab structure is retired or reduced to a read-only summary.

All definition-of-done items were verified on 2026-08-02. Focused tests cover
domain/user scoping, memory API behavior, global tool registration, instruction
distillation and revocation, job scheduling, and natural-language persistence
routing.

## Deferred / out of scope

- Multi-language instruction documents.
- Any change to domain access control beyond what exists today.
- Dashboards/analytics over job execution history beyond what the Jobs domain page needs to be usable.
