#!/bin/bash
#
# Allerac One - Private AI Agent Installation Script
# ==================================================
#
# This script installs everything needed to run your own private AI agent.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh | bash
#
# Or download and run:
#   chmod +x install.sh
#   ./install.sh
#
# Options:
#   --no-ollama     Skip Ollama installation (use external LLM)
#   --no-monitoring Skip monitoring stack (Grafana/Prometheus)
#   --model <name>  Specify LLM model (default: llama3.2)
#   --help          Show this help message
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/Allerac/allerac-one.git"
INSTALL_DIR="$HOME/allerac-one"
DEFAULT_MODEL="llama3.2"
INSTALL_OLLAMA=true
INSTALL_MONITORING=false
USE_SUDO=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-ollama)
            INSTALL_OLLAMA=false
            shift
            ;;
        --no-monitoring)
            INSTALL_MONITORING=false
            shift
            ;;
        --with-monitoring)
            INSTALL_MONITORING=true
            shift
            ;;
        --model)
            DEFAULT_MODEL="$2"
            shift 2
            ;;
        --help)
            head -20 "$0" | tail -18
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS
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
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    log_info "Detected OS: $OS"
}

# Install Docker on Debian/Ubuntu
install_docker_debian() {
    log_info "Installing Docker for Debian/Ubuntu..."

    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg

    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add current user to docker group
    sudo usermod -aG docker "$USER"

    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker

    log_success "Docker installed successfully"
}

# Install Docker on macOS
install_docker_macos() {
    log_info "Installing Docker for macOS..."

    if ! command_exists brew; then
        log_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    brew install --cask docker

    log_warn "Please start Docker Desktop manually, then re-run this script"
    exit 0
}

# Install Docker
install_docker() {
    if command_exists docker; then
        log_success "Docker is already installed"
        return
    fi

    log_info "Docker not found, installing..."

    case $OS in
        debian)
            install_docker_debian
            ;;
        macos)
            install_docker_macos
            ;;
        *)
            log_error "Please install Docker manually: https://docs.docker.com/engine/install/"
            exit 1
            ;;
    esac
}

# Check Docker is running
check_docker_running() {
    # Try without sudo first
    if docker info >/dev/null 2>&1; then
        log_success "Docker is running"
        USE_SUDO=""
        return
    fi

    # Try with sudo (for fresh installs before re-login)
    if sudo docker info >/dev/null 2>&1; then
        log_warn "Docker requires sudo (re-login to use without sudo)"
        USE_SUDO="sudo"
        return
    fi

    # Docker not running, try to start it
    log_info "Starting Docker service..."
    sudo systemctl start docker
    sleep 3

    if sudo docker info >/dev/null 2>&1; then
        log_success "Docker started successfully"
        USE_SUDO="sudo"
        return
    fi

    log_error "Docker is not running. Please start Docker and try again."
    exit 1
}

# Clone or update repository
setup_repository() {
    if [ -d "$INSTALL_DIR" ]; then
        log_info "Updating existing installation..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        log_info "Cloning Allerac One repository..."
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    log_success "Repository ready at $INSTALL_DIR"
}

# Setup environment file
setup_environment() {
    cd "$INSTALL_DIR"

    if [ -f .env ]; then
        log_info ".env file already exists, keeping it"
    else
        log_info "Creating .env configuration..."
        cp .env.local.example .env

        # Generate encryption key
        ENCRYPTION_KEY=$(openssl rand -base64 32)
        sed -i.bak "s|ENCRYPTION_KEY=CHANGE_ME_GENERATE_A_SECURE_KEY|ENCRYPTION_KEY=$ENCRYPTION_KEY|g" .env
        rm -f .env.bak

        # Set default model
        sed -i.bak "s|DEFAULT_MODEL=llama3.2|DEFAULT_MODEL=$DEFAULT_MODEL|g" .env
        rm -f .env.bak

        log_success "Environment configured"
    fi
}

# Build and start services
start_services() {
    cd "$INSTALL_DIR"

    log_info "Building and starting services (this may take a few minutes)..."

    # Build the profiles string
    PROFILES=""
    if [ "$INSTALL_OLLAMA" = true ]; then
        PROFILES="$PROFILES --profile ollama"
    fi
    if [ "$INSTALL_MONITORING" = true ]; then
        PROFILES="$PROFILES --profile monitoring"
    fi

    # Pull images first
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES pull

    # Build the app
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES build

    # Start services
    $USE_SUDO docker compose -f docker-compose.local.yml $PROFILES up -d

    log_success "Services started"
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for services to be ready..."

    # Wait for the app
    for i in {1..90}; do
        if curl -s http://localhost:8080 >/dev/null 2>&1; then
            log_success "Application is ready!"
            return
        fi
        echo -n "."
        sleep 2
    done

    log_warn "Services may still be starting. Check with: $USE_SUDO docker compose -f docker-compose.local.yml logs"
}

# Print success message
print_success() {
    # Determine docker command prefix
    DOCKER_CMD="docker"
    if [ -n "$USE_SUDO" ]; then
        DOCKER_CMD="sudo docker"
    fi

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}   Allerac One - Installation Complete!    ${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "Access your private AI agent at:"
    echo -e "  ${BLUE}http://localhost:8080${NC}"
    echo ""
    if [ "$INSTALL_MONITORING" = true ]; then
        echo -e "Monitoring dashboard:"
        echo -e "  ${BLUE}http://localhost:3001${NC} (admin/admin)"
        echo ""
    fi
    echo -e "Installation directory: ${YELLOW}$INSTALL_DIR${NC}"
    echo ""
    echo -e "Useful commands:"
    echo -e "  ${YELLOW}cd $INSTALL_DIR${NC}"
    echo -e "  ${YELLOW}$DOCKER_CMD compose -f docker-compose.local.yml logs -f${NC}  # View logs"
    echo -e "  ${YELLOW}$DOCKER_CMD compose -f docker-compose.local.yml down${NC}     # Stop services"
    echo -e "  ${YELLOW}$DOCKER_CMD compose -f docker-compose.local.yml up -d${NC}    # Start services"
    echo ""
    if [ "$INSTALL_OLLAMA" = true ]; then
        echo -e "To download additional AI models:"
        echo -e "  ${YELLOW}$DOCKER_CMD exec -it allerac-ollama ollama pull mistral${NC}"
        echo -e "  ${YELLOW}$DOCKER_CMD exec -it allerac-ollama ollama pull llama3.1${NC}"
        echo ""
    fi
    if [ -n "$USE_SUDO" ]; then
        echo -e "${YELLOW}Note: Log out and back in to use docker without sudo${NC}"
        echo ""
    fi
    echo -e "Documentation: ${BLUE}https://github.com/Allerac/allerac-one/blob/main/docs/local-setup.md${NC}"
    echo ""
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."

    # Check RAM
    if [[ "$OS" == "linux" || "$OS" == "debian" ]]; then
        TOTAL_RAM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        TOTAL_RAM_GB=$((TOTAL_RAM / 1024 / 1024))
    elif [[ "$OS" == "macos" ]]; then
        TOTAL_RAM_GB=$(($(sysctl -n hw.memsize) / 1024 / 1024 / 1024))
    fi

    if [ "$TOTAL_RAM_GB" -lt 8 ]; then
        log_warn "System has ${TOTAL_RAM_GB}GB RAM. Recommended: 16GB+ for optimal performance"
    else
        log_success "System has ${TOTAL_RAM_GB}GB RAM"
    fi

    # Check disk space
    AVAILABLE_SPACE=$(df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$AVAILABLE_SPACE" -lt 20 ]; then
        log_error "Insufficient disk space. Need at least 20GB free."
        exit 1
    fi
    log_success "Disk space: ${AVAILABLE_SPACE}GB available"

    # Check git
    if ! command_exists git; then
        log_info "Installing git..."
        if [[ "$OS" == "debian" ]]; then
            sudo apt-get update && sudo apt-get install -y git
        elif [[ "$OS" == "macos" ]]; then
            xcode-select --install 2>/dev/null || true
        fi
    fi
    log_success "Git is installed"
}

# Setup swap if needed (Linux only)
setup_swap() {
    if [[ "$OS" != "linux" && "$OS" != "debian" ]]; then
        return
    fi

    SWAP_SIZE=$(free -g | grep Swap | awk '{print $2}')
    if [ "$SWAP_SIZE" -lt 4 ]; then
        log_warn "Low swap space detected (${SWAP_SIZE}GB). Creating 4GB swap file..."

        if [ -f /swapfile ]; then
            log_info "Swap file already exists"
        else
            sudo fallocate -l 4G /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile
            echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
            log_success "4GB swap file created"
        fi
    fi
}

# Main installation flow
main() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}   Allerac One - Private AI Agent Setup    ${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""

    detect_os
    check_requirements
    setup_swap
    install_docker
    check_docker_running
    setup_repository
    setup_environment
    start_services
    wait_for_services
    print_success
}

# Run main function
main
