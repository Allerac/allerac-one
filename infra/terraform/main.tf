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

# --- FIREWALL ---
resource "google_compute_firewall" "allerac_firewall" {
  name    = "allerac-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443", "8080", "3000", "9000"]
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

  # Startup script - installs Docker and creates service configs
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    echo "Starting Allerac VM Setup..."

    # Update system
    apt-get update
    apt-get upgrade -y

    # Install Docker
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add user to docker group
    usermod -aG docker ${var.ssh_user}

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
    cd /home/${var.ssh_user}
    docker compose -f docker-compose.infra.yml up -d

    echo "Allerac VM Setup Complete!"
  EOF

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(pathexpand(var.ssh_public_key_path))}"
  }

  service_account {
    scopes = ["cloud-platform"]
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
