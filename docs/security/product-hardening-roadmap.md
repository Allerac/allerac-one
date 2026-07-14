# Allerac One Product Hardening Roadmap

This document describes the security and reliability work required before Allerac One should be treated as a production-ready product for real users.

The goal is not to slow feature development. The goal is to make the product safe enough that new features can be added without repeatedly reopening the same classes of risk.

## Current Status (June 9, 2026)

### Priority 1: Security Boundaries - Complete

Completed or substantially implemented:

- Shared session helpers exist in `src/app/lib/auth-session.ts`.
- Conversation/message ownership checks were added to chat actions and services.
- Ownership checks were added for documents, notes, jobs, tickets, email accounts, memories, and agent runs.
- Health and Instagram actions now derive the effective user from the session.
- RAG, benchmark, domain, setup preference, login redirect, and system dashboard actions now derive identity and privileges from the session.
- Domain access checks were added to major chat, document, memory, and user-instruction flows.
- All operational API routes now require a session, an admin session, a verified webhook signature, or an explicit internal Bearer secret.
- Benchmark, finance, Instagram, search, skill evaluation, logs, chat support, Ollama pull, and the Ollama chat proxy now use shared authentication helpers.
- Finance, search, Instagram, chat, image editing, and Clippy enforce domain access where applicable.
- System logs, model downloads, skill evaluation/mutation, backups, updates, pricing, and aggregate metrics are admin-only.
- Shell working directories, file edit paths, and codebase reads are bounded to the user's workspace.
- Workspace shell arguments are quoted, and codebase reads reject real-path/symlink escapes.
- Workspace file, tree, project, process, delete, and command APIs use shared authentication and strict path boundaries.
- Chat validates provider/model/domain identifiers and payload limits before opening the stream, and preselected skills must be visible to the current user.
- Instagram DM routes use the account assigned to the current user instead of assuming the user's own credential row.
- Central log submission requires either an admin session or the internal
  `EXECUTOR_SECRET` (tightened from any user session on 2026-07-14 — the buffer feeds
  the admin-only /logs monitor, so regular sessions must not inject lines into it).
- The `read_logs` AI tool is admin-only in both chat and agent runs (2026-07-14): the
  log buffer aggregates every user's activity in the process, so non-admin users get
  a denial result and the tool is filtered from non-admin agent-run tool definitions.
- Instagram webhook requests require an HMAC signature.
- System settings reject unknown keys and oversized values.
- Expensive chat, benchmark, image-editing, and model-download operations now have request-rate and active-concurrency limits.
- Chat, benchmark, and image-edit limits are isolated per user; model downloads use a global limit across administrators.
- Streaming operation leases are released in `finally` blocks, and HTTP limit rejections return `429` with `Retry-After` metadata.
- The limiter matches the current single-app-instance deployment. Before horizontal scaling, move its counters to a shared PostgreSQL or Redis backend as described in [`distributed-rate-limiting.md`](./distributed-rate-limiting.md).
- Cross-user and authorization regression tests exist for major services, actions, workspace routes, admin-only actions, skill mutation, logs, and Ollama proxy access.
- Cross-user action tests now cover documents and scheduled jobs, including session-derived ownership and restricted-domain rejection before service access.
- Administrative route tests verify non-admin rejection, and domain tests verify that client-supplied identities and admin flags are ignored.
- Ordinary client-facing server actions no longer accept legacy `userId` parameters. Explicit user selectors remain only in admin actions protected by `requireCurrentAdmin`.
- API routes use the shared `authenticationErrorResponse` mapper for JSON and text `401/403` responses. Instagram OAuth routes retain explicit redirects for authentication failures.
- The current automated baseline is 42 Jest suites / 356 tests, plus the disposable PostgreSQL schema-equivalence smoke test, `tsc --noEmit`, and production build validation.

### Priority 2: Split the Chat Route - Complete

- `src/app/api/chat/route.ts` was reduced from approximately 806 lines to approximately 303 lines.
- Request validation, runtime/provider context, image processing, prompt construction, skill resolution, tool allowlisting, tool execution, LLM orchestration, and SSE writing now live in focused modules under `src/app/services/chat`.
- The route is limited to HTTP authentication/authorization, stream creation, conversation orchestration, context loading, and persistence.
- Focused Jest coverage exists for request parsing, provider key validation, prompt composition, skill activation, tool allowlisting, workspace rejection, tool loops, image fallback, and SSE behavior.

### Priority 3: Install and Upgrade Strictness - Complete

Completed or substantially implemented:

- Migrations run in sorted order and are tracked in the `_migrations` table.
- Duplicate migration numbers were resolved, and the runner rejects future duplicates.
- Each migration and its tracking record run atomically with `ON_ERROR_STOP`.
- Failed migrations stop deployment without recording a partial success.
- Docker health dependencies prevent the app from starting before migrations and core services succeed.
- Install and update scripts perform basic dependency and deployment checks.
- Updates create and validate a local database backup before pulling code or running migrations.
- `allerac restore` validates the archive and dump content, creates a pre-restore safety backup, resets the target schema, and imports with `ON_ERROR_STOP`.
- Migration, update ordering, and restore safety invariants have automated regression coverage.
- A disposable PostgreSQL smoke test verifies semantic schema equivalence between fresh installs and upgrades from the former duplicate `020/021` migration history.
- Node.js startup now validates the database URL, executor endpoint, encryption keys, and executor secret before starting background services.
- The Telegram token service no longer falls back to a public default encryption key.
- Update failures preserve the previous Git revision and exact backup path, then print phase-specific rollback commands for migration, build, restart, and health-check failures.
- Deployment verification waits for the app's HTTP healthcheck instead of accepting a merely running container.

## Priorities

1. Enforce security boundaries everywhere.
2. Split the chat route into testable units.
3. Make migrations, installation, and upgrades stricter.

## 1. Security Boundaries

### Principle

Every server action and API route must derive the authenticated user from the current session.

The server must never trust:

- `userId` supplied by the client
- `conversationId` without checking ownership
- `documentId`, `noteId`, `jobId`, `ticketId`, or `accountId` without checking ownership
- `domainSlug` without checking domain access
- shell `cwd` or file paths without enforcing the user's workspace root

Client-provided IDs are selectors only. They are not authorization.

### Required Pattern

Every protected operation should follow this shape:

```typescript
const user = await requireCurrentUser();
const resource = await loadResource(resourceId);

if (!resource || resource.user_id !== user.id) {
  return unauthorizedOrNotFound();
}

// perform operation
```

For domain-specific pages or actions:

```typescript
const user = await requireDomainAccess(domainSlug);
```

For admin-only actions:

```typescript
const user = await requireAdmin();
```

### Server Action Requirements

Server actions should not accept `userId` unless the action is explicitly admin-only and validates admin access first.

Current risky shape:

```typescript
export async function loadConversations(userId: string) {
  return chatService.loadConversations(userId);
}
```

Preferred shape:

```typescript
export async function loadConversations(domainSlug?: string | null) {
  const user = await requireCurrentUser();
  if (domainSlug) await assertDomainAccess(user, domainSlug);
  return chatService.loadConversations(user.id, domainSlug);
}
```

### Resource Ownership Checks

Every mutation and read of user-owned data must include an ownership check.

Required coverage:

| Resource | Required check |
|---|---|
| Conversations | `chat_conversations.user_id = current_user.id` |
| Messages | conversation belongs to current user |
| Documents | `documents.uploaded_by = current_user.id` |
| Document chunks | parent document belongs to current user |
| Memories | `conversation_summaries.user_id = current_user.id` |
| Notes | `notes.user_id = current_user.id` |
| Scheduled jobs | `scheduled_jobs.user_id = current_user.id` |
| Tickets | `tickets.user_id = current_user.id` |
| Email accounts/messages | account belongs to current user |
| Instagram credentials | credential row belongs to current user |
| Garmin credentials/data | credential/data row belongs to current user |
| Agent runs/workers | run belongs to current user |
| Workspace projects | path is under `/workspace/projects/{user.id}` |

### API Route Requirements

All API routes should use a shared helper instead of manually reading cookies in each file.

Recommended helpers:

- `requireCurrentUser()`
- `requireCurrentAdmin()`
- `requireResourceOwner(table, id, userId)`
- `assertConversationOwner(conversationId, userId)`
- `assertDomainAccess(user, domainSlug)`
- `resolveUserWorkspacePath(userId, requestedPath)`

These helpers should return typed results and should centralize the response behavior for unauthorized access.

### Shell and Workspace Boundaries

Shell execution is one of the highest-risk capabilities in the product.

Required rules:

- Shell tools must always execute inside the user's workspace root.
- The route or tool runner must reject `cwd` outside `/workspace/projects/{user.id}`.
- File edit proposals must reject paths outside `/workspace/projects/{user.id}`.
- Path checks must use `path.resolve` and must require either exact root match or `root + '/'` prefix.
- The model must not be allowed to choose arbitrary host paths.
- The executor service should still sandbox, but the app must enforce its own boundary first.

Unsafe:

```typescript
shellTool.execute(command, cwd, timeout);
```

Safer:

```typescript
const safeCwd = resolveUserWorkspacePath(user.id, cwd);
if (!safeCwd) return forbidden();
shellTool.execute(command, safeCwd, timeout);
```

### Authorization Test Matrix

Add tests for cross-user access attempts.

Minimum test cases:

- User A cannot load User B's conversation messages.
- User A cannot delete, pin, or rename User B's conversation.
- User A cannot upload/delete/read User B's document.
- User A cannot read or mutate User B's notes.
- User A cannot list or mutate User B's jobs.
- User A cannot list or mutate User B's tickets.
- User A cannot access User B's email account.
- User A cannot access User B's agent run.
- User A cannot execute shell commands outside their workspace.
- Non-admin users cannot access admin APIs.
- Non-domain users cannot access restricted domain pages or domain actions.

### Acceptance Criteria

This priority is complete when:

- No client-facing server action accepts a raw `userId` for ordinary user operations.
- Every API route derives the user from the session.
- Every read/mutation of user-owned data checks ownership.
- Shell and file paths are bounded server-side.
- Cross-user authorization tests exist for the major resource types.

## 2. Split the Chat Route Into Testable Units

### Problem

The chat route currently owns too many responsibilities:

- request parsing
- authentication
- image upload
- user/system settings lookup
- prompt construction
- domain instruction injection
- memory lookup
- RAG lookup
- skill activation
- tool selection
- tool execution
- provider setup
- SSE keepalive handling
- final streaming
- message persistence
- skill usage tracking

This makes the most important product path hard to test and easy to break.

### Target Structure

Keep `/api/chat` as the HTTP/SSE adapter only.

Move business logic into testable modules:

| Module | Responsibility |
|---|---|
| `ChatRequestParser` | Validate request body and normalize optional fields |
| `ChatAuthContext` | Resolve current user, locale, settings, provider keys |
| `PromptBuilder` | Build final system prompt from soul, user context, domain instructions, memory, RAG, skill |
| `SkillResolver` | Resolve preselected/default/auto-detected skill |
| `ToolRegistry` | Resolve tools allowed for active skill and domain |
| `ToolRunner` | Execute one tool call with authorization and resource boundaries |
| `ChatPipeline` | Coordinate first model call, tool loop, final stream, persistence |
| `SseWriter` | Encode events, keepalive, safe close/error behavior |

### Design Goal

The route handler should become easy to read:

```typescript
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseChatRequest(request);
  const context = await buildChatContext(request, parsed);

  return streamSse(async writer => {
    await chatPipeline.run(parsed, context, writer);
  });
}
```

### Testing Strategy

Add focused unit tests for:

- prompt construction
- domain instruction precedence
- memory/RAG injection behavior
- skill selection and manual lock behavior
- tool allowlist resolution
- shell/file path rejection
- provider key validation
- SSE event encoding

Add integration tests for:

- new conversation creation
- existing conversation ownership check
- tool call loop
- failed tool call handling
- assistant message persistence

### Acceptance Criteria

This priority is complete when:

- `/api/chat/route.ts` is mostly HTTP/SSE orchestration.
- Prompt building can be tested without starting Next.js.
- Tool execution can be tested without an LLM call.
- Authorization checks for tool execution are centralized.
- Chat pipeline regressions can be caught by Jest tests.

## 3. Migration, Installation, and Upgrade Strictness

### Problem

A self-hosted product is only as good as its install and upgrade path.

For Allerac One, users will often run it on personal hardware. They may not know PostgreSQL, Docker, migrations, Ollama models, or how to recover from a failed upgrade. The product must make these paths boring and predictable.

### Migration Requirements

Required improvements:

- Ensure migrations run in a deterministic order.
- Avoid duplicate/confusing migration numbering.
- Track applied migrations in a database table.
- Fail fast when a migration fails.
- Make migrations idempotent where practical.
- Validate that a fresh install and an upgraded install produce the same schema.
- Add a schema smoke test in CI or local test scripts.

Recommended migration table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Fresh Install Requirements

The install process should verify:

- Docker is available.
- Docker Compose is available.
- Required ports are free.
- `.env` exists and required secrets are generated.
- PostgreSQL starts successfully.
- pgvector extension is available.
- migrations finish successfully.
- Ollama is reachable or intentionally disabled.
- selected default model is installed or queued for download.
- web app returns a healthy response.

### Upgrade Requirements

The update process should:

- create a database backup before migrations
- stop only the services that need to be stopped
- run migrations before exposing the new app
- verify the app health after restart
- print clear rollback instructions when something fails
- never destroy user data

### Backup and Restore Requirements

Before public beta, backup/restore should be treated as a core feature, not a nice-to-have.

Required:

- one command to create a backup
- one command to restore a backup
- clear backup location
- restore test documented
- backup includes enough data to recover conversations, memories, documents, settings, and user-owned records

### Configuration Requirements

Secrets and environment values should be validated at startup.

Examples:

- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `EXECUTOR_URL`
- `EXECUTOR_SECRET`
- `OLLAMA_BASE_URL`
- optional provider keys
- public app URL

Invalid critical config should produce a clear startup error instead of failing later inside a user flow.

### Acceptance Criteria

This priority is complete when:

- A fresh install can be tested end-to-end from an empty machine/container.
- An upgrade creates a backup before touching schema.
- Migration failure leaves the user with a clear recovery path.
- Schema state is tracked.
- Critical environment variables are validated.
- Backup/restore has been tested against real app data.

## Suggested Implementation Order

1. Add shared auth helpers.
2. Convert chat/conversation actions to derive user from session.
3. Add ownership checks for conversations and messages.
4. Add ownership checks for documents, notes, jobs, tickets, email, health, Instagram, and agent runs.
5. Harden shell and workspace path handling.
6. Add authorization regression tests.
7. Split `/api/chat/route.ts` into prompt, tools, skill, and pipeline modules.
8. Add tests around the extracted chat modules.
9. Normalize migration ordering and tracking.
10. Harden install/update/backup scripts.

## Product Readiness Signal

Allerac One is ready for a broader beta when a real user can:

- install it without help
- create an account
- use chat, memory, documents, and tools safely
- upgrade without losing data
- restore from a backup
- trust that another user cannot access their data
- understand errors when external services are missing

Security and reliability should become part of the product experience, not just internal engineering concerns.
