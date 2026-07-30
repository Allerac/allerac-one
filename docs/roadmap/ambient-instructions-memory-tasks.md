# Ambient Instructions, Memory, and Tasks

**Status:** Proposed

**Depends on:** `ConversationMemoryService`, `scheduled-jobs` service, the domains/skills/skill_tools infrastructure, and the existing [add-domain guide](../domains/add-domain.md)

**Enables:** Removing manual Instructions/Memory/Tasks management from every domain, replacing it with agent-driven behavior learned from normal conversation

## Objective

Today, `MyAlleracModal.tsx` gives every domain three manually-managed tabs:

- **Instructions** — a free-text system prompt the user writes and edits per domain (`user_domain_instructions`, via `actions/user.ts`).
- **Memory** — a viewer over auto-generated conversation summaries (`conversation_summaries`, via `actions/memory.ts` and `ConversationMemoryService`) plus RAG document upload.
- **Tasks** — a form-based CRUD over scheduled jobs (`scheduled_jobs`, via `actions/scheduled-jobs.ts`), duplicated inside every domain's modal even though a dedicated `jobs` domain already exists (migration `061_jobs_domain.sql`).

The goal is to remove all manual configuration. The user should only ever talk to Allerac; the system decides what to remember, what to codify as a standing instruction, and when to schedule something recurring. Two of these three concepts (Memory and Tasks) become their own **meta-domains** — informative, chat-capable, and exposed as tools any other domain's agent can call on demand. Instructions stays domain-local and stays editable, but is no longer solely the user's responsibility to maintain — the agent writes to it too, from what it learns in conversation.

## Known bug to fix first (independent of this redesign)

`ChatClient.tsx` derives `domain_slug` from the domain's **display name** (`domainName?.toLowerCase()`) instead of its real slug in some call sites. This works by coincidence for most domains but breaks for `write` (page passes `domainName="Content"`, which lowercases to `content` — a slug that matches no real domain). Memory saved from that domain is silently unretrievable. Fix this before building more domain-scoped features on top of the same pattern.

## Target model

### Instructions — agent-authored, still user-editable

`user_domain_instructions` stays domain-local (it's inherently 1:1 with a domain's identity — no cross-domain query makes sense for it). What changes is that the user no longer has to be the one to write it: a background "instruction distiller" reads recent correction memories and conversation summaries for a domain and updates the document itself via `saveDomainInstructions`. The edit textarea stays in the modal — direct editing is a second, equally valid way of teaching Allerac, not something the redesign removes. The distiller and the user are both writers of the same document; neither is exclusive.

### Memory — its own domain

Memory becomes a domain like `jobs` already is: a `domains` row, its own skill/persona ("You are the Memory assistant — help the user search, review, create, and delete memories"), and a real chat page, following the [add-domain guide](../domains/add-domain.md). This makes memory directly interactive — the user can ask it to find, create, or delete a memory (useful for debugging too), instead of only viewing a list.

It also becomes a cross-domain tool: `recall_memory(query, domain_slug?)`, callable by any domain's agent on demand. This replaces the current behavior in `chat-handler.ts` (~line 142), which unconditionally injects the user's 3 most recent summaries into every system message regardless of relevance.

### Tasks — centralized in the existing Jobs domain

The Tasks tab disappears from every domain's modal. A single cross-domain tool, `schedule_task(cron, prompt)`, becomes available to every domain; the caller auto-injects the current `domain_slug` — the agent never chooses or names a domain itself. The `jobs` domain page becomes the one place to see, edit, and delete scheduled tasks across all domains, using the `domain_slug` column that `scheduled_jobs` already has.

## Phased delivery

### Phase 1 — Fix the foundation

1. Give every domain page an explicit `domainSlug` prop instead of deriving it from a display name; fix `write/page.tsx` and any other mismatched call site.
2. Migrate existing rows tagged `domain_slug = 'content'` to `'write'` (`conversation_summaries`, `documents`).
3. Determine how a tool becomes available to *every* domain regardless of `skill_tools` bindings (today tools appear to be assigned per-skill) — this is required by both `recall_memory` and `schedule_task` below.

### Phase 2 — Memory becomes a domain

1. `skills/memory.md` with `domain: memory` frontmatter and a search/review/create/delete persona.
2. Migration registering the `memory` domain (mirror `061_jobs_domain.sql`).
3. `src/app/memory/page.tsx` (chat-only pattern), registered in `HubClient.tsx`, `DomainSkillsModal.tsx`, and `allerac-domains.ts`.
4. Domain-local tools: `search_memory`, `create_memory` (wraps `saveCorrectionMemory`), `delete_memory` (wraps `deleteSummary`).
5. Cross-domain tool `recall_memory(query, domain_slug?)`, available to all domains.
6. Remove the unconditional top-3-summary injection in `chat-handler.ts` once `recall_memory` is in place.
7. Decide where RAG document upload (currently the Memory tab's "Documents" sub-tab) lives going forward — folded into the Memory domain chat, or kept separate (see open questions).

### Phase 3 — Tasks centralized in Jobs

1. Cross-domain tool `schedule_task(cron, prompt)`, auto-injecting the caller's current `domain_slug`.
2. Expand the `jobs` domain page into the full management surface (list/edit/delete across all domains, filter by `domain_slug`, view executions) — likely promoting what `ScheduledJobsModal` already renders inline.
3. Remove the Tasks tab from `MyAlleracModal.tsx`.

### Phase 4 — Instructions becomes agent-maintained

1. Build the instruction distiller: reads recent correction memories + summaries for a domain, updates `user_domain_instructions` via `saveDomainInstructions`. Trigger it off the existing `shouldSummarizeConversation` flow, or on a scheduled cadence via `agent-worker`.
2. Keep the Instructions tab editable; the distiller and manual edits both write to the same document.
3. Decide whether instruction changes need a history/audit trail — this matters more now that two writers (agent + user) touch the same document (see open questions), and whether a user's manual edit should be protected from being silently overwritten by the next distiller pass.

### Phase 5 — Retire the three-tab modal

1. Once Memory and Tasks tabs are gone, decide the final shape of `MyAlleracModal.tsx` — likely a lightweight "About this domain" panel (editable instructions + links to the Memory and Jobs domains) rather than a 3-tab modal.
2. Update every `openMyAlleracModal` call site if the entry point changes.
3. Remove now-dead code (e.g. the already-nonfunctional manual "save to memory" button in `ConversationSidebar.tsx`).

## Open questions

- Where does RAG document upload live once Memory becomes a domain?
- What is the mechanism for making a tool available to every domain by default, instead of per-skill assignment?
- Should the instruction distiller run after every summarized conversation, or on a schedule? Does it need version history for auditability?
- Icon/route for the `memory` domain (🧠 is already used by `learn`).
- Should `recall_memory` fully replace automatic context injection, or should a small default still be injected for very short conversations where a tool call round-trip isn't worth it?

## Definition of done

- No domain has a manual memory save/delete UI or a manual task-creation form outside of natural conversation; Instructions remains editable but is no longer the only way the document gets written.
- The `write` domain slug bug is fixed and historical data corrected.
- `recall_memory` and `schedule_task` are available to every domain and used instead of always-on context injection / per-domain task forms.
- `MyAlleracModal.tsx`'s three-tab structure is retired or reduced to a read-only summary.

## Deferred / out of scope

- Multi-language instruction documents.
- Any change to domain access control beyond what exists today.
- Dashboards/analytics over job execution history beyond what the Jobs domain page needs to be usable.
