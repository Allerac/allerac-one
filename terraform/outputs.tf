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

output "app_url" {
  description = "Application URL"
  value       = "http://${google_compute_address.allerac_ip.address}:8080"
}
