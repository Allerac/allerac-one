# Allerac Monitoring

The System Monitor (`/logs`) is the observability heart of Allerac. It gives engineers real-time visibility into what the AI is doing — skill routing, LLM calls, memory loading, RAG retrieval, tool execution — all in one place.

## Access

Open the hub (`/`) → double-click **📟 Monitor** — or navigate to `/logs` directly.

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│ 📟 ALLERAC SYSTEM MONITOR v1.0                    _ □ x  │
├───────────────────────────────────────────────────────────┤
│ [📋 LOGS]  [📊 METRICS]  [🏃 BENCHMARK]          ■ LIVE │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  14:32:01  [ChatRoute]  Starting LLM call...             │
│  14:32:02  [Skills]     Router → chef (deepseek-r1)      │
│  14:32:03  [Memory]     Loaded 2 summaries               │
│  14:32:04  [RAG]        3 docs, cosine 0.87              │
│  14:32:08  [ChatRoute]  Done. 1.2k tokens                │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Logs tab
Real-time SSE stream of every tagged `console.log/warn/error` across all services. The interceptor installed in `src/instrumentation.ts` captures them all without touching the services themselves.

### Metrics tab
Aggregated stats from the `tokens_usage` and `api_logs` database tables:
- Token consumption per model and provider (today / this month)
- Estimated cost (when applicable)
- Tavily web-search call volume and success rate

### Benchmark tab
The LLM benchmark runner — tests latency, short generation, reasoning, and sustained throughput against the selected model. Results are stored in `benchmark_results` for historical comparison.

## Data Flow

```
console.log/warn/error  ──►  installConsoleInterceptor()   (instrumentation.ts)
                                        │
                                 LogBuffer (singleton)       (src/lib/logger.ts)
                                 circular buffer, 1000 entries
                                        │
                       ┌────────────────┴────────────────┐
                       │                                 │
                 GET /api/logs                    (future: alerts)
                 SSE stream                      threshold checks
                       │
                 LogsClient.tsx
                 retro CRT terminal
```

## Files

| Path | Purpose |
|------|---------|
| `src/lib/logger.ts` | Server-side singleton, console interceptor, EventEmitter |
| `src/lib/logger-shared.ts` | Types + colour map — safe for client imports |
| `src/app/api/logs/route.ts` | SSE endpoint, streams buffer + live events |
| `src/app/logs/LogsClient.tsx` | Tabbed monitor UI (Logs, Metrics, Benchmark) |
| `src/app/logs/MetricsTab.tsx` | Token/API stats display |
| `src/app/components/system/BenchmarkPanel.tsx` | Benchmark runner (embedded in Benchmark tab) |

## See Also

- [Logging Standard](./logging-standard.md) — canonical context tags and conventions
- [Metrics Reference](./metrics.md) — database tables, aggregation queries, cost model
