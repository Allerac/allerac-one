#!/bin/bash
#
# Allerac One - Uninstall Script
# ==============================
#
# Modes:
#   ./uninstall.sh           Stop containers only. Keeps data, images, .env.
#   ./uninstall.sh --clean   Stop containers + remove images. Keeps data, .env.
#                            Use this to force a fresh rebuild on next install.
#   ./uninstall.sh --all     Full clean slate: containers, images, volumes,
#                            .env, and installation directory.
#                            Use this to test install from scratch.
#

# Don't use set -e — we want to continue even if some removals fail
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="${INSTALL_DIR:-$HOME/allerac-one}"
MODE="${1:-}"

log_info()    { echo -e "${BLUE}  →${NC} $1"; }
log_ok()      { echo -e "${GREEN}  ✓${NC} $1"; }
log_skip()    { echo -e "  ${YELLOW}–${NC} $1 (not found, skipping)"; }
log_error()   { echo -e "${RED}  ✗${NC} $1"; }

# ============================================
# Usage
# ============================================
if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
    head -16 "$0" | tail -14
    exit 0
fi

if [[ -n "$MODE" && "$MODE" != "--clean" && "$MODE" != "--all" ]]; then
    echo -e "${RED}Unknown option: $MODE${NC}"
    echo "Usage: ./uninstall.sh [--clean|--all]"
    exit 1
fi

# ============================================
# Header + confirmation
# ============================================
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   Allerac One — Uninstall                ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════╝${NC}"
echo ""

case "$MODE" in
    "")
        echo -e "  Mode: ${BOLD}stop only${NC}"
        echo -e "  Keeps: data volumes, Docker images, .env, files"
        ;;
    --clean)
        echo -e "  Mode: ${BOLD}stop + remove images${NC}"
        echo -e "  Keeps: data volumes, .env, files"
        echo -e "  Removes: containers, built Docker images"
        ;;
    --all)
        echo -e "  Mode: ${BOLD}full clean slate${NC}"
        echo -e "${RED}  Removes: containers, images, volumes, .env, ${INSTALL_DIR}${NC}"
        echo -e "${RED}  ALL data will be lost (conversations, models, backups)${NC}"
        ;;
esac

echo ""
read -rp "  Continue? [y/N]: " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "  Cancelled."; exit 0; }
echo ""

# ============================================
# 1. Stop and remove containers
# ============================================
echo -e "${BOLD}[1/4] Stopping containers...${NC}"

if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    if docker compose -f docker-compose.local.yml \
        --profile ollama --profile notifications --profile monitoring \
        down 2>/dev/null; then
        log_ok "Containers stopped and removed"
    else
        log_info "No compose containers running (or already stopped)"
    fi
else
    log_skip "Install directory not found"
fi

# Also remove any leftover allerac containers not caught by compose
LEFTOVER=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep "^allerac-" || true)
if [ -n "$LEFTOVER" ]; then
    echo "$LEFTOVER" | while read -r name; do
        docker rm -f "$name" >/dev/null 2>&1 && log_ok "Removed leftover container: $name"
    done
fi

echo ""

# ============================================
# 2. Remove Docker images (--clean and --all)
# ============================================
echo -e "${BOLD}[2/4] Docker images...${NC}"

if [[ "$MODE" == "--clean" || "$MODE" == "--all" ]]; then
    # Remove locally built images (app, telegram-bot, notifier, executor)
    for IMAGE in \
        "allerac-one-app" \
        "allerac-one-telegram-bot" \
        "allerac-one-notifier" \
        "allerac-one-executor" \
        "allerac-one-ollama-setup"; do
        if docker image inspect "$IMAGE" >/dev/null 2>&1; then
            docker rmi "$IMAGE" >/dev/null 2>&1 && log_ok "Removed image: $IMAGE"
        else
            log_skip "Image $IMAGE"
        fi
    done

    # Remove dangling build cache
    docker builder prune -f >/dev/null 2>&1 && log_ok "Build cache cleared"
else
    log_info "Skipped (use --clean or --all to remove images)"
fi

echo ""

# ============================================
# 3. Remove data volumes (--all only)
# ============================================
echo -e "${BOLD}[3/4] Data volumes...${NC}"

if [[ "$MODE" == "--all" ]]; then
    for VOL in \
        "allerac_db_data" \
        "allerac_ollama_data" \
        "allerac_backups_data" \
        "allerac_redis_data" \
        "allerac_prometheus_data" \
        "allerac_grafana_data"; do
        if docker volume inspect "$VOL" >/dev/null 2>&1; then
            docker volume rm "$VOL" >/dev/null 2>&1 && log_ok "Removed volume: $VOL"
        else
            log_skip "Volume $VOL"
        fi
    done
else
    log_info "Skipped (use --all to remove data)"
fi

echo ""

# ============================================
# 4. Remove files (--all only)
# ============================================
echo -e "${BOLD}[4/4] Files...${NC}"

if [[ "$MODE" == "--all" ]]; then
    if [ -f "$INSTALL_DIR/.env" ]; then
        rm -f "$INSTALL_DIR/.env" && log_ok "Removed .env"
    else
        log_skip ".env"
    fi

    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR" && log_ok "Removed $INSTALL_DIR"
    else
        log_skip "$INSTALL_DIR"
    fi
else
    log_info "Skipped (use --all to remove files)"
fi

echo ""

# ============================================
# Summary
# ============================================
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Uninstall complete                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

case "$MODE" in
    "")
        echo -e "  To start again:  ${YELLOW}cd $INSTALL_DIR && docker compose -f docker-compose.local.yml --profile ollama up -d${NC}"
        echo -e "  To reinstall:    ${YELLOW}./install.sh${NC}"
        ;;
    --clean)
        echo -e "  Data preserved. To reinstall:  ${YELLOW}./install.sh${NC}"
        ;;
    --all)
        echo -e "  Clean slate. To reinstall:  ${YELLOW}./install.sh${NC}"
        ;;
esac

echo ""
