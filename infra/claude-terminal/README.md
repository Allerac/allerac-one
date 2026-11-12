# Local Claude Code and Codex terminal pilot

> **Local, single-user pilot for a Windows or Linux host.** Never enable this
> on a host or unit that is public or internet-exposed. Enabling it gives the
> configured Allerac user an interactive shell on the host, with the full
> permissions of the account that runs the bridge. On a host that also runs
> public units, the terminal gives shell access to that whole host, including
> those units' files, containers it can reach and anything else that account
> can read. It is off unless the terminal environment variables below are set
> and the bridge is started.

Runs the unmodified Claude Code executable in a host pseudoterminal (ConPTY on
Windows, a Unix PTY on Linux, both through `node-pty`). The
browser talks only to authenticated Allerac routes; those routes proxy to this
bridge with a server-side secret. Anthropic credentials stay with Claude Code.
Only the configured local user ID can access the terminal, including when other
users are administrators. This is full access to the host user's Claude Code
tools and permissions, not a sandbox or an API provider.

## OpenAI / Codex

Codex runs in a separate bridge on port 3016. Install the official CLI and use
`codex login` / `codex login status` to authenticate with ChatGPT. The application
does not read, copy or store Codex's native authentication tokens.

Create `.tools/codex-terminal.json` with an independent random `secret` and the
authorized Allerac `userId`. Set `CODEX_TERMINAL_URL` (for Docker Desktop:
`http://host.docker.internal:3016`), `CODEX_TERMINAL_SECRET` and
`CODEX_TERMINAL_USER_ID` in the local `.env`. Start
`scripts/start-codex-terminal.ps1` (Windows) or the `allerac-terminal@codex`
user service (Linux, see below), then recreate the app with the terminal
compose override. The default binding is loopback, as for the Claude bridge.

Open `/terminal?provider=codex` or choose **OpenAI · Codex** in the terminal's
provider selector. Switching providers detaches the browser from one session
without ending it. Each CLI has a separate process, output buffer, idle timer,
authentication store and server-side bridge credential. Authorization is
checked separately for each provider on every request. Only fixed provider
names are accepted; browser requests cannot choose an executable or endpoint.

Codex starts with native ChatGPT authentication enforced for this subscription
pilot, the official OpenAI provider, workspace-write sandboxing and on-request
approvals. It runs without the shared background daemon. Inherited OpenAI API
keys, access tokens and parent-thread metadata are removed from its child
environment. The status card reports the native login method; account email
and plan tier are not inferred from token files. Use Codex's own `/status` to
inspect the active account and remaining allowance. This remains a local,
single-user terminal integration, not a hosted service or a generic model API.

`tui.disable_paste_burst=true` keeps network-batched typing from being mistaken
for an unbracketed paste, so a single Enter submits the message. Explicit
terminal paste sequences remain handled by the native CLI.

## Setup

### Allerac API tools

Each terminal has an **Allerac API in the terminal** connection in `/connections`.
**Connect API** creates a 30-day personal API key for the signed-in terminal
owner and installs it on that provider's local bridge. The browser receives
only metadata. Identity, capability and accessible-domain reads are included;
additional read/write groups are opt-in and offered only for domains the user
can access. Other users, including admins, cannot configure this connection.

The bridge registers an `allerac_unit` MCP server with each new native session.
Its tools are `allerac_help`, `allerac_status`, and `allerac_request`. No global
Claude/Codex configuration is modified. Command arguments contain only the MCP
server command and connection-file path, never the API token.

The token is stored outside the CLI working directory, in a per-user config
directory with owner-only file mode where supported:

- Windows: `%APPDATA%\allerac\terminal\allerac-api-{provider}.json`
- Other platforms: `$XDG_CONFIG_HOME/allerac/terminal/` (default
  `~/.config/allerac/terminal/`)

Set `ALLERAC_TERMINAL_STATE_DIR` to use another directory; the bridge refuses
a directory inside the CLI working directory. Treat this file as a credential:
it is not in the CLI's project folder, but the host user (and therefore any
tool the CLI runs as that user) can still read it. The bridge credential is
never given to MCP. If you used an earlier build that wrote
`.tools/allerac-api-{provider}.json`, delete that file and select **Connect
API** again; reconnecting rotates and revokes the previous key.

Requests use only the bridge-configured origin (`ALLERAC_TERMINAL_API_URL`,
default `http://localhost:8080`) under `/api/v1`, without following redirects.
The API enforces key scopes, user ownership and route-level domain checks.
The MCP process rereads its connection file on every tool call, so rotation
and disconnection apply to sessions already using the tool. Removing a key
through the regular API-key controls also stops its API access.

**Disconnect API** revokes managed keys before clearing the host file, so
revocation works even when the bridge is offline. Reconnecting rotates the
key; failed installation revokes the new key. The application never stores
recoverable tokens in its database (the existing API-key service stores hashes).
After upgrading the bridge for the first time, open a new terminal session to
load the MCP server. Future connect/disconnect changes do not require restart.

### Password confirmation

Opening, typing into, resizing, reading or ending a terminal session, and
connecting the API (**Connect API** / **Update access**), require the user to
confirm their password in the page. The confirmation is held server-side for
the current sign-in session only, expires after 15 minutes without terminal
activity (8 hours at most), and is cleared by signing out or restarting the
app. Attempts are rate limited (`RATE_LIMIT_TERMINAL_UNLOCK_REQUESTS`, default
5 per `RATE_LIMIT_TERMINAL_UNLOCK_WINDOW_SECONDS`, default 600). Accounts
without a password (for example Google sign-in) must sign in again and confirm
within 15 minutes of that sign-in. **Disconnect API** never needs
confirmation, so access can always be revoked.

### Terminal installation (Windows)

1. Install Claude Code and sign in using its native flow. Check `claude auth status`.
2. Run `npm install --prefix infra/claude-terminal` on the host.
3. Create the ignored `.tools/claude-terminal.json` with `userId` (the Allerac UUID)
   and `secret` (at least 32 random characters). Do not commit this file.
4. Start `scripts/start-claude-terminal.ps1`. Default binding is loopback. For
   Docker Desktop the host gateway may need
   `-ListenHost 0.0.0.0 -AllowWildcardHost`; use only on the local test
   machine, with Windows firewall restricting network access. Without
   `-AllowWildcardHost` the bridge refuses wildcard addresses.
5. Set `CLAUDE_TERMINAL_SECRET` and `CLAUDE_TERMINAL_USER_ID` in the local compose
   environment to match. Rebuild the app and start it using
   `docker compose -f docker-compose.yml -f docker-compose.terminal.yml up -d --build app`.
6. Sign in as the configured Allerac user and open `/connections` or `/terminal`.

### Terminal installation (Linux)

The bridge runs directly on the Linux host (not in a container) as the user
whose shell the terminal should provide. Use a dedicated, unprivileged account
where possible. Never do this on a host that serves a public unit.

1. Install Claude Code (or Codex) for that user and sign in with its native
   flow. Check `claude auth status` / `codex login status`.
2. Install build tools, then the bridge dependencies. `node-pty` ships no Linux
   prebuilt binary, so `npm install` compiles it with `node-gyp` and needs
   `python3`, `make` and a C++ compiler (Debian/Ubuntu:
   `sudo apt install python3 make g++`):
   `npm install --prefix infra/claude-terminal`.
3. Choose the listen address. A container cannot reach the host's loopback on
   Linux, so bind to the Docker bridge gateway, which is what
   `host.docker.internal` maps to through `host-gateway` in
   `docker-compose.terminal.yml`. Find it with
   `ip -4 addr show docker0` (usually `172.17.0.1`). Wildcard addresses
   (`0.0.0.0`, `::`, or an empty value) are refused unless
   `UNIT_TERMINAL_ALLOW_WILDCARD_HOST=true` is set; do not set it on a server.
   The bridge logs a warning whenever it listens on a non-loopback address.
4. Restrict the port with the host firewall so only local containers reach it.
   Docker containers reach the gateway address through the host's INPUT chain,
   so a default-deny firewall needs an explicit allow for the Docker subnets.
   With ufw (adjust the subnet to your compose networks, see
   `docker network inspect <project>_default`):

   ```sh
   sudo ufw allow from 172.16.0.0/12 to 172.17.0.1 port 3015 proto tcp
   sudo ufw deny 3015/tcp
   # Codex bridge: the same two rules for port 3016.
   ```

   With nftables (assuming an `inet filter` table with an `input` chain; adapt
   to your ruleset and make it persistent):

   ```sh
   sudo nft add rule inet filter input ip saddr 172.16.0.0/12 ip daddr 172.17.0.1 tcp dport { 3015, 3016 } accept
   sudo nft add rule inet filter input tcp dport { 3015, 3016 } drop
   ```

   Then confirm from another machine that the port is closed (for example
   `nc -zv <public-ip> 3015` must fail) and from the app container that it is
   reachable. Never forward the port in a router, tunnel or reverse proxy.
5. Create the environment file outside the repository, owner-only:

   ```sh
   install -dm700 ~/.config/allerac/terminal
   install -m600 /dev/null ~/.config/allerac/terminal/claude.env
   ```

   Set `ALLERAC_TERMINAL_BRIDGE_DIR` (absolute path to this directory), `PATH`
   (must include `node`), `CLAUDE_TERMINAL_SECRET` (at least 32 random
   characters, for example `openssl rand -hex 32`), `CLAUDE_TERMINAL_USER_ID`
   (the Allerac user UUID), `CLAUDE_TERMINAL_CWD` (the working directory the
   CLI starts in), `CLAUDE_TERMINAL_HOST` (the gateway address) and optionally
   `CLAUDE_TERMINAL_EXECUTABLE` (absolute path; otherwise `claude` is looked up
   on `PATH`). Use `CODEX_TERMINAL_*` in `codex.env`. Do not set
   `UNIT_TERMINAL_PROVIDER` there; the service instance name selects it.
6. Install the example user unit [`allerac-terminal@.service`](allerac-terminal@.service)
   and start it (it does nothing until you do):

   ```sh
   install -Dm644 infra/claude-terminal/allerac-terminal@.service ~/.config/systemd/user/allerac-terminal@.service
   systemctl --user daemon-reload
   systemctl --user start allerac-terminal@claude
   journalctl --user -u allerac-terminal@claude -n 20
   ```

   `systemctl --user enable` starts it at login; a headless server also needs
   `loginctl enable-linger <user>` for that. Stop it with
   `systemctl --user disable --now allerac-terminal@claude`. The unit uses
   `NoNewPrivileges=true`, so `sudo` does not work inside the terminal.
   For a quick manual test, run `node server.mjs` with the same variables
   exported instead.
7. Set the same `CLAUDE_TERMINAL_SECRET` and `CLAUDE_TERMINAL_USER_ID` for the
   app (and `CLAUDE_TERMINAL_URL` if the bridge is not on
   `http://host.docker.internal:3015`), then recreate it with
   `docker compose -f docker-compose.yml -f docker-compose.terminal.yml up -d --build app`.
   To turn the feature off again, stop the service and recreate the app without
   the override file.

The bridge does not start Claude until **Open / reconnect** is selected.
Reopening the page attaches to the same running process; only one browser tab
should control it at a time. Browser disconnection leaves the process alive for
up to 30 minutes without bridge activity. **End session** kills the process;
Ctrl+C is passed through to Claude Code. Bridge restart ends the live session.
Output is kept only in bounded process memory, not in Allerac's chat database.
The web client batches keystrokes over an 8 ms window and while a request is in
flight, preserving escape sequences and paste order. Output reads wake on input
and use a 16 ms interval during activity, returning to 250 ms when idle. This
avoids a queue of one HTTP round trip per character without speculative echo.
After more than 2 MiB of terminal output, a fresh page cannot replay the entire
screen and asks you to end the session and open another. Claude Code manages
its own conversation files and any native resume functionality.

Initial child environment excludes inherited Anthropic API credentials and
cloud-provider overrides so the pilot starts with the native account login.
The executable's own authentication methods remain available. Confirm the
account/plan and extra-usage settings inside Claude Code before running work;
this bridge does not impose a subscription spending limit or inspect billing.

Run `npm test --prefix infra/claude-terminal` for bridge authentication and
lifecycle tests. The main Jest suite covers the app's authorization and proxy.
