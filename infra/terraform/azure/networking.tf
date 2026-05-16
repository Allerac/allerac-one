resource "azurerm_virtual_network" "main" {
  name                = "allerac-one-vm-az-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  address_space       = ["10.1.0.0/16"]
}

resource "azurerm_subnet" "default" {
  name                 = "default"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.1.0.0/24"]
}

resource "azurerm_network_security_group" "main" {
  name                = "allerac-one-vm-az-nsg"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location

  security_rule {
    name                       = "SSH"
    priority                   = 300
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.ssh_source_range
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTP"
    priority                   = 320
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "HTTPS"
    priority                   = 340
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "main" {
  name                = "allerac-one-vm-az-ip"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = "Standard"
  allocation_method   = "Static"
  zones               = ["1"]
}

resource "azurerm_network_interface" "main" {
  name                           = "allerac-one-vm-az102_z1"
  resource_group_name            = azurerm_resource_group.main.name
  location                       = var.location
  accelerated_networking_enabled = true

  ip_configuration {
    name                          = "ipconfig1"
    subnet_id                     = azurerm_subnet.default.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.main.id
  }
}

resource "azurerm_network_interface_security_group_association" "main" {
  network_interface_id      = azurerm_network_interface.main.id
  network_security_group_id = azurerm_network_security_group.main.id
}
