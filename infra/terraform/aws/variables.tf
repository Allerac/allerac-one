variable "region" {
  description = "AWS region"
  type        = string
}

variable "machine_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "ssh_user" {
  description = "SSH user (Ubuntu default)"
  type        = string
  default     = "ubuntu"
}

variable "ssh_public_key" {
  description = "SSH public key content for EC2 access"
  type        = string
  sensitive   = true
}

variable "ssh_source_range" {
  description = "CIDR allowed to SSH. Restrict to your IP for hardening (e.g. \"203.0.113.10/32\"). Defaults to open."
  type        = string
  default     = "0.0.0.0/0"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for allerac.ai"
  type        = string
}

variable "domain" {
  description = "Base domain"
  type        = string
  default     = "allerac.ai"
}

variable "github_token" {
  description = "GitHub Personal Access Token with 'repo' scope for Actions Runner"
  type        = string
  sensitive   = true
}

variable "github_repo_owner" {
  description = "GitHub repository owner"
  type        = string
  default     = "Allerac"
}

variable "github_repo_name" {
  description = "GitHub repository name"
  type        = string
  default     = "allerac-one"
}
