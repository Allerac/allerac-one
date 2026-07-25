# Control API v1 Duplication Audit - 2026-07-25

> Snapshot: this audit records service-boundary status across Server Actions
> (`src/app/actions/*.ts`) and Control API v1 routes (`src/app/api/v1/*`) as of
> 2026-07-25. See [Control API v1 Roadmap](control-api-v1.md) for the current
> implemented surface and
> [Control API v1 Gap Audit — 2026-06-29](control-api-v1-gap-audit-2026-06-29.md)
> for the earlier contract-coverage audit (a different question: this audit is
> about *duplication*, not *coverage*).
>
> **Update, same day:** all three findings below (Health, Finance, Domains)
> were fixed. 13 of 13 domains with both a Server Action and a `/api/v1` route
> now share a single service/query module. See "Resolution" at the end of each
> section.

## Why this exists

Both `docs/roadmap/control-api-v1.md` ("Working Invariants") and
`docs/architecture/control-api-v1.md` ("Non-Goals") already state the rule:

> Route handlers should not duplicate service logic. / Do not duplicate
> business logic inside route handlers.

That rule was not being consistently followed. It surfaced while building the
Music domain (`src/app/actions/music.ts` + `src/app/api/v1/music/*`): the
recommendations/top-tracks/recently-played SQL was copy-pasted between the
Server Action and the Route Handler, because **Server Actions cannot be called
from a Route Handler** — they resolve the user through `requireCurrentUser()`
(session cookie only), while `/api/v1` routes must also accept a Bearer API
key via `requireApiUser()`. There's no way for a route handler to just "call"
a `'use server'` function and get API-key auth for free, so whoever wrote the
second call path re-typed the query instead of extracting a shared function.

The fix applied to Music: extract the query into a plain service
(`src/app/services/spotify/spotify-query.service.ts`) with no framework
dependency, and have both the Server Action and the Route Handler call it.

This audit checks whether the same problem exists elsewhere.

## Method

For every domain with both a `src/app/actions/*.ts` file and a matching
`src/app/api/v1/*` route tree, checked whether both call into the same
service class/module (**CLEAN**) or each contain their own copy of the
query/logic (**DUPLICATED**). Domains with only one of the two surfaces are
**N/A** — nothing to deduplicate.

## Results

| Domain | Server Action | v1 API | Status | Shared service / evidence |
|---|---|---|---|---|
| Tickets | `actions/tickets.ts` | `api/v1/tickets/*` | CLEAN | `TicketService` |
| Notes | `actions/notes.ts` | `api/v1/notes/*` | CLEAN | `notesService` |
| Documents | `actions/documents.ts` | `api/v1/documents/*` | CLEAN | `docService` |
| Memory | `actions/memory.ts` | `api/v1/memories/*`, `conversations/:id/memory` | CLEAN | `ConversationMemoryService` (`saveCorrectionMemory`'s own raw SQL has no v1 equivalent — N/A, not a duplicate) |
| Scheduled Jobs | `actions/scheduled-jobs.ts` | `api/v1/jobs/*` | CLEAN | `scheduledJobsService` |
| Skills | `actions/skills.ts` | `api/v1/skills/*` | CLEAN | `skillsService` |
| Chat / Conversations | `actions/chat.ts` | `api/v1/conversations/*` | CLEAN | `ChatService` |
| Benchmark | `actions/benchmark.ts` | `api/v1/benchmark/*` | CLEAN | `benchmark-query.service.ts` — **the exact pattern just built for Music**, proving this is an established (if inconsistently applied) convention |
| Email | `actions/email.ts` (accounts only) | `api/v1/email/*` (messages/send only) | CLEAN / N/A | Message read/send: legacy `/api/email/messages` and v1 both call `ImapService`. Account CRUD has no v1 counterpart |
| API Keys | `actions/api-keys.ts` (`validateApiKey` only) | `api/v1/api-keys/*` | N/A | `ControlApiAccessTab.tsx` calls `/api/v1/api-keys` directly via `fetch`, bypassing Server Actions — no duplicate exists |
| Music | `actions/music.ts` | `api/v1/music/*` | **FIXED 2026-07-25** | `spotify-query.service.ts` |
| Health | `actions/health.ts` | `api/v1/health/*` | **FIXED 2026-07-25** | `health-query.service.ts` |
| Finance | `actions/finance.ts` (watchlist only) | `api/v1/finance/*` | **FIXED 2026-07-25** | `watchlist-query.service.ts` |
| Domains | `actions/domains.ts` | `api/v1/domains/route.ts` | **FIXED 2026-07-25** | now calls `domainService.listAccessible()` directly, no new service needed |

`admin.ts`, `backup.ts`, `system.ts` have no `/api/v1` equivalent at all —
excluded, no duplication risk.

**Bottom line: duplication is not systemic, and is now fully resolved.** All
13 domains with both surfaces share a real service/query module. Original
finding stands as a record of what was wrong and why — see below for the
verified evidence and the fixes applied.

## Duplicated spots (verified)

### Health — 3 queries, all confirmed byte-for-byte identical

- `actions/health.ts:336-357` (`getHealthSummary`) vs
  `api/v1/health/summary/route.ts:22-36` — identical
  `SELECT ROUND(AVG(steps))... FROM health_daily_metrics WHERE user_id = $1 AND date >= $2`
  and an identically-shaped `{ day: 1, '3days': 3, week: 7, month: 30, year: 365 }`
  period map, defined separately in each file.
- `actions/health.ts:40-59` (`getGarminStatus`) vs
  `api/v1/health/status/route.ts:9-12` — identical
  `SELECT is_connected, mfa_pending, last_sync_at, last_error, sync_enabled FROM garmin_credentials WHERE user_id = $1`.
- `actions/health.ts:364-370` (`getDailySnapshotForUser`) vs
  `api/v1/health/daily/route.ts:19-21` — identical
  `SELECT * FROM health_daily_metrics WHERE user_id = $1 AND date = $2`.

The daily case has an extra wrinkle worth calling out: the Server Action's
`getDailyHealth` (`actions/health.ts:404-431`) wraps that cached read with a
live-fetch-and-cache-fill fallback to the Garmin worker when there's no
cached row. The v1 route has no such fallback — it returns `null` for a date
that hasn't synced yet, even though the UI path would have gone and fetched
it. This is a **behavioral gap**, not just duplicated SQL: extracting a
shared query function fixes the copy-paste, but the live-fetch fallback
decision (should `/api/v1/health/daily` trigger a live Garmin call on a
cache miss?) needs an explicit answer, not just deduplication.

**Resolution (2026-07-25):** extracted `src/app/services/health/health-query.service.ts`
(`queryGarminStatus`, `queryHealthSummary`, `queryDailyMetricsSnapshot`),
used by `actions/health.ts` and all three `api/v1/health/*` routes. The
live-fetch-fallback question was answered explicitly rather than silently
resolved either way: `/api/v1/health/daily` stays cache-only (documented
inline in the service and the route) — a GET request should not have the
side effect of calling out to the Garmin worker and writing to the DB. Any
client that needs a guaranteed-fresh day should call `POST /api/v1/music/sync`-style
sync endpoint (not yet built for health) rather than relying on a read
endpoint to trigger a sync.

### Finance — watchlist duplicated, quotes/candles have a third, unrelated implementation

- `actions/finance.ts:16-19` (`getWatchlist`) vs
  `api/v1/finance/watchlist/route.ts:13-16` — identical
  `SELECT symbol FROM user_watchlist WHERE user_id = $1 ORDER BY added_at ASC`.
- Quotes/candles are *not* duplicated the same way — `api/v1/finance/quote`
  and `api/v1/finance/candles` already go through `MarketDataService`. But
  `StockPanel.tsx` (the UI) doesn't call a Server Action for quotes at all —
  there isn't one — it calls the legacy `/api/finance/quote` route directly,
  which hits `query1.finance.yahoo.com` with its own independent fetch/parse
  logic, completely separate from `MarketDataService`. That's a **third**
  implementation of "get a stock quote" in the codebase, not covered by this
  audit's CLEAN/DUPLICATED framing since there's no Server Action in the
  comparison — flagging it here because it's the same underlying disease
  (no single source of truth for one piece of business logic).

**Resolution (2026-07-25):** extracted `src/app/services/finance/watchlist-query.service.ts`
(`queryWatchlist`, `addWatchlistSymbol`, `removeWatchlistSymbol`), used by
`actions/finance.ts` and both `api/v1/finance/watchlist*` routes. The
`StockPanel.tsx` / `MarketDataService` / legacy-Yahoo-route split is **not**
fixed — left as a separate, explicitly-tracked follow-up (see "Still open"
below) since it's a product decision (which quote source should the UI use)
rather than a mechanical extraction.

### Domains — one query reimplements what a service already does

- `actions/domains.ts:10-28` (`getUserAccessibleDomains`) hand-rolls the
  admin-bypass + `user_domain_access` join with its own raw SQL.
- `api/v1/domains/route.ts:8` calls `domainService.listAccessible({ userId, isAdmin })`,
  which already encapsulates that exact access logic (and additionally joins
  skill defaults, which the action's version doesn't return).

This is the cheapest fix in the audit: the action doesn't need a new shared
service, it just needs to call `domainService.listAccessible()` instead of
re-deriving the same access rule by hand.

**Resolution (2026-07-25):** `actions/domains.ts`'s `getUserAccessibleDomains`
now calls `domainService.listAccessible({ userId, isAdmin })` directly and
maps `.slug`, matching what `api/v1/domains/route.ts` already did. No new
service file — this really was a one-function fix. As a side effect, the
action's admin listing now also respects `sort_order` (it previously ordered
by `created_at` only), matching v1's ordering.

## Fixes applied (2026-07-25)

Same shape as the Music fix in every case — extract a plain function/service,
have both callers use it. All three landed the same day as this audit:

1. **Domains** — `actions/domains.ts` now calls the existing
   `domainService.listAccessible()`. No new service file.
2. **Health** — new `src/app/services/health/health-query.service.ts`, used
   by `actions/health.ts` and the three `api/v1/health/*` routes. The
   live-fetch-fallback question for `/api/v1/health/daily` was answered
   explicitly (stays cache-only; see the Health section above).
3. **Finance** — new `src/app/services/finance/watchlist-query.service.ts`,
   used by `actions/finance.ts` and both `api/v1/finance/watchlist*` routes.

None of these required database migrations, endpoint contract changes, or
UI behavior changes — they were internal refactors matching a pattern the
codebase already used successfully in 10 other domains. Verified with a full
`tsc --noEmit` pass (no new errors beyond the pre-existing, unrelated
baseline) before rebuilding the `app` container.

## Still open (not fixed by this pass, tracked separately)

- **`StockPanel.tsx`'s standalone Yahoo-backed quote path.** The UI calls the
  legacy `/api/finance/quote` route (direct Yahoo Finance fetch/parse),
  bypassing both the (nonexistent) Server Action and `MarketDataService`,
  which `api/v1/finance/quote` already uses. This is a **product** decision
  (should the UI move to `MarketDataService`-backed quotes, requiring a new
  Server Action?) rather than a mechanical extraction, so it wasn't folded
  into this pass. Revisit if Finance data quality/consistency becomes a
  complaint, or when someone next touches `StockPanel.tsx`.

## What this means for "Phase 6: UI Migration Candidates"

`docs/roadmap/control-api-v1.md` Phase 6 currently frames the deduplication
problem as *"migrate the UI to call `/api/v1/*` instead of Server Actions."*
This audit suggests that's the wrong direction for solving duplication
specifically:

- Migrating the UI to call `/api/v1` over HTTP replaces a code-duplication
  problem with a runtime-inefficiency problem — the UI would make an HTTP
  round-trip within the same container, to the same process, for something a
  Server Action already does in-process. It doesn't reduce the number of
  places business logic lives; it just moves the UI's call site.
- What actually removes the duplication — proven by Tickets, Notes,
  Documents, Memory, Jobs, Skills, Chat, Benchmark, and now Music — is a
  **shared plain service** that both the Server Action and the Route Handler
  call. The UI keeps using fast, in-process Server Actions; `/api/v1` keeps
  serving external API-key clients; neither has to duplicate the other's
  logic.

Suggested reframe: keep Phase 6's goal (stop the duplication) but change the
mechanism from "UI becomes an API client of itself" to "extract the three
remaining domains (Health, Finance, Domains) into shared services," which is
just finishing a pattern already applied everywhere else. This is a smaller,
lower-risk change than a UI migration, and it's consistent with the
already-written invariant in both the roadmap and the architecture doc.

## Recommended next work

1. ~~Apply the Domains fix.~~ Done 2026-07-25.
2. ~~Extract `health-query.service.ts` for the three Health duplicates;
   resolve the daily live-fetch-fallback question explicitly.~~ Done
   2026-07-25.
3. ~~Extract the Finance watchlist query.~~ Done 2026-07-25. The separate,
   non-urgent `StockPanel.tsx` quote-source discussion remains open — see
   "Still open" above.
4. ~~Update `docs/roadmap/control-api-v1.md` Phase 6~~ Done 2026-07-25 — Phase
   6 now reads "Shared Service Extraction" and records all four domains
   (Music, Health, Finance, Domains) as complete.
