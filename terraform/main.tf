# Provider Google Cloud
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# IP estático (opcional, mas recomendado)
resource "google_compute_address" "allerac_ip" {
  name = "allerac-ip"
}

# Firewall - permitir HTTP, HTTPS e SSH
resource "google_compute_firewall" "allerac_firewall" {
  name    = "allerac-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22", "80", "443", "8080"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["allerac-server"]
}

# VM com Docker
resource "google_compute_instance" "allerac_vm" {
  name         = "allerac-vm"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["allerac-server"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 20
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.allerac_ip.address
    }
  }

  # Script de inicialização - instala Docker e Docker Compose
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Atualizar sistema
    apt-get update
    apt-get upgrade -y

    # Instalar Docker
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Adicionar usuário ao grupo docker
    usermod -aG docker ${var.ssh_user}

    # Criar diretório para o app
    mkdir -p /home/${var.ssh_user}/app
    chown ${var.ssh_user}:${var.ssh_user} /home/${var.ssh_user}/app

    echo "Docker instalado com sucesso!"
  EOF

  metadata = {
    ssh-keys = "${var.ssh_user}:${file(pathexpand(var.ssh_public_key_path))}"
  }

  service_account {
    scopes = ["cloud-platform"]
  }
}
