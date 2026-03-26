# Allerac Metrics Reference

Metrics are stored in PostgreSQL and queryable via server actions in `src/app/actions/metrics.ts`.

## Database Tables

### `tokens_usage`
Tracks every LLM call with token counts and cost estimates.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMPTZ | When the call happened |
| `model` | TEXT | Model ID (e.g. `gpt-4o`, `qwen2.5:3b`) |
| `provider` | TEXT | `github`, `ollama`, `gemini` |
| `prompt_tokens` | INTEGER | Input tokens consumed |
| `completion_tokens` | INTEGER | Output tokens generated |
| `total_tokens` | INTEGER | Sum of prompt + completion |
| `estimated_cost_usd` | DECIMAL(10,6) | Cost estimate (0 for local models) |
| `user_id` | UUID | Which user's conversation |
| `conversation_id` | UUID | Links to conversations table |
| `metadata` | JSONB | Extra context (skill active, tool calls, etc.) |

### `api_logs`
Tracks third-party API calls (Tavily web search, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMPTZ | When the call happened |
| `api_name` | TEXT | e.g. `tavily`, `garmin` |
| `endpoint` | TEXT | Full URL called |
| `method` | TEXT | HTTP method |
| `response_time_ms` | INTEGER | Latency in milliseconds |
| `status_code` | INTEGER | HTTP status returned |
| `success` | BOOLEAN | Whether the call succeeded |
| `error_message` | TEXT | Error detail if failed |
| `metadata` | JSONB | Query, result count, etc. |

### `benchmark_results`
One row per benchmark test run.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `run_id` | UUID | Groups tests in one benchmark session |
| `timestamp` | TIMESTAMPTZ | When the run happened |
| `model` | TEXT | Model tested |
| `provider` | TEXT | Provider used |
| `test_name` | TEXT | `latency`, `short_gen`, `reasoning`, `long_gen` |
| `ttft_ms` | INTEGER | Time-to-first-token in ms |
| `total_ms` | INTEGER | Total generation time |
| `tokens` | INTEGER | Tokens generated |
| `tps` | DECIMAL | Tokens per second |

## Server Actions

```ts
import { getTokenStats, getTavilyStats } from '@/app/actions/metrics';

// Token usage — last 24h
const stats = await getTokenStats(24);
// { totalTokens, promptTokens, completionTokens, totalCost, byModel: [...] }

// Token usage — current calendar month
const monthly = await getTokenStats(24, true);

// Tavily calls — last 24h
const search = await getTavilyStats(24);
// { totalCalls, successRate, avgResponseMs, totalCost }
```

## Performance Thresholds (Benchmark)

| Metric | Good | Acceptable | Poor |
|--------|------|------------|------|
| TTFT | < 500ms | < 2s | > 2s |
| Tokens/sec (local) | ≥ 15 | ≥ 7 | < 7 |
| Tokens/sec (cloud) | ≥ 30 | ≥ 15 | < 15 |

## Cost Model

| Provider | Model | Approx. cost per 1M tokens |
|----------|-------|---------------------------|
| GitHub Models | GPT-4o | ~$5 input / $15 output |
| GitHub Models | GPT-4o-mini | ~$0.15 input / $0.60 output |
| GitHub Models | Llama 3.1 70B | Free (limited) |
| Gemini | gemini-2.0-flash | ~$0.10 input / $0.40 output |
| Ollama (local) | Any | $0 (compute only) |

Costs are estimates. The `estimated_cost_usd` field uses these rates when populated by the LLM service.

## Planned Metrics (Roadmap)

- [ ] Skill usage frequency — which skills get activated most
- [ ] Response quality scores — user feedback thumbs up/down
- [ ] Memory hit rate — % of conversations where memory context was injected
- [ ] RAG relevance scores — average cosine similarity of retrieved docs
- [ ] Alerting — notify when error rate > threshold or token budget exceeded
