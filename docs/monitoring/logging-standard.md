# Allerac Logging Standard

Every `console.log`, `console.warn`, and `console.error` call in a server-side service **must** be prefixed with a context tag in square brackets:

```ts
console.log('[ChatRoute] Starting LLM call (tool detection)...');
console.warn('[Skills] Router timed out, falling back to keywords');
console.error('[Memory] Failed to load summaries:', err.message);
```

The System Monitor extracts the tag automatically via regex. No logging library needed.

---

## Canonical Context Tags

| Tag | Colour | Used in | Covers |
|-----|--------|---------|--------|
| `[ChatRoute]` | `#00ff41` matrix green | `api/chat/route.ts` | Full SSE chat pipeline: auth, skill activation, LLM calls, tool loop, streaming, DB save |
| `[Skills]` | `#00ffff` cyan | `skills.service.ts` | Skill lifecycle: detection (LLM router + keyword), activation, enrichment, usage tracking |
| `[SystemSkills]` | `#00ffff` cyan | `system-skills-loader.ts` | Deploy-time skill sync from `/skills/*.md` to DB |
| `[LLM]` | `#8be9fd` light blue | `llm.service.ts` | Raw LLM API calls, retries, provider switching |
| `[Memory]` | `#f1fa8c` pale yellow | `conversation-memory.service.ts` | Summary generation, retrieval, formatting |
| `[RAG]` | `#c792ea` soft purple | `vector-search.service.ts`, `embedding.service.ts` | Document embedding, vector search, context injection |
| `[Search]` | `#ff9580` salmon | `search-web.tool.ts` | Tavily web search, two-level cache (L1 DB hash, L2 semantic embedding) |
| `[SkillRouter]` | `#00ffff` cyan | `skills.service.ts` `detectIntent()` | LLM-based intent detection, keyword fallback |
| `[Auth]` | `#f8f8f2` white | `auth.service.ts` | Login, session validation, registration |
| `[DB]` | `#bd93f9` lavender | `chat.service.ts`, DB client | DB queries, connection pool, migrations |
| `[Workspace]` | `#ffb86c` orange | `workspace/` routes | Shell execution, file ops, process management |
| `[Health]` | `#50fa7b` lime | `health.tool.ts` | Garmin data fetch, health metrics |
| `[Telegram]` | `#6272a4` muted blue | `telegram-bot.service.ts` | Telegram bot messages, commands |
| `[Benchmark]` | `#f8f8f2` white | `api/benchmark/route.ts` | LLM benchmark runs, TTFT, TPS |

Tags not in the table default to `#b0bec5` (gray) in the monitor.

---

## Log Levels

| Level | When to use |
|-------|-------------|
| `console.log` | Normal operation: flow checkpoints, key values, completions |
| `console.info` | Same as log — treated identically |
| `console.warn` | Recoverable problems: fallback activated, timeout, missing optional config |
| `console.error` | Errors: exceptions caught, operations failed, unexpected state |

Never use `console.error` for expected conditions (e.g., "user not found" during login). Use `console.warn` or omit.

---

## Message Format

```
[Tag] Subject — detail
```

Good examples:
```ts
console.log('[ChatRoute] First LLM call completed');
console.log('[Skills] Router → chef (deepseek-r1:1.5b, 312ms)');
console.warn('[Skills] Router timeout after 15s, using keyword fallback');
console.error('[Memory] getRecentSummaries failed:', err.message);
console.log('[RAG] 3 docs found (top cosine: 0.87)');
console.log('[SystemSkills] Synced 7/7 skills from /skills');
```

Bad examples:
```ts
console.log('done');                  // no tag
console.log('[chat] something');      // tag not in canonical list
console.error(err);                   // object only, no message
console.log('[ChatRoute]');           // no message
```

---

## What NOT to Log

- Raw API keys or session tokens (even partial)
- Full user message content (privacy — log intent/length only)
- Full LLM responses (log token count or summary)
- Stack traces in `console.log` (use `console.error` with `err.message`)

---

## Adding a New Context

When adding a new service or subsystem:

1. Choose a tag not in the table above
2. Add it to the table in this doc
3. Add the colour mapping to `src/lib/logger-shared.ts` → `CONTEXT_COLORS`
4. Use it consistently throughout the new service

Example for a hypothetical `NotificationService`:
```ts
// src/lib/logger-shared.ts
Notifications: '#ff5ea3',  // hot pink

// src/app/services/notifications/notifications.service.ts
console.log('[Notifications] Sent push to user', userId);
console.error('[Notifications] Push failed:', err.message);
```
