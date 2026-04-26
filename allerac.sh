#!/bin/bash
#
# Allerac One - CLI
# =================
# Unified command-line interface for managing Allerac One.
#
# Usage:
#   allerac <command> [options]
#
# Commands:
#   start               Start all services
#   stop                Stop all services
#   restart             Restart all services
#   status              Show running containers and their health
#   logs [service]      Follow logs (all services or a specific one)
#   update              Pull latest version and restart
#   backup              Back up the database locally
#   restore <file>      Restore the database from a backup file
#   models              List installed Ollama models
#   pull <model>        Pull an Ollama model (e.g. allerac pull qwen2.5:7b)
#   ports               Show ports in use by running projects
#   kill-port <port>    Kill a process running on a port (3000-3010)
#   uninstall           Stop services (add --clean or --all for deeper removal)
#   open                Open Allerac One in the browser
#   version             Show current version (git commit)
#   help                Show this help message
#

set -e

INSTALL_DIR="${INSTALL_DIR:-$HOME/allerac-one}"
COMPOSE_FILE="docker-compose.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# Helpers
# ============================================
require_install_dir() {
    if [ ! -f "$INSTALL_DIR/$COMPOSE_FILE" ]; then
        log_error "Allerac One not found at $INSTALL_DIR."
        log_error "Run the installer first: bash ~/allerac-one/install.sh"
        exit 1
    fi
    cd "$INSTALL_DIR"
}

get_app_port() {
    grep "^APP_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "8080"
}

compose_flags() {
    local flags=""
    local gpu
    gpu=$(grep "^ENABLE_GPU=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "false")
    [ "$gpu" = "true" ] && flags="$flags -f docker-compose.local.gpu.yml"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "allerac-notifier"  && flags="$flags --profile notifications"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "allerac-prometheus" && flags="$flags --profile monitoring"
    echo "$flags"
}

# ============================================
# Commands
# ============================================
cmd_start() {
    require_install_dir
    local flags
    flags=$(compose_flags)

    log_info "Starting Allerac One..."
    docker compose -f "$COMPOSE_FILE" $flags up -d
    log_ok "Services started"

    local port
    port=$(get_app_port)
    echo ""
    echo -e "  Open: ${BLUE}http://localhost:${port}${NC}"
    echo ""
}

cmd_stop() {
    require_install_dir
    log_info "Stopping Allerac One..."
    docker compose -f "$COMPOSE_FILE" --profile notifications --profile monitoring down
    log_ok "Services stopped"
}

cmd_restart() {
    require_install_dir
    local flags
    flags=$(compose_flags)

    log_info "Restarting Allerac One..."
    docker compose -f "$COMPOSE_FILE" $flags restart
    log_ok "Services restarted"
}

cmd_status() {
    require_install_dir
    echo ""
    echo -e "${BOLD}Allerac One — Status${NC}"
    echo ""

    local services=("allerac-app" "allerac-db" "allerac-ollama" "allerac-health-worker" "allerac-notifier" "allerac-prometheus" "allerac-grafana")
    for svc in "${services[@]}"; do
        local state
        state=$(docker inspect "$svc" --format='{{.State.Status}}' 2>/dev/null || echo "not found")
        case "$state" in
            running)  echo -e "  ${GREEN}●${NC} $svc" ;;
            exited)   echo -e "  ${RED}●${NC} $svc  (exited)" ;;
            "not found") ;;  # skip services not in this deployment
            *)        echo -e "  ${YELLOW}●${NC} $svc  ($state)" ;;
        esac
    done

    echo ""
    local port
    port=$(get_app_port)
    if curl -sf "http://localhost:${port}" >/dev/null 2>&1; then
        echo -e "  App: ${GREEN}http://localhost:${port} (responding)${NC}"
    else
        echo -e "  App: ${YELLOW}http://localhost:${port} (not responding yet)${NC}"
    fi
    echo ""
}

cmd_logs() {
    require_install_dir
    local service="${1:-}"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f "$service"
    else
        docker compose -f "$COMPOSE_FILE" --profile notifications --profile monitoring logs -f
    fi
}

cmd_update() {
    require_install_dir
    bash "$INSTALL_DIR/update.sh"
}

cmd_backup() {
    require_install_dir
    local backup_dir="$INSTALL_DIR/backups"
    mkdir -p "$backup_dir"

    local filename="allerac-$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
    local filepath="$backup_dir/$filename"

    local db_container
    db_container=$(docker ps --format '{{.Names}}' | grep -E 'allerac-db|allerac-postgres' | head -1)

    if [ -z "$db_container" ]; then
        log_error "Database container not found. Is Allerac One running?"
        exit 1
    fi

    log_info "Backing up database..."
    docker exec "$db_container" pg_dump -U postgres allerac | gzip > "$filepath"

    local size
    size=$(du -h "$filepath" | cut -f1)
    log_ok "Backup saved: $filepath ($size)"
    echo ""
    echo -e "  To restore: ${YELLOW}allerac restore $filename${NC}"
    echo ""
}

cmd_restore() {
    require_install_dir
    local file="${1:-}"

    if [ -z "$file" ]; then
        echo ""
        echo "Usage: allerac restore <filename>"
        echo ""
        echo "Available backups:"
        ls -lh "$INSTALL_DIR/backups/"*.sql.gz 2>/dev/null | awk '{print "  " $NF, "(" $5 ")"}' || echo "  (no backups found)"
        echo ""
        exit 1
    fi

    # Accept bare filename or full path
    local filepath="$file"
    [ ! -f "$filepath" ] && filepath="$INSTALL_DIR/backups/$file"

    if [ ! -f "$filepath" ]; then
        log_error "Backup file not found: $file"
        exit 1
    fi

    echo ""
    log_warn "This will REPLACE ALL current data with the backup."
    read -rp "  Continue? [y/N]: " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }

    local db_container
    db_container=$(docker ps --format '{{.Names}}' | grep -E 'allerac-db|allerac-postgres' | head -1)

    if [ -z "$db_container" ]; then
        log_error "Database container not found. Is Allerac One running?"
        exit 1
    fi

    log_info "Stopping app..."
    docker compose -f "$COMPOSE_FILE" stop app 2>/dev/null || true

    log_info "Restoring database from $filepath..."
    gunzip < "$filepath" | docker exec -i "$db_container" psql -U postgres -d allerac

    log_info "Starting app..."
    docker compose -f "$COMPOSE_FILE" start app 2>/dev/null || docker compose -f "$COMPOSE_FILE" up -d app

    log_ok "Database restored from $file"
}

cmd_models() {
    require_install_dir
    echo ""
    echo -e "${BOLD}Installed Ollama models:${NC}"
    echo ""
    docker exec allerac-ollama ollama list 2>/dev/null || log_warn "Ollama container not running."
    echo ""
}

cmd_pull() {
    require_install_dir
    local model="${1:-}"
    if [ -z "$model" ]; then
        echo "Usage: allerac pull <model>"
        echo "Example: allerac pull qwen2.5:7b"
        exit 1
    fi
    log_info "Pulling model: $model"
    docker exec -it allerac-ollama ollama pull "$model"
    log_ok "Model $model ready"
}

cmd_uninstall() {
    bash "$INSTALL_DIR/uninstall.sh" "${1:-}"
}

cmd_open() {
    local port
    port=$(get_app_port)
    local url="http://localhost:${port}"

    # Detect environment and open browser accordingly
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url"
    elif command -v wslview >/dev/null 2>&1; then
        wslview "$url"
    elif [ -n "$WSL_DISTRO_NAME" ]; then
        # Inside WSL2 — open in Windows browser
        cmd.exe /c start "$url" 2>/dev/null || powershell.exe -Command "Start-Process '$url'" 2>/dev/null || true
    else
        echo -e "  Open: ${BLUE}$url${NC}"
    fi
}

cmd_version() {
    require_install_dir
    local commit
    commit=$(git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local date
    date=$(git -C "$INSTALL_DIR" log -1 --format="%ci" 2>/dev/null || echo "unknown")
    echo ""
    echo -e "  Allerac One  ${BOLD}$commit${NC}  ($date)"
    echo ""
}

cmd_ports() {
    require_install_dir
    echo ""
    echo -e "${BOLD}Executor ports in use:${NC}"
    echo ""

    # Get all listening ports from the executor container
    local ports
    ports=$(docker exec allerac-executor sh -c 'netstat -tuln 2>/dev/null | grep LISTEN | awk "{print \$4}" | sed "s/.*://g" | sort -n -u' 2>/dev/null || true)

    if [ -z "$ports" ]; then
        echo -e "  ${YELLOW}No ports in use${NC}"
        echo ""
        return
    fi

    # Filter to just the executor range (3000-3010)
    local executor_ports
    executor_ports=$(echo "$ports" | awk '$1 >= 3000 && $1 <= 3010 {print}')

    if [ -z "$executor_ports" ]; then
        echo -e "  ${GREEN}No ports in use (3000-3010 all available)${NC}"
        echo ""
        return
    fi

    for port in $executor_ports; do
        local pid
        pid=$(docker exec allerac-executor sh -c "netstat -tulnp 2>/dev/null | grep :$port | awk '{print \$NF}' | cut -d/ -f1" 2>/dev/null || echo "?")

        local cmd
        cmd=$(docker exec allerac-executor sh -c "ps -p $pid -o comm= 2>/dev/null" 2>/dev/null || echo "unknown")

        echo -e "  ${BLUE}:$port${NC}  PID=$pid  CMD=$cmd"
    done
    echo ""
}

cmd_kill_port() {
    require_install_dir
    local port="${1:-}"

    if [ -z "$port" ]; then
        echo ""
        echo "Usage: allerac kill-port <port>"
        echo ""
        echo "Examples:"
        echo "  allerac kill-port 3000"
        echo "  allerac kill-port 3005"
        echo ""
        exit 1
    fi

    # Validate port number
    if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 3000 ] || [ "$port" -gt 3010 ]; then
        log_error "Port must be between 3000-3010"
        exit 1
    fi

    echo ""
    log_info "Checking port $port..."

    # Get PID of process on that port
    local pid
    pid=$(docker exec allerac-executor sh -c "netstat -tulnp 2>/dev/null | grep :$port | awk '{print \$NF}' | cut -d/ -f1" 2>/dev/null || echo "")

    if [ -z "$pid" ] || [ "$pid" = "?" ]; then
        log_warn "No process found on port $port"
        echo ""
        return
    fi

    # Get process name
    local cmd
    cmd=$(docker exec allerac-executor sh -c "ps -p $pid -o comm= 2>/dev/null" || echo "process")

    echo -e "  Found: ${YELLOW}$cmd${NC} (PID $pid)"
    echo ""
    read -rp "  Kill this process? [y/N]: " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; echo ""; exit 0; }

    log_info "Killing process $pid..."
    if docker exec allerac-executor kill $pid 2>/dev/null; then
        log_ok "Process killed"
    else
        log_error "Failed to kill process"
        exit 1
    fi
    echo ""
}

cmd_help() {
    echo ""
    echo -e "${BOLD}Allerac One CLI${NC}"
    echo ""
    echo -e "  ${BOLD}Usage:${NC} allerac <command> [options]"
    echo ""
    echo -e "  ${BOLD}Service:${NC}"
    echo -e "    ${GREEN}start${NC}               Start all services"
    echo -e "    ${GREEN}stop${NC}                Stop all services"
    echo -e "    ${GREEN}restart${NC}             Restart all services"
    echo -e "    ${GREEN}status${NC}              Show status of all containers"
    echo -e "    ${GREEN}logs${NC} [service]      Follow logs (omit service for all)"
    echo -e "    ${GREEN}open${NC}                Open Allerac One in the browser"
    echo ""
    echo -e "  ${BOLD}Maintenance:${NC}"
    echo -e "    ${GREEN}update${NC}              Pull latest version and restart"
    echo -e "    ${GREEN}backup${NC}              Back up the database"
    echo -e "    ${GREEN}restore${NC} <file>      Restore from a backup file"
    echo -e "    ${GREEN}uninstall${NC} [flags]   Stop services (--clean / --all)"
    echo ""
    echo -e "  ${BOLD}Models:${NC}"
    echo -e "    ${GREEN}models${NC}              List installed Ollama models"
    echo -e "    ${GREEN}pull${NC} <model>        Download an Ollama model"
    echo ""
    echo -e "  ${BOLD}Workspace ports:${NC}"
    echo -e "    ${GREEN}ports${NC}               Show ports in use by running projects"
    echo -e "    ${GREEN}kill-port${NC} <port>    Kill a process running on a port (3000-3010)"
    echo ""
    echo -e "  ${BOLD}Info:${NC}"
    echo -e "    ${GREEN}version${NC}             Show current version"
    echo -e "    ${GREEN}help${NC}                Show this help"
    echo ""
    echo -e "  ${BOLD}Examples:${NC}"
    echo -e "    allerac start"
    echo -e "    allerac logs app"
    echo -e "    allerac pull qwen2.5:7b"
    echo -e "    allerac backup"
    echo -e "    allerac restore allerac-2026-04-21_10-00-00.sql.gz"
    echo ""
}

# ============================================
# Entry point
# ============================================
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    start)      cmd_start "$@" ;;
    stop)       cmd_stop "$@" ;;
    restart)    cmd_restart "$@" ;;
    status)     cmd_status "$@" ;;
    logs)       cmd_logs "$@" ;;
    update)     cmd_update "$@" ;;
    backup)     cmd_backup "$@" ;;
    restore)    cmd_restore "$@" ;;
    models)     cmd_models "$@" ;;
    pull)       cmd_pull "$@" ;;
    ports)      cmd_ports "$@" ;;
    kill-port)  cmd_kill_port "$@" ;;
    uninstall)  cmd_uninstall "$@" ;;
    open)       cmd_open "$@" ;;
    version)    cmd_version "$@" ;;
    help|--help|-h) cmd_help ;;
    *)
        log_error "Unknown command: $COMMAND"
        echo ""
        cmd_help
        exit 1
        ;;
esac
