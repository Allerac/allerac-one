# GitHub Models Chat Retirement

**Status:** Proposed — not started

**Priority:** Medium-high — two catalog models are silently non-functional, and one
of them is a hardcoded default fallback

**Trigger:** GitHub Models (the whole product — catalog, playground, inference API,
BYOK) was fully retired on 2026-07-30. See
[Provider-Independent Local Embeddings](provider-independent-local-embeddings.md),
which already migrated the *embeddings* side of this off GitHub Models. This
document covers the remaining, unmigrated side: **chat completions**.

**Affects:** Any conversation using a `provider: 'github'` model — currently
`gpt-4o` and `ministral-3b` in `MODELS` (`src/app/services/llm/models.ts`) — plus
every place that hardcodes `gpt-4o` as a default/fallback model.

## Context

Discovered 2026-08-30 while debugging an unrelated "Connection Failed" error when
testing a freshly-generated GitHub fine-grained PAT (scope: `models`) in Settings.
Live checks from the local `allerac-app` container:

- `https://models.inference.ai.azure.com/models` (the legacy endpoint this app has
  always used for GitHub Models, both for chat and for the key-test action) —
  `ENOTFOUND`. The hostname no longer resolves at all. Confirmed general container
  network/DNS health first (`api.github.com` → 200, `api.openai.com` → 401) to rule
  out a container-local network problem.
- `https://models.github.ai/inference/chat/completions` (GitHub's current-generation
  Models endpoint) — resolves, but returns `410` with
  `{"error":{"code":"github_models_retirement_brownout", ...}}`.

This matches and reconfirms what `provider-independent-local-embeddings.md` already
documented from the embeddings side on 2026-07-31: the legacy endpoint returned
`401`/is now dead, the new endpoint returns `410 Gone`, and GitHub's own changelog
confirms full retirement
([announcement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/)).
No token — new, fine-grained, or otherwise — restores this; the service itself is
gone, not the credential.

**What's actually broken (chat side, not previously inventoried):**

- `MODELS` (`src/app/services/llm/models.ts`): `gpt-4o` and `ministral-3b` are both
  `provider: 'github'`. Selecting either for a conversation, a domain's default
  model, or a `fallbackModelId` fails outright.
- `chat-runtime-context.ts`'s `GITHUB_BASE_URL` constant (the legacy dead URL) is
  still the base URL for the `github` provider branch, and the `else` fallback of
  the `modelBaseUrl` ternary when no other provider matches.
- `actions/api-keys.ts`'s `validateApiKey('github', ...)` branch calls the same dead
  URL — this is the immediate symptom that surfaced this (every GitHub key test
  fails with "Connection Failed," valid key or not).
- `telegram-multi-bot.ts` / `telegram-bot.service.ts`: `gpt-4o` is the **hardcoded
  default fallback model** (`MODELS.find(m => m.id === 'gpt-4o') || MODELS[0]`) for
  any Telegram user who hasn't picked a model — meaning a fresh/default Telegram
  chat silently tries a dead provider first.
- Broader footprint not yet inventoried: `grep -rl "models.inference.ai.azure.com"`
  and `grep -rl "provider === 'github'"` each return ~15 files across actions,
  API routes, chat services, memory/instruction distillation, scheduled jobs, and
  benchmarks. Some of these are tests or incidental (e.g. instagram webhook/actions
  unrelated to LLM chat) and need triage, not all are load-bearing — full inventory
  is Phase 1 work, not done in this pass.

## Decision direction (not yet started)

Gian's stated direction: stand up an **Azure AI Foundry** project rather than
finding another direct chat-completions provider one at a time. Not yet scoped —
open questions below are genuinely open.

## Open questions for implementation

- Does Azure AI Foundry replace `gpt-4o`/`ministral-3b` specifically (same/similar
  model family under a new gateway), or does it become a new provider entry
  alongside Anthropic/OpenAI/Gemini/Ollama, with the two dead `MODELS` entries just
  removed?
- Same provider-neutral-contract question the embeddings migration already solved
  once: should chat providers be reachable through one abstraction so a future
  provider retirement (this has now happened twice) doesn't require hunting
  hardcoded URLs across ~15 files again?
- What happens to any domain's `user_domain_model_settings` (model or
  `fallback_model_id`) that already points at `gpt-4o`/`ministral-3b` today? These
  need to be found and repointed as part of the fix, not just the `MODELS` catalog
  entry.
- Should `telegram-bot.service.ts`'s hardcoded `gpt-4o` default fallback change to a
  non-github model *now*, independent of the Foundry timeline, since it's a
  one-line change removing an active footgun for any new/default Telegram user?

## Deferred and out of scope (for now)

- Actually implementing the Azure AI Foundry integration — this document exists to
  capture the finding and unblock moving on, not to design the migration.
- Full inventory of the ~15 files referencing the dead endpoint/provider check.
- Removing `gpt-4o`/`ministral-3b` from `MODELS` (would need the replacement
  decided first, and a check for existing domain/user settings pointing at them).

## References

- [Provider-Independent Local Embeddings](provider-independent-local-embeddings.md)
  — the embeddings-side migration; same root cause, already completed.
- [GitHub Models retirement announcement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/)
- `src/app/services/llm/models.ts` — `MODELS` catalog (`gpt-4o`, `ministral-3b`)
- `src/app/services/chat/chat-runtime-context.ts` — `GITHUB_BASE_URL`
- `src/app/actions/api-keys.ts` — `validateApiKey`'s `github` branch
- `src/app/services/telegram/telegram-multi-bot.ts` /
  `telegram-bot.service.ts` — hardcoded `gpt-4o` default fallback
