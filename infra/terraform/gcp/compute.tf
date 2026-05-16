resource "google_compute_instance" "allerac_vm" {
  name         = "allerac-vm"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["allerac-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 50
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.allerac_ip.address
    }
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    exec > >(tee /var/log/startup-script.log) 2>&1
    echo "=== Starting Allerac VM Setup ==="
    echo "Time: $(date)"

    export DEBIAN_FRONTEND=noninteractive
    export NEEDRESTART_MODE=a

    USER_HOME="/home/${var.ssh_user}"
    RUNNER_DIR="$USER_HOME/actions-runner"
    APP_DIR="$USER_HOME/allerac-one"
    GITHUB_TOKEN="${var.github_token}"
    REPO_OWNER="${var.github_repo_owner}"
    REPO_NAME="${var.github_repo_name}"

    # Update system
    echo "=== Updating system ==="
    apt-get update
    apt-get upgrade -y

    # Swap (prevents OOM with PostgreSQL + Node + Ollama on a single VM)
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

    # Install Docker
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

    # Add user to docker group
    usermod -aG docker ${var.ssh_user}

    # Clone the repository (using token for private repos)
    echo "=== Cloning repository ==="
    if [ ! -d "$APP_DIR" ]; then
      git clone "https://$GITHUB_TOKEN@github.com/$REPO_OWNER/$REPO_NAME.git" "$APP_DIR"
      chown -R ${var.ssh_user}:${var.ssh_user} "$APP_DIR"
    fi

    # Configure git credentials for future operations (runner will use these)
    echo "https://$GITHUB_TOKEN@github.com" > /home/${var.ssh_user}/.git-credentials
    chown ${var.ssh_user}:${var.ssh_user} /home/${var.ssh_user}/.git-credentials
    chmod 600 /home/${var.ssh_user}/.git-credentials
    sudo -u ${var.ssh_user} git config --global credential.helper store

    # Install GitHub Actions Runner
    echo "=== Installing GitHub Actions Runner ==="
    if [ ! -d "$RUNNER_DIR" ]; then
      mkdir -p "$RUNNER_DIR"
      cd "$RUNNER_DIR"

      # Get latest runner version
      LATEST_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/v//')
      echo "Latest runner version: $LATEST_VERSION"

      # Download runner
      curl -L -o actions-runner.tar.gz "https://github.com/actions/runner/releases/download/v$LATEST_VERSION/actions-runner-linux-x64-$LATEST_VERSION.tar.gz"
      tar xzf actions-runner.tar.gz
      rm actions-runner.tar.gz

      chown -R ${var.ssh_user}:${var.ssh_user} "$RUNNER_DIR"

      # Get registration token (retry up to 5x — token expires in 1h, boot can be slow)
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

      # Configure runner as the user (not root)
      RUNNER_NAME="gcp-$(hostname)"
      sudo -u ${var.ssh_user} ./config.sh --url "https://github.com/$REPO_OWNER/$REPO_NAME" \
        --token "$REG_TOKEN" \
        --name "$RUNNER_NAME" \
        --labels "self-hosted,Linux,X64,allerac-server,gcp" \
        --unattended \
        --replace

      # Install and start as service
      ./svc.sh install ${var.ssh_user}
      ./svc.sh start

      echo "GitHub Actions Runner installed: $RUNNER_NAME"
    fi

    # Create directories
    mkdir -p /home/${var.ssh_user}/app
    chown -R ${var.ssh_user}:${var.ssh_user} /home/${var.ssh_user}

    # Start allerac-one app (cloud profile includes Cloudflare tunnel, portainer, grafana)
    echo "=== Starting allerac-one app (with Cloudflare tunnel) ==="
    cd $APP_DIR
    COMPOSE_PROFILES=cloud docker compose up -d --build

    echo ""
    echo "=== Allerac VM Setup Complete! ==="
    echo "Time: $(date)"
    echo "GitHub Runner: gcp-$(hostname)"
    echo "App: http://localhost:8080"
  EOF

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(pathexpand(var.ssh_public_key_path))}"
  }

  service_account {
    scopes = ["cloud-platform"]
  }

  # Prevent VM recreation when startup script or metadata changes
  lifecycle {
    ignore_changes = [
      metadata_startup_script,
      metadata,
    ]
  }
}
