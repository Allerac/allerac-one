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
export ALLERAC_HOME=/home/gianclaudiocarella/wsp/allerac-one
allerac status
```

#### Option 2: Set it permanently (in ~/.bashrc or ~/.zshrc)
```bash
echo 'export ALLERAC_HOME=/home/gianclaudiocarella/wsp/allerac-one' >> ~/.bashrc
source ~/.bashrc
```

#### Option 3: Run from the installation directory
```bash
cd /home/gianclaudiocarella/wsp/allerac-one
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
allerac backup             # Back up the database
allerac restore <file>     # Restore from backup
allerac uninstall [opts]   # Remove services (--clean / --all)
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
