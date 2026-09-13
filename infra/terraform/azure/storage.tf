resource "azurerm_storage_account" "main" {
  name                     = "alleracnapols"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "RAGRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"
}

# Public read access so uploaded images are servable as plain URLs
# (chat attachments, Instagram/TikTok media) without generating SAS tokens.
resource "azurerm_storage_container" "social_posts" {
  name                  = "social-posts"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "blob"
}

# Grants the Azure VM's system-assigned managed identity keyless access.
# Only applies when the VM itself runs in Azure (see azurerm_linux_virtual_machine.main) —
# a locally-hosted VM instead authenticates via AZURE_STORAGE_ACCOUNT_KEY.
resource "azurerm_role_assignment" "vm_storage_blob_contributor" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_linux_virtual_machine.main.identity[0].principal_id
}
