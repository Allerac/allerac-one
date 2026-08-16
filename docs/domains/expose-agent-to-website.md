# How to expose an Allerac agent on an external website

This documents the pattern used for the `sales` domain: a **public-facing** agent, embedded as a
chat widget on `allerac-web` (allerac.ai), talking to a real Allerac One agent instead of a canned
form. This is meant to be repeated for future customer-facing agents — read this before starting
the next one.

This is a specialization of the normal [add-domain.md](./add-domain.md) process, with extra steps
because the caller is an **anonymous website visitor**, not a logged-in Allerac user.

## Concept

```
Visitor (browser)
   |  POST /api/sales-chat
   v
allerac-web — Cloudflare Worker (src/worker.ts)
   - rate limit per IP (Workers KV)
   - injects Authorization: Bearer <bot key>   (secret, never reaches the browser)
   |  POST https://<allerac-one host>/api/v1/conversations
   |  POST https://<allerac-one host>/api/v1/conversations/:id/messages
   v
allerac-one — Control API v1
   - dedicated, non-admin "bot" user account
   - restricted domain (chat only, no personal tools)
   - domain-scoped model setting (no client-supplied model/provider needed)
```

The core security idea: **the isolation boundary is the account, not just the domain.** A scoped
API key is only as safe as the account it belongs to — see "The admin bypass trap" below.

## Checklist

### allerac-one side
- [ ] 1. Create the domain + skill (prefer `skills/<name>.md` + `domain:` frontmatter — see note below)
- [ ] 2. Restrict tools for this domain in `chat-tool-registry.ts` (deny-by-default, not just "don't add new tools")
- [ ] 3. Create a dedicated, **non-admin** service account for the bot (never reuse your own admin account)
- [ ] 4. Grant that account access to the new domain only
- [ ] 5. Add a self-service screen at `/<name>` (copy `src/app/sales/`) so the bot account can mint its own key without needing the full Settings UI
- [ ] 6. Add the scope(s) that screen needs to `DEFAULT_DOMAIN_USERS_SCOPES` (`src/app/api/v1/api-keys/_lib.ts`)
- [ ] 7. Register the domain's icon/path in `allerac-domains.ts` (hub nav) and `DomainSkillsModal.tsx` (admin config UI)
- [ ] 8. Configure the domain's model (`user_domain_model_settings`) for the bot account — either via the `/<name>` model picker or SQL (see below); the Control API's `model`/`provider` are only optional if this is set
- [ ] 9. Log in as the bot account, generate its key from `/<name>`

### allerac-web side
- [ ] 10. Add a Worker route (`src/worker.ts`) that proxies to the new domain's conversation endpoints, rate-limited per IP
- [ ] 11. Add the widget UI component + wire it into the page
- [ ] 12. Configure `wrangler.toml`: `name` must match the **real** deployed Worker name (check the Cloudflare dashboard — don't assume), `ALLERAC_ONE_BASE_URL`, KV namespace id
- [ ] 13. `wrangler secret put <BOT>_API_KEY` (run from wherever `wrangler login`/`CLOUDFLARE_API_TOKEN` is set up for that Cloudflare account)
- [ ] 14. Smoke test end-to-end against production (curl the widget's proxy endpoint directly + `wrangler tail <worker-name>` to see real errors)

---

## The admin bypass trap

`assertDomainAccess` short-circuits to `true` for any account with `is_admin = true` — **domain
restrictions do not apply to admins at all.** If the bot's key is ever issued from your own admin
account (easy mistake — the signup email autocompletes, the account "already has a key" screen
looks the same), the "restricted" domain does nothing: that key has access to every domain, every
personal tool, everything. Always create a **new, dedicated, non-admin account** for the bot,
verify it's non-admin, and grant it only the one domain it needs.

## Tool scoping is deny-by-default in intent, not in code

`chat-tool-registry.ts`'s `resolveChatTools` adds several tool groups **unconditionally to every
domain** (at the time of writing: notes, memory, `schedule_task`, `learn_instruction`). A new
public-facing domain inherits all of them unless explicitly excluded — this is a real gap that bit
the sales domain (`learn_instruction` in particular would let a visitor durably alter the agent's
behavior). Add the new domain to `PUBLIC_DOMAINS` in that file and audit every unconditional block,
don't assume "I didn't add a tool for it" means "it doesn't have tools."

Also: an **empty** `skill_tools` allowlist for a skill means "no restriction" (falls through to the
full general-purpose `TOOLS` array, which includes `execute_shell`), not "no tools." Always give a
restricted skill an explicit, non-empty tool list.

## Skill definition: use the modern pattern, not raw SQL

`add-domain.md` documents the current standard: a `skills/<name>.md` file with `domain: <slug>` in
its frontmatter, auto-loaded and bound by `SystemSkillsLoader` on startup — **no skill SQL needed in
the migration.** Use this from the start; the `sales` domain's migration originally used the older
`082_robot_assistant_domain.sql`-style raw `DO $$ ... INSERT INTO skills ...` pattern instead
(copied from that older domain before this doc existed), which still works but doesn't get the
loader's duplicate-row protection and left an orphaned skill row once `skills/sales.md` was added
to fix it. If you ever inherit a domain built the old way, migrate it with:

1. Add `skills/<name>.md` with `domain: <slug>` in the frontmatter (content only — tools still go
   in `skill_tools` separately, see next section).
2. Trim the migration back down to just the `INSERT INTO domains` line; drop the inline skill SQL.
3. Rebuild/redeploy so `SystemSkillsLoader` creates the new skill row and rebinds
   `domain_skill_defaults` on startup.
4. Run this cleanup once, against the **old** skill's known id (from the migration you just
   trimmed) — it rebinds tools to the new row and removes the orphan, no manual UUID lookup needed:

```sql
UPDATE domain_skill_defaults
SET skill_id = (SELECT id FROM skills WHERE source_file = '<name>.md' AND is_system = true)
WHERE domain_slug = '<name>';

INSERT INTO skill_tools (skill_id, tool_name)
SELECT (SELECT id FROM skills WHERE source_file = '<name>.md' AND is_system = true), tool_name
FROM skill_tools WHERE skill_id = '<old-skill-uuid>'
ON CONFLICT DO NOTHING;

DELETE FROM skill_tools WHERE skill_id = '<old-skill-uuid>';
DELETE FROM skills WHERE id = '<old-skill-uuid>';
```

## Migration numbering on a fast-moving branch

If multiple people/agents work on this repo concurrently, migration numbers collide easily (this
happened twice while building `sales`). Before naming a migration file, check the actual highest
number on the branch you're targeting — `git ls-tree -r --name-only origin/<branch> --
src/database/migrations/ | sort -V | tail`, not just your local working copy, which may be stale or
on the wrong branch entirely (see next section).

## Know which branch is actually deployed

`main` is not necessarily what's running. Check with the person who owns the deploy, or inspect the
Docker host directly (`git branch --show-current`) before assuming `main` is the target — building
on the wrong branch means your migration never reaches the real database no matter how many times
`git pull` says "up to date" (it's up to date with the *wrong* branch).

## The Control API's model/provider are not domain-aware by default

`POST /api/v1/conversations/:id/messages` requires `model` + `provider` in the body unless the
calling account has a `user_domain_model_settings` row for that domain — this is what lets the
website never need to know or send a model choice. Configure it once (via the `/<name>` model
picker, or directly):

```sql
INSERT INTO user_domain_model_settings (user_id, domain_slug, model_id)
SELECT id, '<name>', '<model-id>' FROM users WHERE email = '<bot-account-email>'
ON CONFLICT (user_id, domain_slug) DO UPDATE SET model_id = EXCLUDED.model_id, updated_at = NOW();
```

## Response envelope shape

Control API v1 responses are wrapped: `{"data": {"conversation": {...}}}` /
`{"data": {"message": {...}, "events": [...]}}`, not the bare `{"conversation": {...}}` shape you
might expect from reading the route handler in isolation. Check `_lib/responses.ts`'s `apiData()`
helper, or just curl the real endpoint with a real key before writing the client — don't assume the
shape from the code alone.

## Language: pass locale explicitly, don't rely on the cookie

`buildChatSystemPrompt` picks the reply language from a `locale` value that, by default, is read
from a `locale` cookie on the request (`prompt-builder.ts`'s `LANGUAGE_NAMES`). A server-to-server
caller (the website's Worker) has no browser session and sends no cookie, so it silently fell back
to English regardless of what language the visitor was actually using on the site. Fixed by adding
an optional `locale` field to `POST /api/v1/conversations/:id/messages`'s body (falls back to the
cookie, then `'en'`, if omitted) and having the website thread its own selected locale through:
widget → `/api/sales-chat` Worker → this field. One more gotcha: `LANGUAGE_NAMES` only recognizes
bare 2-letter codes (`en`, `pt`, `es`) — a region-qualified locale like the website's `pt-BR` has to
be stripped to `pt` before use, or the lookup misses and falls back to English anyway.

## Self-service key scopes

Non-admin, domain-only accounts (like the bot) can't reach the admin-only scope picker
(`ControlApiAccessTab`). The list of scopes any such account may self-grant lives in
`DEFAULT_DOMAIN_USERS_SCOPES` (`src/app/api/v1/api-keys/_lib.ts`) — add whatever scope your new
domain's key needs there, and only that scope (e.g. `chat:write`, not `chat:read` if the caller
never reads history back).

## Rate limiting has two layers (three, for public domains)

`operation-limiter.ts`'s `acquireOperationLimit('chat', userId)` is **per account**, not per
visitor — every website visitor authenticates as the same bot account, so this becomes one shared
bucket for the whole website. The real per-visitor limit has to live in the website's own proxy
(Workers KV keyed by `CF-Connecting-IP`, in the sales implementation).

For domains in `PUBLIC_DOMAINS` there's a third layer: `acquireOperationLimit('public-chat',
userId)`, a much longer-window (24h by default) volume cap stacked on top of `chat` in
`messages/route.ts`, plus a per-conversation message cap
(`PUBLIC_DOMAIN_MAX_MESSAGES_PER_CONVERSATION`) so no single conversation grows its context (and
cost) without bound. See
[public-agent-security-considerations.md](./public-agent-security-considerations.md) for the full
threat model this is addressing, and what's still open.

## Windows/PowerShell shell gotchas hit while operating this

- `wrangler login`'s browser OAuth flow can hang forever on a remote/VM host if the browser that
  completes the login isn't running on that same host (the local OAuth callback never arrives). Use
  `CLOUDFLARE_API_TOKEN` instead of interactive login on remote machines.
- PowerShell's `curl` is aliased to `Invoke-WebRequest`, which doesn't accept curl's `-H "K: V"`
  syntax — use `curl.exe` explicitly.
- When running SQL through `docker exec -it ... psql -c "..."` from PowerShell, prefer writing the
  SQL to a file via a bash heredoc (`cat > file.sql <<'SQL' ... SQL`) and piping it in
  (`docker exec -i ... psql < file.sql`) over nesting quotes — much less fragile across shells than
  trying to get `-c "..."` quoting right in every shell you might run it from. Also: a psql
  statement without a trailing `;` just hangs at a `->` continuation prompt waiting for one — it
  never ran.

---

## Pending / not done yet for the `sales` domain

- Rebuild/redeploy the app so `SystemSkillsLoader` picks up `skills/sales.md`, then run the
  one-time cleanup SQL in "Skill definition" above to remove the old raw-SQL skill row.
- See [public-agent-security-considerations.md](./public-agent-security-considerations.md) for the
  open (not-yet-addressed) risks — bot-challenge/CAPTCHA, ticket-creation spam, output content
  moderation, PII retention policy, and the `chat` concurrency limit's site-wide bottleneck for
  public domains.
