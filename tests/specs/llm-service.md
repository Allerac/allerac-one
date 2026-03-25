# Spec: LLM Service

**File:** `src/app/services/llm/llm.service.ts`
**Priority:** 🟡 High — normalization layer between providers; bugs here affect all AI responses

## What to mock
- `fetch` — intercept HTTP calls to GitHub/Ollama/Gemini endpoints
- Do NOT mock the LLMService itself in these tests (it IS the subject)

## Provider normalization

All three providers (github, ollama, gemini) must return the same shape:
```ts
{
  choices: [{ message: { role: 'assistant', content: string, tool_calls?: [...] } }],
  usage?: { total_tokens: number }
}
```

Test each provider with a mocked HTTP response and assert the normalized output.

### GitHub Models
- Passes `Authorization: Bearer {githubToken}` header
- Maps response directly (already OpenAI-compatible)
- Handles `tool_calls` with string arguments

### Ollama
- Calls the configured `modelBaseUrl`
- Handles `tool_calls` where `arguments` is an object (not a string) — must not double-parse
- Handles missing `id` on tool_calls (Ollama omits it)

### Gemini
- Passes `x-goog-api-key` or equivalent auth header
- Maps Gemini response format to OpenAI shape
- Function calls in Gemini format → `tool_calls` in OpenAI format

## Error handling
- HTTP 4xx from provider → throws with status info
- HTTP 5xx from provider → throws
- Network error (fetch throws) → propagates

## Token limits
- `max_tokens` passed through to the provider request
- `temperature` passed through
