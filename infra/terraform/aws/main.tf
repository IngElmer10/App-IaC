# ============================================================
# 1. TERRAFORM Y PROVIDER
# ============================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = "iac"
}


# ============================================================
# 2. VARIABLES
# ============================================================

variable "aws_region" {
  description = "Region de AWS"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Entorno de despliegue"
  type        = string
  default     = "dev"
}

variable "company" {
  description = "Nombre de la empresa"
  type        = string
  default     = "globamatic"
}

variable "instance_type" {
  description = "Tipo de instancia EC2"
  type        = string
  default     = "t3.micro"
}

variable "allowed_ssh_cidr" {
  description = "Direccion IPv4 publica autorizada para SSH /32"
  type        = string

  validation {
    condition = (
      can(cidrnetmask(var.allowed_ssh_cidr)) &&
      endswith(var.allowed_ssh_cidr, "/32") &&
      var.allowed_ssh_cidr != "0.0.0.0/32"
    )
    error_message = "Introduce una IPv4 en formato x.x.x.x/32."
  }
}

variable "ssh_public_key_path" {
  description = "Ruta de la clave publica SSH"
  type        = string
  default     = "~/.ssh/terraform-lab.pub"
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
    Role        = "Frontend"
  }
}


# ============================================================
# 4. CONSULTAR IMAGEN OFICIAL DE UBUNTU
# ============================================================

data "aws_ami" "ubuntu" {
  most_recent = true

  # Canonical - Publicador oficial de Ubuntu
  owners = ["099720109477"]

  filter {
    name = "name"
    values = [
      "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
    ]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}


# ============================================================
# 5. VPC
# ============================================================

resource "aws_vpc" "main" {
  cidr_block = "10.10.0.0/16"

  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}


# ============================================================
# 6. SUBRED PUBLICA
# ============================================================

resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id

  cidr_block = "10.10.1.0/24"

  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-subnet"
  })
}


# ============================================================
# 7. INTERNET GATEWAY
# ============================================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}


# ============================================================
# 8. TABLA DE RUTAS PUBLICA
# ============================================================

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}


# ============================================================
# 9. SECURITY GROUP DEL FRONTEND
# ============================================================

resource "aws_security_group" "frontend" {
  name_prefix = "${local.name_prefix}-frontend-"

  description = "Security Group para servidor frontend"

  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-frontend-sg"
  })
}


# SSH - SOLO IP AUTORIZADA
resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.frontend.id

  description = "Acceso SSH administrativo"

  cidr_ipv4   = var.allowed_ssh_cidr
  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"
}


# HTTP - ACCESO PUBLICO
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.frontend.id

  description = "Acceso HTTP"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}


# HTTPS - ACCESO PUBLICO
resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.frontend.id

  description = "Acceso HTTPS"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
}


# TRAFICO SALIENTE
resource "aws_vpc_security_group_egress_rule" "outbound" {
  security_group_id = aws_security_group.frontend.id

  description = "Permitir salida a Internet"

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}


# ============================================================
# 10. CLAVE SSH PARA ADMINISTRACION
# ============================================================

resource "aws_key_pair" "frontend" {
  key_name = "${local.name_prefix}-frontend-key"

  public_key = file(
    pathexpand(var.ssh_public_key_path)
  )

  tags = local.common_tags
}


# ============================================================
# 11. INSTANCIA EC2 UBUNTU - FRONTEND
# ============================================================

resource "aws_instance" "frontend" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  subnet_id = aws_subnet.public.id

  vpc_security_group_ids = [
    aws_security_group.frontend.id
  ]

  associate_public_ip_address = true

  key_name = aws_key_pair.frontend.key_name

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 16
    encrypted   = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-frontend"
  })

  depends_on = [
    aws_route_table_association.public
  ]
}


# ============================================================
# 12. OUTPUTS
# ============================================================

output "frontend_instance_id" {
  description = "Identificador EC2"
  value       = aws_instance.frontend.id
}

output "frontend_public_ip" {
  description = "IP publica del servidor"
  value       = aws_instance.frontend.public_ip
}

output "frontend_public_dns" {
  description = "DNS publico de la instancia"
  value       = aws_instance.frontend.public_dns
}

output "frontend_ssh_command" {
  description = "Comando para acceder por SSH"
  value       = "ssh -i ~/.ssh/terraform-lab ubuntu@${aws_instance.frontend.public_ip}"
}

output "vpc_id" {
  description = "Identificador de VPC"
  value       = aws_vpc.main.id
}

output "subnet_id" {
  description = "Identificador de subred"
  value       = aws_subnet.public.id
}
