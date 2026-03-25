# Spec: Chat Handler

**File:** `src/app/services/chat/chat-handler.ts`
**Priority:** 🔴 Critical — core pipeline, handles tool calls and user isolation

## What to mock
- `LLMService.chatCompletion` — return controlled `{ choices, usage }`
- `ChatService` (DB) — `createConversation`, `saveMessage`, `loadMessages`
- `ShellTool.execute` — return controlled results
- `SearchWebTool.execute` — return controlled results
- `ConversationMemoryService` — return empty summaries by default
- `VectorSearchService` — return empty context by default
- `skillsService` — return null active skill by default

## Path injection (security)

The handler replaces `/workspace/projects/` → `/workspace/projects/{userId}/` in:
1. The enriched system message (prompt)
2. The `execute_shell` tool command before passing to ShellTool
3. The `cwd` argument of `execute_shell`

Test cases:
- System message containing `/workspace/projects/foo` becomes `/workspace/projects/{userId}/foo`
- Shell command `mkdir /workspace/projects/myapp` becomes `mkdir /workspace/projects/{userId}/myapp`
- Shell command with no workspace path passes through unchanged
- Replacement is idempotent — a path already containing userId is not double-scoped

## Tool call handling

- `search_web` tool: calls `SearchWebTool.execute(query)`, pushes result to messages, calls LLM again
- `execute_shell` tool: calls `ShellTool.execute(scopedCommand, scopedCwd)`, pushes result
- Unknown tool name: pushes `{ error: "Tool X not available" }`, does not throw
- Multiple sequential tool calls in one LLM response are all executed
- Loop terminates when LLM returns a message with no `tool_calls`

## Skill activation

- New conversation with default skill → `activateSkill` called, skill content injected into system message
- Existing conversation → active skill loaded and injected
- `force_tool` on skill → first LLM call uses that tool_choice
- Auto-switch: if `shouldAutoActivate` returns true for a different skill, it replaces active skill
- No active skill → plain ALLERAC_SOUL system message (no skill prefix)

## Message persistence

- User message saved before LLM call
- Assistant response saved after all tool calls resolve
- Image attachments: message saved with `[Image attached: N file(s)]` suffix

## Realtime query forcing

- Message containing "weather"/"clima"/"météo" etc. → first call uses `tool_choice: search_web` (when tavilyApiKey present)
- Same keywords without tavilyApiKey → `tool_choice: auto`
- `force_tool` on active skill takes precedence over realtime keyword detection

## Return value

- Returns `{ conversationId, response }` where response is the final assistant message content
- `conversationId` is the newly created ID when `conversationId` param is null
- `conversationId` is passed through unchanged when provided
