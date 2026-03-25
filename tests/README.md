# Allerac One — Testing Strategy

## Philosophy

Test what breaks silently. The goal is not 100% coverage — it's confidence that the critical paths work.

**Priority order:**
1. Security (auth, path isolation)
2. Core pipeline (chat-handler, LLM normalization)
3. Business logic (skills, memory)
4. API contracts (workspace routes)

Don't test: React components (UI changes too fast), trivial getters/setters, third-party SDK internals.

## Stack

- **Test runner:** Jest
- **HTTP testing:** supertest (for API routes)
- **Mocking:** Jest mocks (`jest.mock()`) for LLM calls, ShellTool, DB
- **DB (integration):** real PostgreSQL via Docker test container (only for auth/chat services)

## Running tests

```bash
# Unit tests only (fast, no DB)
npm run test:unit

# Integration tests (requires DB)
npm run test:integration

# All
npm test
```

> Scripts to be added to `package.json` when implementing.

## Specs

Each file in `specs/` describes **what** to test and **why** — not the implementation.
An agent can read a spec file and implement the test suite directly.

| Spec | Module | Priority |
|------|--------|----------|
| [auth.md](specs/auth.md) | `services/auth/auth.service.ts` | 🔴 Critical |
| [workspace-api.md](specs/workspace-api.md) | `api/workspace/*` | 🔴 Critical |
| [chat-handler.md](specs/chat-handler.md) | `services/chat/chat-handler.ts` | 🔴 Critical |
| [llm-service.md](specs/llm-service.md) | `services/llm/llm.service.ts` | 🟡 High |
| [skills.md](specs/skills.md) | `services/skills/skills.service.ts` | 🟡 High |
| [memory.md](specs/memory.md) | `services/memory/conversation-memory.service.ts` | 🟢 Medium |
