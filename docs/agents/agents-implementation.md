# Parallel Agent Execution - Implementation Guide

## Overview

Implemented the **Orchestrator + Workers** pattern for parallel agent execution in Allerac One. The system allows breaking down complex tasks into independent subtasks that execute in parallel, with results aggregated into a final response.

## Architecture

```
User Request → /api/agents (POST)
                    ↓
         [Orchestrator: Planning Phase]
                    ↓
      Plan Tasks → [Workers (Promise.all)]
      ├─ Worker 1 (running in parallel)
      ├─ Worker 2 (running in parallel)
      └─ Worker 3 (running in parallel)
                    ↓
         [Orchestrator: Aggregation Phase]
                    ↓
         Final Response (streamed as SSE)
```

## Components Implemented

### 1. Database Schema
**File:** `src/database/migrations/028_agent_runs.sql`

New tables:
- `agent_runs` — tracks each agent execution (plan, status, result)
- `agent_workers` — tracks individual worker execution
- `chat_messages.agent_run_id` — links final message to the run

### 2. Services

#### OrchestratorService
**File:** `src/app/services/agents/orchestrator.service.ts`

Responsibilities:
- `evaluateComplexity(message, context)` — uses qwen2.5:3b to decide if task is complex
- `createPlan(message, model, provider, baseUrl)` — uses conversation model to break task into worker specs
- `aggregateResults(message, plan, workerResults, model, provider, baseUrl)` — streaming synthesis

#### WorkerService
**File:** `src/app/services/agents/worker.service.ts`

Responsibilities:
- `executeWorker(spec, config, onToken, onToolCall)` — executes a single agent task
- Reuses tool-calling loop pattern from `chat-handler.ts`
- Supports search_web and execute_shell tools
- Handles tool call loops with proper error handling

### 3. API Endpoint

**File:** `src/app/api/agents/route.ts`

**Endpoint:** `POST /api/agents`

**Request Body:**
```json
{
  "message": "user request",
  "conversationId": "uuid or null",
  "model": "qwen2.5:3b",
  "provider": "ollama|github|gemini|anthropic"
}
```

**Response:** Server-Sent Events (text/event-stream)

**SSE Event Types:**
```
agent_run_started {runId}
orchestrator_planning
orchestrator_planned {workers: [...]}
worker_started {workerId, name, task}
worker_token {workerId, content}
worker_tool_call {workerId, tool, args}
worker_completed {workerId, result}
worker_failed {workerId, error}
orchestrator_aggregating
aggregator_token {content}
run_completed {result}
error {message}
```

### 4. UI Components (Draft)

**Files in:** `src/app/components/agents/`

- `AgentRunView.tsx` — Main pipeline visualization
- `WorkerCard.tsx` — Individual worker status card
- `OrchestratorStatus.tsx` — Orchestrator state indicator
- `useAgentRun.ts` — Hook for managing SSE stream (WIP)

## How to Use

### Testing the Agent Endpoint

**Using curl:**
```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -b "session_token=YOUR_SESSION_TOKEN" \
  -d '{
    "message": "Research the history of AI and summarize the key milestones. Also analyze current trends and suggest future directions.",
    "conversationId": null,
    "model": "qwen2.5:3b",
    "provider": "ollama"
  }'
```

**Expected Output:**
SSE stream with events showing orchestrator planning, worker execution, and final aggregation.

### Integration Points

**Database Migration:**
```bash
npm run migrate  # Run 028_agent_runs.sql
```

**Service Usage:**
```typescript
import { OrchestratorService } from '@/app/services/agents/orchestrator.service';

const orchestrator = new OrchestratorService({
  githubToken: '...',
  geminiToken: '...',
  anthropicToken: '...',
});

// Evaluate complexity
const complexity = await orchestrator.evaluateComplexity(userMessage);

// Create plan
const plan = await orchestrator.createPlan(
  userMessage, 
  selectedModel, 
  modelProvider, 
  modelBaseUrl
);

// Aggregate results
const stream = orchestrator.aggregateResults(
  userMessage, 
  plan, 
  workerResults,
  selectedModel, 
  modelProvider, 
  modelBaseUrl
);
```

## What's Working

✅ Database schema with proper foreign keys and indexes
✅ OrchestratorService with plan generation
✅ WorkerService with tool-calling support
✅ /api/agents endpoint with SSE streaming
✅ Parallel worker execution with Promise.all()
✅ Result aggregation via streaming LLM
✅ Agent run tracking in database
✅ Proper error handling and fallbacks

## UI Integration (✅ COMPLETED)

### What Was Done

1. **types.ts** - Added `agent_run` action type to `MessageAction` union
2. **useAgentRun.ts** - Complete rewrite:
   - Changed from `EventSource` (GET) to `fetch` POST + `ReadableStream` (fixes protocol mismatch)
   - Fixed stale closure bugs in `worker_completed/worker_failed` handlers
   - New interface: `{ state, startRun, reset }`
   - `startRun(message, conversationId, model, provider)` initiates background run
3. **ChatInput.tsx** - Added Agents toggle button:
   - Props: `isAgentMode`, `onToggleAgentMode`
   - Button appears in left toolbar after attachments
   - Lights up (brand color) when agent mode active
4. **ChatClient.tsx** - Integrated agent mode:
   - State: `isAgentMode`, `activeAgentRunId`
   - `useAgentRun` hook integration
   - Modified `handleSendMessage`:
     - **Input unlocks IMMEDIATELY (Option A)** when agent mode
     - Calls `startAgentRun` in background
     - User message added to chat
   - useEffect watches `agentRunState.runId` and injects assistant message with `agent_run` action
5. **ChatMessages.tsx** - Renders AgentRunView:
   - Detects `action.type === 'agent_run'`
   - Renders `<AgentRunView runId={agentRunId}>` inline in message actions
   - Live worker status visible to user

### User Flow
1. Click Agents toggle button (lights up)
2. Type message → Send
3. **Input becomes available immediately** (can type more while agents work)
4. User message appears in chat
5. `AgentRunView` appears showing:
   - OrchestratorStatus (planning → running → aggregating → completed)
   - WorkerCards with individual worker status
   - Final aggregated result
6. Workers execute in parallel via Promise.all()

### What's Not Yet Done

⏸ **Auto-complexity Detection in /api/chat**
- Currently agents triggered manually via toggle button
- Could add automatic detection by checking complexity before LLM pipeline
- Would use complexity model (qwen2.5:3b) to decide whether to route to /api/agents

⏸ **Complexity Detection Threshold**
- Current: manual trigger only
- Could implement: `if (complexity > 70) { useAgents() }`

## Database Schema

### agent_runs
```sql
id UUID PRIMARY KEY
conversation_id UUID REFERENCES chat_conversations(id)
user_id UUID REFERENCES users(id)
status VARCHAR(20) -- 'planning' | 'running' | 'aggregating' | 'completed' | 'failed'
prompt TEXT
plan JSONB
result TEXT
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

### agent_workers
```sql
id UUID PRIMARY KEY
run_id UUID REFERENCES agent_runs(id)
name VARCHAR(100)
task TEXT
skill_id UUID REFERENCES skills(id)
status VARCHAR(20) -- 'waiting' | 'running' | 'completed' | 'failed'
result TEXT
tokens_used INT
started_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

### chat_messages (altered)
```sql
agent_run_id UUID REFERENCES agent_runs(id) -- NEW COLUMN
```

## Next Steps

1. **Test the /api/agents endpoint** with various complex tasks
2. **Add complexity detection** to /api/chat to automatically trigger agent mode
3. **Connect AgentRunView** to ChatMessageService
4. **Add history/sidebar** to browse past agent runs
5. **Implement worker communication** for collaborative agents
6. **Add manual plan editing** for user-defined workflows

## Configuration

Default settings (can be adjusted):
- Max workers per run: 5
- Worker timeout: 60 seconds
- Complexity model: qwen2.5:3b (local, ~200ms)
- Planning model: same as conversation
- Aggregation model: same as conversation

## Performance Considerations

- Complexity check adds ~200ms latency (using fast local model)
- Workers execute in parallel (saves time vs sequential)
- Each worker has own LLM context (more tokens but faster overall)
- Aggregation is streaming (user sees results immediately)

## Error Handling

- Worker failures don't stop the run (marked as failed, continues)
- Missing tools are handled gracefully
- Connection loss is handled at the SSE level
- Database errors are logged and reported

## Testing Checklist

### Backend (from commit 729f820)
- ✅ Migration runs without errors
- ✅ /api/agents endpoint accepts requests
- ✅ Authentication is required
- ✅ Orchestrator can break down complex tasks
- ✅ Workers execute in parallel
- ✅ SSE events stream correctly to client
- ✅ Results are aggregated and returned
- ✅ Database records are created
- ✅ Error cases are handled gracefully
- ✅ Tool calls (search_web, shell) work in workers

### Frontend UI (from this commit)
- [ ] Agents toggle button appears in ChatInput
- [ ] Button lights up when agent mode active
- [ ] User message sends successfully with agent mode
- [ ] Input unlocks immediately (can type while agents work)
- [ ] AgentRunView renders inline in chat
- [ ] OrchestratorStatus shows planning → running → aggregating → completed
- [ ] WorkerCards show individual worker progress
- [ ] Worker tokens stream in real-time
- [ ] Final aggregation result displays
- [ ] Tool calls (search_web, shell) visible in worker status
