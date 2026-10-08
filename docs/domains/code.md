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

Each shell user gets a directory at `/workspace/projects/<userId>/`. The `programmer` skill injects the correct path into the system prompt at runtime. This keeps commands in the right folder but is not isolation between users (one container, one uid).

`/workspace` is the Docker volume `allerac_executor_workspace` (or the host folder in `EXECUTOR_WORKSPACE`). Files are owned by uid `10001` (the executor's non-root user).

**Access:** the shell, the workspace panel and the `execute_shell` / `edit_file` tools are admin-only by default. Non-admin users with access to the Code domain can chat, but these tools are not offered to them unless their user ID is listed in `SHELL_ALLOWED_USER_IDS`.

## External Integrations

- **Git** — clone, commit, push, branch operations
- **GitHub** — via the app's GitHub tools. `GITHUB_PAT` / `GITHUB_TOKEN` are no longer passed into the executor, so shell commands cannot use them.
- **Node.js / npm / Python** — available inside the executor container

## Security Notes

- The executor does **not** have access to `/var/run/docker.sock` (removed deliberately).
- The executor runs as a non-root user with no host mounts, all capabilities dropped and a read-only root filesystem (see `infra/executor/README.md`).
- `infra/executor/server.js` still blocks some commands with a regex blocklist. This is defense in depth only and easy to bypass.
- The programmer skill workflow is: code in workspace → PR on GitHub → human review → deploy. No auto-deploy path.

## DB Scope

- `chat_conversations` where `domain_slug = 'code'`
- `conversation_summaries` where `domain_slug = 'code'`
