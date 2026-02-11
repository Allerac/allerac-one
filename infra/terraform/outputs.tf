# --- VM Outputs ---
output "vm_ip" {
  description = "VM external IP address"
  value       = google_compute_address.allerac_ip.address
}

output "vm_name" {
  description = "VM name"
  value       = google_compute_instance.allerac_vm.name
}

output "ssh_command" {
  description = "SSH connection command"
  value       = "ssh ${var.ssh_user}@${google_compute_address.allerac_ip.address}"
}

# --- Application URLs ---
output "chat_url" {
  description = "Allerac One chat application URL"
  value       = "https://chat.${var.domain}"
}

output "home_url" {
  description = "Homepage dashboard URL"
  value       = "https://home.${var.domain}"
}

output "portainer_url" {
  description = "Portainer URL"
  value       = "https://portainer.${var.domain}"
}

output "landing_url" {
  description = "Landing page URL"
  value       = "https://landing.${var.domain}"
}

output "grafana_url" {
  description = "Grafana monitoring URL"
  value       = "https://grafana.${var.domain}"
}

# --- Backup Outputs ---
output "backup_bucket" {
  description = "GCS bucket for database backups"
  value       = google_storage_bucket.backups.name
}

# --- Cloudflare Outputs ---
output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_tunnel.allerac_tunnel.id
}

output "tunnel_token" {
  description = "Cloudflare Tunnel Token (for cloudflared)"
  value       = cloudflare_tunnel.allerac_tunnel.tunnel_token
  sensitive   = true
}

# --- GitHub Actions ---
output "github_runner_name" {
  description = "GitHub Actions Runner name"
  value       = "gcp-${google_compute_instance.allerac_vm.name}"
}

output "github_actions_url" {
  description = "GitHub Actions URL"
  value       = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}/actions"
}
