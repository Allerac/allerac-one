# Spec: Conversation Memory Service

**File:** `src/app/services/memory/conversation-memory.service.ts`
**Priority:** 🟢 Medium — failures degrade quality silently, don't break the system

## What to mock
- DB client — return controlled message rows and summary rows
- `LLMService` — return a fake summary string when asked to summarize
- `EmbeddingService` — return a fake vector when asked to embed

## `shouldSummarizeConversation(conversationId)`
- Returns true when conversation exceeds the message threshold
- Returns false for short conversations
- Returns false if a recent summary already exists (avoid re-summarizing)

## `generateConversationSummary(conversationId, userId)`
- Calls LLM to summarize the conversation messages
- Saves the summary to DB with importance score and topic tags
- Does not throw if LLM call fails (log and return gracefully)

## `getRecentSummaries(userId, maxCount, maxAgeDays)`
- Returns summaries ordered by recency
- Respects `maxCount` limit
- Excludes summaries older than `maxAgeDays`
- Returns empty array (not null/undefined) when none found

## `formatMemoryContext(summaries)`
- Returns a formatted string suitable for injection into system message
- Empty array → returns empty string (no "## Memory" header injected for nothing)
- Multiple summaries → properly separated and labeled

## Notes
- Memory failures must never crash the chat pipeline — all calls in chat-handler are wrapped in try/catch
- Tests should confirm the graceful degradation (catch blocks reached, empty string returned)
