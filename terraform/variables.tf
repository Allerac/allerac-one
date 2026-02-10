variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region"
  type        = string
  default     = "southamerica-east1"
}

variable "zone" {
  description = "Google Cloud zone"
  type        = string
  default     = "southamerica-east1-a"
}

variable "machine_type" {
  description = "Machine type (e2-micro is free tier, e2-small recommended)"
  type        = string
  default     = "e2-small"
}

variable "ssh_user" {
  description = "SSH user to access the VM"
  type        = string
  default     = "allerac"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}
