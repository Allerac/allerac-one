resource "google_compute_address" "allerac_ip" {
  name = "allerac-ip"
}

# All web traffic goes through Cloudflare Tunnel (outbound only — no inbound ports needed).
# Only SSH is exposed publicly; restrict ssh_source_ranges to your IP for extra hardening.
resource "google_compute_firewall" "allerac_firewall" {
  name    = "allerac-firewall"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_source_ranges
  target_tags   = ["allerac-server"]
}
