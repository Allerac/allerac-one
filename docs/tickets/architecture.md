# Tickets — Architecture

## Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interfaces                       │
│                                                             │
│   Chat (natural language)          Tickets UI (Hub)         │
│         ↓                                ↓                  │
│   tickets skill                   tickets API routes        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Ticket Service                           │
│                                                             │
│   create · update · assign · resolve · cancel · list        │
│                          ↓                                  │
│              Priority Service (isolated)                    │
│         compute · re-score · explain                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     Dispatcher                               │
│                                                             │
│   Polls open tickets → decides to dispatch → creates        │
│   agent_run → links run to ticket                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              Existing Background Agents                      │
│                                                             │
│   agent_runs · agent_workers · WorkerRunnerService          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                      Database                                │
│                                                             │
│   tickets · ticket_events · agent_runs · agent_workers      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Ticket Service (`src/app/services/tickets/ticket.service.ts`)
Core CRUD and lifecycle logic. All ticket state changes go through here.
- Creates tickets and records `created` event
- Transitions status and records `status_changed` event
- Calls Priority Service on create and update
- Does NOT directly create agent runs — that is the Dispatcher's responsibility

### Priority Service (`src/app/services/tickets/priority.service.ts`)
Isolated. Called by Ticket Service. Never calls other services.
See [priority.md](priority.md).

### Dispatcher (`src/app/services/tickets/dispatcher.service.ts`)
Decides when and how to dispatch an agent to work on a ticket.
- Polls for `open` tickets with no active run (configurable interval)
- Skips tickets already `in_progress`
- Selects the highest `priority_score` ticket
- Creates an `agent_run` with the ticket description as prompt
- Transitions ticket to `in_progress`, records event
- When run completes: transitions ticket to `resolved`, links `resolved_by_run_id`
- When run fails: transitions ticket back to `open` (retry) or `failed` (max retries exceeded)

The dispatcher can be toggled on/off. When off, tickets are only resolved manually.

### Tickets Skill (`src/app/skills/tickets.md` + action)
Enables chat-based ticket interaction. Translates natural language to ticket operations:
- Detect intent: create / list / resolve / cancel / prioritize / assign
- Extract fields: title, description, type, urgency keywords
- Call ticket service actions
- Return confirmation or list in chat

### API Routes (`src/app/api/tickets/route.ts`)
REST endpoints for the UI:
- `GET /api/tickets` — list with filters (status, priority, type)
- `POST /api/tickets` — create
- `GET /api/tickets/[id]` — detail with events
- `PATCH /api/tickets/[id]` — update status, priority, assignment
- `DELETE /api/tickets/[id]` — cancel

### Server Actions (`src/app/actions/tickets.ts`)
Used by both UI and skill. Thin wrappers around Ticket Service with auth.

## Flows

### User creates ticket via chat
```
User: "open a ticket to fix the login redirect bug"
  → Chat detects tickets skill intent
  → tickets skill extracts: title="Fix login redirect bug", type="bug", urgency=medium
  → calls createTicket action
  → Priority Service scores it (bug + keyword "bug" + no explicit urgency → score ~55)
  → ticket created with status=open, priority=medium
  → ticket_event: created, actor=user
  → Chat responds: "Ticket #42 opened: Fix login redirect bug (medium priority)"
```

### Agent creates ticket during a run
```
Agent worker detects issue mid-task
  → calls createTicket action with created_by_type=agent, created_by_run_id=<current run>
  → ticket created, priority computed
  → ticket_event: created, actor=agent
  → worker continues its original task
```

### Dispatcher picks up ticket
```
Dispatcher polls every 30s
  → finds open ticket #42 (highest priority_score)
  → creates agent_run with prompt = ticket title + description
  → transitions ticket: open → in_progress
  → ticket_event: status_changed, actor=system
  → WorkerRunnerService picks up the run
  → on run completion:
      → transitions ticket: in_progress → resolved
      → sets resolved_by_run_id
      → ticket_event: resolved, actor=agent
```

### User resolves ticket manually
```
User clicks "Resolve" in UI (or: "mark ticket 42 as done")
  → PATCH /api/tickets/42 { status: resolved, resolution_notes: "..." }
  → Ticket Service transitions status
  → ticket_event: resolved, actor=user
```

## What Is NOT Changed

- `agent_runs` and `agent_workers` tables: unchanged
- `WorkerRunnerService`: unchanged
- Chat and conversation system: unchanged

The ticket system is additive. It sits on top of existing infrastructure.
