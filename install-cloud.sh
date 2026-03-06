#!/bin/bash
#
# Allerac One - Cloud Services Line Installer
# ============================================
# For deploying allerac.cloud (Starter, Personal, Pro tiers)
#
# Usage:
#   ./install-cloud.sh
#
# Non-interactive (CI/CD):
#   TUNNEL_TOKEN=xxx GRAFANA_PASSWORD=xxx ./install-cloud.sh
#
# Prerequisites:
#   - Docker + Docker Compose installed
#   - Cloudflare Tunnel token (Zero Trust dashboard → Networks → Tunnels)
#   - Server with public IP (or behind Cloudflare)
#

set -e

# ============================================
# Colors
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ============================================
# Configuration (overridable via env)
# ============================================
REPO_URL="https://github.com/Allerac/allerac-one.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/allerac-one}"
USE_SUDO=""

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}$1${NC}"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ============================================
# Prerequisites
# ============================================
check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command_exists docker; then
        log_error "Docker is not installed. Install it from: https://docs.docker.com/engine/install/"
        exit 1
    fi
    log_success "Docker: installed"

    if ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose plugin not found. Install: https://docs.docker.com/compose/install/"
        exit 1
    fi
    log_success "Docker Compose: installed"

    if ! command_exists git; then
        log_error "Git is not installed."
        exit 1
    fi
    log_success "Git: installed"

    if ! command_exists openssl; then
        log_error "OpenSSL is not installed (needed to generate encryption keys)."
        exit 1
    fi
    log_success "OpenSSL: installed"

    if docker info >/dev/null 2>&1; then
        USE_SUDO=""
    elif sudo docker info >/dev/null 2>&1; then
        log_warn "Docker requires sudo"
        USE_SUDO="sudo"
    else
        log_error "Docker is not running. Start it and try again."
        exit 1
    fi
}

# ============================================
# Repository
# ============================================
setup_repository() {
    log_step "Setting up repository..."
    if [ -d "$INSTALL_DIR/.git" ]; then
        log_info "Updating existing installation at $INSTALL_DIR..."
        git -C "$INSTALL_DIR" pull origin main
    else
        log_info "Cloning into $INSTALL_DIR..."
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi
    log_success "Repository ready"
}

# ============================================
# Secret generator
# ============================================
generate_secret() {
    openssl rand -hex 32
}

# ============================================
# Read a secret from stdin (hidden input)
# ============================================
read_secret() {
    local PROMPT="$1"
    local VALUE=""
    if [ -t 0 ]; then
        read -rsp "  $PROMPT: " VALUE
        echo ""
    else
        read -r VALUE
    fi
    echo "$VALUE"
}

# ============================================
# Environment Configuration (interactive wizard)
# ============================================
setup_environment() {
    cd "$INSTALL_DIR"

    if [ -f .env ]; then
        echo ""
        log_warn ".env already exists."
        read -rp "  Overwrite? [y/N]: " OVERWRITE
        [[ "$OVERWRITE" =~ ^[Yy]$ ]] || { log_info "Keeping existing .env"; return; }
    fi

    log_step "Cloud configuration wizard"
    echo ""
    echo "  Auto-generating encryption keys..."
    ENC_KEY=$(generate_secret)
    TG_ENC_KEY=$(generate_secret)
    EXEC_SECRET=$(generate_secret | cut -c1-32)
    log_success "Encryption keys generated"

    echo ""
    echo -e "  ${BOLD}Cloudflare Tunnel${NC} (required for public access)"
    echo -e "  Get your token from: Cloudflare Zero Trust → Networks → Tunnels"
    TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"
    if [ -z "$TUNNEL_TOKEN" ]; then
        TUNNEL_TOKEN=$(read_secret "Cloudflare Tunnel token")
    fi
    if [ -z "$TUNNEL_TOKEN" ]; then
        log_error "TUNNEL_TOKEN is required. Aborting."
        exit 1
    fi
    log_success "Cloudflare Tunnel token set"

    echo ""
    echo -e "  ${BOLD}Grafana admin password${NC} (required)"
    GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-}"
    while [ -z "$GRAFANA_PASSWORD" ]; do
        GRAFANA_PASSWORD=$(read_secret "Grafana admin password")
        [ -z "$GRAFANA_PASSWORD" ] && echo "  Password cannot be empty."
    done
    log_success "Grafana password set"

    echo ""
    echo -e "  ${BOLD}GitHub Models API token${NC} (optional — users can also set this in the app)"
    echo -e "  Get from: github.com → Settings → Developer settings → Personal access tokens"
    GITHUB_TOKEN="${GITHUB_TOKEN:-}"
    if [ -z "$GITHUB_TOKEN" ]; then
        read -rp "  GitHub token (Enter to skip): " GITHUB_TOKEN
    fi
    [ -n "$GITHUB_TOKEN" ] && log_success "GitHub token set" || log_info "GitHub token skipped (users can set it in the app)"

    echo ""
    echo -e "  ${BOLD}Ollama models${NC} (runs locally on the server — no inference data leaves)"
    OLLAMA_MODELS="${OLLAMA_MODELS:-}"
    if [ -z "$OLLAMA_MODELS" ]; then
        read -rp "  Models to download (Enter for default: qwen2.5:7b,deepseek-r1:1.5b): " OLLAMA_MODELS
        [ -z "$OLLAMA_MODELS" ] && OLLAMA_MODELS="qwen2.5:7b,deepseek-r1:1.5b"
    fi
    log_success "Ollama models: $OLLAMA_MODELS"

    echo ""
    echo -e "  ${BOLD}Tavily API key${NC} (optional — for web search tool)"
    TAVILY_API_KEY="${TAVILY_API_KEY:-}"
    if [ -z "$TAVILY_API_KEY" ]; then
        read -rp "  Tavily API key (Enter to skip): " TAVILY_API_KEY
    fi
    [ -n "$TAVILY_API_KEY" ] && log_success "Tavily key set" || log_info "Tavily skipped"

    echo ""
    echo -e "  ${BOLD}Telegram bot token${NC} (optional — for Telegram integration)"
    TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        read -rp "  Telegram bot token (Enter to skip): " TELEGRAM_BOT_TOKEN
    fi
    [ -n "$TELEGRAM_BOT_TOKEN" ] && log_success "Telegram token set" || log_info "Telegram skipped"

    cat > .env <<EOF
# ============================================
# Allerac One - Cloud Services Line
# Generated: $(date)
# ============================================

# --------------------------------------------
# REQUIRED: Security keys (auto-generated)
# Never share or commit these values.
# --------------------------------------------
ENCRYPTION_KEY=${ENC_KEY}
TELEGRAM_TOKEN_ENCRYPTION_KEY=${TG_ENC_KEY}
EXECUTOR_SECRET=${EXEC_SECRET}

# --------------------------------------------
# Cloudflare Tunnel (required for public access)
# --------------------------------------------
TUNNEL_TOKEN=${TUNNEL_TOKEN}

# --------------------------------------------
# Monitoring
# --------------------------------------------
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}

# --------------------------------------------
# LLM Providers
# GitHub Models API is the primary cloud LLM.
# Ollama runs containerized when --profile ollama is active.
# --------------------------------------------
GITHUB_TOKEN=${GITHUB_TOKEN}
OLLAMA_MODELS=${OLLAMA_MODELS:-qwen2.5:7b,deepseek-r1:1.5b}
NOTIFIER_LLM_MODEL=qwen2.5:3b

# --------------------------------------------
# External APIs
# --------------------------------------------
TAVILY_API_KEY=${TAVILY_API_KEY}

# --------------------------------------------
# Telegram Bot
# --------------------------------------------
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_USERS=
TELEGRAM_DEFAULT_USER=

# --------------------------------------------
# Self-update: project directory (leave as-is)
# --------------------------------------------
COMPOSE_DIR=${INSTALL_DIR}
EOF

    chmod 600 .env
    log_success "Configuration written to .env"
}

# ============================================
# Start Cloud Services
# ============================================
start_services() {
    cd "$INSTALL_DIR"

    log_step "Deploying cloud stack..."

    export COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_info "Pulling base images..."
    $USE_SUDO docker compose pull --quiet

    log_info "Building application..."
    $USE_SUDO docker compose build

    log_info "Starting containers..."
    $USE_SUDO docker compose up -d

    log_success "Cloud stack started"
}

# ============================================
# Wait for app
# ============================================
wait_for_app() {
    log_info "Waiting for app to be ready..."
    for i in $(seq 1 60); do
        if curl -s http://localhost:8080 >/dev/null 2>&1; then
            log_success "App is ready!"
            return
        fi
        printf "."
        sleep 3
    done
    echo ""
    log_warn "App may still be starting. Check: docker compose logs -f app"
}

# ============================================
# Success Message
# ============================================
print_success() {
    DOCKER_CMD="${USE_SUDO:+sudo }docker"

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   Allerac Cloud — Deployment Complete!   ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Local access:   ${BLUE}http://localhost:8080${NC}"
    echo -e "  Portainer:      ${BLUE}http://localhost:9000${NC}"
    echo -e "  Grafana:        ${BLUE}http://localhost:3001${NC}  (admin / GRAFANA_PASSWORD in .env)"
    echo ""
    echo -e "  Public access is configured via Cloudflare Tunnel."
    echo -e "  Set up public hostnames in the Zero Trust dashboard."
    echo ""
    echo -e "  Installation directory: ${YELLOW}${INSTALL_DIR}${NC}"
    echo ""
    echo -e "  Useful commands:"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose logs -f${NC}              # logs"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose down${NC}                 # stop"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose up -d${NC}                # start"
    echo -e "    ${YELLOW}./update.sh${NC}                         # update"
    echo ""
}

# ============================================
# Main
# ============================================
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Allerac One — Cloud Services Setup     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    setup_repository
    setup_environment
    start_services
    wait_for_app
    print_success
}

main
