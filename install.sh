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
#   lite   → N100, 16GB  → qwen2.5:3b
#   home   → i5/R5, 32GB → qwen2.5:3b
#   pro    → i7/R7, 64GB → qwen2.5:3b
#   custom → You choose the models
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
ENABLE_GPU="${ENABLE_GPU:-}"
RECONFIGURE="${RECONFIGURE:-false}"
USE_SUDO=""
GPU_COMPOSE_FLAG=""

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
    IS_WSL=false
    if grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
    fi

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

    if [ "$IS_WSL" = true ]; then
        log_info "Detected OS: $OS (WSL2)"
    else
        log_info "Detected OS: $OS"
    fi
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

    # WSL2 defaults to no swap, which causes SIGBUS crashes during large Docker
    # image pulls (ollama is ~4GB).  Ensure at least 4GB swap is available.
    local target_gb=4
    [ "$IS_WSL" = "true" ] && target_gb=8

    SWAP_GB=$(free -g | awk '/Swap/ {print $2}')
    if [ "${SWAP_GB:-0}" -lt "$target_gb" ]; then
        log_info "Low swap (${SWAP_GB}GB). Creating ${target_gb}GB swap file..."
        if [ ! -f /swapfile ]; then
            sudo fallocate -l "${target_gb}G" /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile
            echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
            log_success "${target_gb}GB swap created"
        else
            sudo swapon /swapfile 2>/dev/null || true
            log_info "Swap file already exists — activated"
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

    # Start Docker - handle WSL without systemd
    if [ "$IS_WSL" = true ] && ! pidof systemd >/dev/null 2>&1; then
        sudo service docker start
    else
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
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
    # Check if docker command exists AND works (not just a broken symlink from Docker Desktop)
    if command_exists docker && (docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1); then
        log_success "Docker already installed"
        return
    fi

    if command_exists docker; then
        log_warn "Docker command exists but is not functional - installing Docker Engine..."
    fi

    case $OS in
        debian) install_docker_debian ;;
        macos)  install_docker_macos  ;;
        *)      log_error "Install Docker manually: https://docs.docker.com/engine/install/"; exit 1 ;;
    esac
}

check_docker_conflicts() {
    # ── Docker Desktop ──────────────────────────────────────────────────────
    if systemctl --user is-active docker-desktop >/dev/null 2>&1 || \
       [ -S "$HOME/.docker/desktop/docker.sock" ]; then
        echo ""
        echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  Docker Desktop detected — not supported by Allerac One      ║${NC}"
        echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "  Docker Desktop runs containers inside a VM, which prevents GPU"
        echo -e "  acceleration and adds unnecessary overhead."
        echo ""
        echo -e "  ${BOLD}Please switch to Docker Engine (CE):${NC}"
        echo -e "    https://docs.docker.com/engine/install/ubuntu/"
        echo ""
        echo -e "  Quick steps:"
        echo -e "    ${YELLOW}systemctl --user stop docker-desktop${NC}"
        echo -e "    ${YELLOW}sudo apt-get remove docker-desktop${NC}"
        echo -e "    ${YELLOW}# Then install Docker Engine and re-run this script${NC}"
        echo ""
        exit 1
    fi

    # ── Snap-installed Docker ───────────────────────────────────────────────
    if snap list 2>/dev/null | grep -q "^docker "; then
        echo ""
        log_error "Docker is installed via snap — not supported by Allerac One."
        echo ""
        echo -e "  Snap Docker has permission restrictions that prevent GPU access"
        echo -e "  and volume mounts from working correctly."
        echo ""
        echo -e "  ${BOLD}Please remove it and install Docker Engine:${NC}"
        echo -e "    ${YELLOW}sudo snap remove docker${NC}"
        echo -e "    ${YELLOW}# Then install Docker Engine and re-run this script${NC}"
        echo -e "    ${YELLOW}# https://docs.docker.com/engine/install/ubuntu/${NC}"
        echo ""
        exit 1
    fi

    # ── Natively-installed Ollama (systemd service) ─────────────────────────
    if systemctl is-active ollama >/dev/null 2>&1; then
        echo ""
        log_warn "Ollama is running as a native systemd service (port 11434)."
        echo ""
        echo -e "  Allerac One runs Ollama in a container. The native service will"
        echo -e "  block the container from binding to port 11434."
        echo ""
        read -rp "  Stop and disable native Ollama service now? [Y/n]: " OPT_NATIVE_OLLAMA
        if [[ ! "$OPT_NATIVE_OLLAMA" =~ ^[Nn]$ ]]; then
            sudo systemctl stop ollama
            sudo systemctl disable ollama
            log_success "Native Ollama service stopped and disabled"
        else
            log_warn "Skipped — you may hit port conflicts on 11434."
        fi
    fi

    # ── Snap-installed Ollama ───────────────────────────────────────────────
    if snap list 2>/dev/null | grep -q "^ollama "; then
        echo ""
        log_warn "Ollama is installed via snap and may conflict on port 11434."
        echo ""
        echo -e "  Allerac One runs Ollama in a container. The snap version will"
        echo -e "  block the container from binding to port 11434."
        echo ""
        read -rp "  Stop and disable snap Ollama now? [Y/n]: " OPT_SNAP_OLLAMA
        if [[ ! "$OPT_SNAP_OLLAMA" =~ ^[Nn]$ ]]; then
            sudo snap stop ollama 2>/dev/null || true
            sudo snap disable ollama 2>/dev/null || true
            # Also stop the systemd service unit that snap creates
            sudo systemctl stop snap.ollama.ollama.service 2>/dev/null || true
            sudo systemctl disable snap.ollama.ollama.service 2>/dev/null || true
            # Wait for port 11434 to be released (up to 15s)
            local waited=0
            while ss -tlnp 2>/dev/null | grep -q ':11434 '; do
                if [ $waited -ge 15 ]; then
                    log_warn "Port 11434 still in use after 15s — continuing anyway."
                    break
                fi
                sleep 1
                waited=$((waited + 1))
            done
            log_success "Snap Ollama disabled"
        else
            log_warn "Skipped — you may hit port conflicts on 11434."
        fi
    fi

    # ── Port 11434 in use by something else ────────────────────────────────
    if ss -tlnp 2>/dev/null | grep -q ':11434 '; then
        local port_owner
        port_owner=$(ss -tlnp 2>/dev/null | grep ':11434 ' | grep -oP '(?<=")[^"]+(?=")' | head -1 || echo "unknown process")
        log_warn "Port 11434 is still in use by: ${port_owner}"
        echo -e "  The Ollama container may fail to bind to this port."
        echo -e "  To fix: kill the process using port 11434 and re-run this script."
    fi

}

# ============================================
# Fix Docker credential helpers for WSL2
# ============================================
fix_docker_credentials_wsl() {
    [ "$IS_WSL" = "true" ] || return 0

    # WSL2 inherits Windows environment variables.  Docker Desktop sets
    # DOCKER_CONFIG to the Windows user profile (e.g. /mnt/c/Users/foo/.docker).
    # If that is the case our edits to /root/.docker have no effect.
    # Override DOCKER_CONFIG unconditionally so every subsequent docker command
    # uses a clean WSL-local config directory.
    export DOCKER_CONFIG="$HOME/.docker"
    mkdir -p "$DOCKER_CONFIG"

    local cfg="$DOCKER_CONFIG/config.json"

    # Remove credential helper binaries broken in WSL2 (no GNOME/libsecret).
    # Use command -v to find the actual location rather than guessing the path.
    for bin in docker-credential-secretservice docker-credential-pass; do
        local bin_path
        bin_path=$(command -v "$bin" 2>/dev/null || true)
        if [ -n "$bin_path" ]; then
            log_info "Removing broken WSL2 credential helper: $bin_path"
            rm -f "$bin_path" 2>/dev/null || true
        fi
    done

    # Write a clean Docker client config with no credential helpers.
    # Absent key (not "") = plain-file auth; "" still triggers OS default.
    python3 -c "
import json
path = '$cfg'
try:
    with open(path) as f:
        c = json.load(f)
except Exception:
    c = {}
c.pop('credsStore', None)
c.pop('credHelpers', None)
with open(path, 'w') as f:
    json.dump(c, f, indent=2)
" 2>/dev/null || printf '{}' > "$cfg"

    log_success "Docker credentials configured for WSL2 (DOCKER_CONFIG=$DOCKER_CONFIG)"
    log_info    "Active Docker config: $(cat "$cfg" 2>/dev/null | tr -d '\n')"
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
        # WSL2 may not have systemd enabled - try both methods
        if [ "$IS_WSL" = true ]; then
            # Check if systemd is available in WSL
            if pidof systemd >/dev/null 2>&1; then
                sudo systemctl start docker
            else
                # WSL without systemd - use service command
                sudo service docker start
            fi
        else
            sudo systemctl start docker
        fi
        sleep 3
        sudo docker info >/dev/null 2>&1 && USE_SUDO="sudo" || { log_error "Docker is not running."; exit 1; }
    fi
}

# ============================================
# GPU Detection (Linux + NVIDIA only)
# ============================================
install_nvidia_toolkit() {
    log_info "Installing nvidia-container-toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y nvidia-container-toolkit
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker
    log_success "nvidia-container-toolkit installed"
}

detect_gpu() {
    # Only on Linux — macOS and others skip
    [[ "$OS" != "linux" && "$OS" != "debian" ]] && ENABLE_GPU="false" && return

    # Already set via env var (non-interactive / CI)
    if [ -n "$ENABLE_GPU" ]; then
        [ "$ENABLE_GPU" = "true" ] && GPU_COMPOSE_FLAG="-f ${INSTALL_DIR}/docker-compose.local.gpu.yml"
        return
    fi

    # No nvidia-smi → no GPU
    if ! command_exists nvidia-smi; then
        ENABLE_GPU="false"
        return
    fi

    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
    echo ""
    log_success "NVIDIA GPU detected: ${GPU_NAME}"

    # Check if toolkit is already installed
    if command_exists nvidia-container-cli; then
        log_success "nvidia-container-toolkit already installed"
        ENABLE_GPU="true"
        GPU_COMPOSE_FLAG="-f ${INSTALL_DIR}/docker-compose.local.gpu.yml"
        log_info "GPU acceleration will be enabled for Ollama"
        return
    fi

    # Toolkit not installed — ask user
    echo ""
    read -rp "  Enable GPU acceleration for Ollama? (recommended) [Y/n]: " OPT_GPU
    if [[ "$OPT_GPU" =~ ^[Nn]$ ]]; then
        ENABLE_GPU="false"
        log_info "GPU acceleration skipped"
        return
    fi

    install_nvidia_toolkit
    ENABLE_GPU="true"
    GPU_COMPOSE_FLAG="-f ${INSTALL_DIR}/docker-compose.local.gpu.yml"
    log_success "GPU acceleration enabled"
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
            lite)   OLLAMA_MODELS="qwen2.5:3b" ;;
            home)   OLLAMA_MODELS="qwen2.5:3b" ;;
            pro)    OLLAMA_MODELS="qwen2.5:3b" ;;
            custom) OLLAMA_MODELS="${OLLAMA_MODELS:-qwen2.5:3b}" ;;
        esac
        log_info "Hardware tier: $HARDWARE_TIER (models: $OLLAMA_MODELS)"
        return
    fi

    echo ""
    echo -e "${BOLD}Which Allerac hardware are you setting up?${NC}"
    echo ""
    echo -e "  ${BOLD}1) Allerac Lite${NC}   — N100 · 16GB RAM"
    echo -e "     Models: qwen2.5:3b                      (~2GB download)"
    echo ""
    echo -e "  ${BOLD}2) Allerac Home${NC}   — i5/Ryzen 5 · 32GB RAM"
    echo -e "     Models: qwen2.5:3b                      (~2GB download)"
    echo ""
    echo -e "  ${BOLD}3) Allerac Pro${NC}    — i7/Ryzen 7 · 64GB RAM (optional GPU)"
    echo -e "     Models: qwen2.5:3b                      (~2GB download)"
    echo ""
    echo -e "  ${BOLD}4) Custom${NC}         — Choose your own models"
    echo ""

    while true; do
        read -rp "  Select [1-4]: " TIER_CHOICE
        case "$TIER_CHOICE" in
            1) HARDWARE_TIER="lite";   OLLAMA_MODELS="qwen2.5:3b"; break ;;
            2) HARDWARE_TIER="home";   OLLAMA_MODELS="qwen2.5:3b"; break ;;
            3) HARDWARE_TIER="pro";    OLLAMA_MODELS="qwen2.5:3b"; break ;;
            4) HARDWARE_TIER="custom"
               read -rp "  Enter models (comma-separated, e.g. qwen2.5:3b,deepseek-r1:7b): " OLLAMA_MODELS
               [ -z "$OLLAMA_MODELS" ] && OLLAMA_MODELS="qwen2.5:3b"
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
    HEALTH_WORKER_SECRET=$(generate_secret | cut -c1-32)

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
NOTIFIER_LLM_MODEL=qwen2.5:3b"
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
HEALTH_WORKER_SECRET=${HEALTH_WORKER_SECRET}

# --------------------------------------------
# Ollama models for this hardware tier
# lite/home/pro: qwen2.5:3b | custom = user-defined
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
# GPU acceleration (auto-detected by install.sh)
# --------------------------------------------
ENABLE_GPU=${ENABLE_GPU}

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
    log_info  "Keys generated: ENCRYPTION_KEY, TELEGRAM_TOKEN_ENCRYPTION_KEY, EXECUTOR_SECRET, HEALTH_WORKER_SECRET"
}

# ============================================
# Register CLI in PATH
# ============================================
register_cli() {
    chmod +x "$INSTALL_DIR/allerac.sh"
    local link="/usr/local/bin/allerac"
    if [ -L "$link" ] || [ -f "$link" ]; then
        sudo rm -f "$link"
    fi
    sudo ln -s "$INSTALL_DIR/allerac.sh" "$link"
    log_success "CLI registered: type 'allerac help' from anywhere"
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
    # WSL2 can crash docker compose (SIGBUS) during large concurrent pulls due
    # to mmap issues.  Retry up to 3 times — Docker caches completed layers so
    # subsequent attempts are fast.  Drop --quiet so output is not buffered.
    local pull_ok=false
    for attempt in 1 2 3; do
        if $USE_SUDO docker compose -f docker-compose.local.yml $GPU_COMPOSE_FLAG $PROFILES pull; then
            pull_ok=true
            break
        fi
        log_warn "Image pull attempt $attempt/3 failed — retrying in 10s..."
        sleep 10
    done
    if [ "$pull_ok" = "false" ]; then
        log_error "Failed to pull images after 3 attempts."
        exit 1
    fi

    log_info "Building application..."
    $USE_SUDO docker compose -f docker-compose.local.yml $GPU_COMPOSE_FLAG $PROFILES build app health-worker

    log_info "Starting containers..."
    $USE_SUDO docker compose -f docker-compose.local.yml $GPU_COMPOSE_FLAG $PROFILES up -d

    log_success "Services started"

    # If Ollama container exited due to port conflict, try restarting once
    sleep 3
    local ollama_status
    ollama_status=$($USE_SUDO docker inspect allerac-ollama --format='{{.State.Status}}' 2>/dev/null || echo "missing")
    if [ "$ollama_status" = "exited" ]; then
        log_warn "Ollama container exited — attempting restart (possible port conflict resolved)..."
        $USE_SUDO docker compose -f docker-compose.local.yml $GPU_COMPOSE_FLAG $PROFILES up -d ollama
        sleep 5
    fi
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
    [ "$ENABLE_GPU" = "true" ] && echo -e "  GPU:       ${GREEN}enabled (NVIDIA)${NC}" || echo -e "  GPU:       CPU only"
    echo ""
    echo -e "  Open your browser:  ${BLUE}http://localhost:${APP_PORT_NUM}${NC}"
    echo ""

    if [ "$ENABLE_MONITORING" = "true" ]; then
        GRAFANA_PORT_NUM=$(grep "^GRAFANA_PORT=" "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "3001")
        echo -e "  Monitoring:  ${BLUE}http://localhost:${GRAFANA_PORT_NUM}${NC}  (admin / see GRAFANA_PASSWORD in .env)"
        echo ""
    fi

    echo -e "  Installation directory: ${YELLOW}${INSTALL_DIR}${NC}"
    echo ""
    echo -e "  Useful commands:"
    echo -e "    ${YELLOW}allerac status${NC}      # show running services"
    echo -e "    ${YELLOW}allerac logs${NC}        # follow logs"
    echo -e "    ${YELLOW}allerac stop${NC}        # stop"
    echo -e "    ${YELLOW}allerac start${NC}       # start"
    echo -e "    ${YELLOW}allerac update${NC}      # update to latest version"
    echo -e "    ${YELLOW}allerac backup${NC}      # back up the database"
    echo -e "    ${YELLOW}allerac help${NC}        # all commands"
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
    check_docker_conflicts
    install_docker
    check_docker_running
    fix_docker_credentials_wsl
    detect_gpu
    setup_repository
    select_hardware_tier
    configure_features
    setup_environment
    register_cli
    start_services
    follow_model_download
    wait_for_app
    print_success
}

main
