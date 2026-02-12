#!/bin/bash
#
# Allerac One - Uninstall Script
# ==============================
#
# Usage:
#   ./uninstall.sh           # Uninstall, keep data
#   ./uninstall.sh --all     # Uninstall and delete all data
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$HOME/allerac-one"
DELETE_DATA=false

if [[ "$1" == "--all" ]]; then
    DELETE_DATA=true
fi

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}   Allerac One - Uninstall                  ${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# Confirm
if [ "$DELETE_DATA" = true ]; then
    echo -e "${RED}WARNING: This will delete ALL data including:${NC}"
    echo "  - Database (conversations, memories, users)"
    echo "  - Ollama models"
    echo "  - Monitoring data"
    echo ""
fi

read -p "Are you sure you want to continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

# Stop services
echo ""
echo -e "${YELLOW}Stopping services...${NC}"
cd "$INSTALL_DIR" 2>/dev/null || true
docker compose -f docker-compose.local.yml --profile ollama --profile monitoring down 2>/dev/null || true

# Remove volumes if requested
if [ "$DELETE_DATA" = true ]; then
    echo -e "${YELLOW}Removing data volumes...${NC}"
    docker volume rm allerac_db_data 2>/dev/null || true
    docker volume rm allerac_ollama_data 2>/dev/null || true
    docker volume rm allerac_prometheus_data 2>/dev/null || true
    docker volume rm allerac_grafana_data 2>/dev/null || true
fi

# Remove images
echo -e "${YELLOW}Removing Docker images...${NC}"
docker rmi allerac-one-app 2>/dev/null || true

# Remove installation directory
if [ "$DELETE_DATA" = true ]; then
    echo -e "${YELLOW}Removing installation directory...${NC}"
    rm -rf "$INSTALL_DIR"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   Uninstall Complete                       ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

if [ "$DELETE_DATA" = false ]; then
    echo "Data volumes were preserved. To remove them:"
    echo "  docker volume rm allerac_db_data allerac_ollama_data"
    echo ""
    echo "Installation directory preserved: $INSTALL_DIR"
fi

echo ""
