# Allerac One - Local Setup Guide

Run your own private AI agent at home. No cloud required, no API costs, 100% private.

## Quick Start (One Command)

```bash
curl -sSL https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh | bash
```

That's it! The script will:
1. Install Docker (if needed)
2. Clone the repository
3. Configure environment
4. Download AI model
5. Start all services

Access your AI at: **http://localhost:8080**

---

## System Requirements

### Minimum
| Component | Requirement |
|-----------|-------------|
| CPU | 4 cores |
| RAM | 8 GB |
| Storage | 20 GB SSD |
| OS | Ubuntu 20.04+, macOS 12+ |

### Recommended
| Component | Requirement |
|-----------|-------------|
| CPU | 8+ cores |
| RAM | 16-32 GB |
| Storage | 50+ GB NVMe |
| GPU | NVIDIA RTX 3060+ (optional) |

### AI Model Requirements

| Model | RAM Needed | Quality | Speed |
|-------|------------|---------|-------|
| Llama 3.2 3B | 4 GB | Good | Fast |
| Mistral 7B | 8 GB | Great | Medium |
| Llama 3.1 8B | 10 GB | Great | Medium |
| Mixtral 8x7B | 32 GB | Excellent | Slow |

---

## Installation Options

### Option 1: Automatic Installation (Recommended)

```bash
# Full installation with Ollama
curl -sSL https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh | bash

# With monitoring (Grafana + Prometheus)
curl -sSL https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh | bash -s -- --with-monitoring

# Specify a different model
curl -sSL https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh | bash -s -- --model mistral
```

### Option 2: Manual Installation

```bash
# 1. Clone the repository
git clone https://github.com/Allerac/allerac-one.git
cd allerac-one

# 2. Copy and configure environment
cp .env.local.example .env

# 3. Generate encryption key and update .env
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

# 4. Start services (with Ollama)
docker compose -f docker-compose.local.yml --profile ollama up -d

# 5. Wait for model download (first time only)
docker logs -f allerac-ollama-setup
```

### Option 3: Using Existing Ollama

If you already have Ollama installed on your machine:

```bash
# 1. Clone and configure
git clone https://github.com/Allerac/allerac-one.git
cd allerac-one
cp .env.local.example .env

# 2. Update .env to use host Ollama
# Change: OLLAMA_BASE_URL=http://host.docker.internal:11434

# 3. Start without containerized Ollama
docker compose -f docker-compose.local.yml up -d
```

---

## Configuration

### Environment Variables (.env)

```bash
# Required
ENCRYPTION_KEY=your_secure_key_here

# Ollama settings
OLLAMA_BASE_URL=http://ollama:11434
DEFAULT_MODEL=llama3.2

# Ports (change if conflicts)
APP_PORT=8080
OLLAMA_PORT=11434
GRAFANA_PORT=3001
```

### Changing AI Models

```bash
# List available models
docker exec allerac-ollama ollama list

# Download a new model
docker exec allerac-ollama ollama pull mistral
docker exec allerac-ollama ollama pull codellama
docker exec allerac-ollama ollama pull llama3.1

# Remove a model
docker exec allerac-ollama ollama rm llama3.2
```

### GPU Support (NVIDIA)

1. Install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

2. Uncomment GPU section in `docker-compose.local.yml`:
```yaml
ollama:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

3. Restart services:
```bash
docker compose -f docker-compose.local.yml --profile ollama down
docker compose -f docker-compose.local.yml --profile ollama up -d
```

---

## Common Operations

### Starting/Stopping

```bash
cd ~/allerac-one

# Start all services
docker compose -f docker-compose.local.yml --profile ollama up -d

# Stop all services
docker compose -f docker-compose.local.yml --profile ollama down

# Restart
docker compose -f docker-compose.local.yml --profile ollama restart
```

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.local.yml logs -f

# Specific service
docker compose -f docker-compose.local.yml logs -f app
docker compose -f docker-compose.local.yml logs -f ollama
```

### Updating

```bash
cd ~/allerac-one

# Pull latest code
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.local.yml --profile ollama down
docker compose -f docker-compose.local.yml --profile ollama build
docker compose -f docker-compose.local.yml --profile ollama up -d
```

### Backup

```bash
# Backup database
docker exec allerac-db pg_dump -U postgres allerac | gzip > backup.sql.gz

# Restore database
gunzip < backup.sql.gz | docker exec -i allerac-db psql -U postgres -d allerac
```

---

## Troubleshooting

### System Freezing / Out of Memory

**Symptoms:** System becomes unresponsive, Docker crashes

**Solutions:**

1. **Add swap space:**
```bash
# Create 4GB swap (if not exists)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

2. **Use a smaller model:**
```bash
# Edit .env
DEFAULT_MODEL=llama3.2  # 3B model, needs only 4GB
```

3. **Limit container memory:**
Already configured in `docker-compose.local.yml`

### Ollama Model Download Stuck

```bash
# Check download progress
docker logs -f allerac-ollama-setup

# If stuck, restart
docker compose -f docker-compose.local.yml --profile ollama restart ollama ollama-setup
```

### Port Already in Use

```bash
# Check what's using the port
sudo lsof -i :8080

# Change port in .env
APP_PORT=8081
```

### Docker Permission Denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

### App Not Starting

```bash
# Check logs for errors
docker compose -f docker-compose.local.yml logs app

# Common issues:
# - Database not ready: wait and retry
# - Migration failed: check migrations logs
docker compose -f docker-compose.local.yml logs migrations
```

---

## Accessing Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Allerac App | http://localhost:8080 | Create account |
| Grafana | http://localhost:3001 | admin / admin |
| Prometheus | http://localhost:9090 | - |
| Ollama API | http://localhost:11434 | - |

---

## Recommended Hardware

### Budget (~$350)
- **Beelink SER5 Pro** (AMD Ryzen 5, 32GB RAM)
- Good for 7B models

### Mid-range (~$600)
- **Intel NUC 13 Pro** (Intel Core i7, 64GB RAM)
- Good for 13B models

### High-end (~$800-1500)
- **Mac Mini M2/M3** (24GB unified memory)
- Excellent performance, quiet

### With GPU (~$1000+)
- Any mini PC + external GPU enclosure
- Or dedicated workstation with RTX 3060+

---

## Security Considerations

1. **Network:** By default, services only bind to localhost
2. **Firewall:** No incoming ports needed
3. **Data:** All data stays on your machine
4. **Encryption:** Database uses local encryption key
5. **No telemetry:** No data sent to external services

### Exposing to Local Network

If you want to access from other devices on your home network:

```bash
# Edit docker-compose.local.yml
# Change "8080:8080" to "0.0.0.0:8080:8080"

# Or use SSH tunnel from another device
ssh -L 8080:localhost:8080 user@your-server-ip
```

---

## Uninstalling

```bash
# Stop and remove containers
cd ~/allerac-one
docker compose -f docker-compose.local.yml --profile ollama --profile monitoring down -v

# Remove installation directory
rm -rf ~/allerac-one

# Optional: remove Docker images
docker image prune -a
```

---

## Support

- **Issues:** https://github.com/Allerac/allerac-one/issues
- **Documentation:** https://github.com/Allerac/allerac-one/docs
