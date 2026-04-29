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

set -e

# ============================================
# Colors
# ============================================
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

    if [ "$PRODUCT_LINE" = "cloud" ]; then
        COMPOSE_FILE="docker-compose.yml"
        COMPOSE_FLAGS=""
    else
        COMPOSE_FILE="docker-compose.local.yml"
        # Re-activate GPU override if enabled
        GPU_FLAG=""
        ENABLE_GPU=$(grep "^ENABLE_GPU=" .env 2>/dev/null | cut -d= -f2 || echo "false")
        [ "$ENABLE_GPU" = "true" ] && GPU_FLAG="-f docker-compose.local.gpu.yml"
        # Re-activate the same profiles that are currently running
        RUNNING_PROFILES=""
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "allerac-notifier"  && RUNNING_PROFILES="$RUNNING_PROFILES --profile notifications"
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "allerac-prometheus" && RUNNING_PROFILES="$RUNNING_PROFILES --profile monitoring"
        COMPOSE_FLAGS="$GPU_FLAG $RUNNING_PROFILES"
    fi
}

# ============================================
# Verify running containers (product-line aware)
# ============================================
verify_deployment() {
    echo ""
    echo -e "${YELLOW}[6/6]${NC} Verifying deployment..."

    # Core (both product lines)
    if docker ps --format '{{.Names}}' | grep -q "allerac-app"; then
        echo -e "${GREEN}✓ App is running${NC}"
    else
        echo -e "${RED}✗ App failed to start — check logs: docker compose -f $COMPOSE_FILE logs app${NC}"
        exit 1
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
echo ""

# Check we're in the project directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
    echo "Run this script from the allerac-one directory."
    exit 1
fi

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
    echo -e "${YELLOW}[0/8]${NC} Configuring local hostname (allerac.home)..."
    setup_local_hostname
    echo -e "${GREEN}✓ Local hostname ready${NC}"
    echo ""
fi

# Step 1: Pull latest changes
echo -e "${YELLOW}[1/8]${NC} Pulling latest changes from GitHub..."
git pull origin main || { echo -e "${RED}Failed to pull changes${NC}"; exit 1; }
echo -e "${GREEN}✓ Changes pulled${NC}"
echo ""

# Step 2: Generate build info
echo -e "${YELLOW}[2/8]${NC} Generating build information..."
export COMMIT_HASH=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "   Commit: ${COMMIT_HASH:0:7}"
echo "   Date:   $BUILD_DATE"
echo -e "${GREEN}✓ Build info ready${NC}"
echo ""

# Step 3: Ensure named data volumes exist (safe to run on every update)
# These are declared as external in docker-compose.yml so they must exist before `up`.
echo -e "${YELLOW}[3/8]${NC} Ensuring data volumes exist..."
docker volume create allerac_db_data      > /dev/null 2>&1 || true
docker volume create allerac_ollama_data  > /dev/null 2>&1 || true
docker volume create allerac_backups_data > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Volumes ready${NC}"
echo ""

# Step 4: Run database migrations
echo -e "${YELLOW}[4/8]${NC} Running database migrations..."
docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up --force-recreate migrations || {
    echo -e "${RED}Failed to run migrations${NC}"
    exit 1
}
echo -e "${GREEN}✓ Migrations complete${NC}"
echo ""

# Step 5: Rebuild app images
echo -e "${YELLOW}[5/8]${NC} Rebuilding application images..."
if [ "$PRODUCT_LINE" = "cloud" ]; then
    docker compose -f "$COMPOSE_FILE" build --no-cache app allerac-telegram notifier
else
    # Only rebuild images that exist in this deployment
    BUILD_TARGETS="app health-worker"
    docker ps --format '{{.Names}}' | grep -q "allerac-telegram" && BUILD_TARGETS="$BUILD_TARGETS allerac-telegram"
    docker ps --format '{{.Names}}' | grep -q "allerac-notifier" && BUILD_TARGETS="$BUILD_TARGETS notifier"
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS build --no-cache $BUILD_TARGETS
fi
echo -e "${GREEN}✓ Images rebuilt${NC}"
echo ""

# Step 6: Remove containers from other projects that would conflict.
# Catches both name conflicts (explicit container_name) and port conflicts
# from old non-prefixed monitoring containers (loki, grafana, prometheus, etc.).
echo -e "${YELLOW}[6/8]${NC} Cleaning up orphan containers..."
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
echo -e "${GREEN}✓ Cleanup done${NC}"
echo ""

# Step 7: Restart services
echo -e "${YELLOW}[7/8]${NC} Restarting services..."
COMMIT_HASH=$COMMIT_HASH BUILD_DATE=$BUILD_DATE \
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up -d || {
    echo -e "${RED}Failed to restart services${NC}"
    exit 1
}
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 8: Verify — wait up to 30s for the app to be ready
echo -e "${YELLOW}[8/8]${NC} Verifying deployment..."
WAIT=0
until docker ps --format '{{.Names}}' | grep -q "allerac-app" || [ $WAIT -ge 30 ]; do
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
if [ "$PRODUCT_LINE" = "cloud" ]; then
    echo "  App:     http://localhost:8080"
    echo "  Grafana: http://localhost:3001"
else
    APP_PORT=$(grep "^APP_PORT=" .env 2>/dev/null | cut -d= -f2)
    echo "  App: https://allerac.home  (or http://localhost:${APP_PORT:-8080})"
fi
echo ""
