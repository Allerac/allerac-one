# Modules and profiles

Allerac One is one codebase. Each **Unit** (see [multi-unit.md](multi-unit.md))
is a separate install of that code and can choose which optional **modules**
it runs. Core features are always on.

## Groups

| Group | Modules | Notes |
|---|---|---|
| Core (always on) | chat, memories, RAG, notes, knowledge, crawler, tickets, code, auth, admin, API, agents/workers, telegram, github, benchmark | Not configurable. |
| External | `openworld`, `sales` | Public-facing (website widgets). Must never break. |
| Personal | `health` (Garmin/Strava), `music` (Spotify), `email`, `social` (Instagram/TikTok) | Personal data. |

Each module has a manifest in `src/modules/<id>/module.ts` (id, group, domain
slugs, nav entries, tool names, skills, Docker profile, required env). The
registry is `src/modules/registry.ts`. In this first step manifests are thin:
they point at code that still lives under `src/app`; nothing has moved.

## Selecting modules

| Variable | Meaning |
|---|---|
| `ALLERAC_MODULES` | Comma list of module ids, e.g. `health,music`. `all` or `*` = every module, `none` = no optional modules (core only). Blank counts as unset. Wins over `ALLERAC_PROFILE`. Unknown ids are ignored. |
| `ALLERAC_PROFILE` | Preset used when `ALLERAC_MODULES` is unset. Unknown values fail the boot config check. |

| Profile | Modules |
|---|---|
| `all` (default when nothing is set) | every module: identical to a classic install |
| `personal` | `health`, `music`, `email`, `social` |
| `openworld` | `openworld` |
| `sales` | `sales` |

The variables are read by the app, agent-worker and Telegram bot processes
(`src/lib/runtime-config.ts`, `resolveModuleSelection`). Restart the
containers after changing them.

## What "disabled" means

For a module that is off in a Unit, its domains are unavailable to everyone,
admins included:

- hub, taskbar and `/api/domains` do not list them (`DomainService.listAccessible`);
- the pages answer 404 (`requireDomainAccess`) and `assertDomainAccess` throws
  `ForbiddenError` for API routes and actions; `canAccessDomain` returns false;
- the module's tools are not offered to the LLM (`TOOLS` and `resolveChatTools`);
- redirects to a user's "first domain" skip disabled domains.

Not yet (later steps): code, dependencies, migrations/tables and skills are
still present in every build and database. The `domains.is_active` flag and
`user_domain_access` keep working as per-user authorization inside the
enabled modules.

## Docker Compose profiles

`health-worker` (Garmin + Strava sync) belongs to the `health` module and only
runs with the `health` Compose profile.

### Derived automatically by the scripts

`install.sh`, `update.sh` and `allerac.sh` (`allerac start`, ...) derive
`COMPOSE_PROFILES` from the module selection, so **setting only
`ALLERAC_PROFILE=personal` is enough**:

| Module selection | Derived Compose profiles |
|---|---|
| nothing set / `ALLERAC_PROFILE=all` | `health` (same services as before modules existed) |
| `ALLERAC_PROFILE=personal` | `health` |
| `ALLERAC_PROFILE=openworld` or `sales` | none |
| `ALLERAC_MODULES` containing `health` | `health` |

Rules:

- The derived profiles are **merged** with the Unit's `COMPOSE_PROFILES` from
  its env file (`local`, `webhook`, `cloud`, ...), without duplicates:
  `COMPOSE_PROFILES=local,webhook` + `personal` gives `local,webhook,health`.
- `COMPOSE_PROFILES` set in the **calling shell** is explicit and always wins
  as is (`COMPOSE_PROFILES=local ./update.sh` does not add `health`; an
  empty `COMPOSE_PROFILES= ./update.sh` adds nothing).
- `ALLERAC_PROFILE` / `ALLERAC_MODULES` are read from the shell first, then
  from the Unit's env file.

The mapping lives in `scripts/lib/compose-profiles.sh` (sourced by the three
scripts). It is a static copy of the manifests' `dockerProfile` and of
`ALLERAC_PROFILES`; `src/__tests__/modules/compose-profiles-sync.test.ts`
fails if they drift, and also runs `scripts/lib/compose-profiles.test.sh`.

### Plain `docker compose up`

Compose itself knows nothing about modules. Without the scripts you still
need the profile yourself, e.g. `COMPOSE_PROFILES=health` in `.env` or
`COMPOSE_PROFILES=health,local docker compose up -d`. Otherwise health-worker
is not started.

### Notes

- `garmin-auth-worker` stays under the `local` profile (it exists to use a
  home IP for Garmin login), so enable `local` too if you use it.
- A lean public Unit should set `ALLERAC_PROFILE=openworld` or `sales`;
  with nothing set the scripts treat it as `all` and start health-worker.
- CI (`scripts/ci/security-integration.sh`) and the multi-unit smoke
  (`scripts/smoke/multi-unit-smoke.sh`) call `docker compose` directly with
  `COMPOSE_PROFILES=` and named core services, so they never start
  health-worker.

## Example env files

`deploy/profiles/personal.env`, `openworld.env`, `sales.env`. Merge the lines
into the Unit's env file:

```bash
cat deploy/profiles/personal.env >> .env      # edit secrets afterwards
./update.sh                                   # or: allerac start (derives COMPOSE_PROFILES=health)
```

For a second Unit:

```bash
cp .env.unit.example .env.openworld
cat deploy/profiles/openworld.env >> .env.openworld
ALLERAC_ENV_FILE=.env.openworld ./update.sh
```

## Adding a module

1. Create `src/modules/<id>/module.ts` with `defineModule({...})`.
2. Add it to `MODULES` in `src/modules/registry.ts`.
3. Add it to the relevant presets in `ALLERAC_PROFILES` (`src/lib/runtime-config.ts`).
4. Put its Docker services under `profiles: [<id>]`, set `dockerProfile` in the
   manifest and add it to `ALLERAC_MODULE_COMPOSE_PROFILES` in
   `scripts/lib/compose-profiles.sh` (the sync test enforces it).
