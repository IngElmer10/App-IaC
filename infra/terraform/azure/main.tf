
# ============================================================
# EMPRESA: GLOBAMATIC
# ENTORNO: DEVELOPMENT (DEV)
# PROYECTO: SISTEMA WEB DE CONTROL DE ASISTENCIA
# MODULO: INFRAESTRUCTURA COMO CODIGO
# CLOUD: MICROSOFT AZURE
#
# OBJETIVO:
# Aprovisionar un servidor Ubuntu para el backend.
# NestJS y PostgreSQL se instalaran manualmente.
# ============================================================


# ============================================================
# 1. TERRAFORM Y PROVIDER
# ============================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}

  subscription_id = var.subscription_id
}


# ============================================================
# 2. VARIABLES
# ============================================================

variable "subscription_id" {
  description = "ID de la suscripcion de Azure"
  type        = string
}

variable "azure_region" {
  description = "Region de Azure"
  type        = string
  default     = "mexicocentral"
}

variable "company" {
  description = "Nombre de la empresa"
  type        = string
  default     = "globamatic"
}

variable "environment" {
  description = "Entorno de despliegue"
  type        = string
  default     = "dev"
}

variable "vm_size" {
  description = "Tamano de la maquina virtual"
  type        = string
  default     = "Standard_B2ats_v2"
}

variable "admin_username" {
  description = "Usuario administrador de Ubuntu"
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Ruta de la clave publica SSH"
  type        = string
  default     = "~/.ssh/terraform-lab.pub"
}

variable "allowed_ssh_cidr" {
  description = "Direccion IPv4 publica autorizada para SSH"
  type        = string

  validation {
    condition = (
      can(cidrnetmask(var.allowed_ssh_cidr)) &&
      endswith(var.allowed_ssh_cidr, "/32") &&
      var.allowed_ssh_cidr != "0.0.0.0/32"
    )

    error_message = "Introduce una IPv4 publica en formato x.x.x.x/32."
  }
}


# ============================================================
# 3. VARIABLES LOCALES Y ETIQUETAS
# ============================================================

locals {
  name_prefix = "${var.company}-${var.environment}"

  common_tags = {
    Company     = "Globamatic"
    Environment = var.environment
    Project     = "Control-Asistencia"
    ManagedBy   = "Terraform"
    Role        = "Backend"
  }
}


# ============================================================
# 4. RESOURCE GROUP
# ============================================================

resource "azurerm_resource_group" "main" {
  name     = "${local.name_prefix}-rg"
  location = var.azure_region

  tags = local.common_tags
}


# ============================================================
# 5. VIRTUAL NETWORK
# ============================================================

resource "azurerm_virtual_network" "main" {
  name                = "${local.name_prefix}-vnet"
  address_space       = ["10.20.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = local.common_tags
}


# ============================================================
# 6. SUBRED DEL BACKEND
# ============================================================

resource "azurerm_subnet" "backend" {
  name                 = "${local.name_prefix}-backend-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name

  address_prefixes = ["10.20.1.0/24"]
}


# ============================================================
# 7. IP PUBLICA
# ============================================================

resource "azurerm_public_ip" "backend" {
  name                = "${local.name_prefix}-backend-pip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  allocation_method = "Static"
  sku               = "Standard"

  tags = local.common_tags
}


# ============================================================
# 8. NETWORK SECURITY GROUP
# ============================================================

resource "azurerm_network_security_group" "backend" {
  name                = "${local.name_prefix}-backend-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = local.common_tags
}


# ============================================================
# 9. REGLAS DE SEGURIDAD
# ============================================================

# SSH: acceso administrativo solo desde nuestra IP

resource "azurerm_network_security_rule" "ssh" {
  name                       = "Allow-SSH"
  priority                   = 100
  direction                  = "Inbound"
  access                     = "Allow"
  protocol                   = "Tcp"
  source_port_range          = "*"
  destination_port_range     = "22"
  source_address_prefix      = var.allowed_ssh_cidr
  destination_address_prefix = "*"

  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.backend.name
}

# HTTP: reservado para futuro proxy inverso

resource "azurerm_network_security_rule" "http" {
  name                       = "Allow-HTTP"
  priority                   = 110
  direction                  = "Inbound"
  access                     = "Allow"
  protocol                   = "Tcp"
  source_port_range          = "*"
  destination_port_range     = "80"
  source_address_prefix      = "*"
  destination_address_prefix = "*"

  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.backend.name
}

# HTTPS: reservado para publicar la API

resource "azurerm_network_security_rule" "https" {
  name                       = "Allow-HTTPS"
  priority                   = 120
  direction                  = "Inbound"
  access                     = "Allow"
  protocol                   = "Tcp"
  source_port_range          = "*"
  destination_port_range     = "443"
  source_address_prefix      = "*"
  destination_address_prefix = "*"

  resource_group_name         = azurerm_resource_group.main.name
  network_security_group_name = azurerm_network_security_group.backend.name
}


# ============================================================
# 10. NETWORK INTERFACE
# ============================================================

resource "azurerm_network_interface" "backend" {
  name                = "${local.name_prefix}-backend-nic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.backend.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.backend.id
  }

  tags = local.common_tags
}


# ============================================================
# 11. ASOCIAR NSG A LA INTERFAZ DE RED
# ============================================================

resource "azurerm_network_interface_security_group_association" "backend" {
  network_interface_id      = azurerm_network_interface.backend.id
  network_security_group_id = azurerm_network_security_group.backend.id
}


# ============================================================
# 12. MAQUINA VIRTUAL LINUX
# ============================================================

resource "azurerm_linux_virtual_machine" "backend" {
  name                = "${local.name_prefix}-backend"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  size = var.vm_size

  admin_username                  = var.admin_username
  disable_password_authentication = true

  network_interface_ids = [
    azurerm_network_interface.backend.id
  ]

  admin_ssh_key {
    username = var.admin_username

    public_key = file(
      pathexpand(var.ssh_public_key_path)
    )
  }

  os_disk {
    name                 = "${local.name_prefix}-backend-osdisk"
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = 30
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }

  tags = local.common_tags

  depends_on = [
    azurerm_network_interface_security_group_association.backend
  ]
}


# ============================================================
# 13. OUTPUTS
# ============================================================

output "resource_group_name" {
  description = "Nombre del Resource Group"
  value       = azurerm_resource_group.main.name
}

output "backend_vm_id" {
  description = "ID de la maquina virtual"
  value       = azurerm_linux_virtual_machine.backend.id
}

output "backend_public_ip" {
  description = "IP publica del servidor backend"
  value       = azurerm_public_ip.backend.ip_address
}

output "backend_private_ip" {
  description = "IP privada del backend"
  value       = azurerm_network_interface.backend.private_ip_address
}

output "backend_ssh_command" {
  description = "Comando para acceder por SSH"
  value       = "ssh -i ~/.ssh/terraform-lab ${var.admin_username}@${azurerm_public_ip.backend.ip_address}"
}

output "virtual_network_id" {
  description = "ID de la red virtual"
  value       = azurerm_virtual_network.main.id
}
