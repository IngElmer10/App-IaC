terraform {
  required_version = ">= 1.10"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.69.1"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "AttendancePlatformMVP", Tenant = var.tenant_slug, TenantId = var.tenant_id, Environment = var.environment, ManagedBy = "Terraform" }
  }
}

variable "region" { type = string }
variable "tenant_id" { type = string }
variable "tenant_slug" { type = string }
variable "environment" { type = string }
variable "instance_type" { type = string }
variable "storage_gb" { type = number }
variable "frontend_storage_gb" {
  type    = number
  default = 20
}
variable "legacy_migration" {
  type    = bool
  default = false
}
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "allowed_cidr" { type = string }
variable "artifact_bucket" { type = string }
variable "artifact_key" { type = string }
variable "parameter_name" { type = string }

locals {
  roles = toset(["frontend", "backend", "database"])
}

data "aws_caller_identity" "current" {}
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

moved {
  from = aws_instance.tenant
  to   = aws_instance.nodes["frontend"]
}
moved {
  from = aws_security_group.tenant
  to   = aws_security_group.frontend
}
moved {
  from = aws_iam_role.tenant
  to   = aws_iam_role.nodes["frontend"]
}
moved {
  from = aws_iam_role_policy_attachment.ssm
  to   = aws_iam_role_policy_attachment.ssm["frontend"]
}
moved {
  from = aws_iam_role_policy.tenant_data
  to   = aws_iam_role_policy.data["frontend"]
}
moved {
  from = aws_iam_instance_profile.tenant
  to   = aws_iam_instance_profile.nodes["frontend"]
}

resource "aws_security_group" "frontend" {
  name_prefix = "mvp-${var.tenant_slug}-"
  description = "Tenant HTTP limited to the presentation network"
  vpc_id      = var.vpc_id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.allowed_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.tenant_slug}-frontend-${var.environment}", Role = "frontend" }
}

resource "aws_security_group" "backend" {
  name_prefix = "mvp-${var.tenant_slug}-backend-"
  description = "API accessible only from the tenant frontend"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }
  ingress {
    from_port       = 9100
    to_port         = 9100
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.tenant_slug}-backend-${var.environment}", Role = "backend" }
}

resource "aws_security_group" "database" {
  name_prefix = "mvp-${var.tenant_slug}-database-"
  description = "PostgreSQL is reachable only by this tenant backend"
  vpc_id      = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.backend.id]
  }
  ingress {
    from_port       = 9100
    to_port         = 9100
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }
  ingress {
    from_port       = 9187
    to_port         = 9187
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.tenant_slug}-database-${var.environment}", Role = "database" }
}

resource "aws_iam_role" "nodes" {
  for_each           = local.roles
  name_prefix        = each.key == "frontend" ? "mvp-${var.tenant_slug}-" : "mvp-${var.tenant_slug}-${each.key}-"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  for_each   = local.roles
  role       = aws_iam_role.nodes[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "data" {
  for_each = local.roles
  role     = aws_iam_role.nodes[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "arn:aws:s3:::${var.artifact_bucket}/mvp/artifacts/*" },
      { Effect = "Allow", Action = ["ssm:GetParameter"], Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.parameter_name}/${each.key}" },
      { Effect = "Deny", Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"], NotResource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.parameter_name}/${each.key}" }
      ], each.key == "database" || (each.key == "frontend" && var.legacy_migration) ? [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = "arn:aws:s3:::${var.artifact_bucket}/mvp/backups/${var.tenant_id}/*" }
    ] : [])
  })
}

resource "aws_iam_instance_profile" "nodes" {
  for_each    = local.roles
  name_prefix = each.key == "frontend" ? "mvp-${var.tenant_slug}-" : "mvp-${var.tenant_slug}-${each.key}-"
  role        = aws_iam_role.nodes[each.key].name
}

resource "aws_instance" "nodes" {
  for_each                    = local.roles
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [each.key == "frontend" ? aws_security_group.frontend.id : each.key == "backend" ? aws_security_group.backend.id : aws_security_group.database.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.nodes[each.key].name
  depends_on                  = [aws_iam_role_policy.data, aws_iam_role_policy_attachment.ssm]
  user_data = templatefile("${path.module}/cloud-init.sh.tftpl", {
    region         = var.region, artifact_bucket = var.artifact_bucket, artifact_key = var.artifact_key,
    parameter_name = "${var.parameter_name}/${each.key}", service_role = each.key
  })
  root_block_device {
    volume_size           = each.key == "database" ? var.storage_gb : each.key == "frontend" ? var.frontend_storage_gb : 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  dynamic "credit_specification" {
    for_each = startswith(var.instance_type, "t") ? [1] : []
    content { cpu_credits = "standard" }
  }
  lifecycle { ignore_changes = [ami, user_data] }
  tags = { Name = "${var.tenant_slug}-${each.key}-${var.environment}", Role = each.key }
}

output "instance_id" { value = aws_instance.nodes["frontend"].id }
output "public_ip" { value = aws_instance.nodes["frontend"].public_ip }
output "resources" {
  value = [for role in ["frontend", "backend", "database"] : {
    role         = role, instanceId = aws_instance.nodes[role].id, privateIp = aws_instance.nodes[role].private_ip,
    publicIp     = aws_instance.nodes[role].public_ip, name = "${var.tenant_slug}-${role}-${var.environment}",
    instanceType = aws_instance.nodes[role].instance_type, storageGb = aws_instance.nodes[role].root_block_device[0].volume_size
  }]
}
