resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "aws_tunnel" {
  account_id = var.cloudflare_account_id
  name       = "Allerac AWS"
  secret     = random_id.tunnel_secret.b64_std

  lifecycle {
    ignore_changes = [secret]
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "aws_config" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.id

  config {
    ingress_rule {
      hostname = "hub.${var.domain}"
      service  = "http://localhost:8080"
    }
    ingress_rule {
      hostname = "portainer.hub.${var.domain}"
      service  = "http://localhost:9000"
    }
    ingress_rule {
      hostname = "grafana.hub.${var.domain}"
      service  = "http://localhost:3001"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "dns_app" {
  zone_id         = var.cloudflare_zone_id
  name            = "hub"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_portainer" {
  zone_id         = var.cloudflare_zone_id
  name            = "portainer.hub"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}

resource "cloudflare_record" "dns_grafana" {
  zone_id         = var.cloudflare_zone_id
  name            = "grafana.hub"
  content         = "${cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.id}.cfargotunnel.com"
  type            = "CNAME"
  proxied         = true
  allow_overwrite = true
}
