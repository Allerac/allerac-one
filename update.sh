#!/bin/bash
#
# Allerac One - Update Script
# ===========================
# Pulls latest changes, rebuilds, and restarts services.
# Works for both Local Hardware Line and Cloud Services Line.
#
# Usage:
#   ./update.sh                     # auto-detects product line
#   ALLERAC_PRODUCT_LINE=local ./update.sh
#   ALLERAC_PRODUCT_LINE=cloud ./update.sh
#   DEPLOY_BRANCH=development ./update.sh

set -eo pipefail
trap 'echo "Update failed at line $LINENO: $BASH_COMMAND"' ERR

# ============================================
# Colors
# ============================================
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PREVIOUS_COMMIT=""
PREVIOUS_BRANCH=""
PRE_UPDATE_BACKUP=""
MIGRATIONS_STARTED=false
BACKUP_PATH_FILE=""

cleanup_update_state() {
    [ -z "$BACKUP_PATH_FILE" ] || rm -f "$BACKUP_PATH_FILE"
}
trap cleanup_update_state EXIT

print_rollback_instructions() {
    local phase="$1"

    echo ""
    echo -e "${YELLOW}Rollback instructions (${phase}):${NC}"
    echo "  1. Inspect the failure:"
    echo "     docker compose $COMPOSE_ARGS logs --tail=200 app migrations"

    if [ "$MIGRATIONS_STARTED" = true ] && [ -n "$PRE_UPDATE_BACKUP" ]; then
        echo "  2. If the database must return to its pre-update state:"
        printf '     INSTALL_DIR=%q bash ./allerac.sh restore %q\n' "$(pwd)" "$PRE_UPDATE_BACKUP"
    else
        echo "  2. The database was not migrated; no database restore is required."
    fi

    if [ -n "$PREVIOUS_COMMIT" ]; then
        echo "  3. Restore the previous application revision:"
        printf '     git checkout --detach %q\n' "$PREVIOUS_COMMIT"
        echo "     docker compose $COMPOSE_ARGS build"
        echo "     docker compose $COMPOSE_ARGS up -d"
        if [ -n "$PREVIOUS_BRANCH" ]; then
            echo "  4. After resolving the update, return to the tracked branch:"
            printf '     git checkout %q\n' "$PREVIOUS_BRANCH"
        fi
    fi

    if [ -n "$PRE_UPDATE_BACKUP" ]; then
        echo "  Pre-update backup: $PRE_UPDATE_BACKUP"
    fi
    echo ""
}

fail_update() {
    local phase="$1"
    local message="$2"
    echo -e "${RED}${message}${NC}"
    print_rollback_instructions "$phase"
    exit 1
}

# ============================================
# Product line detection
# ============================================
# ALLERAC_PRODUCT_LINE is injected by docker-compose into the container env.
# When run directly on the host, it auto-detects from running containers.
detect_product_line() {
    if [ -n "$ALLERAC_PRODUCT_LINE" ]; then
        PRODUCT_LINE="$ALLERAC_PRODUCT_LINE"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${UNIT}-tunnel"; then
        PRODUCT_LINE="cloud"
    else
        PRODUCT_LINE="local"
    fi

    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_FLAGS=""
}
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
    *)  UNIT_ENV_PATH="$(pwd)/$ALLERAC_ENV_FILE" ;;
esac
unit_env_value() {
    { grep -E "^$1=" "$UNIT_ENV_PATH" 2>/dev/null || true; } | tail -n 1 | cut -d= -f2- \
        | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}
UNIT="${ALLERAC_UNIT:-$(unit_env_value ALLERAC_UNIT)}"
UNIT="${UNIT:-allerac}"
# A Unit worktree pins its own branch (DEPLOY_BRANCH=unit/<name> in its env file);
# the calling shell still wins.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(unit_env_value DEPLOY_BRANCH)}"
_current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
case "$_current_branch" in
    unit/*)
        if [ "${DEPLOY_BRANCH:-main}" != "$_current_branch" ]; then
            echo "This checkout is on Unit branch $_current_branch but DEPLOY_BRANCH is '${DEPLOY_BRANCH:-main}'." >&2
            echo "Refusing to merge another branch into a Unit branch; set DEPLOY_BRANCH=$_current_branch in its env file." >&2
            exit 1
        fi ;;
esac
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
# COMPOSE_PROFILES set in the calling shell is explicit and always wins.
if [ -n "${COMPOSE_PROFILES+x}" ]; then SHELL_COMPOSE_PROFILES_SET=1; else SHELL_COMPOSE_PROFILES_SET=0; fi
# Step 8 passes COMPOSE_PROFILES explicitly. For a non-default Unit take it from
# that Unit's env file when the shell does not set it. (The primary Unit keeps
# the historic behaviour: only the shell value is used there.)
if [ "$ALLERAC_ENV_FILE" != ".env" ] && [ -z "${COMPOSE_PROFILES+x}" ]; then
    COMPOSE_PROFILES="$(unit_env_value COMPOSE_PROFILES)"
fi
# Module services (e.g. health-worker): derive their Compose profiles from
# ALLERAC_PROFILE / ALLERAC_MODULES and merge them with the Unit's profiles.
# shellcheck source=scripts/lib/compose-profiles.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/lib/compose-profiles.sh"
if [ "$SHELL_COMPOSE_PROFILES_SET" != "1" ]; then
    COMPOSE_PROFILES="$(allerac_effective_compose_profiles 0 "" \
        "${COMPOSE_PROFILES:-$(unit_env_value COMPOSE_PROFILES)}" \
        "${ALLERAC_PROFILE-$(unit_env_value ALLERAC_PROFILE)}" \
        "${ALLERAC_MODULES-$(unit_env_value ALLERAC_MODULES)}")"
    export COMPOSE_PROFILES
fi

compose_profiles_without() {
    local remove_profile="$1"
    local source_profiles="${COMPOSE_PROFILES:-}"
    local result=""
    local profile

    IFS=',' read -ra profiles <<< "$source_profiles"
    for profile in "${profiles[@]}"; do
        [ -z "$profile" ] && continue
        [ "$profile" = "$remove_profile" ] && continue
        if [ -z "$result" ]; then
            result="$profile"
        else
            result="${result},${profile}"
        fi
    done

    printf '%s' "$result"
}

# Only the given services that are active for this Unit (a lean Unit using
# docker-compose.public.yml has no executor, so it is not rebuilt).
active_services() {
    local active svc result=""
    active="$(docker compose $COMPOSE_ARGS $COMPOSE_FLAGS config --services 2>/dev/null || true)"
    for svc in "$@"; do
        if [ -z "$active" ] || printf '%s\n' "$active" | grep -qx "$svc"; then
            result="$result $svc"
        fi
    done
    printf '%s' "${result# }"
}

# ============================================
# Verify running containers (product-line aware)
# ============================================
verify_deployment() {
    echo ""
    echo -e "${YELLOW}Verifying deployment services...${NC}"

    local app_status
    app_status="$(docker inspect ${UNIT}-app \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        2>/dev/null || echo "missing")"
    if [ "$app_status" = "healthy" ]; then
        echo -e "${GREEN}✓ App is healthy${NC}"
    else
        fail_update "health verification" "App health verification failed (status: $app_status)."
    fi

    if [ "$PRODUCT_LINE" = "cloud" ]; then
        # Cloud-specific services
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-tunnel"   && echo -e "${GREEN}✓ Cloudflare tunnel is running${NC}" || echo -e "${YELLOW}⚠ Tunnel is not running${NC}"
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-telegram" && echo -e "${GREEN}✓ Telegram bot is running${NC}"   || echo -e "${YELLOW}⚠ Telegram bot is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "grafana"          && echo -e "${GREEN}✓ Grafana is running${NC}"        || echo -e "${YELLOW}⚠ Grafana is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "loki"             && echo -e "${GREEN}✓ Loki is running${NC}"           || echo -e "${YELLOW}⚠ Loki is not running${NC}"
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-notifier" && echo -e "${GREEN}✓ Notifier is running${NC}"       || echo -e "${YELLOW}⚠ Notifier is not running${NC}"
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-ollama"   && echo -e "${GREEN}✓ Ollama is running${NC}"         || true
    else
        # Local-specific services (only check if they were running before)
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-ollama"        && echo -e "${GREEN}✓ Ollama is running${NC}"         || true
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-health-worker" && echo -e "${GREEN}✓ Health worker is running${NC}"  || echo -e "${YELLOW}⚠ Health worker is not running${NC}"
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-notifier"      && echo -e "${GREEN}✓ Notifier is running${NC}"       || true
        docker ps --format '{{.Names}}' | grep -qx "${UNIT}-grafana"       && echo -e "${GREEN}✓ Grafana is running${NC}"        || true
    fi
}

# ============================================
# Main
# ============================================
detect_product_line

echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Allerac One — Update             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════╝${NC}"
echo ""
echo -e "  Product line: ${YELLOW}${PRODUCT_LINE}${NC}"
echo -e "  Compose file: ${YELLOW}${COMPOSE_FILE}${NC}"
echo -e "  Deploy branch: ${YELLOW}${DEPLOY_BRANCH:-main}${NC}"
echo ""

# Check we're in the project directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
    echo "Run this script from the allerac-one directory."
    exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
PREVIOUS_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"

# Step 0: Local hostname + HTTPS certs (idempotent)
setup_local_hostname() {
    local hostname="allerac.home"
    local cert_dir="$(pwd)/infra/caddy/certs"

    # /etc/hosts entries
    for h in allerac.home allerac.grafana allerac.portainer; do
        if ! grep -q "$h" /etc/hosts 2>/dev/null; then
            echo "  Adding $h to /etc/hosts..."
            echo "127.0.0.1 $h" | sudo tee -a /etc/hosts > /dev/null
        fi
    done

    # Install mkcert if missing
    if ! command -v mkcert &>/dev/null; then
        echo "  Installing mkcert..."
        if [ -f /etc/debian_version ]; then
            sudo apt-get install -y -q mkcert libnss3-tools
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install mkcert nss
        else
            echo -e "${YELLOW}  ⚠ Please install mkcert manually: https://github.com/FiloSottile/mkcert${NC}"
            return
        fi
    elif [ -f /etc/debian_version ] && ! command -v certutil &>/dev/null; then
        sudo apt-get install -y -q libnss3-tools
    fi

    # Install local CA into system + browser trust stores
    mkcert -install

    # Generate certs for any domain missing
    mkdir -p "$cert_dir"
    local generated=false
    for domain in allerac.home allerac.grafana allerac.portainer; do
        if [ ! -f "$cert_dir/${domain}.pem" ] || [ ! -f "$cert_dir/${domain}-key.pem" ]; then
            mkcert \
                -cert-file "$cert_dir/${domain}.pem" \
                -key-file  "$cert_dir/${domain}-key.pem" \
                "$domain"
            generated=true
        fi
    done
    [ "$generated" = true ] && echo -e "${GREEN}✓ HTTPS certificates generated${NC}"
}

if [ "$PRODUCT_LINE" = "local" ] && [ "$UNIT" != "allerac" ]; then
    echo -e "${YELLOW}[0/9]${NC} Skipping local hostname setup (allerac.home belongs to the primary Unit)."
    echo ""
elif [ "$PRODUCT_LINE" = "local" ]; then
    echo -e "${YELLOW}[0/9]${NC} Configuring local hostname (allerac.home)..."
    setup_local_hostname
    echo -e "${GREEN}✓ Local hostname ready${NC}"
    echo ""
fi

# Step 1: Back up the database before changing code or schema
echo -e "${YELLOW}[1/9]${NC} Creating pre-update database backup..."
DB_RUNNING_ID="$(docker compose $COMPOSE_ARGS $COMPOSE_FLAGS ps --status running -q db 2>/dev/null || true)"
if [ -z "$DB_RUNNING_ID" ]; then
    # First install (or the unit was never started): there is no database to
    # back up yet. Skip the backup and continue with build/up/migrations.
    echo -e "${YELLOW}⚠ Database service 'db' is not running (first install or unit never started).${NC}"
    echo "  Skipping pre-update backup; nothing to back up yet."
else
    BACKUP_PATH_FILE="$(mktemp)"
    ALLERAC_BACKUP_PATH_FILE="$BACKUP_PATH_FILE" INSTALL_DIR="$(pwd)" \
        ALLERAC_ENV_FILE="$ALLERAC_ENV_FILE" ALLERAC_UNIT="$UNIT" bash ./allerac.sh backup pre-update \
        || fail_update "pre-update backup" "Update aborted: a verified database backup could not be created."
    PRE_UPDATE_BACKUP="$(cat "$BACKUP_PATH_FILE")"
    [ -n "$PRE_UPDATE_BACKUP" ] \
        || fail_update "pre-update backup" "Update aborted: backup path was not recorded."
fi
echo ""

# Step 2: Pull latest changes
echo -e "${YELLOW}[2/9]${NC} Pulling latest changes from GitHub..."
git pull origin "${DEPLOY_BRANCH:-main}" || fail_update "source update" "Failed to pull changes."
echo -e "${GREEN}✓ Changes pulled${NC}"
echo ""

# Step 3: Generate build info
echo -e "${YELLOW}[3/9]${NC} Generating build information..."
export COMMIT_HASH=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export RELEASE_VERSION=$(git tag --points-at HEAD --sort=-version:refname | head -n 1)
[ -n "$RELEASE_VERSION" ] || RELEASE_VERSION="unreleased"
echo "   Commit: ${COMMIT_HASH:0:7}"
echo "   Date:   $BUILD_DATE"
echo "   Release: $RELEASE_VERSION"
echo -e "${GREEN}✓ Build info ready${NC}"
echo ""

# Step 4: Ensure named data volumes exist (safe to run on every update)
# These are declared as external in docker-compose.yml so they must exist before `up`.
echo -e "${YELLOW}[4/9]${NC} Ensuring data volumes exist..."
docker volume create ${UNIT}_db_data      > /dev/null 2>&1 || true
docker volume create ${UNIT}_ollama_data  > /dev/null 2>&1 || true
docker volume create ${UNIT}_backups_data > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Volumes ready${NC}"
echo ""

# Executor hardening notice: HOST_WORKSPACE (host /home mounted read-write into
# the shell executor) is no longer used. Warn so nobody silently loses files.
if grep -q "^HOST_WORKSPACE=" "$UNIT_ENV_PATH" 2>/dev/null; then
    echo -e "${YELLOW}  Note: HOST_WORKSPACE in .env is no longer used. The AI shell now works in the${NC}"
    echo -e "${YELLOW}  Docker volume ${UNIT}_executor_workspace (or EXECUTOR_WORKSPACE). Existing${NC}"
    echo -e "${YELLOW}  projects under <HOST_WORKSPACE>/projects must be copied once — see${NC}"
    echo -e "${YELLOW}  infra/executor/README.md (\"Upgrading\").${NC}"
    echo ""
fi

# n8n keeps its credentials encrypted with N8N_ENCRYPTION_KEY. Compose cannot
# require it only when the automation profile is on, so check it here.
EFFECTIVE_PROFILES="${COMPOSE_PROFILES:-$(unit_env_value COMPOSE_PROFILES)}"
if [[ ",${EFFECTIVE_PROFILES}," == *",automation,"* ]] \
    && [ -z "${N8N_ENCRYPTION_KEY:-$(unit_env_value N8N_ENCRYPTION_KEY)}" ]; then
    fail_update "configuration check" "N8N_ENCRYPTION_KEY is required when the automation profile is enabled (generate one with: openssl rand -hex 32)."
fi

# Step 5: Run database migrations
echo -e "${YELLOW}[5/9]${NC} Running database migrations..."
MIGRATIONS_STARTED=true
docker compose $COMPOSE_ARGS $COMPOSE_FLAGS build --pull migrations \
    || fail_update "database migration" "Failed to build the migration image."
docker compose $COMPOSE_ARGS $COMPOSE_FLAGS up --force-recreate migrations \
    || fail_update "database migration" "Failed to run migrations."
echo -e "${GREEN}✓ Migrations complete${NC}"
echo ""

# Step 6: Rebuild app images
echo -e "${YELLOW}[6/9]${NC} Rebuilding application images..."
# Build every enabled service, including certificate-only vendor wrappers.
# Compose profiles and public/cloud overrides still select the deployment.
docker compose $COMPOSE_ARGS $COMPOSE_FLAGS build --pull \
    || fail_update "image build" "Failed to rebuild application images."
echo -e "${GREEN}✓ Images rebuilt${NC}"
echo ""

# Step 7: Remove containers from other projects that would conflict.
# Catches both name conflicts (explicit container_name) and port conflicts
# from old non-prefixed monitoring containers (loki, grafana, prometheus, etc.).
echo -e "${YELLOW}[7/9]${NC} Cleaning up orphan containers..."
OLD_CONTAINERS=$(docker ps -a \
    --filter "label=com.docker.compose.project=allerac-one" \
    --format "{{.Names}}" 2>/dev/null)
if [ -n "$OLD_CONTAINERS" ]; then
    echo "$OLD_CONTAINERS" | while read -r c; do
        echo "  Removing allerac-one container: $c"
        docker rm -f "$c" > /dev/null 2>&1 || true
    done
fi
# Also remove known allerac containers by name in case they exist from a
# previous install with a different compose project label (e.g. profile changes).
for KNOWN in ${UNIT}-health-worker; do
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${KNOWN}$"; then
        echo "  Removing leftover container: $KNOWN"
        docker rm -f "$KNOWN" > /dev/null 2>&1 || true
    fi
done

# Docker Compose can leave prefixed containers behind when an interrupted deploy
# is killed while services are being recreated. These names can conflict with the
# next restart even though they are no longer part of the active project.
ORPHAN_PATTERNS="^[[:alnum:]]+_${UNIT}-(app|telegram|notifier|health-worker)\$"
ORPHAN_CONTAINERS="$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E "$ORPHAN_PATTERNS" || true)"
if [ -n "$ORPHAN_CONTAINERS" ]; then
    echo "$ORPHAN_CONTAINERS" | while read -r c; do
        echo "  Removing prefixed orphan container: $c"
        docker rm -f "$c" > /dev/null 2>&1 || true
    done
fi
echo -e "${GREEN}✓ Cleanup done${NC}"
echo ""

# Step 8: Restart services
echo -e "${YELLOW}[8/9]${NC} Restarting services..."
RESTART_COMPOSE_PROFILES="${COMPOSE_PROFILES:-}"
if [ "${SKIP_WEBHOOK_RESTART:-false}" = "true" ]; then
    RESTART_COMPOSE_PROFILES="$(compose_profiles_without webhook)"
    echo -e "${YELLOW}  Skipping webhook profile during self-triggered deploy.${NC}"
fi
COMMIT_HASH=$COMMIT_HASH BUILD_DATE=$BUILD_DATE RELEASE_VERSION=$RELEASE_VERSION \
    COMPOSE_PROFILES="$RESTART_COMPOSE_PROFILES" \
    docker compose $COMPOSE_ARGS $COMPOSE_FLAGS up -d \
    || fail_update "service restart" "Failed to restart services."
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 9: Verify - wait up to 60s for the app to be healthy
echo -e "${YELLOW}[9/9]${NC} Verifying deployment..."
WAIT=0
until [ "$(docker inspect ${UNIT}-app --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)" = "healthy" ] \
    || [ $WAIT -ge 60 ]; do
    sleep 2
    WAIT=$((WAIT + 2))
done
verify_deployment

echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Update completed successfully!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo "  Build: ${COMMIT_HASH:0:7} ($BUILD_DATE)"
echo "  Release: $RELEASE_VERSION"
if [ "$PRODUCT_LINE" = "cloud" ]; then
    echo "  App:     http://localhost:8080"
    echo "  Grafana: http://localhost:3001"
else
    APP_PORT=$(unit_env_value APP_PORT)
    echo "  App: https://allerac.home  (or http://localhost:${APP_PORT:-8080})"
fi
echo ""
