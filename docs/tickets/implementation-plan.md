# Tickets — Implementation Plan

The system is built in 4 phases. Each phase is independently usable.

---

## Phase 1 — Foundation (DB + Service + API)
*Goal: tickets exist and can be created/listed/resolved via API*

- [ ] Migration: `tickets` table + `ticket_events` table
- [ ] `TicketPriorityService` — v1 scoring (explicit urgency + type + keywords)
- [ ] `TicketService` — create, update status, list, get by id
- [ ] Server actions: `createTicket`, `updateTicket`, `listTickets`, `getTicket`
- [ ] API routes: `GET/POST /api/tickets`, `GET/PATCH/DELETE /api/tickets/[id]`

**Deliverable:** Can create and query tickets via API. Priority scoring works.

---

## Phase 2 — UI (Hub integration)
*Goal: user can manage tickets from the UI*

- [ ] Tickets section in Hub (new tab or domain)
- [ ] Ticket list view: filter by status, priority, type; sort by priority_score
- [ ] Ticket detail view: title, description, status, events timeline, linked agent run
- [ ] Create ticket form (manual)
- [ ] Status transitions from UI (resolve, cancel, reopen)

**Deliverable:** Full ticket management without chat or agent dispatch.

---

## Phase 3 — Chat Integration
*Goal: user can open and manage tickets via natural language*

- [ ] `tickets` skill definition (`src/app/skills/tickets.md`)
- [ ] Intent detection and field extraction in skill
- [ ] Wire skill to ticket server actions
- [ ] Chat responses: confirmation, ticket list formatting, status updates
- [ ] Agent-created tickets: expose `createTicket` to agent tool use

**Deliverable:** "Open a ticket to fix X" works in chat. Agents can open tickets.

---

## Phase 4 — Dispatcher
*Goal: agents automatically pick up and resolve tickets*

- [ ] `DispatcherService` — poll loop, priority selection, run creation
- [ ] Link completed runs back to tickets (resolve ticket on run completion)
- [ ] Retry logic on run failure (configurable max retries)
- [ ] Dispatcher toggle (on/off per user settings)
- [ ] Age-based priority re-scoring (background job)

**Deliverable:** Open tickets are automatically worked on by agents based on priority.

---

## Future
- Priority v2: user feedback loop
- Priority v3: LLM-based scoring
- Due dates and deadline-aware priority
- Ticket dependencies (blocked by / blocking)
- Multi-user ticket assignment
- Notification on ticket resolved (via existing notifier)
