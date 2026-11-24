# Unit terminal (Claude Code and Codex)

Runs the unmodified Claude Code and Codex CLIs in pseudoterminals inside
containers of the Unit. The browser talks only to authenticated Allerac routes
(`/api/terminal/*`); those routes proxy to these services over the Unit network
with a server-side secret. The services have no host ports, and each sits on its
own network shared only with the app (`<unit>_terminal_claude`,
`<unit>_terminal_codex`): the CLIs reach `app:8080` and the internet, not the
database, Redis, Ollama, Portainer, the webhook or each other.

Design and decisions: [docs/roadmap/unit-terminal-container.md](../../docs/roadmap/unit-terminal-container.md).

## Model

- One image, two compose services: `terminal-claude` (port 3015) and
  `terminal-codex` (port 3016), profile `terminal`.
- **One shared session per provider.** Every authorized user and tab on the
  same provider sees and types in the same session; the last resize wins.
  Closing a tab does not end it. Without any attached tab it ends after 30
  minutes. Claude and Codex are independent processes.
- **Access** is an admin-granted permission (`user_terminal_access`, Admin →
  user → *Unit terminal*). Admins have it implicitly. It is checked by the app
  on every request, so revocation applies on the next poll or keystroke. The
  services trust only their bearer secret and reject browser (`Origin`)
  requests.
- **Recent sign-in**: reading output and controlling a session (and granting
  API access) also need a password confirmation bound to the browser session
  (`/api/terminal/unlock`, admins included). It lapses after 15 minutes without
  terminal activity or 8 hours at most, and on sign-out or app restart.
  Accounts without a password unlock only within 15 minutes of signing in.
- **Logins** are the CLIs' own, made once inside the container and kept in the
  provider's home volume (`terminal_claude_home`, `terminal_codex_home`). All
  users with access share them, and anyone with access can log out or change
  CLI settings. Grant the terminal only to people trusted with the whole Unit
  workspace. Check the provider's plan terms before sharing an individual plan.
- **Workspace**: `/workspace`, the `terminal_workspace` volume shared by both
  providers (or `TERMINAL_WORKSPACE`, a host folder owned by uid 10001).
- **History**: the app records who started, reconnected or stopped a session
  and how it ended (`terminal_session_events`, admin view in `/connections`,
  90 days). Input and output are never recorded.

## Setup

1. In the Unit's env file set `CLAUDE_TERMINAL_SECRET` and
   `CODEX_TERMINAL_SECRET` (each `openssl rand -hex 32`) and add `terminal` to
   `COMPOSE_PROFILES`. Leave `CLAUDE_TERMINAL_URL` / `CODEX_TERMINAL_URL` unset
   (they default to the compose services); remove any values left from the old
   host-bridge pilot (`host.docker.internal`, `*_TERMINAL_USER_ID`).
2. `docker compose up -d --build` (or `./update.sh`). The migration adds the
   permission, the history table and the service-account flag.
3. As an admin, grant *Unit terminal* to the users who should use it.
4. Open `/terminal`, choose the provider and **Abrir / reconectar**.
5. First login, once per Unit and provider:
   - **Claude Code** shows a login link in the session (or type `/login`). Open
     it in your browser and paste the code back into the terminal.
   - **Codex** is restricted to ChatGPT login. Use the device-code option if the
     login screen offers it; otherwise run on the server
     `docker exec -it <unit>-terminal-codex codex login --device-auth`.
   The status card in `/connections` and the banner on `/terminal` show whether
   the provider is logged in.

CLI versions are pinned in the `Dockerfile` (`CLAUDE_CODE_VERSION`,
`CODEX_VERSION`); rebuild the image to upgrade. Self-update is disabled and the
root filesystem is read-only.

Codex runs with `--sandbox workspace-write` by default. If its Linux sandbox
cannot start inside the hardened container, set
`CODEX_TERMINAL_SANDBOX=danger-full-access`: the container (non-root, no
capabilities, read-only root, only the home and workspace volumes writable) is
then the only sandbox.

## Allerac API tools (allerac_unit MCP)

Each new CLI session gets an `allerac_unit` MCP server (`allerac_help`,
`allerac_status`, `allerac_request`). In a shared session the tools act as the
Unit's **terminal service account** (`terminal@service.allerac.invalid`: no
password, no sessions, not admin, hidden from user management), never as the
user who typed.

In `/connections`, only an admin can **Conectar API** for a provider: choose the
scope groups, and the app creates a 7-day key for the service account,
installs it on that terminal service and grants the account exactly the domains
those scopes need. The browser receives only metadata. **Desconectar API**
revokes the keys before clearing the file, so revocation works even when the
terminal is down. Reconnecting rotates (renews) the key; a failed installation
revokes the new key.

The token is stored in `/home/terminal/.config/allerac/terminal/allerac-api-<provider>.json` (mode 0600)
on the provider's home volume, not in the shared workspace. Treat the home
volumes as secrets in backups. Command arguments contain only the MCP command
and the file path. Requests go only to `ALLERAC_TERMINAL_API_URL`
(`http://app:8080`) under `/api/v1`, without following redirects; the API
enforces scopes and domain checks. The MCP process rereads the file on every
call, so rotation and disconnection apply to running sessions. After the first
connection, open a new session to load the MCP server.

## Threat model

The agent is untrusted input-driven code: anything it reads (a note, a ticket,
a web page) can try to instruct it. Inside its container it runs with the same
uid as the bridge, so it **can** read the bridge's environment
(`/proc/1/environ`, including the provider secret) and the API token file.
Separating them would need `CAP_SETUID` or `hidepid` (`CAP_SYS_ADMIN`), which
the hardening drops on purpose. What that buys it:

- **Bridge secret**: control of the session it already runs in. The other
  provider's bridge has a different secret and is not reachable on its network.
- **API token**: what the `allerac_unit` tools already allow, plus the ability
  to exfiltrate the token (the CLIs have internet access) and use it elsewhere
  until it expires. Treat the token as exposed to the model: grant only the
  scope groups you need, keep the 7-day expiry, and **Desconectar API** to revoke
  it at once. The service account is its own user, so the token never reaches
  the data of the people who use the terminal.

## Behaviour details

The service does not start a CLI until **Abrir / reconectar** is selected.
**Encerrar sessão** kills the process for everyone; Ctrl+C is passed through.
Restarting the container ends the live session (logins and workspace persist).
Output is kept only in bounded process memory (2 MiB); after that a fresh page
cannot replay the whole screen and asks to open a new session. The web client
batches keystrokes over an 8 ms window and while a request is in flight; output
reads wake on input and poll every 16 ms during activity, 250 ms when idle.

The child environment excludes inherited Anthropic/OpenAI API credentials,
cloud-provider overrides and the service secrets, so the CLIs use their native
subscription login (this is hygiene, not a boundary; see Threat model). Confirm account, plan and extra-usage settings inside each
CLI; this service does not limit spending or inspect billing.
`tui.disable_paste_burst=true` keeps network-batched typing from being taken as
an unbracketed paste in Codex.

Run `npm test --prefix infra/unit-terminal` for service authentication and
lifecycle tests. The main Jest suite covers the app's authorization, proxy,
history and service account.
