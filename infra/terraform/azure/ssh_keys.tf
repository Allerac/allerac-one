resource "azurerm_ssh_public_key" "vm_key" {
  name                = "allerac-one-vm-az_key"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  public_key          = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "azurerm_ssh_public_key" "az" {
  name                = "allerac-one-az"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  public_key          = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "azurerm_ssh_public_key" "azure" {
  name                = "allerac-one-azure"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  public_key          = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "azurerm_ssh_public_key" "azure_allerac_one" {
  name                = "azure-allerac-one"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  public_key          = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}
