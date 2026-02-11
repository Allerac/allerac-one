#!/bin/bash
#
# GitHub Actions Runner Installer for allerac-one
#
# Usage: ./install-runner.sh <GITHUB_TOKEN>
#
# The token needs "repo" scope. Get it from:
# https://github.com/settings/tokens/new?scopes=repo
#

set -e

REPO_OWNER="Allerac"
REPO_NAME="allerac-one"
RUNNER_LABELS="self-hosted,Linux,X64,allerac-server"
INSTALL_DIR="$HOME/actions-runner"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== GitHub Actions Runner Installer ===${NC}"

# Check for token argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: GitHub token required${NC}"
    echo ""
    echo "Usage: $0 <GITHUB_TOKEN>"
    echo ""
    echo "Get a token with 'repo' scope from:"
    echo "https://github.com/settings/tokens/new?scopes=repo"
    exit 1
fi

GITHUB_TOKEN="$1"

# Check if runner is already installed
if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/.runner" ]; then
    echo -e "${YELLOW}Runner already installed at $INSTALL_DIR${NC}"
    echo "To reinstall, remove the directory first: rm -rf $INSTALL_DIR"
    exit 1
fi

# Get latest runner version
echo "Fetching latest runner version..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
    echo -e "${RED}Error: Could not fetch latest runner version${NC}"
    exit 1
fi

echo -e "Latest version: ${GREEN}v$LATEST_VERSION${NC}"

# Create installation directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download runner
RUNNER_FILE="actions-runner-linux-x64-${LATEST_VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${LATEST_VERSION}/${RUNNER_FILE}"

echo "Downloading runner from $DOWNLOAD_URL..."
curl -L -o "$RUNNER_FILE" "$DOWNLOAD_URL"

# Extract
echo "Extracting..."
tar xzf "$RUNNER_FILE"
rm "$RUNNER_FILE"

# Get registration token
echo "Getting registration token..."
REG_TOKEN=$(curl -s -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | grep '"token":' | sed -E 's/.*"token": "([^"]+)".*/\1/')

if [ -z "$REG_TOKEN" ]; then
    echo -e "${RED}Error: Could not get registration token. Check your GitHub token permissions.${NC}"
    exit 1
fi

# Configure runner
RUNNER_NAME="$(hostname)-allerac"
echo "Configuring runner as '$RUNNER_NAME' with labels: $RUNNER_LABELS"

./config.sh --url "https://github.com/$REPO_OWNER/$REPO_NAME" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --unattended \
    --replace

# Install and start service
echo "Installing as systemd service..."
sudo ./svc.sh install
sudo ./svc.sh start

echo ""
echo -e "${GREEN}=== Runner installed successfully! ===${NC}"
echo ""
echo "Runner name: $RUNNER_NAME"
echo "Labels: $RUNNER_LABELS"
echo "Directory: $INSTALL_DIR"
echo ""
echo "Commands:"
echo "  Status:  sudo ./svc.sh status"
echo "  Stop:    sudo ./svc.sh stop"
echo "  Start:   sudo ./svc.sh start"
echo "  Logs:    journalctl -u actions.runner.$REPO_OWNER-$REPO_NAME.$RUNNER_NAME.service -f"
