# Domain: Code

**Slug:** `code`  
**Route:** `/code`  
**Icon:** 💻  
**Status:** Active  
**Default Skill:** `programmer` (`skills/programmer.md`)

## Purpose

The programmer domain. The AI can run shell commands, read and edit files, clone repos, install packages, and open pull requests. All code execution is sandboxed inside the `allerac-executor` container.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/code/page.tsx` |
| Client layout | `src/app/code/CodeClient.tsx` |
| Workspace panel | `src/app/code/WorkspacePanel.tsx` |
| File edit UI | `src/app/code/FileEditProposal.tsx` |
| Shell tool | `src/app/tools/shell.tool.ts` |
| Skill | `skills/programmer.md` |

## Tools Available

| Tool | Description |
|------|-------------|
| `execute_shell` | Run bash commands inside the executor sandbox |
| `edit_file` | Propose file edits; user accepts or rejects the diff |
| `search_web` | Web search via Tavily |
| `read_url` | Fetch and read a URL |
| `get_today_info` | Current date/time |

## Workspace

Each user gets an isolated directory at `/workspace/projects/<userId>/`. The `programmer` skill injects the correct path into the system prompt at runtime.

Files created by the executor are owned by `root` (the executor runs as root inside the container). To delete them from the host, use `sudo rm -rf`.

## External Integrations

- **Git** — clone, commit, push, branch operations
- **GitHub** — PR creation via `GITHUB_PAT` / `GITHUB_TOKEN`
- **Node.js / npm / Python** — available inside the executor container

## Security Notes

- The executor does **not** have access to `/var/run/docker.sock` (removed deliberately).
- Certain commands are blocked by the executor's allowlist/blocklist in `infra/executor/server.js`.
- The programmer skill workflow is: code in workspace → PR on GitHub → human review → deploy. No auto-deploy path.

## DB Scope

- `chat_conversations` where `domain_slug = 'code'`
- `conversation_summaries` where `domain_slug = 'code'`
