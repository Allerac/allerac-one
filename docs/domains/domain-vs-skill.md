# Domains vs Skills — why both exist

## The short answer

**Domain** = who can access what, at which URL, with which conversation history.  
**Skill** = what the AI knows, how it behaves, which tools it can use.

They are separate layers that compose together. A domain without a skill is just a gated route. A skill without a domain is just a system prompt with no home.

---

## Responsibilities

| Concern | Domain | Skill |
|---|---|---|
| URL (`/design`, `/finance`) | ✅ | ✗ |
| Access control (which users can enter) | ✅ | ✗ |
| Conversation history scope | ✅ | ✗ |
| System prompt (AI persona) | ✗ | ✅ |
| Tool configuration (`search_web`, `execute_shell`, etc.) | ✗ | ✅ |
| Workspace path injection (`{{USER_ID}}`) | ✗ | ✅ |
| Can be swapped without breaking anything | ✗ | ✅ |

---

## Why not merge them?

If a domain and skill were the same thing, every time you wanted to change the AI's behavior you would also be changing the access control and the URL. And to give a user access to a different AI persona, you'd need to create a whole new route.

Keeping them separate means:

- You can **reassign the skill** of a domain (Design domain gets a "Design Critique" skill instead of "Design System" skill) without touching routes or user permissions.
- You can **reuse a skill** across domains (the `programmer` skill is used by both `code` and `tickets` domains).
- You can **grant access** to a domain without knowing or caring which skill is currently active.

---

## The relationship today

Today the relationship is 1:1 by default — each domain has one active skill. That default is stored in `domain_skill_defaults`.

```
design domain  →  design skill (default)
finance domain →  finance skill (default)
tickets domain →  tickets skill (default)
```

This is a *default*, not a constraint. The architecture already supports:

- **Admin overrides** the default via the Domain Skills modal
- **Future: multiple skills per domain** — e.g. the Design domain could offer "Design Critique" and "Token Generator" as selectable skills; the user picks one per conversation

---

## Data model

```
domains                     skills
──────────────────          ──────────────────────────
id                          id
slug          ←──────────── (referenced by domain_skill_defaults)
display_name                name
is_active                   display_name
                            content (system prompt)
                            category
                            domain (frontmatter → auto-bind)

user_domain_access          domain_skill_defaults
──────────────────          ──────────────────────────
user_id                     domain_slug  →  domains.slug
domain_id → domains.id      skill_id     →  skills.id

skill_tools
──────────────────────────
skill_id  →  skills.id
tool_name
```

---

## Analogy

Think of it like a building:

- The **domain** is a floor with a key card reader — it controls who gets in and keeps a separate logbook of activity.
- The **skill** is the specialist sitting at the desk on that floor — it determines what gets done and which tools are available.

You can replace the specialist without rewiring the key cards. You can grant someone floor access without knowing who the specialist is.
