# Tickets — Overview

A ticket management system for humans and agents. Users and agents can open tickets,
agents and users can resolve them. Built on top of the existing background agents infrastructure.

## Problem

Background agents execute tasks and return results inline in the chat. This works well for
one-off requests but breaks down for:

- Tasks that need to be tracked over time
- Work that requires multiple sessions or handoffs
- Tasks opened by agents themselves (e.g. "I found a bug, opening a ticket")
- Work that needs prioritization and scheduling
- Situations where you want to see a backlog and make decisions about what to do next

## What Tickets Are

A ticket is a persistent unit of work with:
- A clear description of what needs to be done
- A status that tracks progress (open → in progress → resolved)
- A priority that influences when it gets picked up
- An owner (user or agent) and an assignee (user or agent)
- A link to the agent run that resolved it (if resolved by an agent)
- A full audit trail of what happened

## Key Design Decisions

### Creators and Resolvers
Both users and agents can create and resolve tickets:
- **User → opens ticket** via chat (natural language) or UI form
- **Agent → opens ticket** when it detects work that needs tracking during a task
- **User → resolves ticket** by marking it done after doing the work manually
- **Agent → resolves ticket** by executing the work and linking the result

### Priority System
Priority is a first-class concept, isolated in its own service so it can evolve independently.
The system understands priority and uses it to decide which ticket to work on next.
See [priority.md](priority.md) for the full model.

### Chat Integration
Users can interact with the ticket system via natural language in chat:
- "Open a ticket to refactor the auth service" → creates ticket
- "What tickets are open?" → lists tickets
- "Work on the highest priority ticket" → dispatches agent
- "Mark ticket #12 as done" → resolves ticket

The chat integration is a thin layer: a skill (`tickets`) that translates natural language
into ticket operations and delegates to the ticket service.

### Relationship to Agent Runs
Tickets and agent runs are separate concepts that link together:
- A ticket can exist without an agent run (user resolves it manually)
- An agent run can exist without a ticket (ad-hoc chat request)
- When an agent resolves a ticket, the run is linked via `resolved_by_run_id`

This keeps the existing agent system unchanged.
