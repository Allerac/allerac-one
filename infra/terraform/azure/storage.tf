resource "azurerm_storage_account" "main" {
  name                     = "alleracstorage"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = "RAGRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"
}
