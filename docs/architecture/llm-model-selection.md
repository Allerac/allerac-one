# LLM Model Selection — Architecture Map

How the selected model flows from user choice to API call, and where every decision point lives.

---

## Model Registry

**`src/app/services/llm/models.ts`** — single source of truth for all available models.

| ID | Provider | Category |
|----|----------|----------|
| `qwen2.5:3b` | ollama | local |
| `deepseek-r1:7b` | ollama | local |
| `gemma4` | ollama | local |
| `gemma4:e2b` | ollama | local |
| `ministral-3b` | github | cloud |
| `gpt-4o` | github | cloud |
| `gemini-2.5-flash` | gemini | cloud |
| `claude-haiku-4-5-20251001` | anthropic | cloud |
| `claude-sonnet-4-6` | anthropic | cloud |
| `claude-opus-4-7` | anthropic | cloud |

Type definition: `src/app/types.ts` — `Model` interface with `provider: 'github' | 'ollama' | 'gemini' | 'anthropic'`.

---

## Storage

### Database
- **Table/column:** `user_settings.selected_model TEXT`
- **Migration:** `052_user_selected_model.sql`
- **Read:** `UserSettingsService.loadUserSettings()` → `selected_model: row.selected_model || null`
- **Write:** `UserSettingsService.saveSelectedModel(userId, modelId)` — UPSERT

### localStorage
- **Key:** `'selected_model'`
- Written and read by every domain client component on mount.

### Problem: two sources, partial sync
Most components save to **localStorage only**. `DomainChatPanel` saves to **both** localStorage and DB. `PreferencesTab` saves to **localStorage only** (does not call `saveSelectedModel`). Telegram reads from **DB only**. This causes the bug where changing model in one surface doesn't persist to another.

---

## Loading / Resolution

### Web clients (ChatClient, NotesClient, CodeClient, DesignClient, …)
```
useState('gemini-2.5-flash')          ← hardcoded fallback
  ↓ useEffect on mount
localStorage.getItem('selected_model') ← overrides if present
```
None of these clients load from DB on mount — only localStorage.

### DomainChatPanel
```
useState('gemini-2.5-flash')
  ↓ useEffect on mount
localStorage.getItem('selected_model')
```
On change: saves to localStorage **and** calls `saveSelectedModel(userId, modelId)`.

### Telegram bot (`telegram-bot.service.ts` line ~217)
```
DB: user_settings.selected_model
  ↓ fallback
gpt-4o → MODELS[0]
```
No localStorage — correct for a server-side service.

### Internal services (agents, skill router)
Hardcoded constants — not user-selectable:
- `worker-runner.service.ts`: `'qwen2.5:3b'`
- `skills.service.ts`: `process.env.SKILL_ROUTER_MODEL || 'qwen2.5:3b'`
- `agents/route.ts`: `'qwen2.5:3b'`

---

## Flow: user click → API call

```
ModelSelector / <select> onChange
    │
    ├─ setSelectedModel(modelId)            ← React state
    ├─ localStorage.setItem(key, modelId)   ← client persistence
    └─ saveSelectedModel(userId, modelId)   ← DB (only in DomainChatPanel)

ChatMessageService.sendMessage()
    │
    ├─ provider = MODELS.find(m => m.id === selectedModel)?.provider || 'github'
    └─ POST /api/chat { model: modelId, provider }

/api/chat/route.ts
    │
    ├─ provider determines baseUrl
    └─ new LLMService(provider, baseUrl, tokens).chatCompletion({ model: modelId, … })

LLMService.chatCompletion()
    │
    ├─ 'github'    → githubStreamChatCompletion()   POST baseUrl/chat/completions
    ├─ 'ollama'    → ollamaStreamChatCompletion()    POST baseUrl/api/chat
    ├─ 'gemini'    → geminiStreamChatCompletion()    Google SDK
    └─ 'anthropic' → anthropicStreamChatCompletion() Anthropic SDK
```

---

## Hardcoded defaults (all components)

| File | Default |
|------|---------|
| `ChatClient.tsx` | `gemini-2.5-flash` |
| `DomainChatPanel.tsx` | `gemini-2.5-flash` |
| `NotesClient.tsx` | `gemini-2.5-flash` |
| `CodeClient.tsx` | `gemini-2.5-flash` |
| `DesignClient.tsx` | `gemini-2.5-flash` |
| `SearchClient.tsx` | `gemini-2.5-flash` |
| `HealthClient.tsx` | `gemini-2.5-flash` |
| `FinanceClient.tsx` | `gemini-2.5-flash` |
| `EmailClient.tsx` | `gemini-2.5-flash` |
| `HubClient.tsx` | `gemini-2.5-flash` |
| `InstagramPostStudio.tsx` | `gpt-4o-mini` |
| Telegram bot | `gpt-4o` |
| Skill router / agents | `qwen2.5:3b` |

---

## Known Issues

### 1. Telegram model doesn't persist after change
`PreferencesTab` (Settings → Preferences) only writes to localStorage. Telegram reads from DB. Changing model in Settings does not update the DB → Telegram keeps old value.

### 2. Domain clients don't load from DB on mount
If the user changes model on one device or resets localStorage, the saved DB preference is ignored. Only `DomainChatPanel` writes to DB on change.

### 3. Model reverts on page reload in some domains
Domains whose client loads only from localStorage will show the hardcoded default (`gemini-2.5-flash`) for a brief render before hydrating from localStorage. If localStorage is empty (e.g. new device, private window), the user's DB preference is never applied.

### 4. Multiple selector implementations
Model selection is implemented independently in: `ModelSelector.tsx` (full component), `DomainChatPanel.tsx` (inline `<select>`), `PreferencesTab.tsx` (renders `ModelSelector`). They have slightly different save behaviours.

---

## Recommended Fix (when implementing)

Single source of truth: **DB is authoritative**. localStorage is a cache.

1. Load from DB on app init (server component passes `selected_model` as prop, or a single `GET /api/user/settings` call).
2. All selectors save to DB via `saveSelectedModel`.
3. localStorage can mirror for instant re-hydration but is never the primary source.
4. Telegram already reads from DB — fix is entirely on the web side.
