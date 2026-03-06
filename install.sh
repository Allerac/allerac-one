#!/bin/bash
#
# Allerac One - Local Hardware Line Installer
# ===========================================
# For Allerac Lite, Home, and Pro hardware
#
# Usage:
#   curl -sSL https://get.allerac.com/install | bash
#   ./install.sh
#
# Non-interactive (CI/scripted):
#   HARDWARE_TIER=lite ./install.sh
#   HARDWARE_TIER=home ENABLE_NOTIFICATIONS=true ./install.sh
#
# Tiers:
#   lite   → N100, 16GB  → qwen3.5:4b + 
#   home   → i5/R5, 32GB → qwen3.5:4b + 
#   pro    → i7/R7, 64GB → qwen3.5:4b + 
#   custom → You choose the models
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
HARDWARE_TIER="${HARDWARE_TIER:-}"
OLLAMA_MODELS="${OLLAMA_MODELS:-}"
ENABLE_NOTIFICATIONS="${ENABLE_NOTIFICATIONS:-false}"
ENABLE_MONITORING="${ENABLE_MONITORING:-false}"
RECONFIGURE="${RECONFIGURE:-false}"
USE_SUDO=""

# ============================================
# Logging
# ============================================
log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}$1${NC}"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ============================================
# OS Detection
# ============================================
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
        else
            OS="linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        log_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
    log_info "Detected OS: $OS"
}

# ============================================
# System Requirements
# ============================================
check_requirements() {
    log_step "Checking system requirements..."

    if [[ "$OS" == "linux" || "$OS" == "debian" ]]; then
        TOTAL_RAM_GB=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
    elif [[ "$OS" == "macos" ]]; then
        TOTAL_RAM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
    fi

    if [ "${TOTAL_RAM_GB:-0}" -lt 8 ]; then
        log_warn "Only ${TOTAL_RAM_GB}GB RAM detected. Minimum 16GB recommended."
    else
        log_success "RAM: ${TOTAL_RAM_GB}GB"
    fi

    AVAILABLE_SPACE=$(df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "${AVAILABLE_SPACE:-0}" -lt 20 ]; then
        log_error "Need at least 20GB free disk space (found ${AVAILABLE_SPACE}GB)."
        exit 1
    fi
    log_success "Disk: ${AVAILABLE_SPACE}GB available"

    if ! command_exists git; then
        log_info "Installing git..."
        [[ "$OS" == "debian" ]] && sudo apt-get update -qq && sudo apt-get install -y git
        [[ "$OS" == "macos" ]]  && xcode-select --install 2>/dev/null || true
    fi
    log_success "Git: installed"
}

# ============================================
# Swap (Linux only, helps small devices)
# ============================================
setup_swap() {
    [[ "$OS" != "linux" && "$OS" != "debian" ]] && return

    SWAP_GB=$(free -g | awk '/Swap/ {print $2}')
    if [ "${SWAP_GB:-0}" -lt 4 ]; then
        log_info "Low swap (${SWAP_GB}GB). Creating 4GB swap file for model loading..."
        if [ ! -f /swapfile ]; then
            sudo fallocate -l 4G /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile
            echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
            log_success "4GB swap created"
        else
            log_info "Swap file already exists"
        fi
    fi
}

# ============================================
# Docker
# ============================================
install_docker_debian() {
    log_info "Installing Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
    sudo systemctl start docker
    sudo systemctl enable docker
    log_success "Docker installed"
}

install_docker_macos() {
    log_info "Installing Docker for macOS..."
    command_exists brew || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    brew install --cask docker
    log_warn "Please start Docker Desktop, then re-run this script."
    exit 0
}

install_docker() {
    if command_exists docker; then
        log_success "Docker already installed"
        return
    fi
    case $OS in
        debian) install_docker_debian ;;
        macos)  install_docker_macos  ;;
        *)      log_error "Install Docker manually: https://docs.docker.com/engine/install/"; exit 1 ;;
    esac
}

check_docker_running() {
    if docker info >/dev/null 2>&1; then
        log_success "Docker is running"
        USE_SUDO=""
    elif sudo docker info >/dev/null 2>&1; then
        log_warn "Docker requires sudo (re-login to use without sudo)"
        USE_SUDO="sudo"
    else
        log_info "Starting Docker..."
        sudo systemctl start docker
        sleep 3
        sudo docker info >/dev/null 2>&1 && USE_SUDO="sudo" || { log_error "Docker is not running."; exit 1; }
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
# Hardware Tier Selection (interactive)
# ============================================
select_hardware_tier() {
    # Already set via env var (non-interactive mode)
    if [ -n "$HARDWARE_TIER" ] && [ -n "$OLLAMA_MODELS" ]; then
        log_info "Hardware tier: $HARDWARE_TIER (models: $OLLAMA_MODELS)"
        return
    fi
    if [ -n "$HARDWARE_TIER" ]; then
        case "$HARDWARE_TIER" in
            lite)   OLLAMA_MODELS="qwen3.5:4b" ;;
            home)   OLLAMA_MODELS="qwen3.5:4b" ;;
            pro)    OLLAMA_MODELS="qwen3.5:4b" ;;
            custom) OLLAMA_MODELS="${OLLAMA_MODELS:-qwen3.5:4b}" ;;
        esac
        log_info "Hardware tier: $HARDWARE_TIER (models: $OLLAMA_MODELS)"
        return
    fi

    echo ""
    echo -e "${BOLD}Which Allerac hardware are you setting up?${NC}"
    echo ""
    echo -e "  ${BOLD}1) Allerac Lite${NC}   — N100 · 16GB RAM"
    echo -e "     Models: qwen3.5:4b +   (~3.3GB download)"
    echo ""
    echo -e "  ${BOLD}2) Allerac Home${NC}   — i5/Ryzen 5 · 32GB RAM"
    echo -e "     Models: qwen3.5:4b +   (~3.3GB download)"
    echo ""
    echo -e "  ${BOLD}3) Allerac Pro${NC}    — i7/Ryzen 7 · 64GB RAM (optional GPU)"
    echo -e "     Models: qwen3.5:4b +   (~3.3GB download)"
    echo ""
    echo -e "  ${BOLD}4) Custom${NC}         — Choose your own models"
    echo ""

    while true; do
        read -rp "  Select [1-4]: " TIER_CHOICE
        case "$TIER_CHOICE" in
            1) HARDWARE_TIER="lite";   OLLAMA_MODELS="qwen3.5:4b"; break ;;
            2) HARDWARE_TIER="home";   OLLAMA_MODELS="qwen3.5:4b"; break ;;
            3) HARDWARE_TIER="pro";    OLLAMA_MODELS="qwen3.5:4b"; break ;;
            4) HARDWARE_TIER="custom"
               read -rp "  Enter models (comma-separated, e.g. qwen3.5:4b): " OLLAMA_MODELS
               [ -z "$OLLAMA_MODELS" ] && OLLAMA_MODELS="qwen3.5:4b"
               break ;;
            *) echo "  Please select 1, 2, 3, or 4." ;;
        esac
    done

    echo ""
    log_success "Tier: Allerac ${HARDWARE_TIER^}  |  Models: $OLLAMA_MODELS"
}

# ============================================
# Feature Selection (interactive)
# ============================================
configure_features() {
    # Already set via env vars (non-interactive mode)
    if [ "$ENABLE_NOTIFICATIONS" != "false" ] || [ "$ENABLE_MONITORING" != "false" ]; then
        return
    fi

    echo ""
    echo -e "${BOLD}Optional features:${NC}"
    echo ""

    read -rp "  Enable notifications? (Telegram bot + Redis) [y/N]: " OPT_NOTIF
    [[ "$OPT_NOTIF" =~ ^[Yy]$ ]] && ENABLE_NOTIFICATIONS=true || ENABLE_NOTIFICATIONS=false

    read -rp "  Enable monitoring? (Grafana + Prometheus)   [y/N]: " OPT_MON
    [[ "$OPT_MON" =~ ^[Yy]$ ]] && ENABLE_MONITORING=true || ENABLE_MONITORING=false

    echo ""
}

# ============================================
# Environment Configuration
# ============================================
generate_secret() {
    # Prefer openssl, fallback to /dev/urandom
    if command_exists openssl; then
        openssl rand -hex 32
    else
        cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1
    fi
}

setup_environment() {
    cd "$INSTALL_DIR"

    if [ -f .env ] && [ "$RECONFIGURE" != "true" ]; then
        log_info ".env already exists — keeping it. Run with RECONFIGURE=true to overwrite."
        return
    fi

    log_step "Generating configuration..."

    ENC_KEY=$(generate_secret)
    TG_ENC_KEY=$(generate_secret)
    EXEC_SECRET=$(generate_secret | cut -c1-32)

    TELEGRAM_SECTION=""
    if [ "$ENABLE_NOTIFICATIONS" = "true" ]; then
        echo ""
        echo -e "  ${BOLD}Telegram bot setup (optional — press Enter to skip):${NC}"
        read -rp "  Telegram bot token (from @BotFather): " TG_TOKEN
        read -rp "  Allowed Telegram user IDs (comma-separated, or Enter for all): " TG_USERS

        TELEGRAM_SECTION="
# --------------------------------------------
# Telegram Bot
# Get token from @BotFather on Telegram
# --------------------------------------------
TELEGRAM_BOT_TOKEN=${TG_TOKEN}
TELEGRAM_ALLOWED_USERS=${TG_USERS}
TELEGRAM_DEFAULT_USER=
NOTIFIER_LLM_MODEL=qwen3.5:4b"
    fi

    cat > .env <<EOF
# ============================================
# Allerac One - Local Hardware Line
# Generated: $(date)
# Hardware tier: ${HARDWARE_TIER}
# ============================================

# --------------------------------------------
# REQUIRED: Security keys (auto-generated)
# Never share or commit these values.
# --------------------------------------------
ENCRYPTION_KEY=${ENC_KEY}
TELEGRAM_TOKEN_ENCRYPTION_KEY=${TG_ENC_KEY}
EXECUTOR_SECRET=${EXEC_SECRET}

# --------------------------------------------
# Ollama models for this hardware tier
# All tiers: qwen3.5:4b (custom = user-defined)
# --------------------------------------------
OLLAMA_MODELS=${OLLAMA_MODELS}

# Ollama API endpoint (containerized Ollama, default for local hardware)
OLLAMA_BASE_URL=http://ollama:11434

# --------------------------------------------
# Database (no changes needed for local use)
# --------------------------------------------
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=allerac

# --------------------------------------------
# Application
# --------------------------------------------
APP_PORT=8080
OLLAMA_PORT=11434

# Working directory exposed to the AI agent (your home directory by default)
# Change this to restrict the agent's file system access, e.g. /home/user/workspace
HOST_WORKSPACE=/home

# --------------------------------------------
# Monitoring (used with --profile monitoring)
# --------------------------------------------
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
GRAFANA_PORT=3001

# --------------------------------------------
# External APIs (optional — local AI works without them)
# --------------------------------------------
# Web search via Tavily (https://tavily.com)
TAVILY_API_KEY=

# GitHub Models API (cloud LLM fallback — users can also set this in the app UI)
GITHUB_TOKEN=
${TELEGRAM_SECTION}
EOF

    chmod 600 .env
    log_success "Configuration written to .env"
    log_info  "Keys generated: ENCRYPTION_KEY, TELEGRAM_TOKEN_ENCRYPTION_KEY, EXECUTOR_SECRET"
}

# ============================================
# Start Services
# ============================================
start_services() {
    cd "$INSTALL_DIR"

    log_step "Starting Allerac One..."

    PROFILES=""
    [ "$ENABLE_NOTIFICATIONS" = "true" ] && PROFILES="$PROFILES --profile notifications"
    [ "$ENABLE_MONITORING" = "true" ]    && PROFILES="$PROFILES --profile monitoring"

    export COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_info "Pulling base images..."
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES pull --quiet

    log_info "Building application..."
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES build

    log_info "Starting containers..."
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES up -d

    log_success "Services started"
}

# ============================================
# Follow model download in real time
# ============================================
follow_model_download() {
    log_step "Downloading AI models..."
    echo -e "  ${YELLOW}${OLLAMA_MODELS}${NC}"
    echo -e "  This may take several minutes depending on your connection."
    echo ""

    # Wait for the setup container to appear (up to 60s, Ollama healthcheck takes ~30s)
    local waited=0
    while ! docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^allerac-ollama-setup$"; do
        if [ $waited -ge 60 ]; then
            log_warn "ollama-setup container not found. Models may still be downloading."
            log_info "Check progress: docker logs -f allerac-ollama-setup"
            return
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Follow logs — exits automatically when the container stops
    docker logs -f allerac-ollama-setup 2>/dev/null || true
    echo ""

    local exit_code
    exit_code=$(docker inspect allerac-ollama-setup --format='{{.State.ExitCode}}' 2>/dev/null || echo "0")
    if [ "$exit_code" = "0" ]; then
        log_success "Models ready"
    else
        log_warn "Model download may have failed (exit $exit_code). Check: docker logs allerac-ollama-setup"
    fi
}

# ============================================
# Wait for app to be ready
# ============================================
wait_for_app() {
    log_info "Waiting for app to be ready..."
    APP_PORT_NUM=$(grep "^APP_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "8080")

    for i in $(seq 1 60); do
        if curl -s "http://localhost:${APP_PORT_NUM}" >/dev/null 2>&1; then
            log_success "App is ready!"
            return
        fi
        printf "."
        sleep 3
    done
    echo ""
    log_warn "App may still be starting. Check: docker compose -f docker-compose.local.yml logs -f"
}

# ============================================
# Success Message
# ============================================
print_success() {
    APP_PORT_NUM=$(grep "^APP_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "8080")
    DOCKER_CMD="${USE_SUDO:+sudo }docker"

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   Allerac One — Installation Complete!   ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Product:   ${BOLD}Allerac ${HARDWARE_TIER^}${NC}"
    echo -e "  Models:    ${OLLAMA_MODELS}"
    echo ""
    echo -e "  Open your browser:  ${BLUE}http://localhost:${APP_PORT_NUM}${NC}"
    echo ""

    if [ "$ENABLE_MONITORING" = "true" ]; then
        GRAFANA_PORT_NUM=$(grep "^GRAFANA_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3001")
        echo -e "  Monitoring:  ${BLUE}http://localhost:${GRAFANA_PORT_NUM}${NC}  (admin / see GRAFANA_PASSWORD in .env)"
        echo ""
    fi

    if [ "$HARDWARE_TIER" = "pro" ]; then
        echo -e "  ${YELLOW}GPU (Allerac Pro):${NC} To enable NVIDIA GPU acceleration,"
        echo -e "  install nvidia-container-toolkit and uncomment the 'deploy'"
        echo -e "  block in the 'ollama' service in docker-compose.local.yml."
        echo ""
    fi

    echo -e "  Installation directory: ${YELLOW}${INSTALL_DIR}${NC}"
    echo ""
    echo -e "  Useful commands:"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose -f docker-compose.local.yml logs -f${NC}    # logs"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose -f docker-compose.local.yml down${NC}        # stop"
    echo -e "    ${YELLOW}${DOCKER_CMD} compose -f docker-compose.local.yml up -d${NC}       # start"
    echo -e "    ${YELLOW}./update.sh${NC}                                            # update"
    echo ""

    if [ -n "$USE_SUDO" ]; then
        echo -e "  ${YELLOW}Note: Log out and back in to use Docker without sudo.${NC}"
        echo ""
    fi
}

# ============================================
# Main
# ============================================
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Allerac One — Local Hardware Setup     ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
    echo ""

    detect_os
    check_requirements
    setup_swap
    install_docker
    check_docker_running
    setup_repository
    select_hardware_tier
    configure_features
    setup_environment
    start_services
    follow_model_download
    wait_for_app
    print_success
}

main
