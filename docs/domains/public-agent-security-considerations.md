# Security considerations for public-facing agents

This is a running list of risks specific to **anonymous, public-facing** agents (the pattern
documented in [expose-agent-to-website.md](./expose-agent-to-website.md)) — an agent reached by
website visitors who never log in, through a shared service account. It's meant to be reviewed
each time a new public agent is built, not just for the `sales` domain.

Two items from this list (denial-of-wallet via sustained abuse, and unbounded conversation length)
have already been addressed for `sales` — see "Already mitigated" below. Everything else here is
still open and worth a conscious decision (fix now, accept the risk, or track for later) before
exposing a new public agent.

## Already mitigated (as of the `sales` domain)

- **API key never reaches the browser** — injected server-side by the website's Cloudflare Worker.
- **Per-IP rate limit** — 12 requests/minute via Workers KV, in the website's Worker.
- **Per-account rate limit** — the existing `chat` operation limiter (`operation-limiter.ts`),
  30 requests/minute per account by default.
- **Daily volume cap** — a new `public-chat` operation limit, applied only to domains in
  `PUBLIC_DOMAINS`, stacked on top of `chat`. Defaults to 300 requests/24h per account
  (`RATE_LIMIT_PUBLIC_CHAT_REQUESTS` / `RATE_LIMIT_PUBLIC_CHAT_WINDOW_SECONDS` env vars). Exists
  because the per-IP and per-minute limits alone don't stop a sustained, distributed attacker
  (VPN/IP rotation) from running up real LLM spend over a full day.
- **Per-conversation message cap** — `PUBLIC_DOMAIN_MAX_MESSAGES_PER_CONVERSATION` (40, in
  `messages/route.ts`) stops a single conversation from growing its context — and therefore its
  per-message cost — without bound. Returns `conversation_limit_reached`; the website widget
  catches this specifically and starts a fresh conversation with a friendly message instead of
  showing a generic error.

**Caveat:** both new limiters live in the same in-process, in-memory store as the existing `chat`
limiter (`operation-limiter.ts`'s `globalThis` map) — state resets on every app restart/redeploy.
This is a soft ceiling, not a hard guarantee: a determined attacker who can trigger or predict
restarts isn't fully stopped by it. If the daily cap ever needs to be a hard guarantee (e.g. tied
to real per-domain billing alerts), it should move to a persistent store (Redis, or a DB counter)
instead.

## Still open

### 1. `chat`'s concurrency limit may bottleneck legitimate visitors

`operation-limiter.ts`'s `chat` operation defaults to `concurrency: 2`, scoped per account. Every
visitor to a public domain authenticates as the *same* service account, so this caps the entire
website to **2 simultaneous in-flight chats, site-wide** — a 3rd concurrent visitor gets rejected
with `concurrency_limited` even though nothing is actually being abused. Worth deciding: raise
concurrency specifically for `PUBLIC_DOMAINS` accounts (similar to how `public-chat` stacks a
domain-aware limit on top of `chat`), or accept it as a soft cap on simultaneous traffic for now.

### 2. No bot challenge (CAPTCHA)

The website's Worker endpoint is rate-limited but not otherwise protected — it's a plain `curl`
target. CORS headers don't help here: CORS only blocks cross-origin requests made *from a
browser*; a script hitting the Worker directly ignores it entirely. If per-IP/per-day limits prove
insufficient in practice, adding Cloudflare Turnstile (or similar) in front of the widget is the
next layer.

### 3. Lead/ticket spam (mitigated for `sales`)

`create_ticket` has been removed from `sales`, which is now text-only. If tool-based lead capture is
introduced in another public domain, nothing inherently stops a visitor or script from filing junk
tickets. Prefer a validated website form, or add a dedicated per-visitor and per-day cap separate
from chat message limits.

### 4. No output-side content moderation

Tool access is locked down (deny-by-default, see `chat-tool-registry.ts`), but the *text* the
model generates isn't separately filtered. The model's own safety training is the only backstop
against it saying something off-brand, wrong, or embarrassing in a reply — which, since this
agent is public and unauthenticated, could be screenshotted and shared. This is a brand-safety
risk more than a technical security one, but worth having a human periodically spot-check
transcripts, especially early on.

### 5. PII collected without a defined retention/deletion process

A public conversation can contain whatever the visitor shares — name, email, and what they need —
even when no ticket tool exists. This is personal data from an anonymous visitor, not from someone
who signed a contract. Define how long public conversations are kept and how a deletion request
(LGPD/GDPR) would actually be fulfilled.

### 6. File upload is a separate decision, not a natural extension

If a future public agent is asked to support file/image upload (as `sales` was, and explicitly
deferred — see the decision log for that discussion), treat it as a new feature with its own
review, not a small addition:

- Require authentication first — none of the major consumer AI products (ChatGPT, Gemini, Claude)
  allow file upload from a fully anonymous session. Login gives accountability (who sent it, can
  they be rate-limited/banned individually) that IP-based limits on a shared account can't.
- Even with login, run uploads through content moderation *before* they reach the model or get
  stored — a hash-match check against known-CSAM databases (PhotoDNA/NCMEC) plus an NSFW/violence
  classifier. This is standard practice across the industry and, in some jurisdictions, a legal
  reporting obligation, not an optional safeguard.
- The Control API already supports `imageAttachments` end-to-end — the missing piece is the
  moderation layer in front of it, not the plumbing.
