# --- VM Outputs ---
output "vm_ip" {
  description = "VM public IP address"
  value       = azurerm_public_ip.main.ip_address
}

output "vm_name" {
  description = "VM name"
  value       = azurerm_linux_virtual_machine.main.name
}

output "ssh_command" {
  description = "SSH connection command"
  value       = "ssh ${var.ssh_user}@${azurerm_public_ip.main.ip_address}"
}

# --- Application URLs ---
output "app_url" {
  description = "Main app URL"
  value       = "https://app.${var.domain}"
}

output "instagram_url" {
  description = "Instagram integration URL"
  value       = "https://instagram.${var.domain}"
}

output "portainer_url" {
  description = "Portainer URL"
  value       = "https://portainer.app.${var.domain}"
}

output "grafana_url" {
  description = "Grafana monitoring URL"
  value       = "https://grafana.app.${var.domain}"
}

# --- Storage ---
output "storage_account_name" {
  description = "Storage account name"
  value       = azurerm_storage_account.main.name
}

# --- Cloudflare Outputs ---
output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.id
}

output "tunnel_token" {
  description = "Cloudflare Tunnel Token (for cloudflared)"
  value       = cloudflare_zero_trust_tunnel_cloudflared.azure_tunnel.tunnel_token
  sensitive   = true
}

# --- GitHub Actions ---
output "github_runner_name" {
  description = "GitHub Actions Runner name"
  value       = "azure-${azurerm_linux_virtual_machine.main.name}"
}

output "github_actions_url" {
  description = "GitHub Actions URL"
  value       = "https://github.com/${var.github_repo_owner}/${var.github_repo_name}/actions"
}
