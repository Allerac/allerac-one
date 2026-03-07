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
        docker ps --format '{{.Names}}' | grep -q "allerac-ollama"   && echo -e "${GREEN}✓ Ollama is running${NC}"         || true
        docker ps --format '{{.Names}}' | grep -q "allerac-notifier" && echo -e "${GREEN}✓ Notifier is running${NC}"       || true
        docker ps --format '{{.Names}}' | grep -q "allerac-grafana"  && echo -e "${GREEN}✓ Grafana is running${NC}"        || true
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

# Step 1: Pull latest changes
echo -e "${YELLOW}[1/6]${NC} Pulling latest changes from GitHub..."
git pull origin main || { echo -e "${RED}Failed to pull changes${NC}"; exit 1; }
echo -e "${GREEN}✓ Changes pulled${NC}"
echo ""

# Step 2: Generate build info
echo -e "${YELLOW}[2/6]${NC} Generating build information..."
export COMMIT_HASH=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "   Commit: ${COMMIT_HASH:0:7}"
echo "   Date:   $BUILD_DATE"
echo -e "${GREEN}✓ Build info ready${NC}"
echo ""

# Step 3: Run database migrations
echo -e "${YELLOW}[3/6]${NC} Running database migrations..."
docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up --force-recreate migrations || {
    echo -e "${RED}Failed to run migrations${NC}"
    exit 1
}
echo -e "${GREEN}✓ Migrations complete${NC}"
echo ""

# Step 4: Rebuild app images
echo -e "${YELLOW}[4/6]${NC} Rebuilding application images..."
if [ "$PRODUCT_LINE" = "cloud" ]; then
    docker compose -f "$COMPOSE_FILE" build --no-cache app telegram-bot notifier
else
    # Only rebuild images that exist in this deployment
    BUILD_TARGETS="app"
    docker ps --format '{{.Names}}' | grep -q "allerac-telegram" && BUILD_TARGETS="$BUILD_TARGETS telegram-bot"
    docker ps --format '{{.Names}}' | grep -q "allerac-notifier" && BUILD_TARGETS="$BUILD_TARGETS notifier"
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS build --no-cache $BUILD_TARGETS
fi
echo -e "${GREEN}✓ Images rebuilt${NC}"
echo ""

# Step 5: Restart services
echo -e "${YELLOW}[5/6]${NC} Restarting services..."
COMMIT_HASH=$COMMIT_HASH BUILD_DATE=$BUILD_DATE \
    docker compose -f "$COMPOSE_FILE" $COMPOSE_FLAGS up -d || {
    echo -e "${RED}Failed to restart services${NC}"
    exit 1
}
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 6: Verify
sleep 3
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
    APP_PORT=$(grep "^APP_PORT=" .env 2>/dev/null | cut -d= -f2 || echo "8080")
    echo "  App: http://localhost:${APP_PORT}"
fi
echo ""
