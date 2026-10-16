# Running several Units on one host

An **Allerac Unit** is one isolated Allerac stack: its own containers, its own
PostgreSQL volume, its own Docker network, its own host ports and its own
secrets. One host can run several Units, for example:

- the primary Unit (the classic install, with the shell executor, monitoring
  and Portainer), and
- one or more **lean public Units** that only serve a public agent, such as a
  website bot or a customer-facing bot, with no shell executor, no Docker
  socket and no host-level monitoring.

Units do not share data. Each Unit has its own users, conversations, memory and
settings, so a public bot cannot read the primary Unit's database.

## How it works

`docker-compose.yml` is parameterised by environment variables. With nothing
set, it resolves to exactly the same project name, container names, volume
names and services as before, so an existing install is unaffected.

| Variable | Default | Drives |
|---|---|---|
| `ALLERAC_UNIT` | `allerac` | Compose project name, every container name (`<unit>-app`, `<unit>-db`, ...) and every volume name (`<unit>_db_data`, ...). Lowercase letters, digits, `-`, `_`. |
| `ALLERAC_ENV_FILE` | `.env` | The env file loaded into the `app` container. Set it to the Unit's own file name. |
| `ALLERAC_PROFILE` / `ALLERAC_MODULES` | `all` | Optional modules enabled in this Unit ([modules-and-profiles.md](modules-and-profiles.md)). |
| `COMPOSE_FILE` | (unset) | `docker-compose.yml:docker-compose.public.yml` selects the lean public profile. |
| `APP_PORT`, `OLLAMA_PORT`, `DOCS_PORT`, `N8N_PORT`, `WEBHOOK_PORT`, `EXECUTOR_DEV_PORT`, `EXECUTOR_DEV_PORT_RANGE`, `NODE_EXPORTER_PORT`, `PROMETHEUS_PORT`, `LOKI_PORT`, `PORTAINER_PORT`, `GARMIN_WORKER_PORT`, `CADDY_HTTP_PORT`, `CADDY_HTTPS_PORT` | today's ports | Host side of every published port. Container ports never change. |
| `MONITORING_BIND`, `PORTAINER_BIND`, `N8N_BIND`, `EXECUTOR_DEV_PORTS_BIND` | `127.0.0.1` | Host interface for internal tools. |
| `APP_MEM_LIMIT` / `APP_CPUS`, `DB_MEM_LIMIT` / `DB_CPUS`, `OLLAMA_MEM_LIMIT` / `OLLAMA_CPUS` | `1G` / none, `512M` / none, `10g` / none | Optional resource limits (`0` CPUs = no limit). |
| `SKILLS_HOST_DIR`, `TELEGRAM_BOTS_FILE` | `./skills`, `./telegram-bots.json` | Bind mounts that are otherwise shared by every Unit in the same folder. |

The Docker network is always `<project>_default`, so Units cannot reach each
other's containers by name. Internal URLs use Compose service names (`app`,
`db`, `ollama`, `loki`, ...), which resolve inside each Unit's own network.
Published host ports are a different matter: anything published on all
interfaces (by default the app, docs and Ollama ports) is reachable from other
Units through the host, like from the rest of your network.

## Modules and profiles per Unit

Each Unit can run a different set of optional modules with `ALLERAC_PROFILE`
(`all`, `personal`, `openworld`, `sales`) or an explicit `ALLERAC_MODULES`
list. `install.sh`, `update.sh` and `allerac.sh` derive the module Compose
profiles from it (e.g. `health` for health-worker) and merge them with the
Unit's own `COMPOSE_PROFILES`; a `COMPOSE_PROFILES` set in the calling shell
wins as is. Plain `docker compose --env-file .env.<unit> up -d` does not do
this, so add `health` to `COMPOSE_PROFILES` there yourself. Public Units
should set `ALLERAC_PROFILE=openworld` or `sales` (nothing set means `all`,
which starts health-worker). Example env files live in `deploy/profiles/`.
See [modules-and-profiles.md](modules-and-profiles.md).

## Add a second Unit

Each Unit gets its own **git worktree** of this repository, checked out on its
own long-lived branch `unit/<name>`, with its own `.env`. A worktree shares the
git objects with the primary checkout but has its own files, so updating one
Unit (`git pull`, rebuild, bind-mounted files) never changes another.

```bash
cd ~/allerac-one && git fetch origin
scripts/units/new-unit.sh openworld --profile openworld --hostname openworld.allerac.ai --dry-run
scripts/units/new-unit.sh openworld --profile openworld --hostname openworld.allerac.ai
cd ~/allerac-units/openworld
docker compose config --services     # check what will run
docker compose up -d --build
curl -s http://localhost:8081/api/v1/version
git push -u origin unit/openworld    # publish the Unit branch once
```

`new-unit.sh` changes nothing outside the new worktree and never starts or
pushes anything. It:

- refuses names starting with `allerac` (reserved for the primary Unit, whose
  scripts match `allerac-*` containers), names already used by an env file,
  worktree, Compose project or volume, and a branch checked out elsewhere;
- creates `unit/<name>` from `origin/development` (or reuses an existing local
  or remote `unit/<name>`), in `~/allerac-units/<name>` (`--dir` to change);
- writes `.env` from `.env.unit.example` (mode 600) with **fresh** secrets,
  `ALLERAC_UNIT`, `ALLERAC_PROFILE`, `DEPLOY_BRANCH=unit/<name>`, `APP_URL`,
  closed registration, and every host port shifted by the first free offset
  (`APP_PORT=8081`, `8082`, ...; executor dev ports in blocks of 20);
- selects the lean public override, and for `openworld`/`sales` also
  `docker-compose.no-ollama.yml` (see below; `--with-ollama` to keep it,
  `--full` for every service).

A new Unit's database has no account at all (the legacy `dev@local.host`
bootstrap admin is no longer created, see migration 140): the first account
registered on it becomes its admin.

Back up the new `.env`: it holds the only copy of that Unit's
`ENCRYPTION_KEY`. Never copy secrets between Units; a Unit cannot decrypt
another Unit's stored tokens, and that is the point.

Other rules:

- `EXECUTOR_SECRET` is still required on a lean Unit: it also authenticates
  internal calls (notifier → `/api/jobs/run`, service logs → `/api/log-submit`).
- The first account created on a new Unit becomes its admin (or import one,
  see *Move a domain into a Unit*). Registration is closed after that.
- Each Unit builds its own images. Expect build time and disk to grow per Unit.
- A Unit can still live in the primary checkout with `--env-file .env.<unit>`,
  but then both share files and `git pull`; prefer a worktree.

### Unit branches

`unit/<name>` is what that Unit runs. It is never deleted and never developed
on directly:

1. **Fixes and features go to `development` only**, never straight to a Unit
   branch, so every Unit gets them and the branches do not drift.
2. To update a Unit, open a PR `development` → `unit/<name>` and merge it
   (merge, not rebase: the branch is shared history).
3. On the host: `cd ~/allerac-units/<name> && ./update.sh`. It backs the Unit
   up and pulls `DEPLOY_BRANCH`, i.e. `unit/<name>`. `update.sh` refuses to run in a
   `unit/*` checkout whose `DEPLOY_BRANCH` points elsewhere, so it can never
   merge `main` into a Unit branch.
4. Roll back: `git checkout` the previous commit printed by `update.sh` and
   restore the pre-update backup.

The only commits that belong on a Unit branch alone are that Unit's skill
files. **Skill file divergence:** the skills loader rewrites file-backed
system skills (e.g. `skills/openworld.md`) from the checkout on every start.
If a bot's skill was edited in the database (or `import-domain.sh` warns that
the file differs), commit the database text to `skills/<file>` on
`unit/<name>` by PR, then restart and run `import-domain.sh --verify-only`.
Otherwise the next restart silently reverts the bot's behaviour. When a later
`development` → `unit/<name>` PR conflicts on such a file, keep the Unit's
version unless the change is meant for that bot too.

The GitHub webhook auto-deploy stays on the primary Unit only.

### Cloudflare hostname

In Cloudflare Zero Trust → *Networks → Tunnels* → the host's tunnel →
*Public hostnames* → *Add*: subdomain `openworld`, domain `allerac.ai`, service
`http://localhost:<APP_PORT of the Unit>`. One tunnel serves every Unit; do
not start a second `cloudflared` per Unit. See *One hostname per Unit* below.

## Move a domain into a Unit

`scripts/units/export-domain.sh` and `import-domain.sh` move a public bot
(the service account behind `openworld` or `sales`) from one Unit's database
to another. Conversation history is not copied.

```bash
cd ~/allerac-one   # source Unit
scripts/units/export-domain.sh --domain openworld --account <bot email> --unit-dir . --dry-run
scripts/units/export-domain.sh --domain openworld --account <bot email> --unit-dir . --out /tmp/openworld.json
cd ~/allerac-units/openworld
scripts/units/import-domain.sh /tmp/openworld.json --unit-dir . --dry-run
scripts/units/import-domain.sh /tmp/openworld.json --unit-dir .
scripts/units/import-domain.sh /tmp/openworld.json --unit-dir . --verify-only
shred -u /tmp/openworld.json   # it contains the account's password hash
```

(`--db-url postgresql://...` instead of `--unit-dir` talks to a database directly.)

Copied: the account (same id, email and password hash, never admin), its
domain access (remapped by slug), its API key **hash** rows (the widget token
keeps working), non-secret settings, domain model settings, instructions and
their versions, learned domain instructions (without conversation links),
the domain rate limit, the domain's default skill, every skill the account
owns or enabled, with their tool grants.

Not copied: conversations, memories, documents, and anything encrypted with
the source Unit's key (provider API keys, Telegram bot tokens, GitHub tokens).
Re-enter those in the new Unit.

Skills define the bot's behaviour, so the import compares a fingerprint of
each skill (content, metadata and tool grants) with the export and rolls back
on any difference; `--verify-only` repeats the check later. File-backed system
skills (e.g. `skills/openworld.md`) are matched by file name and overwritten
with the exported text. The loader rewrites them from the file on the next
start, so when the import warns that a file differs, commit the exported text
to that Unit branch's `skills/<file>` first. The importer refuses an account
that already exists in the target, and always creates the account as
**non-admin**: `export-domain.sh --allow-admin` only allows exporting an admin
account; the import demotes it and says so. Give the Unit its own admin
(the first account registered on it).

## Lean public profile

`docker-compose.public.yml` is an override file. A Unit selects it with
`COMPOSE_FILE=docker-compose.yml:docker-compose.public.yml` in its env file.
It:

- moves the **executor** behind the `executor` profile and sets
  `EXECUTOR_ENABLED=false` and an empty `EXECUTOR_URL` for `app`,
  `agent-worker` and the Telegram bot. The app then never offers the
  `execute_shell` / `edit_file` tools, the `/api/workspace/*` routes answer
  `403`, the workspace page is not found, and nobody (admins included) can
  reach a shell. `app`, `agent-worker` and the Telegram bot no longer wait
  for the executor to be healthy;
- moves **Portainer** (Docker socket) behind the `ops` profile;
- moves **promtail** (Docker socket) and **node-exporter** (host root
  filesystem), plus **prometheus** and **loki**, behind the `monitoring`
  profile;
- moves the **docs** server behind the `docs` profile.

What remains: `db`, `migrations`, `app`, `agent-worker`, `health-worker`,
`redis`, `notifier`, `ollama`, `ollama-setup` and the Telegram bot.

The base file is not changed by this override, so a normal install keeps every
service without any new setting. The override needs Docker Compose v2.24.4 or
newer (it uses the `!override` tag); check with `docker compose version`.

Public domains (`sales`, `openworld`) already refuse shell, GitHub and log
tools at the application level; the lean profile also removes the executor
and the Docker socket from the Unit, so there is nothing to reach.

### Units without Ollama (cloud provider)

`docker-compose.no-ollama.yml` runs a Unit without a local Ollama:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.public.yml:docker-compose.no-ollama.yml
```

It moves `ollama` and `ollama-setup` behind the `ollama` profile, so no
Ollama container runs and **no model is downloaded** at install or update
(`install.sh` skips the model download step when `ollama-setup` is not in the
Unit's services), it turns off the note and memory embedding sweeps, and it
sets `GRAMPEADOR_ENABLED=false` so the Hub's Grampeador shows static phrases
instead of generating them with Ollama every minute.
Chat runs on a cloud provider; local models and document/note embeddings are
not available in that Unit.

Choosing the provider and model of a Unit:

- **Key**: `ANTHROPIC_API_KEY` in the Unit's `.env` (env fallback), or the
  Unit admin's *Settings → API keys* (stored encrypted, takes precedence; a
  user's own key wins over both). OpenAI (`OPENAI_API_KEY`) and Gemini work
  the same way through settings.
- **Model**: the domain's model setting (`user_domain_model_settings.model_id`,
  e.g. a `claude-*` model; the provider follows from the model), set in the
  domain's model settings. The import carries this choice but never the key.

Switch back to Ollama later: remove `docker-compose.no-ollama.yml` from
`COMPOSE_FILE`, set `OLLAMA_MODELS`, `docker compose up -d` (the models are
downloaded once), and pick a local model for the domain. Nothing else changes:
the Ollama services and settings stay in the base file.

A single Ollama shared by several Units is a possible future option; it is not
needed while public Units use a cloud provider.

## One hostname per Unit (Cloudflare Tunnel)

Give each Unit its own hostname, for example `website.example.com` for the
website Unit and the primary Unit on its own hostname. In Cloudflare Zero
Trust, add one public hostname per Unit pointing to that Unit's local app
port:

| Public hostname | Service |
|---|---|
| `app.example.com` | `http://localhost:8080` (primary Unit, `APP_PORT=8080`) |
| `website.example.com` | `http://localhost:8081` (website Unit, `APP_PORT=8081`) |

Either run one tunnel connector for the whole host (the primary Unit's
`cloud` profile) and add every hostname to that tunnel, or give a Unit its own
connector with `COMPOSE_PROFILES=cloud` and its own `TUNNEL_TOKEN` in its env
file. The `tunnel` service uses host networking, so `localhost:<APP_PORT>` is
reachable from it either way. Set `APP_URL` and `NEXT_PUBLIC_API_URL` in each
Unit's env file to that Unit's public URL.

Only `caddy` (the `local` profile) binds ports 80/443, so normally only the
primary Unit uses it. A second Unit that also needs Caddy must set
`CADDY_HTTP_PORT` / `CADDY_HTTPS_PORT`.

## Sessions and cookies

The login cookie (`session_token`) is set without a `Domain` attribute (see
`src/app/actions/auth.ts` and `src/app/api/auth/google/callback/route.ts`), so
browsers keep it host-only: a session from `website.example.com` is never sent
to `app.example.com`, and the reverse.

- Do not add a `Domain=.example.com` (parent domain) to that cookie, and do not
  have a proxy rewrite it that way. A parent-domain cookie would be sent to
  every Unit under that domain.
- Cookies ignore ports. Two Units opened as `http://localhost:8080` and
  `http://localhost:8081` share one cookie jar, so logging into one logs you
  out of the other. Use one hostname per Unit (or separate browser profiles)
  when you work with several Units on the same machine.

## Backups, per Unit

Each Unit has its own database volume (`<unit>_db_data`), so back up each one
separately:

```bash
# Primary Unit (unchanged): files land in ./backups
./allerac.sh backup

# Another Unit: files land in ./backups/<unit>
ALLERAC_ENV_FILE=.env.website ./allerac.sh backup
ALLERAC_ENV_FILE=.env.website ./allerac.sh restore <file>

# Plain Compose, same result:
docker compose --env-file .env.website exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > backups/website-$(date +%F).sql.gz
```

Keep each Unit's env file backed up too (it holds that Unit's encryption keys;
without them its stored tokens cannot be decrypted).

## Updating

A Unit in its own worktree is updated from its directory (`./update.sh`, see
*Unit branches*). A Unit sharing the primary checkout is updated with:

```bash
./update.sh                                          # primary Unit (as before)
ALLERAC_ENV_FILE=.env.website ./update.sh            # another Unit
```

`update.sh` reads `ALLERAC_UNIT`, `COMPOSE_FILE`, `COMPOSE_PROFILES` and
`ALLERAC_PROFILE`/`ALLERAC_MODULES` (to derive module profiles) from the given env file, backs that Unit up first, only rebuilds services the Unit
actually runs (a lean Unit has no executor), and skips the `allerac.home`
hostname setup for non-primary Units. Note that `update.sh` also runs
`git pull`, so the second run usually finds nothing new to pull.

## Resource limits

Optional, per Unit, in its env file:

```bash
APP_MEM_LIMIT=768M
APP_CPUS=1
DB_MEM_LIMIT=384M
DB_CPUS=0.5
OLLAMA_MEM_LIMIT=4g
OLLAMA_CPUS=2
```

Unset values keep the defaults (`1G`, `512M`, `10g`, no CPU limit).

## Smoke test

`scripts/smoke/multi-unit-smoke.sh` brings up a throwaway lean Unit next to
your existing install, checks it, and removes it again (containers, volumes,
network and the images it built):

```bash
bash scripts/smoke/multi-unit-smoke.sh                 # full run (builds images)
SMOKE_DRY_RUN=1 bash scripts/smoke/multi-unit-smoke.sh # config checks only
```

It checks that the resolved config has no executor, Portainer, host-monitoring
or docs service and only uses the throwaway Unit's names. It checks that `app`
and `agent-worker` become healthy without an executor and that the Unit's
volume and network are its own. Over HTTP it expects `/login` → 200,
`/api/v1/version` → 200 and `/api/v1/me` → 401. With an admin session created
in the throwaway database, `POST /api/workspace/run` must answer 403 and
`/workspace` 404. Finally it checks that the default Unit's containers did not
change.

It refuses to run with an empty Unit name, `allerac`, a name starting with
`allerac`, the `ALLERAC_UNIT` of `./.env`, or a project or volume that already
exists. Compose runs in a clean environment with explicit `-p`, `-f` and
`--env-file`, so exported shell variables cannot point it at another Unit.
`SMOKE_KEEP=1` leaves the Unit running for inspection. `SMOKE_IMAGES_FROM=allerac`
reuses the images already built for the default Unit instead of building again.

CI runs this on every pull request (`.github/workflows/integration.yml`), after
`scripts/ci/security-integration.sh` has checked the default Unit; see
`docs/tests/ci-and-versioning.md`.

## Removing a Unit

```bash
docker compose --env-file .env.website down          # stop, keep data
docker compose --env-file .env.website down -v       # stop and DELETE its volumes
```

`uninstall.sh` only handles the primary Unit.
