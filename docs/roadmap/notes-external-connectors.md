# Read-Only External Connectors for Notes

**Status:** Design finalized. Phase 1 (foundation) and Phase 2 (Google Drive)
are implemented and verified end-to-end against a real Google Cloud project
(connect, select, import all confirmed working locally) — see "Getting the
OAuth app/Picker combination actually working" below for the non-obvious
Google Cloud setup this required. Phase 3 (OneNote) is not started; PDF text
extraction (see Phase 3 notes) is scheduled for the same session.

**Scope:** Read-only OAuth connectors (OneNote, Google Drive to start) that let a
user import their own external notes/files into the Allerac `user_notes` vault
for local RAG. Allerac never writes back to the external account.

**Depends on:** Notes domain (`docs/domains/notes.md`), encrypted credential
storage (`services/crypto/encryption.service.ts`), local embeddings
(`embeddinggemma` via Ollama), the generic `integration_connections` table
(`services/integrations/integration-connections.service.ts` — see
`docs/architecture/allerac-bridge.md`) for connection status.

**Related but distinct:** [Strava Integration for Health](health-strava-integration.md)
(closest existing OAuth-connector precedent — same env-var-per-instance OAuth
app model, same disconnect-vs-delete distinction), the crawler
content-acquisition pipeline (`docs/api/control-api-v1/crawler.md`,
`crawler_sources` / `crawler_runs` / `crawler_documents` — closest existing
"external content → `documents` table" precedent).

**Official references:**

- [Microsoft Graph — OneNote API overview](https://learn.microsoft.com/en-us/graph/integrate-with-onenote)
- [Microsoft Graph — permissions reference (`Notes.Read`)](https://learn.microsoft.com/en-us/graph/permissions-reference#notes-permissions)
- [Google Drive API overview](https://developers.google.com/drive/api/guides/about-sdk)
- [Google Picker API](https://developers.google.com/drive/picker/guides/overview)
- [Google OAuth 2.0 scopes (`drive.file`)](https://developers.google.com/identity/protocols/oauth2/scopes#drive)
- [Google Docs API — export/plain text](https://developers.google.com/docs/api/how-tos/export)

## Decision

Add a generic **connector** abstraction to the Notes domain instead of two
one-off integrations. A connector is a read-only adapter that turns an
external account into an explicitly user-selected set of items, each
normalizable to markdown/plain text and stored as a regular `user_note` (with
`document_id` pointing at the existing RAG `documents` table, same as every
other note).

```text
OneNote ──┐
          ├── connector adapters ── normalized note ── user_notes / documents
Google Drive ──┘
```

Unlike Strava/Health (one bespoke `strava_credentials` table, deep
provider-specific normalization), Notes connectors are shallow and structurally
identical across providers: select items, fetch content, convert to
text/markdown, upsert as a note. This justifies one generic schema
(`notes_connector_*`) with a `provider` column, rather than a table per
provider.

**Why read-only, user-selected, one-shot import (not live sync):**

- Matches the private-first vision exactly: after import, the note lives
  locally, is embedded locally, and the OAuth token can be revoked without
  losing anything. The "connection" is a means to an end, not a standing
  dependency.
- Avoids the complexity Strava's roadmap took on for a good reason there
  (webhooks, reconciliation, incremental sync) that Notes doesn't need — a note
  vault import is not a live activity feed.
- Read-only, least-privilege scopes (`Notes.Read`, `drive.file`) are narrower
  and easier to justify to the user than read-write or full-drive access, and
  are provable at consent time.
- Explicit item selection (decided below) means Allerac never silently
  ingests something the user didn't point at.

### Locked product decisions

| Decision | Choice | Why |
|---|---|---|
| Google Drive scope | `drive.file` + Google Picker | User explicitly picks files in Google's own UI; Allerac never gets standing read access to the whole Drive. |
| Item selection | User selects specific items before import, for both providers | No "import everything" surprise; matches the explicit-consent spirit of `drive.file`. |
| Connector UI placement | Inside the Notes domain (`VaultPanel`), not a shared cross-domain Integrations screen | Mirrors the existing Strava-in-Health precedent; each domain owns its own connectors. |
| Re-sync conflict rule | Local edits are never silently overwritten | If the user edited an imported note and the source also changed, flag a conflict and let the user resolve it explicitly. |
| OAuth app registration | One app per self-hosted instance, credentials via env vars (`ONENOTE_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_ID`/`SECRET`) | Same model already used for `STRAVA_CLIENT_ID`/`SECRET`/`REDIRECT_URI`. |
| Accounts per provider | **Superseded** — see "Multiple accounts per provider" below. Originally one connection per `(user_id, provider)` (migration 132); migration 133 lifted this once a real need (personal + work account) showed up. |
| OneNote HTML → Markdown | New small conversion step (e.g. `turndown`) | `react-markdown`/`remark-gfm` only render markdown, they don't produce it from HTML. |
| Auto-tagging | Imported notes get the source notebook/section (or Drive parent folder) name as a tag, in addition to `source` | Keeps the existing tag-based grouping useful for imported content without building folders. |

## Goals

- Let a user connect their OneNote or Google Drive account with OAuth 2.0,
  read-only, least-privilege scopes only.
- Let the user explicitly select which items to import — never an implicit
  "import everything."
- Import selected items as `user_notes`: normalize to markdown/plain text,
  embed locally, tag with `source` = provider name plus the originating
  notebook/section/folder name.
- Make re-running an import ("Sincronizar") idempotent and safe: unchanged
  items are skipped, changed items update the note only if the user hasn't
  edited it locally since import, and conflicting changes are surfaced instead
  of silently resolved.
- Let the user disconnect (revoke token) at any time without deleting already
  imported notes.
- Support adding further providers later (Notion, Evernote, ...) by
  implementing the same connector interface.

## Non-goals

- Writing, editing, or deleting anything in the external account.
- Live/continuous sync (webhooks, push notifications, polling schedules) in
  the first delivery. Sync is user-initiated ("Import" / "Sincronizar").
- Preserving rich formatting fidelity (embedded drawings, OneNote ink,
  Google Docs comments/suggestions). Best-effort text/markdown is enough for
  RAG and reading; a link back to the original item covers the rest.
- A generic "connect any MCP server as a data source" framework. MCP fits an
  agent deciding at chat time whether to call a tool, not a bulk import job
  driven by per-user OAuth; revisit only if Allerac wants arbitrary
  user-supplied MCP servers as a platform feature, independent of Notes.
- Folder hierarchy mirroring (tracked separately in the Notes domain's open
  question on folders vs. tags) — imported items get a tag, not a folder.
- A shared cross-domain "Integrations" screen — explicitly rejected above in
  favor of per-domain connector UI.

## Product experience

### Connection

The Notes vault (`VaultPanel`) shows **Connect OneNote** and **Connect Google
Drive** actions in a small "External sources" panel.

1. Allerac creates signed OAuth state tied to the current user and the chosen
   provider.
2. The user authorizes Allerac with the minimum read-only scope
   (`Notes.Read` / `drive.file`).
3. Provider redirects to the registered callback.
4. Allerac validates state, exchanges the authorization code, stores encrypted
   tokens.
5. UI shows connected account, granted scope, and a **Select items to
   import** action — nothing is imported automatically.

### Selecting and importing items

Selection is always explicit, but the mechanism differs by provider because of
the `drive.file` scope decision:

**Google Drive:**
1. **Select items to import** opens the native **Google Picker** widget
   (client-side, using the OAuth token obtained above).
2. The user multi-selects files/folders inside Google's own UI. Picking a file
   this way is what actually grants Allerac's `drive.file`-scoped token access
   to that specific file — there is no separate server-side "list the whole
   Drive" call.
3. The Picker returns the selected file IDs + basic metadata directly to the
   client, which POSTs them to the import endpoint.
4. To import more files later, the user reopens the Picker; previously granted
   files remain accessible for re-sync without re-picking.

**OneNote:**
1. **Select items to import** calls `GET /connectors/onenote/items`, which
   walks `notebooks → sections → pages` via Microsoft Graph.
2. UI shows a checkbox tree (notebook → section → page), with a "select all in
   this notebook/section" convenience toggle that just checks every page
   underneath — selection is still resolved to explicit page IDs.
3. The user confirms; selected page IDs are POSTed to the import endpoint.

**Both providers converge on the same import job:**

1. A bounded job (agent-worker) fetches content for each selected external ID,
   normalizes it, and upserts notes with `source: 'onenote' | 'google_drive'`
   and an auto-tag for the originating notebook/section/folder.
2. UI shows progress (`N of M imported`) and a summary on completion.
3. Each imported note keeps a `source_url` back to the original item and shows
   a small provider badge, same visual language as the due-date badges already
   in `NoteRow`.

Disconnecting revokes/discards the token. It does not delete already-imported
notes — deletion of imported notes is a separate, explicit action, mirroring
the Strava disconnect-vs-delete distinction.

### Re-sync and local-edit protection

**Sincronizar**, shown per connected account, re-checks only previously
imported items (it does not re-open the picker/selection tree):

1. For each `notes_connector_items` row, fetch the item's current
   `external_content_hash` from the provider (cheaply, e.g. via
   `modifiedAt`/ETag before doing a full content fetch when the provider
   supports it).
2. **Unchanged externally** (hash matches stored `external_content_hash`):
   skip.
3. **Changed externally:** compute the current hash of `user_notes.content`
   and compare it to the stored `imported_content_hash` (the hash of the
   content exactly as last written by the connector):
   - **Note untouched locally** (hashes match): safe to update — fetch,
     normalize, overwrite `user_notes.content`, update both stored hashes.
   - **Note edited locally** (hashes differ): do **not** overwrite. Mark the
     `notes_connector_items` row `status = 'conflict'` and surface it in the
     UI (provider badge turns into a "source updated" indicator) with two
     explicit actions:
     - **Manter minha versão** — dismiss the conflict, update the stored
       `external_content_hash` only (so it stops being flagged), local content
       untouched.
     - **Usar versão da fonte** — fetch, normalize, overwrite local content,
       update both hashes.

This is the only place the design accepts extra complexity over a plain
"last-write-wins" sync, because it is the one place where silently discarding
the user's own edit would violate the private-first premise of the whole
feature.

## Authentication and credentials

Following the existing Bridge pattern (`docs/architecture/allerac-bridge.md`,
`integration-connections.service.ts`): connection status (`is_connected`,
`last_sync_at`, `last_error`) lives in the already-existing, provider-agnostic
`integration_connections` table (`provider = 'onenote' | 'google_drive'`).
`notes_connector_credentials` holds only secrets and provider-identity fields,
one generic table for both providers instead of one table per provider
(contrast with `strava_credentials`, justified above), one row per
`(user_id, provider)`:

```sql
CREATE TABLE notes_connector_credentials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL CHECK (provider IN ('onenote', 'google_drive')),
  provider_account_id      TEXT,
  provider_account_label   TEXT,          -- email/display name shown in UI
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  granted_scopes           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);
```

OAuth apps are registered once per self-hosted instance and configured via env
vars, exactly like Strava:

```text
ONENOTE_CLIENT_ID=
ONENOTE_CLIENT_SECRET=
ONENOTE_REDIRECT_URI=https://your-domain.example/api/notes-connectors/onenote/callback

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://your-domain.example/api/notes-connectors/google_drive/callback
```

Requirements (same bar as Strava/Health):

- encrypt access and refresh tokens at rest (`services/crypto`);
- never return tokens to the browser after the OAuth exchange (the Google
  Picker on the client uses a short-lived OAuth access token obtained through
  the standard Google Identity Services flow, scoped only to `drive.file`, not
  the long-lived refresh token stored server-side);
- refresh access tokens under a per-connection lock;
- do not log authorization codes, tokens, or client secrets;
- validate OAuth state and callback ownership;
- make callback processing idempotent;
- support revocation — provider-side (call the revoke endpoint when available)
  and local (`upsertConnection(userId, provider, { isConnected: false, syncEnabled: false })`
  plus blanking the encrypted token columns, mirroring `StravaCredentialsService.disconnect`).

## Connector interface

```ts
interface NotesConnectorItem {
  externalId: string;
  title: string;
  sourceUrl: string;
  parentLabel: string;     // notebook/section name or Drive parent folder name -> auto-tag
  modifiedAt: string;      // ISO timestamp, used for cheap change checks
}

interface NotesConnector {
  provider: 'onenote' | 'google_drive';
  // OneNote only: powers the server-rendered selection tree.
  // Google Drive selection comes from the client-side Picker instead —
  // its connector implementation may leave this unimplemented.
  listItems?(credentials): AsyncIterable<NotesConnectorItem>;
  fetchContent(credentials, externalId): Promise<{ raw: string; mimeType: string }>;
  normalizeToMarkdown(raw: string, mimeType: string): string;
}
```

Import job, provider-agnostic, given an explicit list of selected
`externalId`s (from the Picker result or the OneNote checkbox tree):

```text
for externalId in selectedExternalIds:
  raw = connector.fetchContent(creds, externalId)
  markdown = connector.normalizeToMarkdown(raw, mimeType)
  contentHash = hash(markdown)
  upsert user_notes (content=markdown, tags=[provider, parentLabel], source=provider, ...)
  upsert notes_connector_items (external_content_hash=contentHash, imported_content_hash=contentHash, status='synced', ...)
```

Re-sync job (see "Re-sync and local-edit protection" above), over existing
`notes_connector_items` rows only — it never expands the selection:

```text
for row in notes_connector_items where credential_id = ...:
  newHash = cheap-check-or-fetch(row.external_id)
  if newHash == row.external_content_hash: continue
  if hash(currentNote.content) == row.imported_content_hash:
    apply update; row.external_content_hash = newHash; row.imported_content_hash = newHash
  else:
    row.status = 'conflict'; row.pending_external_content_hash = newHash
```

Dedup/idempotency mirrors the crawler's `crawler_documents` pattern
(`source_id + external_id` as natural key) rather than inventing a new one,
extended with the conflict-tracking fields the re-sync design needs:

```sql
CREATE TABLE notes_connector_items (
  credential_id                UUID NOT NULL REFERENCES notes_connector_credentials(id) ON DELETE CASCADE,
  external_id                  TEXT NOT NULL,
  note_id                      UUID NOT NULL UNIQUE REFERENCES user_notes(id) ON DELETE CASCADE,
  source_url                   TEXT NOT NULL,
  external_content_hash        TEXT NOT NULL,  -- hash of the last-fetched source content
  imported_content_hash        TEXT NOT NULL,  -- hash of user_notes.content as last written by the connector
  pending_external_content_hash TEXT,          -- set only while status = 'conflict'
  status                       TEXT NOT NULL DEFAULT 'synced'
                                 CHECK (status IN ('synced', 'conflict')),
  provider_modified_at         TIMESTAMPTZ,
  first_imported_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (credential_id, external_id)
);
```

### OneNote specifics

- List: walk `notebooks → sections → pages` via Microsoft Graph
  (`GET /me/onenote/notebooks?$expand=sections`, then
  `GET /me/onenote/sections/{id}/pages`) to build the selection tree.
  `parentLabel` = section name (or `notebook / section` if names collide).
- Fetch: `GET /me/onenote/pages/{id}/content` returns page HTML (may reference
  embedded images via separate resource URLs).
- Normalize: HTML → markdown via a small conversion step (e.g. `turndown`).
  Embedded images are skipped or kept as attachment links — full asset import
  is out of scope for the first delivery.
- Scope: `Notes.Read` (read-only, all notebooks) — do not request
  `Notes.ReadWrite`.

### Google Drive specifics

- Selection: Google Picker (`DocsView` filtered to Google Docs, plain text,
  markdown, and PDF files).
- Fetch: Google Docs via `files.export` (`text/markdown` or `text/plain`);
  native text/markdown files via `files.get?alt=media`; PDFs via the same
  `alt=media` download, piped through `extractPdfText`
  (`src/app/services/rag/pdf-text.ts`) — the same `pdf-parse`-based extraction
  already used for manual document upload/RAG, shared rather than
  reimplemented. Text-based PDFs only; scanned/image PDFs need OCR, not
  attempted. `parentLabel` = the immediate parent folder name, fetched via
  `files.get(fields=parents)` + one `files.get` per parent id (small,
  bounded — at most once per imported file per sync).
- Scope: `drive.file` only. This is why Drive has no server-side `listItems`:
  the app can only ever see files the user explicitly granted through the
  Picker, so "list what's importable" and "let the user select" are the same
  client-side action.
- **No folder-level bulk import.** Confirmed against the live API during
  Phase 2 testing: picking a folder in the Picker grants the app access to
  that folder by id (`files.get` works), but `files.list` scoped to that
  folder's children returns empty regardless of query — under `drive.file`,
  `files.list` only ever returns files the app itself created, never files
  granted through the Picker. A folder can be *browsed* in the Picker (find
  files inside it) but not *selected* as a unit; multi-select individual
  files instead. Getting real "import this whole folder" would require
  `drive.readonly` or `drive.metadata.readonly`, which contradicts the
  least-privilege decision above — not worth revisiting unless a real user
  need for bulk-by-folder import shows up.

### Getting the OAuth app/Picker combination actually working

Phase 2 testing hit a long chain of "picked file 404s on import" failures
that had nothing to do with this codebase's logic — all on the Google Cloud
side. Every one of these is a prerequisite, not an implementation detail, so
listing them here in case Phase 3 (OneNote, a different Google/Microsoft
surface but the same class of problem) or a future redeploy hits the same
wall:

1. **The OAuth client must be type "Web application," not "Desktop app."**
   A Desktop-type client silently accepts the server-side authorization-code
   exchange (Google lets Desktop clients use arbitrary `localhost` redirect
   URIs without pre-registration, so the "Connect" flow appeared to work
   fine — token issued, `about.get` succeeded, scope correct). But it has no
   "Authorized JavaScript origins" concept at all, so the browser-side
   `google.accounts.oauth2.initTokenClient(...)` call Picker needs fails
   outright with `invalid_client` / "no registered origin". This is easy to
   get wrong by accident: Google Cloud Console's OAuth client creation flow
   defaults can produce a Desktop client without it being obvious from the
   name alone — check the page header, which says "OAuth 2.0 Client ID for
   Desktop" vs "...for Web application."
2. **The scope must be explicitly added on the OAuth consent screen's Data
   Access page**, not just requested in the authorization URL. The Drive
   API's `about.get` and general reads worked with the token even before this
   was done; only the Picker's per-file grant registration silently failed.
3. **`PickerBuilder.setAppId(...)` is required.** Pass the Google Cloud
   project number — conveniently the numeric prefix of the OAuth client_id
   itself (`{project_number}-{random}.apps.googleusercontent.com`), so no
   separate env var is needed. Without it, a picked file's `drive.file` grant
   does not attach anywhere: browsing, search, and the Picker's `PICKED`
   callback all work normally (they only need the bearer token), but every
   subsequent `files.get` on the picked id 404s, indistinguishable from a
   "grant never happened" state.
4. **`PickerBuilder.setOrigin(...)` matching the page's actual origin.**
5. **The Picker's OAuth token is minted live in the browser** via
   `google.accounts.oauth2.initTokenClient(...).requestAccessToken()`, using
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the same client id as the server's
   `GOOGLE_CLIENT_ID`; client ids are not secret). `importGoogleDriveSelection`
   receives and uses that exact token for the immediate `files.get`/`files.export`
   calls, rather than the action independently re-fetching the server's
   stored access token.

Items 1–4 were fixed together, then retested cumulatively rather than one at
a time — so it's possible not all four were strictly necessary in isolation
(in particular, once 1–3 are fixed at the Google Cloud project/client level,
the server's independently-refreshed token stored from the "Connect" flow may
turn out to work fine for `files.get` too, which would matter for `resync`
running without a browser open). Treat 1–4 as "get all of these right before
debugging further," not as a proven-minimal list — and see `resyncGoogleDrive`
in production use for whether the server-stored token path needs the same
live-token treatment as import.

**Duplicate folders and empty folder contents in the Picker** (found on real
VM usage, not local testing — the account used locally apparently had no
overlapping Recent/Shared-with-me folders to expose it). `DocsView(ViewId.DOCS)`
by default merges "My Drive," "Shared with me," and "Recent" into one corpus;
a folder indexed by both hierarchy and recent-activity shows up twice with the
same name but different underlying references, and navigating into the
Recent-sourced duplicate doesn't resolve to a real children query, so it looks
empty. Fix: `.setOwnedByMe(true)` on the `DocsView`, which restricts it to the
real My Drive hierarchy and eliminates both symptoms. Tried and reverted:
`.setParent('root')` alongside it — this pins the entire view to root-level
items only and breaks navigating into subfolders at all; don't add it back.
Trade-off worth knowing: `setOwnedByMe(true)` also hides folders/files merely
shared with the user (not owned) from folder browsing — they're still
reachable via the Picker's search box, just not by navigating a shared
folder's tree. Acceptable for now; revisit only if "browse a folder someone
else shared with me" becomes an actual ask.

## Multiple accounts per provider

A real need (connect a personal *and* a work Google Drive account
simultaneously) showed up after Phase 2 shipped, reversing the original "one
connection per `(user_id, provider)`" decision. What changed (migration 133,
`docs/architecture/allerac-bridge.md`'s `integration_connections` convention
no longer applies here):

- `notes_connector_credentials` unique constraint moved from
  `(user_id, provider)` to `(user_id, provider, provider_account_id)` — one
  row per connected account, not per provider.
- Status (`status`, `last_error`, `last_synced_at`) moved onto
  `notes_connector_credentials` itself instead of the shared
  `integration_connections` table, which structurally can't represent more
  than one connection per `(user, provider)` and is relied on as such by
  Garmin/Strava/Spotify. This is a deliberate, one-off exception for this
  domain, not a precedent to copy elsewhere without the same justification.
- Every credentials-service method that used to take `userId` now takes
  `(userId, credentialId)` — `getValidAccessToken`, `disconnect`. `save`
  upserts by `(user, provider, account)`, so connecting a *new* account adds a
  row and reconnecting an *existing* one updates it in place, returning
  `{ credentialId }`.
- Every server action (`resyncGoogleDrive`, `importOneNoteSelection`,
  `resolveGoogleDriveConflict`, etc.) now takes an explicit `credentialId` —
  the client always knows which connected account's card a button belongs to.
- `notes_connector_items` needed no change — it was already scoped by
  `credential_id`, not `(user, provider)`, so multiple accounts' imported
  items were already naturally separated.
- `buildAuthUrl` for both providers now forces `prompt=select_account`
  (Google: `select_account consent`) so reconnecting doesn't silently reuse
  whatever account has an active browser session — the user gets an account
  chooser every time, needed both to add a *different* account and to switch
  which one a stale "Connect" click lands on.
- The Google Picker's own account choice is **not cross-checked** against the
  `credentialId` the user clicked "Selecionar e importar" on. If they pick the
  wrong Google account in that popup, the import call still succeeds against
  the clicked card's stored connection, but `describeSelectedFile`/`fetchContent`
  will fail (wrong account can't see the picked file). Acceptable for now —
  revisit only if this trips people up in practice.

## Connections UI lives in a global sidebar modal, not the Notes vault panel

Originally `ExternalSourcesPanel` was embedded inline in `VaultPanel`'s ~224px
list column — cramped, and every button wrapped. It's been replaced by
`NotesConnectorsModal`, opened from a "Connections" button in
`SidebarDesktop.tsx` (same place/pattern as the existing "My Allerac" button:
a fixed action button under the collapse toggle, rendered from
`ChatClient.tsx` — the shared, multi-domain client that now backs the Notes
page instead of a bespoke `NotesClient.tsx`). The button only shows when
`showNotes` is true.

The modal lists every connected account per provider as its own card
(status line, action buttons, per-card conflict access), plus a
"+ Conectar outra conta" action per provider. `ChatClient.tsx` auto-opens it
when it sees `?connector=google_drive|onenote` from either OAuth redirect,
and passes `onImported` through to the same `vaultRefresh` counter the chat's
`save_note`/`update_note`/`delete_note` tool-call handling already bumps —
`VaultPanel` didn't need any new prop for this.

`ConnectorConflictModal` (provider-agnostic) and `OneNoteSelectionModal` were
extracted as shared/standalone components during this move rather than
duplicated per provider inside the connections modal.

Mobile has no equivalent entry point yet — `SidebarMobile.tsx` was not wired
up. Revisit if mobile use of the connectors turns out to matter.

## API surface

Following the actual Strava precedent (`src/app/api/strava/*` + `src/app/actions/strava.ts`), not the versioned `/api/v1` Control API: OAuth's browser redirect dance is the only part that needs real HTTP routes (cookies + redirects aren't expressible as a server action); everything else is a `'use server'` action called directly by `NotesConnectorsModal`, per the top-level rule that "all data mutations go through `actions/` files."

```text
GET  /api/notes-connectors/{provider}/connect     -- start OAuth (redirects to provider)
GET  /api/notes-connectors/{provider}/callback    -- OAuth callback (redirects back to /notes)
```

```ts
// src/app/actions/notes-connectors.ts — Google Drive
listGoogleDriveConnections()                                              // one row per connected account
importGoogleDriveSelection(credentialId, files: { id, name }[], accessToken) // Picker result -> fetch + normalize + upsert
resyncGoogleDrive(credentialId)
listGoogleDriveConflicts(credentialId)
resolveGoogleDriveConflict(credentialId, externalId, resolution)
disconnectGoogleDrive(credentialId)

// OneNote — same shape, plus getOneNoteItems for the checkbox tree (no
// Google-Picker equivalent since drive.file selection is client-side there)
listOneNoteConnections()
getOneNoteItems(credentialId)
importOneNoteSelection(credentialId, items: NotesConnectorItem[])
resyncOneNote(credentialId)
listOneNoteConflicts(credentialId)
resolveOneNoteConflict(credentialId, externalId, resolution)
disconnectOneNote(credentialId)
```

**The Picker's OAuth token is minted live in the browser, not reused from the
server connection.** Originally this project had a `getGoogleDrivePickerToken`
action returning the server-stored access token to the client for the Picker.
That does not work: confirmed against the live API while debugging Phase 2,
Google only registers a picked file's per-file `drive.file` grant when the
token passed to the Picker came from a live, in-browser Google Identity
Services flow (`google.accounts.oauth2.initTokenClient(...).requestAccessToken()`).
A token obtained via the server's stored refresh token lets the Picker browse
and search Drive fine (plain reads), but every subsequent `files.get` on a
"picked" file 404s — reproduced with a brand-new, owned, never-shared Google
Doc, so it is not about file age, sharing, or resource keys. `getGoogleDrivePickerToken`
was removed; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (client IDs are not secret) plus
the `https://accounts.google.com/gsi/client` script are what the Picker flow
actually needs now. The server-side connection (authorization-code exchange,
stored refresh token) remains required for persistent "connected" status and
for `resyncGoogleDrive`, which runs without the browser open.

## Assistant access

No new tools needed at first — imported notes are regular `user_notes` and
already fully covered by `query_vault` / `list_notes` / etc. The only assistant
surface worth considering later is a conversational trigger ("importa minhas
notas do OneNote") that calls the same import endpoint — deferred until the UI
flow above is proven.

The assistant must never receive connector OAuth tokens in its context, and
must not silently resolve conflicts on the user's behalf.

## Privacy, deletion, and compliance

- Request the minimum scope for the experience (`Notes.Read`, `drive.file`).
- Keep all connector data user-scoped at every storage/query layer.
- On disconnect, discard tokens immediately; imported notes remain unless the
  user explicitly deletes them.
- Offer explicit "delete all notes imported from this connector" as a distinct
  action from disconnect.
- Do not log document/page content or tokens.

## Delivery phases

### Phase 1 — Generic connector foundation
1. `notes_connector_credentials` + `notes_connector_items` migrations
   (including the conflict-tracking columns from day one).
2. `NotesConnector` interface + import/resync job runner (agent-worker).
3. Encrypted token storage, OAuth state/callback scaffolding shared by both
   providers, env var wiring (`ONENOTE_*`, `GOOGLE_*`).

### Phase 2 — Google Drive connector ✅ verified end-to-end locally
1. OAuth connect/callback/disconnect with `drive.file` scope —
   `src/app/api/notes-connectors/google_drive/{connect,callback}/route.ts`,
   `GoogleDriveConnectorService`.
2. Google Picker integration on the client; `fetchContent` /
   `normalizeToMarkdown` for Drive on the server — `ExternalSourcesPanel.tsx`,
   `GoogleDriveConnectorService.fetchContent`.
3. Import UI (connect button, Picker trigger, progress, resync, disconnect,
   conflict resolution) inside `VaultPanel` — `ExternalSourcesPanel.tsx`.

Requires the Google Cloud setup in "Getting the OAuth app/Picker combination
actually working" above (Web application client, `drive.file` declared on
the consent screen's Data Access page, matching JavaScript origin/redirect
URI) plus `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`, and the
`132_notes_connectors.sql` migration applied. Connect → select → import
confirmed working against a real account; `resyncGoogleDrive` and the
conflict-resolution UI are implemented but not yet exercised against real
drift (a note edited locally + the source file changed).

### Phase 3 — OneNote connector
1. OAuth connect/callback/disconnect against Microsoft Graph.
2. Selection-tree endpoint + checkbox UI (notebook → section → page).
3. `fetchContent` / `normalizeToMarkdown` (HTML → markdown) for OneNote.
4. Reuse the Phase 2 import job/progress UI (provider-parameterized, not
   rebuilt).

**PDF text extraction ✅** — done ahead of Phase 3, for Google Drive only.
`extractPdfText` (`src/app/services/rag/pdf-text.ts`) was pulled out of
`DocumentService`'s existing `pdf-parse`-based extraction (previously private,
used only for manual document upload/RAG) into a shared function, then wired
into `GoogleDriveConnectorService.fetchContent` and added to the Picker's
`PICKER_MIME_TYPES`. Text-based PDFs only — scanned/image PDFs need OCR,
not attempted. Manual "paste a PDF directly into the Notes vault" (the
original open question on `docs/domains/notes.md`) is a separate, still-open
UI feature (a file input in `VaultPanel` calling this same helper) — the
extraction work it needed is now done, just not wired to that UI.

### Phase 4 — Re-sync and conflict handling
1. `resync` endpoint and job using the hash-comparison algorithm above.
2. Conflict UI: provider badge → "source updated" state, with **Manter minha
   versão** / **Usar versão da fonte** actions.
3. "Delete all notes from this connector" action.
4. Auto-tagging by notebook/section/folder name; provider badges and
   source links on `NoteRow`.

## Definition of done

- A user can connect and disconnect OneNote/Google Drive with read-only,
  least-privilege OAuth (`Notes.Read`, `drive.file`).
- Nothing is imported without an explicit item selection by the user.
- Import brings selected items in as searchable, embedded `user_notes`, tagged
  with the source and originating notebook/section/folder.
- Re-running sync does not duplicate unchanged notes, and never silently
  overwrites a note the user edited locally — conflicts are always surfaced
  and resolved explicitly.
- Disconnecting stops all provider access without deleting local notes.
- No token, page, or file content ever appears in logs or assistant context.
- Adding a third provider requires implementing `NotesConnector` (and, if it
  needs one, a selection-tree endpoint) only — no changes to the import/resync
  job, schema, or the surrounding UI shell.
