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
    echo "     docker compose -f $COMPOSE_FILE logs --tail=200 app migrations"

    if [ "$MIGRATIONS_STARTED" = true ] && [ -n "$PRE_UPDATE_BACKUP" ]; then
        echo "  2. If the database must return to its pre-update state:"
        printf '     INSTALL_DIR=%q bash ./allerac.sh restore %q\n' "$(pwd)" "$PRE_UPDATE_BACKUP"
    else
        echo "  2. The database was not migrated; no database restore is required."
    fi

    if [ -n "$PREVIOUS_COMMIT" ]; then
        echo "  3. Restore the previous application revision:"
        printf '     git checkout --detach %q\n' "$PREVIOUS_COMMIT"
        echo "     docker compose -f $COMPOSE_FILE build"
        echo "     docker compose -f $COMPOSE_FILE up -d"
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
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "allerac-tunnel"; then
        PRODUCT_LINE="cloud"
    else
        PRODUCT_LINE="local"
    fi

    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_FLAGS=""
}

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

# ============================================
# Verify running containers (product-line aware)
# ============================================
verify_deployment() {
    echo ""
    echo -e "${YELLOW}Verifying deployment services...${NC}"

    local app_status
    app_status="$(docker inspect allerac-app \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        2>/dev/null || echo "missing")"
    if [ "$app_status" = "healthy" ]; then
        echo -e "${GREEN}✓ App is healthy${NC}"
    else
        fail_update "health verification" "App health verification failed (status: $app_status)."
    fi

    if [ "$PRODUCT_LINE" = "cloud" ]; then
        # Cloud-specific services
        docker ps --format '{{.Names}}' | grep -q "allerac-tunnel"   && echo -e "${GREEN}✓ Cloudflare tunnel is running${NC}" || echo -e "${YELLOW}⚠ Tunnel is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "allerac-telegram" && echo -e "${GREEN}✓ Telegram bot is running${NC}"   || echo -e "${YELLOW}⚠ Telegram bot is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "grafana"          && echo -e "${GREEN}✓ Grafana is running${NC}"        || echo -e "${YELLOW}⚠ Grafana is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "loki"             && echo -e "${GREEN}✓ Loki is running${NC}"           || echo -e "${YELLOW}⚠ Loki is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "allerac-notifier" && echo -e "${GREEN}✓ Notifier is running${NC}"       || echo -e "${YELLOW}⚠ Notifier is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "allerac-ollama"   && echo -e "${GREEN}✓ Ollama is running${NC}"         || true
    else
        # Local-specific services (only check if they were running before)
        docker ps --format '{{.Names}}' | grep -q "allerac-ollama"        && echo -e "${GREEN}✓ Ollama is running${NC}"         || true
        docker ps --format '{{.Names}}' | grep -q "allerac-health-worker" && echo -e "${GREEN}✓ Health worker is running${NC}"  || echo -e "${YELLOW}⚠ Health worker is not running${NC}"
        docker ps --format '{{.Names}}' | grep -q "allerac-notifier"      && echo -e "${GREEN}✓ Notifier is running${NC}"       || true
        docker ps --format '{{.Names}}' | grep -q "allerac-grafana"       && echo -e "${GREEN}✓ Grafana is running${NC}"        || true
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

if [ "$PRODUCT_LINE" = "local" ]; then
    echo -e "${YELLOW}[0/9]${NC} Configuring local hostname (allerac.home)..."
    setup_local_hostname
    echo -e "${GREEN}✓ Local hostname ready${NC}"
    echo ""
fi

# Step 1: Back up the database before changing code or schema
echo -e "${YELLOW}[1/9]${NC} Creating pre-update database backup..."
BACKUP_PATH_FILE="$(mktemp)"
ALLERAC_BACKUP_PATH_FILE="$BACKUP_PATH_FILE" INSTALL_DIR="$(pwd)" \
    bash ./allerac.sh backup pre-update \
    || fail_update "pre-update backup" "Update aborted: a verified database backup could not be created."
PRE_UPDATE_BACKUP="$(cat "$BACKUP_PATH_FILE")"
[ -n "$PRE_UPDATE_BACKUP" ] \
    || fail_update "pre-update backup" "Update aborted: backup path was not recorded."
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
docker volume create allerac_db_data      > /dev/null 2>&1 || true
docker volume create allerac_ollama_data  > /dev/null 2>&1 || true
docker volume create allerac_backups_data > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Volumes ready${NC}"
echo ""

# Step 5: Run database migrations
echo -e "${YELLOW}[5/9]${NC} Running database migrations..."
MIGRATIONS_STARTED=true
docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up --force-recreate migrations \
    || fail_update "database migration" "Failed to run migrations."
echo -e "${GREEN}✓ Migrations complete${NC}"
echo ""

# Step 6: Rebuild app images
echo -e "${YELLOW}[6/9]${NC} Rebuilding application images..."
if [ "$PRODUCT_LINE" = "cloud" ]; then
    docker compose -f "$COMPOSE_FILE" build --no-cache app allerac-telegram notifier \
        || fail_update "image build" "Failed to rebuild application images."
else
    # Only rebuild images that exist in this deployment
    BUILD_TARGETS="app health-worker"
    docker ps --format '{{.Names}}' | grep -q "allerac-telegram" && BUILD_TARGETS="$BUILD_TARGETS allerac-telegram"
    docker ps --format '{{.Names}}' | grep -q "allerac-notifier" && BUILD_TARGETS="$BUILD_TARGETS notifier"
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS build --no-cache $BUILD_TARGETS \
        || fail_update "image build" "Failed to rebuild application images."
fi
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
for KNOWN in allerac-health-worker; do
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${KNOWN}$"; then
        echo "  Removing leftover container: $KNOWN"
        docker rm -f "$KNOWN" > /dev/null 2>&1 || true
    fi
done

# Docker Compose can leave prefixed containers behind when an interrupted deploy
# is killed while services are being recreated. These names can conflict with the
# next restart even though they are no longer part of the active project.
ORPHAN_PATTERNS='^[[:alnum:]]+_allerac-(app|telegram|notifier|health-worker)$'
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
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up -d \
    || fail_update "service restart" "Failed to restart services."
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 9: Verify - wait up to 60s for the app to be healthy
echo -e "${YELLOW}[9/9]${NC} Verifying deployment..."
WAIT=0
until [ "$(docker inspect allerac-app --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)" = "healthy" ] \
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
    APP_PORT=$(grep "^APP_PORT=" .env 2>/dev/null | cut -d= -f2)
    echo "  App: https://allerac.home  (or http://localhost:${APP_PORT:-8080})"
fi
echo ""
