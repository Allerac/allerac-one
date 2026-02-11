# Unified Terraform Configuration for Allerac-One
# Combines GCP infrastructure with Cloudflare tunnel

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

# --- PROVIDERS ---
provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# --- CLOUDFLARE TUNNEL ---
resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_tunnel" "allerac_tunnel" {
  account_id = var.cloudflare_account_id
  name       = "allerac-gcp-tunnel"
  secret     = random_id.tunnel_secret.b64_std
}

# --- STATIC IP ---
resource "google_compute_address" "allerac_ip" {
  name = "allerac-ip"
}

# --- BACKUP STORAGE ---
resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-backups"
  location      = var.region
  storage_class = "NEARLINE"

  # Auto-delete backups older than 30 days
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  # Prevent accidental deletion
  force_destroy = false

  uniform_bucket_level_access = true
}

# --- FIREWALL ---
resource "google_compute_firewall" "allerac_firewall" {
  name    = "allerac-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443", "8080", "3000", "3001", "9000", "9090", "9100"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["allerac-server"]
}

# --- VIRTUAL MACHINE ---
resource "google_compute_instance" "allerac_vm" {
  name         = "allerac-vm"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["allerac-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.allerac_ip.address
    }
  }

  # Startup script - installs Docker, GitHub Runner, and deploys app
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    exec > >(tee /var/log/startup-script.log) 2>&1
    echo "=== Starting Allerac VM Setup ==="
    echo "Time: $(date)"

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

    # Install Docker
    echo "=== Installing Docker ==="
    apt-get install -y ca-certificates curl gnupg git jq
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

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

      # Get registration token
      REG_TOKEN=$(curl -s -X POST \
        -H "Accept: application/vnd.github+json" \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | jq -r '.token')

      if [ -z "$REG_TOKEN" ] || [ "$REG_TOKEN" = "null" ]; then
        echo "ERROR: Failed to get registration token"
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
    mkdir -p /home/${var.ssh_user}/config
    mkdir -p /home/${var.ssh_user}/site
    chown -R ${var.ssh_user}:${var.ssh_user} /home/${var.ssh_user}

    # Create landing page
    cat > /home/${var.ssh_user}/site/index.html <<'LANDING'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Allerac AI</title>
  <style>
    body { background: #0a0a0a; color: #00ff88; font-family: 'Courier New', monospace; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; }
    h1 { font-size: 3rem; margin-bottom: 1rem; }
    p { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Allerac AI</h1>
    <p>System Online - Google Cloud Platform</p>
  </div>
</body>
</html>
LANDING

    # Create homepage config
    cat > /home/${var.ssh_user}/config/services.yaml <<'SERVICES'
- My Apps:
    - Allerac Chat:
        icon: si-openai
        href: https://chat.${var.domain}
        description: AI Chat Application
    - Portainer:
        icon: si-portainer
        href: https://portainer.${var.domain}
        description: Docker Management
    - Landing Page:
        icon: si-nginx
        href: https://landing.${var.domain}
        description: Marketing Site
SERVICES

    cat > /home/${var.ssh_user}/config/widgets.yaml <<'WIDGETS'
- resources:
    cpu: true
    memory: true
    disk: /
WIDGETS

    cat > /home/${var.ssh_user}/config/docker.yaml <<'DOCKERYAML'
my-docker:
  socket: /var/run/docker.sock
DOCKERYAML

    # Create docker-compose for infrastructure services
    cat > /home/${var.ssh_user}/docker-compose.infra.yml <<'COMPOSE'
version: '3.8'
services:
  # Cloudflare Tunnel (network_mode: host to access localhost ports)
  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    network_mode: host
    environment:
      - TUNNEL_TOKEN=${cloudflare_tunnel.allerac_tunnel.tunnel_token}

  # Homepage Dashboard
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    restart: unless-stopped
    volumes:
      - /home/${var.ssh_user}/config:/app/config
      - /var/run/docker.sock:/var/run/docker.sock:ro
    ports:
      - "3000:3000"
    environment:
      HOMEPAGE_ALLOWED_HOSTS: "*"

  # Portainer
  portainer:
    image: portainer/portainer-ce:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data
    ports:
      - "9000:9000"

  # Landing Page
  website:
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - /home/${var.ssh_user}/site:/usr/share/nginx/html:ro
    ports:
      - "80:80"

volumes:
  portainer_data:
COMPOSE

    chown -R ${var.ssh_user}:${var.ssh_user} /home/${var.ssh_user}

    # Start infrastructure services
    echo "=== Starting infrastructure services ==="
    cd /home/${var.ssh_user}
    docker compose -f docker-compose.infra.yml up -d

    # Start the allerac-one app
    echo "=== Starting allerac-one app ==="
    cd $APP_DIR
    docker compose up -d --build

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

# --- CLOUDFLARE TUNNEL ROUTING ---
resource "cloudflare_tunnel_config" "allerac_config" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_tunnel.allerac_tunnel.id

  config {
    # Allerac One App (main application)
    ingress_rule {
      hostname = "chat.${var.domain}"
      service  = "http://localhost:8080"
    }
    # Homepage Dashboard
    ingress_rule {
      hostname = "home.${var.domain}"
      service  = "http://localhost:3000"
    }
    # Portainer
    ingress_rule {
      hostname = "portainer.${var.domain}"
      service  = "http://localhost:9000"
    }
    # Landing Page
    ingress_rule {
      hostname = "landing.${var.domain}"
      service  = "http://localhost:80"
    }
    # Grafana
    ingress_rule {
      hostname = "grafana.${var.domain}"
      service  = "http://localhost:3001"
    }
    # Catch-all
    ingress_rule {
      service = "http_status:404"
    }
  }
}

# --- DNS RECORDS ---
resource "cloudflare_record" "dns_chat" {
  zone_id         = var.cloudflare_zone_id
  name            = "chat"
  value           = "${cloudflare_tunnel.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_home" {
  zone_id         = var.cloudflare_zone_id
  name            = "home"
  value           = "${cloudflare_tunnel.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_portainer" {
  zone_id         = var.cloudflare_zone_id
  name            = "portainer"
  value           = "${cloudflare_tunnel.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_landing" {
  zone_id         = var.cloudflare_zone_id
  name            = "landing"
  value           = "${cloudflare_tunnel.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_grafana" {
  zone_id         = var.cloudflare_zone_id
  name            = "grafana"
  value           = "${cloudflare_tunnel.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}
