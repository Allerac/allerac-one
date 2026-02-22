#!/bin/bash
#
# Allerac One - Update Script
# ===========================
# Pulls latest changes, rebuilds with proper build info, and restarts services
#
# Usage:
#   ./update.sh

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Allerac One Update Script        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the allerac-one directory"
    exit 1
fi

# Step 1: Pull latest changes
echo -e "${YELLOW}[1/5]${NC} Pulling latest changes from GitHub..."
git pull origin main || {
    echo -e "${RED}Failed to pull changes${NC}"
    exit 1
}
echo -e "${GREEN}✓ Changes pulled successfully${NC}"
echo ""

# Step 2: Generate build info
echo -e "${YELLOW}[2/6]${NC} Generating build information..."
export COMMIT_HASH=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "   Commit: ${COMMIT_HASH:0:7}"
echo "   Date: $BUILD_DATE"
echo -e "${GREEN}✓ Build info generated${NC}"
echo ""

# Step 3: Run database migrations
echo -e "${YELLOW}[3/6]${NC} Running database migrations..."
docker compose up --force-recreate migrations || {
    echo -e "${RED}Failed to run migrations${NC}"
    exit 1
}
echo -e "${GREEN}✓ Migrations completed${NC}"
echo ""

# Step 4: Rebuild Docker images
echo -e "${YELLOW}[4/6]${NC} Rebuilding Docker images..."
docker compose build --no-cache app telegram-bot notifier || {
    echo -e "${RED}Failed to rebuild images${NC}"
    exit 1
}
echo -e "${GREEN}✓ Images rebuilt successfully${NC}"
echo ""

# Step 5: Restart services
echo -e "${YELLOW}[5/6]${NC} Restarting services..."
docker compose up -d || {
    echo -e "${RED}Failed to restart services${NC}"
    exit 1
}
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 6: Verify
echo -e "${YELLOW}[6/6]${NC} Verifying deployment..."
sleep 3
if docker ps | grep -q allerac-one-app; then
    echo -e "${GREEN}✓ App is running${NC}"
else
    echo -e "${RED}✗ App failed to start${NC}"
    echo "Check logs with: docker compose logs app"
    exit 1
fi

if docker ps | grep -q allerac-telegram; then
    echo -e "${GREEN}✓ Telegram bot is running${NC}"
else
    echo -e "${YELLOW}⚠ Telegram bot is not running${NC}"
fi

if docker ps | grep -q allerac-tunnel; then
    echo -e "${GREEN}✓ Tunnel is running${NC}"
else
    echo -e "${YELLOW}⚠ Tunnel is not running${NC}"
fi

if docker ps | grep -q grafana; then
    echo -e "${GREEN}✓ Grafana is running${NC}"
else
    echo -e "${YELLOW}⚠ Grafana is not running${NC}"
fi

if docker ps | grep -q loki; then
    echo -e "${GREEN}✓ Loki is running${NC}"
else
    echo -e "${YELLOW}⚠ Loki is not running${NC}"
fi

if docker ps | grep -q promtail; then
    echo -e "${GREEN}✓ Promtail is running${NC}"
else
    echo -e "${YELLOW}⚠ Promtail is not running${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Update completed successfully!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo "Build: ${COMMIT_HASH:0:7} ($BUILD_DATE)"
echo "Public: https://chat.allerac.ai"
echo "Local: http://localhost:8080"
echo "Grafana: http://localhost:3001 (logs & metrics)"
