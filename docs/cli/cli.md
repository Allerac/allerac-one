# Allerac One CLI

The `allerac` command is a unified interface for managing Allerac One deployments.

## Installation

The CLI is automatically installed during the setup process:

```bash
./install.sh
```

This copies the wrapper script to `/usr/local/bin/allerac`, making it available system-wide.

## For Multiple Users

The CLI wrapper automatically detects the Allerac One installation using this priority:

1. **`ALLERAC_HOME` environment variable** — explicitly set the installation path
2. **Current directory and parent directories** — search up the filesystem tree
3. **Common installation paths** — check `/home/*/allerac-one`, `/opt/allerac-one`, etc.

### Setting Up for Another User

If another user wants to use the CLI, they have two options:

#### Option 1: Set the environment variable (per-session)
```bash
export ALLERAC_HOME=/home/<user>/allerac-one
allerac status
```

#### Option 2: Set it permanently (in ~/.bashrc or ~/.zshrc)
```bash
echo 'export ALLERAC_HOME=/home/<user>/allerac-one' >> ~/.bashrc
source ~/.bashrc
```

#### Option 3: Run from the installation directory
```bash
cd /home/<user>/allerac-one
allerac status
```

## Commands

### Service Management

```bash
allerac start              # Start all services
allerac stop               # Stop all services
allerac restart            # Restart all services
allerac status             # Show service status
allerac logs [service]     # Follow logs (e.g., allerac logs app)
allerac open               # Open Allerac in the browser
```

### Maintenance

```bash
allerac update             # Pull latest version and restart
allerac backup             # Create and validate a local database backup
allerac restore <file>     # Validate and restore a local backup
allerac uninstall [opts]   # Remove services (--clean / --all)
```

Backups are compressed PostgreSQL plain-text dumps stored in
`$ALLERAC_HOME/backups`. `allerac update` creates a `pre-update` backup before
pulling code or running migrations and aborts if the backup cannot be validated.

`allerac restore` validates the gzip archive and dump header before making
changes. After confirmation, it creates a `pre-restore` safety backup, stops the
app, recreates the database's `public` schema, imports with PostgreSQL
`ON_ERROR_STOP`, and starts the app again. The safety backup is retained after a
successful restore.

If an update fails during migrations, image build, service restart, or health
verification, the updater prints the exact pre-update backup and previous Git
commit. It provides commands to inspect logs, optionally restore the database,
run the previous revision in detached mode, and return to the tracked branch.
Rollback is never performed automatically.

Example:

```bash
allerac backup
allerac restore allerac-manual-2026-06-09_10-00-00.sql.gz
```

### Models (Ollama)

```bash
allerac models             # List installed models
allerac pull <model>       # Download a model (e.g., qwen2.5:7b)
```

### Workspace

```bash
allerac ports              # Show ports in use (3000-3010)
allerac kill-port <port>   # Kill a process on a port
```

### Info

```bash
allerac version            # Show current version
allerac help               # Show help
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ALLERAC_HOME` | auto-detect | Override installation directory |
| `INSTALL_DIR` | `$HOME/allerac-one` | Used by allerac.sh if ALLERAC_HOME not set |

## Troubleshooting

**Error: "Allerac One installation not found"**

If the CLI can't find your installation:

```bash
# Option 1: Set ALLERAC_HOME
export ALLERAC_HOME=/path/to/your/allerac-one

# Option 2: Run from the installation directory
cd /path/to/your/allerac-one
allerac status
```

**Permission denied when running commands**

The CLI uses Docker, which requires:
- Docker to be installed and running
- Current user to be in the `docker` group (or use `sudo`)

```bash
# Add current user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker ps
```
