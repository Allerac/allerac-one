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

`health-worker` (Garmin + Strava sync) runs only with the `health` Compose
profile. A default `docker compose up -d` no longer starts it.

- Personal Unit: set `COMPOSE_PROFILES=health` (plus any profiles you already
  use, e.g. `health,local,webhook`). `deploy/profiles/personal.env` does this.
- `garmin-auth-worker` stays under the `local` profile (it exists to use a
  home IP for Garmin login), so enable `local` too if you use it.
- Existing installs that use Health: add `health` to `COMPOSE_PROFILES`
  before the next `update.sh`, otherwise health-worker is not started.

CI (`scripts/ci/security-integration.sh`) and the multi-unit smoke
(`scripts/smoke/multi-unit-smoke.sh`) start named core services with
`COMPOSE_PROFILES=` and never start health-worker, so they are unaffected.

## Example env files

`deploy/profiles/personal.env`, `openworld.env`, `sales.env`. Merge the lines
into the Unit's env file:

```bash
cat deploy/profiles/personal.env >> .env      # edit secrets afterwards
docker compose up -d
```

For a second Unit:

```bash
cp .env.unit.example .env.openworld
cat deploy/profiles/openworld.env >> .env.openworld
docker compose --env-file .env.openworld up -d
```

## Adding a module

1. Create `src/modules/<id>/module.ts` with `defineModule({...})`.
2. Add it to `MODULES` in `src/modules/registry.ts`.
3. Add it to the relevant presets in `ALLERAC_PROFILES` (`src/lib/runtime-config.ts`).
4. Put its Docker services under `profiles: [<id>]`.
