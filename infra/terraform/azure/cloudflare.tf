resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "azure_tunnel" {
  account_id = var.cloudflare_account_id
  name       = "Allerac Azure"
  secret     = random_id.tunnel_secret.b64_std

  lifecycle {
    ignore_changes = [secret]
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "azure_config" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id

  config {
    ingress_rule {
      hostname = "app.${var.domain}"
      service  = "http://localhost:8080"
    }
    ingress_rule {
      hostname = "instagram.${var.domain}"
      service  = "http://localhost:8080"
    }
    ingress_rule {
      hostname = "portainer.app.${var.domain}"
      service  = "http://localhost:9000"
    }
    ingress_rule {
      hostname = "grafana.app.${var.domain}"
      service  = "http://localhost:3001"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "dns_app" {
  zone_id         = var.cloudflare_zone_id
  name            = "app"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_instagram" {
  zone_id         = var.cloudflare_zone_id
  name            = "instagram"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_portainer" {
  zone_id         = var.cloudflare_zone_id
  name            = "portainer.app"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_grafana" {
  zone_id         = var.cloudflare_zone_id
  name            = "grafana.app"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}
