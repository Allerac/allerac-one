variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
  sensitive   = true
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "North Europe"
}

variable "resource_group_name" {
  description = "Azure resource group name"
  type        = string
  default     = "allerac-one"
}

variable "machine_type" {
  description = "Azure VM size"
  type        = string
  default     = "Standard_F4ads_v7"
}

variable "ssh_user" {
  description = "VM admin username"
  type        = string
  default     = "allerac-adm"
}

variable "ssh_public_key" {
  description = "SSH public key content for VM access"
  type        = string
  sensitive   = true
}

variable "ssh_source_range" {
  description = "CIDR allowed to SSH. Restrict to your IP for hardening (e.g. \"203.0.113.10/32\"). Defaults to open."
  type        = string
  default     = "*"
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
