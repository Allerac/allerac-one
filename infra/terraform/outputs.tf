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
output "app_url" {
  description = "Allerac One application URL"
  value       = "https://app.${var.domain}"
}

output "home_url" {
  description = "Homepage dashboard URL"
  value       = "https://home.${var.domain}"
}

output "portainer_url" {
  description = "Portainer URL"
  value       = "https://portainer.${var.domain}"
}

output "web_url" {
  description = "Landing page URL"
  value       = "https://web.${var.domain}"
}

# --- Cloudflare Outputs ---
output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_tunnel.allerac_tunnel.id
}
