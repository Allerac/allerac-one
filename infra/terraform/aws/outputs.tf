# --- VM Outputs ---
output "vm_ip" {
  description = "VM public IP address (Elastic IP)"
  value       = aws_eip.main.public_ip
}

output "vm_name" {
  description = "EC2 instance ID"
  value       = aws_instance.main.id
}

output "ssh_command" {
  description = "SSH connection command"
  value       = "ssh ${var.ssh_user}@${aws_eip.main.public_ip}"
}

# --- Application URLs ---
output "app_url" {
  description = "Main app URL"
  value       = "https://hub.${var.domain}"
}

output "portainer_url" {
  description = "Portainer URL"
  value       = "https://portainer.hub.${var.domain}"
}

output "grafana_url" {
  description = "Grafana monitoring URL"
  value       = "https://grafana.hub.${var.domain}"
}

# --- Storage ---
output "backup_bucket" {
  description = "S3 bucket for database backups"
  value       = aws_s3_bucket.backups.bucket
}

# --- Cloudflare Outputs ---
output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.id
}

output "tunnel_token" {
  description = "Cloudflare Tunnel Token (for cloudflared)"
  value       = cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.tunnel_token
  sensitive   = true
}

# --- GitHub Actions ---
output "github_runner_name" {
  description = "GitHub Actions Runner name (set after first boot)"
  value       = "aws-${aws_instance.main.id}"
}

output "github_actions_url" {
  description = "GitHub Actions URL"
  value       = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}/actions"
}
