# Domain: Tickets

**Slug:** `tickets`  
**Route:** `/tickets`  
**Icon:** 🎫  
**Status:** Active  
**Default Skill:** `tickets` (`skills/tickets.md`)

## Purpose

Bug tracker and task management assistant. The AI investigates bugs by reading code, running shell commands to grep for root causes, and generating GitHub issues with step-to-reproduce documentation and diff-style fix proposals.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/tickets/page.tsx` |
| Client layout | `src/app/tickets/TicketsClient.tsx` |
| Ticket service | `src/app/services/tickets/ticket.service.ts` |
| Priority service | `src/app/services/tickets/priority.service.ts` |
| Skill | `skills/tickets.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `execute_shell` | Run shell commands (grep, git log, git blame, etc.) for investigation |
| `edit_file` | Propose file changes; user accepts or rejects the diff |
| `search_web` | Web search |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## External Integrations

- **GitHub API (agent runs / ticket → PR)** — the `github_*` tools run in the app / agent-worker with the system `github_repo_token` (Admin settings). In agent runs they are **admin-only**: a ticket started by a non-admin gets neither these tools nor the shell. Use a fine-grained token limited to the repo (Contents + Pull requests).
- **GitHub from the shell (optional)** — `git` / `curl` inside the executor only see the dedicated `EXECUTOR_GITHUB_TOKEN` (as `GH_TOKEN` / `GITHUB_TOKEN`); the broad `GITHUB_TOKEN` / `GITHUB_PAT` are not passed to the executor.

## Workflow

1. User describes a bug or pastes an error
2. AI runs targeted `grep` / `git log` / `git blame` commands to find root cause
3. AI generates a GitHub issue with: description, steps to reproduce, expected vs actual behaviour, and a fix proposal
4. If `EXECUTOR_GITHUB_TOKEN` is configured (with Issues: write), the issue can be created automatically from the shell; PRs are opened by the `github_*` tools with `github_repo_token`

## Notes

- Shell execution runs inside the `allerac-executor` container (non-root, no host mounts), same as the Code domain, and is admin-only by default (`SHELL_ALLOWED_USER_IDS` can extend it).
- The tickets skill is oriented toward **investigation + documentation**, not just tracking. It actively digs into the code rather than just creating a ticket from a description.
