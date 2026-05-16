#!/bin/bash
set -e
exec > >(tee /var/log/startup-script.log) 2>&1
echo "=== Starting Allerac VM Setup ==="
echo "Time: $(date)"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

USER_HOME="/home/${ssh_user}"
RUNNER_DIR="$USER_HOME/actions-runner"
APP_DIR="$USER_HOME/allerac-one"
GITHUB_TOKEN="${github_token}"
REPO_OWNER="${github_repo_owner}"
REPO_NAME="${github_repo_name}"

echo "=== Updating system ==="
apt-get update
apt-get upgrade -y

# Swap (prevents OOM with PostgreSQL + Node on a single VM)
echo "=== Creating swap ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

echo "=== Installing Docker ==="
apt-get install -y ca-certificates curl gnupg git jq
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Limit build cache to 20GB and enable automatic GC
cat > /etc/docker/daemon.json <<'DAEMON'
{
  "builder": {
    "gc": {
      "enabled": true,
      "defaultKeepStorage": "20GB"
    }
  }
}
DAEMON
systemctl restart docker

# Weekly cleanup cron: dangling images + stopped containers
echo "0 3 * * 0 root docker image prune -f && docker container prune -f" > /etc/cron.d/docker-cleanup

usermod -aG docker ${ssh_user}

echo "=== Cloning repository ==="
if [ ! -d "$APP_DIR" ]; then
  git clone "https://$GITHUB_TOKEN@github.com/$REPO_OWNER/$REPO_NAME.git" "$APP_DIR"
  chown -R ${ssh_user}:${ssh_user} "$APP_DIR"
fi

echo "https://$GITHUB_TOKEN@github.com" > /home/${ssh_user}/.git-credentials
chown ${ssh_user}:${ssh_user} /home/${ssh_user}/.git-credentials
chmod 600 /home/${ssh_user}/.git-credentials
sudo -u ${ssh_user} git config --global credential.helper store

echo "=== Installing GitHub Actions Runner ==="
if [ ! -d "$RUNNER_DIR" ]; then
  mkdir -p "$RUNNER_DIR"
  cd "$RUNNER_DIR"

  LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/v//')
  curl -L -o actions-runner.tar.gz "https://github.com/actions/runner/releases/download/v$LATEST_VERSION/actions-runner-linux-x64-$LATEST_VERSION.tar.gz"
  tar xzf actions-runner.tar.gz
  rm actions-runner.tar.gz

  chown -R ${ssh_user}:${ssh_user} "$RUNNER_DIR"

  REG_TOKEN=""
  for attempt in 1 2 3 4 5; do
    REG_TOKEN=$(curl -s -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | jq -r '.token')
    if [ -n "$REG_TOKEN" ] && [ "$REG_TOKEN" != "null" ]; then
      break
    fi
    echo "Attempt $attempt failed, retrying in 30s..."
    sleep 30
  done

  if [ -z "$REG_TOKEN" ] || [ "$REG_TOKEN" = "null" ]; then
    echo "ERROR: Failed to get registration token after 5 attempts"
    exit 1
  fi

  RUNNER_NAME="aws-$(hostname)"
  sudo -u ${ssh_user} ./config.sh --url "https://github.com/$REPO_OWNER/$REPO_NAME" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "self-hosted,Linux,X64,allerac-server,aws" \
    --unattended \
    --replace

  ./svc.sh install ${ssh_user}
  ./svc.sh start

  echo "GitHub Actions Runner installed: $RUNNER_NAME"
fi

mkdir -p /home/${ssh_user}/app
chown -R ${ssh_user}:${ssh_user} /home/${ssh_user}

echo "=== Starting allerac-one app (with Cloudflare tunnel) ==="
cd $APP_DIR
COMPOSE_PROFILES=cloud docker compose up -d --build

echo ""
echo "=== Allerac VM Setup Complete! ==="
echo "Time: $(date)"
echo "GitHub Runner: aws-$(hostname)"
echo "App: http://localhost:8080"
