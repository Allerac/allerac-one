# Tickets — Priority System

Priority is isolated in its own service (`TicketPriorityService`) so the model can
be iterated and improved without touching the rest of the ticket system.

## Storage

Each ticket stores three priority fields:

| Field | Type | Description |
|---|---|---|
| `priority_score` | INTEGER 0-100 | Computed score. Higher = more urgent. Used for sorting. |
| `priority_level` | TEXT | Human label derived from score: `critical`, `high`, `medium`, `low` |
| `priority_factors` | JSONB | Snapshot of inputs used to compute the score. For explainability and debugging. |

## Score → Level Mapping (v1)

```
80-100  →  critical
60-79   →  high
40-59   →  medium
0-39    →  low
```

These thresholds live in the priority service config and can be tuned independently.

## Priority Inputs (v1)

The v1 model computes the score from a weighted combination of explicit and implicit signals:

### Explicit (set by creator)
| Factor | Weight | Notes |
|---|---|---|
| Explicit urgency | 40% | User/agent says "urgent", "critical", "low priority", etc. |
| Ticket type | 10% | `bug` scores higher than `improvement` by default |

### Implicit (computed by system)
| Factor | Weight | Notes |
|---|---|---|
| Age | 20% | Score increases over time to prevent starvation. Configurable rate. |
| Creator type | 10% | Agent-created tickets may signal automated detection (configurable) |
| Keywords | 20% | Title/description scanned for urgency signals ("crash", "down", "urgent", "breaking") |

The `priority_factors` snapshot records the exact inputs and weights used at computation time,
so you can always explain why a ticket has a given score.

## Priority Lifecycle

Priority is computed:
1. **At creation** — initial score assigned
2. **On update** — if title, description, or explicit urgency changes
3. **On schedule** — background job re-scores open tickets periodically (age factor)
4. **On demand** — user or agent can request a re-score

## Interface

```typescript
// src/app/services/tickets/priority.service.ts

interface PriorityFactors {
  explicitUrgency: 'critical' | 'high' | 'medium' | 'low' | null;
  ticketType: string;
  ageHours: number;
  creatorType: 'user' | 'agent';
  keywordSignals: string[];  // matched keywords
}

interface PriorityResult {
  score: number;        // 0-100
  level: PriorityLevel; // critical | high | medium | low
  factors: PriorityFactors;
}

class TicketPriorityService {
  compute(input: PriorityInput): PriorityResult;
  levelFromScore(score: number): PriorityLevel;
  scoreFromExplicit(urgency: string | null): number;
}
```

## Future Iterations

The isolation of this service means future versions can add without breaking anything:

- **v2**: User feedback loop — tickets resolved quickly vs. left open adjusts future scoring
- **v3**: LLM-based scoring — use an LLM to read the description and assess urgency
- **v4**: Dependency graph — ticket blocked by another gets lower score; blocker gets higher
- **v5**: Calendar/deadline awareness — score spikes as due date approaches
