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
#   disaster-backup             Create a portable disaster-recovery package
#   disaster-inspect <package>  Verify and inspect a disaster-recovery package
#   disaster-restore <package>  Restore a disaster-recovery package onto this host
#   verify               Check this install's backup readiness
#   models              List installed Ollama models
#   pull <model>        Pull an Ollama model (e.g. allerac pull qwen2.5:7b)
#   ports               Show ports in use by running projects
#   kill-port <port>    Kill a process running on a port (3000-3010)
#   uninstall           Stop services (add --clean or --all for deeper removal)
#   open                Open Allerac One in the browser
#   version             Show current version (git commit)
#   help                Show this help message
#

set -eo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/allerac-one}"
COMPOSE_FILE="docker-compose.yml"

# --------------------------------------------
# Allerac Unit (see docs/operations/multi-unit.md)
# --------------------------------------------
# With nothing set this is the historic single-Unit install: env file .env,
# containers allerac-*, volumes allerac_*. To manage another Unit on the same
# host point ALLERAC_ENV_FILE at its env file (ALLERAC_ENV_FILE=.env.<unit>).
ALLERAC_ENV_FILE="${ALLERAC_ENV_FILE:-.env}"
case "$ALLERAC_ENV_FILE" in
    /*) UNIT_ENV_PATH="$ALLERAC_ENV_FILE" ;;
    *)  UNIT_ENV_PATH="$INSTALL_DIR/$ALLERAC_ENV_FILE" ;;
esac
unit_env_value() {
    { grep -E "^$1=" "$UNIT_ENV_PATH" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2- \
        | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}
UNIT="${ALLERAC_UNIT:-$(unit_env_value ALLERAC_UNIT)}"
UNIT="${UNIT:-allerac}"
if ! [[ "$UNIT" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "Invalid ALLERAC_UNIT '$UNIT' (lowercase letters, digits, '-' and '_' only)." >&2
    exit 1
fi
# Compose files: the Unit's COMPOSE_FILE (e.g. docker-compose.yml:docker-compose.public.yml)
# or the default file. A non-default env file is passed explicitly.
COMPOSE_ARGS="-f $COMPOSE_FILE"
UNIT_COMPOSE_FILES="$(unit_env_value COMPOSE_FILE)"
if [ -n "$UNIT_COMPOSE_FILES" ]; then
    COMPOSE_ARGS=""
    IFS=':' read -ra _unit_compose_files <<< "$UNIT_COMPOSE_FILES"
    for _unit_compose_file in "${_unit_compose_files[@]}"; do
        COMPOSE_ARGS="$COMPOSE_ARGS -f $_unit_compose_file"
    done
fi
[ "$ALLERAC_ENV_FILE" = ".env" ] || COMPOSE_ARGS="$COMPOSE_ARGS --env-file $UNIT_ENV_PATH"
# Database backups: ./backups for the primary Unit (unchanged), ./backups/<unit> otherwise.
if [ "$UNIT" = "allerac" ]; then
    UNIT_BACKUP_DIR="$INSTALL_DIR/backups"
else
    UNIT_BACKUP_DIR="$INSTALL_DIR/backups/$UNIT"
fi
TELEGRAM_BOTS_PATH="$(unit_env_value TELEGRAM_BOTS_FILE)"
TELEGRAM_BOTS_PATH="${TELEGRAM_BOTS_PATH:-./telegram-bots.json}"
case "$TELEGRAM_BOTS_PATH" in /*) ;; *) TELEGRAM_BOTS_PATH="$INSTALL_DIR/${TELEGRAM_BOTS_PATH#./}" ;; esac

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
    if [ ! -f "$UNIT_ENV_PATH" ] && [ "$ALLERAC_ENV_FILE" != ".env" ]; then
        log_error "Unit env file not found: $UNIT_ENV_PATH"
        exit 1
    fi
    cd "$INSTALL_DIR"
}

get_app_port() {
    grep "^APP_PORT=" "$UNIT_ENV_PATH" 2>/dev/null | cut -d= -f2 || echo "8080"
}

compose_flags() {
    local flags=""
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${UNIT}-notifier"  && flags="$flags --profile notifications"
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${UNIT}-prometheus" && flags="$flags --profile monitoring"
    echo "$flags"
}

create_database_backup() {
    local label="${1:-manual}"
    local backup_dir="$UNIT_BACKUP_DIR"
    local filename="allerac-${label}-$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
    local filepath="$backup_dir/$filename"
    local tempfile="${filepath}.tmp"

    mkdir -p "$backup_dir"
    rm -f "$tempfile"

    log_info "Backing up database..."
    if ! docker compose $COMPOSE_ARGS exec -T db sh -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
        | gzip > "$tempfile"; then
        rm -f "$tempfile"
        log_error "Database backup failed."
        return 1
    fi

    if [ ! -s "$tempfile" ] || ! gzip -t "$tempfile"; then
        rm -f "$tempfile"
        log_error "Database backup validation failed."
        return 1
    fi

    mv "$tempfile" "$filepath"
    LAST_BACKUP_PATH="$filepath"
    if [ -n "${ALLERAC_BACKUP_PATH_FILE:-}" ]; then
        printf '%s\n' "$filepath" > "$ALLERAC_BACKUP_PATH_FILE"
    fi
}

start_app_after_restore() {
    docker compose $COMPOSE_ARGS start app 2>/dev/null \
        || docker compose $COMPOSE_ARGS up -d app
}

restore_database_dump() {
    local filepath="$1"

    log_info "Resetting the public schema..."
    if ! docker compose $COMPOSE_ARGS exec -T db sh -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'; then
        log_error "Could not reset the database schema. Current data was not replaced."
        return 1
    fi

    log_info "Restoring database from $filepath..."
    if ! gzip -cd "$filepath" | docker compose $COMPOSE_ARGS exec -T db sh -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
        log_error "Restore failed."
        return 1
    fi

    return 0
}

# ============================================
# Disaster recovery helpers
# ============================================
require_disaster_deps() {
    local missing=""
    command -v docker >/dev/null 2>&1 || missing="$missing docker"
    command -v tar >/dev/null 2>&1 || missing="$missing tar"
    { command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1; } || missing="$missing sha256sum/shasum"
    if [ -n "$missing" ]; then
        log_error "Missing required tools:$missing"
        exit 1
    fi
}

json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

detect_product_line_value() {
    if [ -n "${ALLERAC_PRODUCT_LINE:-}" ]; then
        echo "$ALLERAC_PRODUCT_LINE"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${UNIT}-tunnel"; then
        echo "cloud"
    else
        echo "local"
    fi
}

get_schema_version() {
    local result
    result=$(docker compose $COMPOSE_ARGS exec -T db sh -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -tAc "SELECT name FROM _migrations ORDER BY applied_at DESC LIMIT 1" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
        2>/dev/null | tr -d '[:space:]')
    [ -n "$result" ] && echo "$result" || echo "unknown"
}

collect_required_setting_names() {
    for f in "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env.local.example" "$INSTALL_DIR/.env.cloud.example"; do
        if [ -f "$f" ]; then
            grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$f" | sed 's/=$//'
        fi
    done | sort -u
}

write_required_settings() {
    local pkg_dir="$1"
    local json_file="$pkg_dir/configuration/required-settings.json"
    local present_file="$pkg_dir/configuration/required-settings-present.txt"
    local names
    names=$(collect_required_setting_names)
    : > "$present_file"
    {
        printf '{"required_settings":['
        local first=true
        while IFS= read -r name; do
            [ -z "$name" ] && continue
            local present="false"
            if [ -f "$UNIT_ENV_PATH" ] && grep -qE "^${name}=.+" "$UNIT_ENV_PATH"; then
                present="true"
                echo "$name" >> "$present_file"
            fi
            [ "$first" = true ] || printf ','
            printf '{"name":"%s","present":%s}' "$(json_escape "$name")" "$present"
            first=false
        done <<< "$names"
        printf ']}\n'
    } > "$json_file"
}

print_missing_settings_checklist() {
    local pkg_dir="$1"
    local src_present="$pkg_dir/configuration/required-settings-present.txt"
    [ -f "$src_present" ] || return 0

    local missing=()
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        if [ ! -f "$UNIT_ENV_PATH" ] || ! grep -qE "^${name}=.+" "$UNIT_ENV_PATH"; then
            missing+=("$name")
        fi
    done < "$src_present"

    if [ "${#missing[@]}" -gt 0 ]; then
        log_warn "The source environment had these keys set — verify they're set here too:"
        local name
        for name in "${missing[@]}"; do
            echo "    - $name"
        done
    fi
}

write_containers_inventory() {
    local pkg_dir="$1"
    local ids
    ids=$(docker compose $COMPOSE_ARGS ps -a -q 2>/dev/null)
    if [ -n "$ids" ]; then
        docker inspect $ids > "$pkg_dir/inventories/containers.json" 2>/dev/null \
            || echo "[]" > "$pkg_dir/inventories/containers.json"
    else
        echo "[]" > "$pkg_dir/inventories/containers.json"
    fi
}

write_volumes_inventory() {
    local pkg_dir="$1"
    local existing_vols=""
    local vol
    for vol in ${UNIT}_db_data ${UNIT}_ollama_data ${UNIT}_backups_data ${UNIT}_redis_data; do
        if docker volume inspect "$vol" >/dev/null 2>&1; then
            existing_vols="$existing_vols $vol"
        fi
    done
    if [ -n "$existing_vols" ]; then
        docker volume inspect $existing_vols > "$pkg_dir/inventories/volumes.json" 2>/dev/null \
            || echo "[]" > "$pkg_dir/inventories/volumes.json"
    else
        echo "[]" > "$pkg_dir/inventories/volumes.json"
    fi
}

write_ollama_inventory() {
    local pkg_dir="$1"
    local names=()
    local raw
    raw=$(docker exec ${UNIT}-ollama ollama list 2>/dev/null | tail -n +2 | awk '{print $1}')
    if [ -n "$raw" ]; then
        while IFS= read -r name; do
            [ -n "$name" ] && names+=("$name")
        done <<< "$raw"
    fi
    {
        printf '{"models":['
        local i
        for i in "${!names[@]}"; do
            if [ "$i" -gt 0 ]; then
                printf ','
            fi
            printf '{"name":"%s"}' "$(json_escape "${names[$i]}")"
        done
        printf ']}\n'
    } > "$pkg_dir/inventories/ollama-models.json"
}

write_manifest() {
    local pkg_dir="$1"
    local db_size
    db_size=$(wc -c < "$pkg_dir/database/allerac.sql.gz" | tr -d ' ')

    local commit commit_date release product_line schema_version hostname_val
    commit=$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
    commit_date=$(git -C "$INSTALL_DIR" log -1 --format=%ci 2>/dev/null || echo "unknown")
    release=$(git -C "$INSTALL_DIR" tag --points-at HEAD --sort=-version:refname 2>/dev/null | head -n 1)
    [ -n "$release" ] || release="unreleased"
    product_line=$(detect_product_line_value)
    schema_version=$(get_schema_version)
    hostname_val=$(hostname 2>/dev/null || basename "$INSTALL_DIR")

    local included_json='"database", "configuration", "inventories"'
    if [ -f "$pkg_dir/files/telegram-bots.json" ]; then
        included_json="$included_json, \"files.telegram-bots.json\""
    fi

    cat > "$pkg_dir/manifest.json" <<EOF
{
  "format_version": "1.0",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_environment": "$(json_escape "$hostname_val")",
  "allerac": {
    "commit": "$(json_escape "$commit")",
    "commit_date": "$(json_escape "$commit_date")",
    "release_version": "$(json_escape "$release")",
    "product_line": "$product_line",
    "schema_version": "$(json_escape "$schema_version")"
  },
  "restore_tool": { "min_allerac_cli_version": "1.0" },
  "components": {
    "included": [$included_json],
    "excluded": ["env_secrets", "ollama_model_weights", "caddy_certs", "grafana_loki_prometheus_history", "tunnel_credentials", "github_actions_runner_identity", "skills (git-tracked, restored via commit checkout)"]
  },
  "artifacts": [
    { "path": "database/allerac.sql.gz", "size_bytes": $db_size }
  ],
  "encryption": { "enabled": false, "method": null }
}
EOF
}

generate_checksums() {
    local pkg_dir="$1"
    local checksum_tool
    if command -v sha256sum >/dev/null 2>&1; then
        checksum_tool="sha256sum"
    else
        checksum_tool="shasum -a 256"
    fi

    (
        cd "$pkg_dir" || exit 1
        find . -type f ! -name checksums.sha256 -print0 | sort -z | while IFS= read -r -d '' f; do
            $checksum_tool "$f"
        done
    ) > "$pkg_dir/checksums.sha256"
}

verify_checksums() {
    local pkg_dir="$1"
    (
        cd "$pkg_dir" || exit 1
        if [ ! -f checksums.sha256 ]; then
            echo "checksums.sha256 missing from package" >&2
            exit 1
        fi
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum -c checksums.sha256
        else
            shasum -a 256 -c checksums.sha256
        fi
    )
}

# ============================================
# Commands
# ============================================
cmd_start() {
    require_install_dir
    local flags
    flags=$(compose_flags)

    log_info "Starting Allerac One..."
    docker compose $COMPOSE_ARGS $flags up -d
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
    docker compose $COMPOSE_ARGS --profile notifications --profile monitoring down
    log_ok "Services stopped"
}

cmd_restart() {
    require_install_dir
    local flags
    flags=$(compose_flags)

    log_info "Restarting Allerac One..."
    docker compose $COMPOSE_ARGS $flags restart
    log_ok "Services restarted"
}

cmd_status() {
    require_install_dir
    echo ""
    echo -e "${BOLD}Allerac One — Status${NC}"
    echo ""

    local services=("${UNIT}-app" "${UNIT}-db" "${UNIT}-ollama" "${UNIT}-executor" "${UNIT}-telegram" "${UNIT}-health-worker" "${UNIT}-notifier" "${UNIT}-redis" "${UNIT}-prometheus" "${UNIT}-grafana" "${UNIT}-loki" "${UNIT}-promtail" "${UNIT}-portainer" "${UNIT}-node-exporter")
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
        docker compose $COMPOSE_ARGS logs -f "$service"
    else
        docker compose $COMPOSE_ARGS --profile notifications --profile monitoring logs -f
    fi
}

cmd_update() {
    require_install_dir
    bash "$INSTALL_DIR/update.sh"
}

cmd_backup() {
    require_install_dir
    local label="${1:-manual}"
    case "$label" in
        *[!A-Za-z0-9_-]*)
            log_error "Invalid backup label: $label"
            exit 1
            ;;
    esac

    create_database_backup "$label"
    local size
    size=$(du -h "$LAST_BACKUP_PATH" | cut -f1)
    log_ok "Backup saved: $LAST_BACKUP_PATH ($size)"
    echo ""
    echo -e "  To restore: ${YELLOW}allerac restore $(basename "$LAST_BACKUP_PATH")${NC}"
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
        ls -lh "$UNIT_BACKUP_DIR/"*.sql.gz 2>/dev/null | awk '{print "  " $NF, "(" $5 ")"}' || echo "  (no backups found)"
        echo ""
        exit 1
    fi

    # Accept bare filename or full path
    local filepath="$file"
    [ ! -f "$filepath" ] && filepath="$UNIT_BACKUP_DIR/$file"

    if [ ! -f "$filepath" ]; then
        log_error "Backup file not found: $file"
        exit 1
    fi

    if ! gzip -t "$filepath"; then
        log_error "Backup is not a valid gzip archive: $filepath"
        exit 1
    fi

    if ! gzip -cd "$filepath" | awk '
        NR <= 100 && /PostgreSQL database dump/ { found = 1 }
        END { exit found ? 0 : 1 }
    '; then
        log_error "Backup does not contain a PostgreSQL plain-text dump."
        exit 1
    fi

    echo ""
    log_warn "This will REPLACE ALL current data with the backup."
    read -rp "  Continue? [y/N]: " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }

    log_info "Creating a safety backup of the current database..."
    create_database_backup "pre-restore"
    local safety_backup="$LAST_BACKUP_PATH"
    log_ok "Safety backup saved: $safety_backup"

    log_info "Stopping app..."
    docker compose $COMPOSE_ARGS stop app 2>/dev/null || true

    if ! restore_database_dump "$filepath"; then
        start_app_after_restore
        log_error "Restore failed. Recovery backup: $safety_backup"
        exit 1
    fi

    log_info "Starting app..."
    start_app_after_restore

    log_ok "Database restored from $file"
    log_ok "Pre-restore safety backup retained at $safety_backup"
}

cmd_disaster_backup() {
    require_install_dir
    require_disaster_deps

    local timestamp pkg backups_dir stage pkg_dir
    timestamp=$(date -u +%Y-%m-%d_%H-%M-%S)
    pkg="allerac-recovery-${timestamp}"
    backups_dir="$UNIT_BACKUP_DIR"
    stage="$backups_dir/.stage-${pkg}"
    pkg_dir="$stage/$pkg"

    mkdir -p "$backups_dir"
    rm -rf "$stage"
    trap 'rm -rf "$stage"' EXIT

    mkdir -p "$pkg_dir/database" "$pkg_dir/configuration" "$pkg_dir/files" "$pkg_dir/inventories"

    if ! create_database_backup "disaster"; then
        log_error "Disaster backup aborted: database backup failed."
        exit 1
    fi
    mv "$LAST_BACKUP_PATH" "$pkg_dir/database/allerac.sql.gz"

    log_info "Collecting configuration inventory..."
    write_required_settings "$pkg_dir"

    log_info "Collecting application files..."
    if [ -f "$TELEGRAM_BOTS_PATH" ]; then
        cp "$TELEGRAM_BOTS_PATH" "$pkg_dir/files/telegram-bots.json"
    fi

    log_info "Collecting infrastructure inventory..."
    write_containers_inventory "$pkg_dir"
    write_volumes_inventory "$pkg_dir"
    write_ollama_inventory "$pkg_dir"

    log_info "Writing manifest..."
    write_manifest "$pkg_dir"

    log_info "Generating checksums..."
    generate_checksums "$pkg_dir"

    log_info "Packaging archive..."
    local archive_tmp="$backups_dir/${pkg}.tar.gz.tmp"
    local archive="$backups_dir/${pkg}.tar.gz"
    rm -f "$archive_tmp"
    if ! tar -C "$stage" -czf "$archive_tmp" "$pkg"; then
        rm -f "$archive_tmp"
        log_error "Failed to create archive."
        exit 1
    fi
    if ! tar -tzf "$archive_tmp" >/dev/null; then
        rm -f "$archive_tmp"
        log_error "Archive validation failed."
        exit 1
    fi
    mv "$archive_tmp" "$archive"

    local size
    size=$(du -h "$archive" | cut -f1)
    log_ok "Disaster recovery package created: $archive ($size)"
    echo ""
    echo -e "  Inspect:  ${YELLOW}allerac disaster-inspect $(basename "$archive")${NC}"
    echo -e "  Restore:  ${YELLOW}allerac disaster-restore $(basename "$archive")${NC}"
    echo ""
}

cmd_disaster_inspect() {
    require_install_dir
    require_disaster_deps

    local file="${1:-}"
    if [ -z "$file" ]; then
        echo ""
        echo "Usage: allerac disaster-inspect <package.tar.gz>"
        echo ""
        echo "Available packages:"
        ls -lh "$UNIT_BACKUP_DIR/"allerac-recovery-*.tar.gz 2>/dev/null | awk '{print "  " $NF, "(" $5 ")"}' || echo "  (none found)"
        echo ""
        exit 1
    fi

    local filepath="$file"
    [ ! -f "$filepath" ] && filepath="$UNIT_BACKUP_DIR/$file"
    if [ ! -f "$filepath" ]; then
        log_error "Package not found: $file"
        exit 1
    fi

    if ! tar -tzf "$filepath" >/dev/null 2>&1; then
        log_error "Not a valid gzip/tar archive: $filepath"
        exit 1
    fi

    local pkg_name tmp_dir pkg_dir
    pkg_name=$(basename "$filepath" .tar.gz)
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT
    pkg_dir="$tmp_dir/$pkg_name"

    log_info "Extracting package..."
    tar -xzf "$filepath" -C "$tmp_dir"
    if [ ! -d "$pkg_dir" ]; then
        log_error "Unexpected archive layout (expected top-level dir: $pkg_name)."
        exit 1
    fi

    echo ""
    echo -e "${BOLD}Manifest${NC}"
    echo ""
    if [ -f "$pkg_dir/manifest.json" ]; then
        cat "$pkg_dir/manifest.json"
    else
        log_warn "manifest.json missing from package."
    fi
    echo ""

    echo -e "${BOLD}Checksum verification${NC}"
    echo ""
    local checksum_status=0
    verify_checksums "$pkg_dir" || checksum_status=$?
    echo ""

    echo -e "${BOLD}Required settings present on source${NC}"
    echo ""
    if [ -s "$pkg_dir/configuration/required-settings-present.txt" ]; then
        cat "$pkg_dir/configuration/required-settings-present.txt"
    else
        echo "  (none recorded)"
    fi
    echo ""

    echo -e "${BOLD}Ollama models on source${NC}"
    echo ""
    [ -f "$pkg_dir/inventories/ollama-models.json" ] && cat "$pkg_dir/inventories/ollama-models.json"
    echo ""

    if [ "$checksum_status" -eq 0 ]; then
        log_ok "Package integrity verified."
    else
        log_error "Package integrity check FAILED. Do not restore from this package."
        exit 1
    fi
}

cmd_disaster_restore() {
    require_install_dir
    require_disaster_deps

    local file="${1:-}"
    if [ -z "$file" ]; then
        echo ""
        echo "Usage: allerac disaster-restore <package.tar.gz>"
        echo ""
        exit 1
    fi

    local filepath="$file"
    [ ! -f "$filepath" ] && filepath="$UNIT_BACKUP_DIR/$file"
    if [ ! -f "$filepath" ]; then
        log_error "Package not found: $file"
        exit 1
    fi

    if ! tar -tzf "$filepath" >/dev/null 2>&1; then
        log_error "Not a valid gzip/tar archive: $filepath"
        exit 1
    fi

    local pkg_name tmp_dir pkg_dir
    pkg_name=$(basename "$filepath" .tar.gz)
    tmp_dir=$(mktemp -d)
    trap 'rm -rf "$tmp_dir"' EXIT
    pkg_dir="$tmp_dir/$pkg_name"

    log_info "Extracting package..."
    tar -xzf "$filepath" -C "$tmp_dir"
    if [ ! -d "$pkg_dir" ]; then
        log_error "Unexpected archive layout (expected top-level dir: $pkg_name)."
        exit 1
    fi

    log_info "Verifying package integrity..."
    if ! verify_checksums "$pkg_dir"; then
        log_error "Checksum verification FAILED. Restore aborted — the package may be corrupt or tampered with."
        exit 1
    fi
    log_ok "Package integrity verified."

    if [ ! -f "$pkg_dir/manifest.json" ]; then
        log_error "manifest.json missing from package. Restore aborted."
        exit 1
    fi
    if ! grep -q '"format_version": "1.0"' "$pkg_dir/manifest.json"; then
        log_error "Unsupported package format version. This CLI supports format_version 1.0."
        exit 1
    fi
    if [ ! -f "$pkg_dir/database/allerac.sql.gz" ]; then
        log_error "Package does not contain a database dump. Restore aborted."
        exit 1
    fi

    local pkg_commit current_commit
    pkg_commit=$(grep -o '"commit": "[^"]*"' "$pkg_dir/manifest.json" | head -1 | sed 's/.*: "//;s/"$//')
    current_commit=$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
    if [ -n "$pkg_commit" ] && [ "$pkg_commit" != "unknown" ] && [ "$pkg_commit" != "$current_commit" ]; then
        log_warn "This package was created from commit ${pkg_commit:0:7}, but this install is on ${current_commit:0:7}."
        log_warn "The database dump may not match this code's schema."
    fi

    print_missing_settings_checklist "$pkg_dir"

    echo ""
    log_warn "This will REPLACE ALL current data with the contents of this package."
    read -rp "  Continue? [y/N]: " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }

    log_info "Creating a safety backup of the current database..."
    if create_database_backup "pre-disaster-restore"; then
        log_ok "Safety backup saved: $LAST_BACKUP_PATH"
    else
        log_warn "Could not create a safety backup (database may be empty/unreachable). Continuing."
    fi

    log_info "Stopping app..."
    docker compose $COMPOSE_ARGS stop app 2>/dev/null || true

    if ! restore_database_dump "$pkg_dir/database/allerac.sql.gz"; then
        start_app_after_restore
        log_error "Restore failed."
        exit 1
    fi

    if [ -f "$pkg_dir/files/telegram-bots.json" ]; then
        if [ -f "$TELEGRAM_BOTS_PATH" ]; then
            cp "$TELEGRAM_BOTS_PATH" "$TELEGRAM_BOTS_PATH.bak"
        fi
        cp "$pkg_dir/files/telegram-bots.json" "$TELEGRAM_BOTS_PATH"
        log_ok "Restored telegram-bots.json (previous copy saved as .bak, if any)."
    fi

    log_info "Starting app..."
    start_app_after_restore

    log_ok "Disaster recovery restore complete."

    echo ""
    echo -e "${BOLD}Next steps${NC}"
    echo "  - Review any missing settings listed above and set them in .env"
    if [ -f "$pkg_dir/inventories/ollama-models.json" ]; then
        echo "  - Re-pull Ollama models used by the source:"
        grep -o '"name":"[^"]*"' "$pkg_dir/inventories/ollama-models.json" | sed 's/.*:"//;s/"$//' | while read -r m; do
            echo "      allerac pull $m"
        done
    fi
    echo "  - Not restored (excluded by design): Caddy certs, Grafana/Loki/Prometheus history, tunnel credentials, GitHub Actions runner identity."
    echo ""
}

cmd_verify() {
    require_install_dir
    require_disaster_deps

    echo ""
    echo -e "${BOLD}Allerac One — Backup Readiness Check${NC}"
    echo ""

    local ok=true

    log_info "Testing database backup round-trip..."
    if create_database_backup "verify-check"; then
        log_ok "Database backup succeeded: $LAST_BACKUP_PATH"
        rm -f "$LAST_BACKUP_PATH"
    else
        log_error "Database backup failed."
        ok=false
    fi

    log_info "Checking schema version..."
    local schema_version
    schema_version=$(get_schema_version)
    if [ "$schema_version" != "unknown" ]; then
        log_ok "Schema version: $schema_version"
    else
        log_warn "Could not determine schema version."
        ok=false
    fi

    log_info "Checking backups directory is writable..."
    if [ -w "$UNIT_BACKUP_DIR" ] || mkdir -p "$UNIT_BACKUP_DIR" 2>/dev/null; then
        log_ok "backups/ is writable."
    else
        log_error "backups/ is not writable."
        ok=false
    fi

    log_info "Checking required configuration keys..."
    local names total=0 present=0
    names=$(collect_required_setting_names)
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        total=$((total + 1))
        if [ -f "$UNIT_ENV_PATH" ] && grep -qE "^${name}=.+" "$UNIT_ENV_PATH"; then
            present=$((present + 1))
        fi
    done <<< "$names"
    log_ok "$present/$total known configuration keys are set."

    echo ""
    if [ "$ok" = true ]; then
        log_ok "Backup readiness: OK"
    else
        log_warn "Backup readiness: issues found above"
    fi
    echo ""
}

cmd_models() {
    require_install_dir
    echo ""
    echo -e "${BOLD}Installed Ollama models:${NC}"
    echo ""
    docker exec ${UNIT}-ollama ollama list 2>/dev/null || log_warn "Ollama container not running."
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
    docker exec -it ${UNIT}-ollama ollama pull "$model"
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
    ports=$(docker exec ${UNIT}-executor sh -c 'netstat -tuln 2>/dev/null | grep LISTEN | awk "{print \$4}" | sed "s/.*://g" | sort -n -u' 2>/dev/null || true)

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
        pid=$(docker exec ${UNIT}-executor sh -c "netstat -tulnp 2>/dev/null | grep :$port | awk '{print \$NF}' | cut -d/ -f1" 2>/dev/null || echo "?")

        local cmd
        cmd=$(docker exec ${UNIT}-executor sh -c "ps -p $pid -o comm= 2>/dev/null" 2>/dev/null || echo "unknown")

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
    pid=$(docker exec ${UNIT}-executor sh -c "netstat -tulnp 2>/dev/null | grep :$port | awk '{print \$NF}' | cut -d/ -f1" 2>/dev/null || echo "")

    if [ -z "$pid" ] || [ "$pid" = "?" ]; then
        log_warn "No process found on port $port"
        echo ""
        return
    fi

    # Get process name
    local cmd
    cmd=$(docker exec ${UNIT}-executor sh -c "ps -p $pid -o comm= 2>/dev/null" || echo "process")

    echo -e "  Found: ${YELLOW}$cmd${NC} (PID $pid)"
    echo ""
    read -rp "  Kill this process? [y/N]: " CONFIRM
    [[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; echo ""; exit 0; }

    log_info "Killing process $pid..."
    if docker exec ${UNIT}-executor kill $pid 2>/dev/null; then
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
    echo -e "  ${BOLD}Disaster recovery:${NC}"
    echo -e "    ${GREEN}disaster-backup${NC}              Create a portable recovery package (db + config + inventory)"
    echo -e "    ${GREEN}disaster-inspect${NC} <package>   Verify checksums and show package contents"
    echo -e "    ${GREEN}disaster-restore${NC} <package>   Restore a recovery package onto this host"
    echo -e "    ${GREEN}verify${NC}                       Check this install's backup readiness"
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
    disaster-backup)   cmd_disaster_backup "$@" ;;
    disaster-inspect)  cmd_disaster_inspect "$@" ;;
    disaster-restore)  cmd_disaster_restore "$@" ;;
    verify)     cmd_verify "$@" ;;
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
