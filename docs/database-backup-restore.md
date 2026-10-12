# Database Backup and Restore

Two related but distinct capabilities:

- **Same-host backup/restore** — `allerac backup` / `allerac restore`. Fast, database-only, used automatically before every `allerac update`. See [CLI Reference](cli/cli.md#maintenance) for flags and behavior.
- **Disaster recovery** — `allerac disaster-backup` / `allerac disaster-inspect` / `allerac disaster-restore` / `allerac verify`. A portable package (database + configuration inventory + infrastructure inventory + checksums) that can be moved to a **different machine** and restored there. This page covers that workflow.

Disaster recovery is what makes it safe to run Allerac One on a single home machine: if that machine is lost, a package created ahead of time can rebuild the install elsewhere.

## What's in a recovery package

Running `allerac disaster-backup` produces one file, `allerac-recovery-<timestamp>.tar.gz`, in `backups/`:

```text
allerac-recovery-<timestamp>/
  manifest.json                          # commit, release, schema version, product line, included/excluded components
  checksums.sha256                       # SHA-256 of every file in the package
  database/allerac.sql.gz                # full PostgreSQL dump
  configuration/
    required-settings.json               # .env key NAMES and whether each is set — never values
    required-settings-present.txt
  files/telegram-bots.json               # only if this install has one (per-deployment config, not in git)
  inventories/
    containers.json
    volumes.json
    ollama-models.json                   # model names only — weights are never bundled
```

**Never included:** `.env` values or any other secret, Ollama model weights, Caddy certificates, Grafana/Loki/Prometheus history, Cloudflare tunnel credentials, GitHub Actions runner identity. `skills/` isn't bundled either — it's tracked in git and comes back automatically when the destination checks out the commit recorded in the manifest.

## Step-by-step: recovering on a different machine

### Prerequisites

- Source machine: a running Allerac One install.
- Destination machine: Docker installed, and either a fresh `bash install.sh` run or a manual `git clone` + `docker-compose.yml` in place. `disaster-restore` does **not** clone the repository for you — it expects the destination to already be a valid (even if empty) Allerac One install.

### 1. Create the package (source machine)

```bash
cd ~/allerac-one
allerac verify              # optional — checks backup readiness before you rely on it
allerac disaster-backup
```

Output includes the package path, e.g. `backups/allerac-recovery-2026-08-09_20-12-59.tar.gz`, and its size.

### 2. Transfer the package

Copy the single `.tar.gz` file to the destination machine however is convenient — `scp`, a USB drive, cloud storage. Nothing else needs to travel with it.

```bash
scp backups/allerac-recovery-2026-08-09_20-12-59.tar.gz user@destination:~/allerac-one/backups/
```

### 3. Inspect before restoring (destination machine)

```bash
cd ~/allerac-one
allerac disaster-inspect allerac-recovery-2026-08-09_20-12-59.tar.gz
```

This verifies every checksum, prints the manifest (source commit, release, schema version), and lists which configuration keys were set on the source and which Ollama models it had. It does not touch the destination's data — safe to run any time. **Do not restore from a package that fails this check.**

### 4. Fill in missing configuration

`disaster-inspect` (and `disaster-restore`, before it prompts) lists which `.env` keys the source had set. Compare against the destination's own `.env` and fill in anything missing — the package never carries secret values, only the fact that a key was set, so this step is manual by design.

### 5. Restore

```bash
allerac disaster-restore allerac-recovery-2026-08-09_20-12-59.tar.gz
```

This will:

1. Re-verify checksums (aborts before touching anything if they don't match).
2. Warn if the package's commit doesn't match the destination's checked-out commit — the code and schema may not agree.
3. Print the missing-configuration checklist again.
4. Ask for confirmation (`This will REPLACE ALL current data...`).
5. Take a safety backup of whatever's currently on the destination (`pre-disaster-restore`), stop the app, drop and recreate the schema, import the dump, restart the app.
6. Restore `telegram-bots.json` if the package has one (backing up any existing destination copy as `.bak` first).

### 6. Post-restore checklist

The restore command prints this for you, but to be explicit:

- Re-pull any Ollama models it listed: `allerac pull <model>`.
- Confirm the app is healthy: `allerac status`.
- Log in and confirm the data you expect is actually there (a known conversation, ticket, etc.).
- Re-issue anything intentionally excluded: Caddy certs (regenerate via `./update.sh`'s local-hostname step), Grafana/Loki/Prometheus history (not restorable — monitoring starts fresh), Cloudflare tunnel credentials, GitHub Actions runner identity.

## Troubleshooting

**"Checksum verification FAILED"** — the package is corrupt or was tampered with in transit. Re-copy it from the source and try again; never restore from a package that fails this check.

**"This install is on a different commit"** — a warning, not a hard stop. The database dump may reference a schema or column the current code doesn't expect (or vice versa). Safest path: check out the same commit the manifest records before restoring, or re-run `allerac update` on the destination after restoring.

**"docker-compose.yml not found"** on `disaster-restore` — the destination isn't set up yet. Run `bash install.sh` there first; `disaster-restore` only restores data into an existing install, it doesn't create one.

**Package not found by name alone** — `disaster-inspect`/`disaster-restore` accept either a full path or a bare filename, in which case they look in `backups/` under the current install.
