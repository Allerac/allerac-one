resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "allerac_tunnel" {
  account_id = var.cloudflare_account_id
  name       = "allerac-gcp-tunnel"
  secret     = random_id.tunnel_secret.b64_std

  # Cloudflare API never returns the secret, so Terraform always sees a diff.
  # Without this, every plan would destroy and recreate the tunnel.
  lifecycle {
    ignore_changes = [secret]
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "allerac_config" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.allerac_tunnel.id

  config {
    ingress_rule {
      hostname = "chat.${var.domain}"
      service  = "http://localhost:8080"
    }
    ingress_rule {
      hostname = "portainer.chat.${var.domain}"
      service  = "http://localhost:9000"
    }
    ingress_rule {
      hostname = "grafana.chat.${var.domain}"
      service  = "http://localhost:3001"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "dns_chat" {
  zone_id         = var.cloudflare_zone_id
  name            = "chat"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_portainer" {
  zone_id         = var.cloudflare_zone_id
  name            = "portainer.chat"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_grafana" {
  zone_id         = var.cloudflare_zone_id
  name            = "grafana.chat"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.allerac_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}
