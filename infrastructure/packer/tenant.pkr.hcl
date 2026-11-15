packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = ">= 1.3.0"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

source "amazon-ebs" "tenant" {
  region        = var.region
  instance_type = "t3.small"
  ssh_username  = "ubuntu"
  ami_name      = "tenantforge-base-{{timestamp}}"
  source_ami_filter {
    filters = {
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["099720109477"]
    most_recent = true
  }
  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  tags = { Project = "AttendancePlatformMVP", Purpose = "PreconfiguredBase" }
}

build {
  sources = ["source.amazon-ebs.tenant"]
  provisioner "shell" {
    inline = [
      "sudo apt-get update -qq",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates nginx postgresql-common prometheus prometheus-node-exporter",
      "curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs",
      "sudo apt-get clean"
    ]
  }
}
