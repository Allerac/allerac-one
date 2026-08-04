# Knowledge

**Status:** Proposed — Memory Graph baseline implemented

**Domain name:** **Knowledge**

**Product description:** *Memory, knowledge, and context—connected.*

**Depends on:** [Ambient Instructions, Memory, and Tasks](ambient-instructions-memory-tasks.md), [Provider-Independent Local Embeddings](provider-independent-local-embeddings.md), Notes, Documents/RAG, Scheduled Jobs, and domain-scoped access control

## Decision

Evolve the user-facing **Memory** domain into **Knowledge**, a private-first
personal knowledge graph. The user-facing name changes before the
technical identifiers do:

| Surface | Initial value |
|---|---|
| UI name | Knowledge |
| Subtitle | Your personal knowledge graph |
| Existing route | `/memory` |
| Existing domain slug | `memory` |
| Existing API resource | `/api/v1/memories` |

Keeping the route, slug, scopes, tables, and API stable avoids breaking
conversations, permissions, tools, clients, and integrations. A future
`/knowledge` route may become canonical later while `/memory` remains a
compatible redirect.

## Why this name

Memory describes only one input. The target experience connects memories with
notes, documents, learned instructions, conversations, entities, and temporary
operational context.

**Knowledge** is broad enough to include different information sources while
remaining concrete inside the application. It is the place where the user can
inspect what Allerac knows, why it knows it, and how that knowledge is related.

The subtitle clarifies that this is connected personal knowledge rather than a
generic document repository. Use one of:

- **Your personal knowledge graph** — preferred for the domain header.
- **Memory, knowledge, and context—connected.** — preferred for descriptive copy.

Names considered but not selected:

- **Allerac Memory** — accurate today but too narrow for the target.
- **Allerac Mind** — approachable, but anthropomorphic and less precise.
- **Allerac Intelligence** — useful as a marketing concept, but too abstract and
  institutional as a system module.
- **My Allerac** — already used for the lightweight learned-instructions review
  surface.

## Product boundary

Knowledge is not a second copy of every record in Allerac. It is a
unified read, retrieval, and relationship layer over records that retain a single
source of truth.

| Information | Source of truth | Lifetime | Example |
|---|---|---|---|
| Durable memory | `conversation_summaries` | Long-lived | "Gian supports Palmeiras and Barcelona." |
| Learned instruction | Structured domain instructions | Until revoked | "Prefer concise answers." |
| Personal note | Notes storage | User-managed | "Buy olive oil." |
| Reminder/action | `scheduled_jobs` | Time-bound / operational | "Remind me about the doctor tomorrow." |
| Document knowledge | Documents and chunks | While source exists | A manual or uploaded PDF |
| Conversation evidence | Chat conversations/messages | Historical | Where a fact was learned |

The graph may show all of these together, but it stores references such as
`source_type` and `source_id` instead of duplicating the full source record.

## Persistence semantics

The assistant must choose the correct persistence mechanism before confirming an
action:

| User intent | Tool | Meaning |
|---|---|---|
| "Remember that I prefer..." | `create_memory` | Stable context that should improve future conversations |
| "Write down that I need..." | `save_note` | User-authored information kept for later reference |
| "Remind me tomorrow..." | `schedule_task` | A future action with time or recurrence |
| "From now on, always..." | `learn_instruction` | A standing behavioral rule |

Only a successful tool result permits the assistant to say that information was
stored, learned, or scheduled.

A scheduled reminder should not also become a durable memory merely so it can
appear in the graph. Durable knowledge may be distilled separately when the
underlying event reveals a stable fact:

```text
"Doctor appointment tomorrow at 10:00"  -> scheduled job
"Gian is under cardiology follow-up"     -> durable memory, if explicitly learned
"Gian prefers morning appointments"      -> learned preference, with evidence
```

## Typed knowledge graph

### Node model

The graph should expose a provider-neutral representation instead of requiring the
UI to understand every source table:

```ts
type IntelligenceNodeType =
  | 'memory'
  | 'note'
  | 'document'
  | 'instruction'
  | 'conversation'
  | 'person'
  | 'organization'
  | 'place'
  | 'topic'
  | 'reminder';

interface IntelligenceNode {
  id: string;
  type: IntelligenceNodeType;
  sourceType: string;
  sourceId: string;
  label: string;
  summary?: string;
  domainSlug?: string | null;
  importance?: number;
  status?: string;
  occurredAt?: string;
  expiresAt?: string;
  metadata: Record<string, unknown>;
}
```

Operational nodes such as reminders are projections. Their lifecycle follows their
source record: completing, cancelling, or deleting a job changes or removes its
graph projection.

### Edge model

```ts
type IntelligenceRelation =
  | 'shares_topic'
  | 'semantically_similar'
  | 'belongs_to_domain'
  | 'derived_from'
  | 'mentioned_in'
  | 'about'
  | 'scheduled_for'
  | 'supersedes'
  | 'contradicts';

interface IntelligenceEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relation: IntelligenceRelation;
  weight: number;
  provenance: 'deterministic' | 'embedding' | 'extracted' | 'user';
  evidence?: string;
}
```

Every relationship must have provenance. A user should be able to understand why
two nodes are connected.

## Current graph baseline

The first Memory Graph implementation:

- renders memory nodes with Three.js;
- colors nodes by domain;
- sizes nodes by importance;
- creates strong links from shared `key_topics`;
- creates weaker links between memories in the same domain;
- limits each node to its five strongest candidate relationships;
- supports search, domain filtering, selection, detail review, and deletion.

The current relationship weight is:

```text
weight = shared topic count * 3 + same domain * 1
```

A memory can be isolated when it is the only memory in its domain and shares no
topic with another visible memory. Filters can also temporarily hide its
neighbors.

This heuristic is suitable as a visual baseline, but `key_topics` alone cannot
recognize paraphrases or relationships expressed with different vocabulary.

## Local semantic relationships

Use the existing provider-independent local embedding boundary to add semantic
similarity without coupling Knowledge directly to Ollama or a specific
model.

Principles:

1. Store the provider, model, dimensions, and embedding version.
2. Never compare vectors from incompatible vector spaces.
3. Generate embeddings asynchronously when practical.
4. Prioritize interactive retrieval over background graph indexing.
5. Keep keyword/topic relationships available when embeddings are degraded.
6. Require a similarity threshold; do not connect every node.
7. Limit semantic neighbors per node to keep retrieval and visualization useful.

Semantic similarity is evidence for a relationship, not proof that two facts mean
the same thing. Contradiction, supersession, and entity extraction require
additional classification or explicit user confirmation.

## Retrieval

Knowledge should support several retrieval strategies behind one
service boundary:

1. exact identifiers and structured filters;
2. keyword and topic search;
3. vector similarity;
4. graph expansion from relevant seed nodes;
5. optional reranking;
6. domain and user-access filtering at every stage.

The chat runtime should receive a small, relevant context package rather than the
entire graph. Returned context should preserve source references and relationship
provenance.

## Performance and consistency

Do not duplicate Notes or Jobs into `conversation_summaries` for performance.
Duplication increases storage, embedding work, stale-data risk, and ambiguous search
results.

Prefer:

- indexes on each source table;
- a graph projection/query service;
- a shared semantic index keyed by `user_id`, `source_type`, and `source_id`;
- bounded nearest-neighbor queries;
- short-lived caching for graph payloads;
- incremental invalidation after source mutations;
- a materialized projection only if measured scale requires it.

The source table remains authoritative. The semantic index and graph projection
must be rebuildable.

## Privacy and access control

- Every node and edge is scoped to a user.
- Domain access is checked before retrieval or mutation.
- Cross-domain retrieval must not bypass domain permissions.
- Sensitive node types may be excluded from visualization or embedding.
- Deleting a source must delete or invalidate its projections, embeddings, and
  derived edges.
- Provenance must never expose another user's records.

Knowledge remains private-first and self-hosted. Managed external
knowledge-base services may be architectural references or optional adapters, but
are not the default source of truth.

## Phased evolution

### Phase 1 — Product identity and compatibility

1. Rename the domain in the UI to **Knowledge**.
2. Add the subtitle and explanatory empty states.
3. Keep `memory` as the technical slug and `/memory` as a compatible route.
4. Document the Memory, Notes, Jobs, and Instructions boundaries in user-facing
   copy.

### Phase 2 — Typed graph contract

1. Introduce `IntelligenceNode` and `IntelligenceEdge` service contracts.
2. Adapt existing memories into typed nodes.
3. Move current topic/domain edge construction out of the Three.js component.
4. Return relationship reason and provenance to the UI.
5. Add API/service tests for ownership and domain filtering.

### Phase 3 — Local semantic edges

1. Add versioned embeddings for eligible intelligence nodes.
2. Build incremental indexing and rebuild support.
3. Add thresholded `semantically_similar` edges.
4. Benchmark Portuguese, Spanish, and English relationships on the target mini PC.
5. Expose degraded mode when embeddings are unavailable.

### Phase 4 — Multi-source projections

1. Add Notes and Documents.
2. Add learned instructions and their evidence.
3. Add Jobs as temporary reminder nodes without duplicating job content as memory.
4. Add source-type filters and distinct visual treatments.
5. Propagate source updates and deletions into the graph.

### Phase 5 — Entities and explicit relations

1. Extract candidate people, organizations, places, projects, and topics.
2. Preserve extraction evidence and confidence.
3. Support user correction, merge, split, and relationship removal.
4. Model contradiction and supersession instead of silently overwriting facts.

### Phase 6 — Graph-assisted recall

1. Use semantic search to choose seed nodes.
2. Expand through high-value typed edges with strict budgets.
3. Rerank the resulting context.
4. Return citations/provenance to chat and API clients.
5. Measure answer quality, latency, memory hit rate, and false associations.

## Definition of done

- The UI presents Knowledge as a personal knowledge graph.
- Memory, Notes, Jobs, Documents, and Instructions retain distinct semantics and
  sources of truth.
- Typed nodes and edges include ownership, source references, and provenance.
- Semantic relationships use versioned local embeddings and explicit thresholds.
- Source mutation and deletion cannot leave authoritative stale copies.
- Retrieval respects user and domain access at every stage.
- Chat receives relevant, bounded, attributable context.
- The graph remains useful when local embeddings are unavailable.

## Non-goals

- Copying every source record into the memory table.
- Treating all related records as durable memory.
- Connecting every node merely to make the visualization dense.
- Replacing transactional Notes or Jobs behavior with vector search.
- Requiring a managed cloud knowledge-base service.
- Letting inferred relations become authoritative facts without provenance.
