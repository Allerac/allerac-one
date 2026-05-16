# Step 1: apply this target first: terraform apply -target=google_storage_bucket.tfstate
# Step 2: uncomment the backend block in providers.tf
# Step 3: run: terraform init -migrate-state
resource "google_storage_bucket" "tfstate" {
  name          = "${var.project_id}-tfstate"
  location      = var.region
  storage_class = "STANDARD"
  force_destroy = false
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-backups"
  location      = var.region
  storage_class = "NEARLINE"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  force_destroy = false
  uniform_bucket_level_access = true
}
