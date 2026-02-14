#!/bin/bash
#
# Allerac One - Update Script
# ===========================
# Pulls latest changes, rebuilds with proper build info, and restarts services
#
# Usage:
#   ./update.sh                    # Update with production profile (includes tunnel)
#   ./update.sh --no-tunnel        # Update without tunnel (local testing)

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
PROFILE="production"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-tunnel)
            PROFILE=""
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Allerac One Update Script       ║${NC}"
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
echo -e "${YELLOW}[2/5]${NC} Generating build information..."
export COMMIT_HASH=$(git rev-parse HEAD)
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "   Commit: ${COMMIT_HASH:0:7}"
echo "   Date: $BUILD_DATE"
echo -e "${GREEN}✓ Build info generated${NC}"
echo ""

# Step 3: Rebuild Docker images
echo -e "${YELLOW}[3/5]${NC} Rebuilding Docker images..."
if [ -n "$PROFILE" ]; then
    docker compose --profile "$PROFILE" build --no-cache app || {
        echo -e "${RED}Failed to rebuild images${NC}"
        exit 1
    }
else
    docker compose build --no-cache app || {
        echo -e "${RED}Failed to rebuild images${NC}"
        exit 1
    }
fi
echo -e "${GREEN}✓ Images rebuilt successfully${NC}"
echo ""

# Step 4: Restart services
echo -e "${YELLOW}[4/5]${NC} Restarting services..."
if [ -n "$PROFILE" ]; then
    docker compose --profile "$PROFILE" up -d || {
        echo -e "${RED}Failed to restart services${NC}"
        exit 1
    }
else
    docker compose up -d || {
        echo -e "${RED}Failed to restart services${NC}"
        exit 1
    }
fi
echo -e "${GREEN}✓ Services restarted${NC}"
echo ""

# Step 5: Verify
echo -e "${YELLOW}[5/5]${NC} Verifying deployment..."
sleep 3
if docker ps | grep -q allerac-one-app; then
    echo -e "${GREEN}✓ App is running${NC}"
else
    echo -e "${RED}✗ App failed to start${NC}"
    echo "Check logs with: docker compose logs app"
    exit 1
fi

if [ -n "$PROFILE" ]; then
    if docker ps | grep -q allerac-tunnel; then
        echo -e "${GREEN}✓ Tunnel is running${NC}"
    else
        echo -e "${YELLOW}⚠ Tunnel is not running${NC}"
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Update completed successfully!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════╝${NC}"
echo ""
echo "Build: ${COMMIT_HASH:0:7} ($BUILD_DATE)"

if [ -n "$PROFILE" ]; then
    echo "Access: https://chat.allerac.ai"
else
    echo "Access: http://localhost:8080"
fi
