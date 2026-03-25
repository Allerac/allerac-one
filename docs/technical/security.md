# Allerac One - Security Guide

This document covers security considerations for exposing your private AI agent to the internet and preparing for multi-agent deployments.

## Table of Contents

1. [Security Principles](#security-principles)
2. [Local Network Security](#local-network-security)
3. [Internet Exposure Options](#internet-exposure-options)
4. [Authentication & Authorization](#authentication--authorization)
5. [Multi-Agent Security (Phase 3)](#multi-agent-security-phase-3)
6. [Security Checklist](#security-checklist)

---

## Security Principles

### Core Philosophy

Allerac One is designed as a **private-first** AI agent. The default configuration:

- Binds only to `localhost` (127.0.0.1)
- No external ports exposed
- No telemetry or data collection
- All data stays on your machine

### Threat Model

| Threat | Risk Level | Mitigation |
|--------|------------|------------|
| Unauthorized access | High | Authentication, network isolation |
| Data interception | High | HTTPS/TLS encryption |
| Prompt injection | Medium | Input validation, sandboxing |
| Resource exhaustion | Medium | Rate limiting, resource limits |
| Model theft | Low | Local models, no external APIs |

---

## Local Network Security

### Default Configuration (Secure)

By default, Allerac One only listens on localhost:

```yaml
# docker-compose.local.yml
ports:
  - "127.0.0.1:8080:8080"  # Only localhost
```

### LAN Access (Home Network)

To access from other devices on your home network:

```yaml
# docker-compose.local.yml
ports:
  - "0.0.0.0:8080:8080"  # All interfaces (LAN accessible)
```

**Security considerations for LAN:**
- Your router's firewall protects from internet
- Other devices on your network can access
- Consider who has access to your WiFi
- Recommended: Enable authentication

### Firewall Rules (Linux)

```bash
# Allow only from specific IP
sudo ufw allow from 192.168.1.0/24 to any port 8080

# Or allow from anywhere on LAN
sudo ufw allow 8080/tcp
```

---

## Internet Exposure Options

### Option 1: Cloudflare Tunnel (Recommended)

**Best for:** Most users, easy setup, free tier available

```
Internet --> Cloudflare Edge --> Tunnel --> Your Server --> Allerac
              (DDoS protection)   (Encrypted)
```

**Advantages:**
- No open ports on your firewall
- Automatic HTTPS
- DDoS protection included
- Cloudflare Access for authentication
- Free tier available

**Setup:**

```bash
# 1. Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# 2. Authenticate with Cloudflare
cloudflared tunnel login

# 3. Create tunnel
cloudflared tunnel create allerac

# 4. Configure tunnel
cat > ~/.cloudflared/config.yml << EOF
tunnel: <TUNNEL_ID>
credentials-file: /home/$USER/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: ai.yourdomain.com
    service: http://localhost:8080
  - service: http_status:404
EOF

# 5. Run tunnel
cloudflared tunnel run allerac

# 6. (Optional) Install as service
sudo cloudflared service install
```

**Add Cloudflare Access (Authentication):**

1. Go to Cloudflare Zero Trust dashboard
2. Create an Access Application
3. Set policy (email, SSO, one-time PIN)
4. Apply to your tunnel hostname

---

### Option 2: Tailscale/ZeroTier (VPN Mesh)

**Best for:** Personal use, accessing from mobile devices

```
Your Phone --> Tailscale Network --> Your Server --> Allerac
              (Encrypted P2P)
```

**Advantages:**
- No public exposure at all
- Works through NAT/firewalls
- Access from anywhere securely
- Free for personal use

**Setup (Tailscale):**

```bash
# On your server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# On your devices (phone, laptop)
# Install Tailscale app and login with same account

# Access Allerac via Tailscale IP
# http://100.x.x.x:8080
```

---

### Option 3: Reverse Proxy + HTTPS

**Best for:** Advanced users, full control

```
Internet --> Nginx --> Let's Encrypt --> Allerac
           (Auth)    (HTTPS)
```

**Requirements:**
- Domain name
- Public IP or Dynamic DNS
- Open port 443

**Nginx Configuration:**

```nginx
# /etc/nginx/sites-available/allerac
server {
    listen 443 ssl http2;
    server_name ai.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ai.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    # Basic authentication
    auth_basic "Allerac One";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Setup:**

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d ai.yourdomain.com

# Create password file
sudo htpasswd -c /etc/nginx/.htpasswd admin

# Enable site
sudo ln -s /etc/nginx/sites-available/allerac /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

### Option 4: SSH Tunnel (Quick Access)

**Best for:** Temporary access, debugging

```bash
# From your laptop/phone (with SSH access)
ssh -L 8080:localhost:8080 user@your-server-ip

# Then access at http://localhost:8080
```

---

## Authentication & Authorization

### Current State

Allerac One currently has:
- User accounts with email/password
- Session-based authentication
- No mandatory authentication on first access

### Recommended Improvements (Phase 2)

#### 1. Mandatory First-Run Setup

```typescript
// Force account creation on first access
if (!hasAnyUsers()) {
  redirect('/setup');
}
```

#### 2. API Key Authentication

For programmatic access:

```typescript
// Header-based auth
Authorization: Bearer <API_KEY>

// Or query parameter
?api_key=<API_KEY>
```

#### 3. Rate Limiting

```typescript
// Per-user rate limiting
const rateLimiter = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
};
```

#### 4. IP Allowlisting

```typescript
// Only allow specific IPs
const allowedIPs = ['192.168.1.0/24', '10.0.0.0/8'];
```

---

## Multi-Agent Security (Phase 3)

### Architecture Overview

```
+-------------------------------------------------------------+
|                     Secure Home Network                      |
|                                                              |
|  +--------------+    +--------------+    +--------------+   |
|  |   Agent A    |    |   Agent B    |    |   Agent C    |   |
|  |  (Kitchen)   |<-->|  (Office)    |<-->|  (Bedroom)   |   |
|  +--------------+    +--------------+    +--------------+   |
|          |                   |                   |           |
|          +-------------------+-------------------+           |
|                              |                               |
|                    +---------v---------+                     |
|                    |   mDNS Discovery  |                     |
|                    |   + mTLS Auth     |                     |
|                    +-------------------+                     |
+-------------------------------------------------------------+
```

### Agent-to-Agent Security

#### 1. Mutual TLS (mTLS)

Each agent has its own certificate:

```bash
# Generate CA (one per network)
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt

# Generate agent certificate
openssl genrsa -out agent-kitchen.key 2048
openssl req -new -key agent-kitchen.key -out agent-kitchen.csr
openssl x509 -req -in agent-kitchen.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out agent-kitchen.crt -days 365 -sha256
```

#### 2. Agent Identity

```typescript
interface AgentIdentity {
  id: string;           // Unique agent ID (UUID)
  name: string;         // Human-readable name
  publicKey: string;    // For message signing
  capabilities: string[]; // What this agent can do
  trustLevel: 'local' | 'network' | 'internet';
}
```

#### 3. Message Signing

All inter-agent messages are signed:

```typescript
interface AgentMessage {
  from: string;         // Agent ID
  to: string;           // Target agent ID
  timestamp: number;    // Prevent replay attacks
  nonce: string;        // Unique per message
  payload: any;         // Actual message
  signature: string;    // Ed25519 signature
}
```

#### 4. Trust Levels

| Level | Can Do | Cannot Do |
|-------|--------|-----------|
| Local | Full access to own data | - |
| Network | Share memories, delegate tasks | Access other agent's private data |
| Internet | Receive public queries | Access any private data |

### Discovery Security

#### mDNS with Verification

```typescript
// Agent announces itself
const announcement = {
  service: '_allerac._tcp',
  name: 'agent-kitchen',
  port: 8080,
  txt: {
    id: 'uuid-xxx',
    publicKey: 'base64...',
    version: '1.0.0'
  }
};

// Verification on discovery
async function verifyAgent(discovered: Agent): Promise<boolean> {
  // 1. Check if agent ID is known
  // 2. Verify public key matches stored key
  // 3. Challenge-response authentication
  // 4. Check certificate validity
}
```

### Data Sharing Policies

```typescript
interface SharingPolicy {
  // What can be shared
  memories: 'none' | 'public' | 'all';
  conversations: 'none' | 'summaries' | 'all';
  documents: 'none' | 'metadata' | 'all';

  // Who can receive
  allowedAgents: string[];  // Agent IDs
  allowedNetworks: string[]; // Network IDs

  // Conditions
  requireApproval: boolean;
  expiresAfter: number; // Hours
}
```

### Attack Vectors & Mitigations

| Attack | Description | Mitigation |
|--------|-------------|------------|
| Rogue Agent | Malicious agent joins network | mTLS, agent allowlist |
| Eavesdropping | Intercepting agent messages | TLS encryption |
| Replay Attack | Resending captured messages | Nonces, timestamps |
| Impersonation | Pretending to be another agent | Message signing, mTLS |
| Data Exfiltration | Stealing shared memories | Trust levels, audit logs |
| DoS | Flooding agent with requests | Rate limiting |

---

## Security Checklist

### Before Exposing to Internet

- [ ] Change all default passwords
- [ ] Enable HTTPS/TLS
- [ ] Configure authentication
- [ ] Set up rate limiting
- [ ] Review firewall rules
- [ ] Enable audit logging
- [ ] Test from external network
- [ ] Set up monitoring/alerts

### For Multi-Agent Deployment

- [ ] Generate unique certificates for each agent
- [ ] Configure trust policies
- [ ] Set up agent allowlist
- [ ] Define sharing policies
- [ ] Enable inter-agent encryption
- [ ] Test discovery mechanism
- [ ] Configure network isolation
- [ ] Set up centralized logging

### Regular Maintenance

- [ ] Rotate encryption keys (annually)
- [ ] Update SSL certificates (before expiry)
- [ ] Review access logs (weekly)
- [ ] Update dependencies (monthly)
- [ ] Security audit (quarterly)
- [ ] Backup verification (monthly)

---

## Environment Variables for Security

```bash
# .env security settings

# Required: Encryption key for database
ENCRYPTION_KEY=<generate with: openssl rand -base64 32>

# Optional: Force HTTPS
FORCE_HTTPS=true

# Optional: Allowed origins for CORS
ALLOWED_ORIGINS=https://ai.yourdomain.com

# Optional: Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# Optional: IP allowlist (comma-separated)
ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8

# Multi-agent settings (Phase 3)
AGENT_ID=<unique-uuid>
AGENT_NAME=kitchen
AGENT_NETWORK_KEY=<shared network secret>
AGENT_TRUST_LEVEL=network
```

---

## Quick Reference

### Exposure Method Comparison

| Method | Setup | Security | Cost | Best For |
|--------|-------|----------|------|----------|
| Cloudflare Tunnel | Easy | High | Free | Most users |
| Tailscale | Easy | Very High | Free | Personal |
| Nginx + HTTPS | Medium | High | Domain cost | Full control |
| SSH Tunnel | Easy | High | Free | Temporary |
| Direct Port | Easy | Low | Free | Never for internet |

### Command Cheatsheet

```bash
# Check open ports
sudo ss -tlnp | grep 8080

# Test local access
curl http://localhost:8080

# Test external access (from another machine)
curl http://your-server-ip:8080

# Check firewall status
sudo ufw status

# View access logs
docker logs allerac-app 2>&1 | grep -i "access\|auth"
```

---

## Support

- **Issues:** https://github.com/Allerac/allerac-one/issues
- **Security Issues:** security@allerac.ai (for private disclosure)
