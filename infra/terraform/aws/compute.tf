data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_key_pair" "main" {
  key_name   = "allerac-one-key"
  public_key = var.ssh_public_key

  lifecycle {
    ignore_changes = [public_key]
  }
}

resource "aws_instance" "main" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.machine_type
  key_name               = aws_key_pair.main.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.main.id]

  root_block_device {
    volume_size = 50
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/scripts/startup.sh", {
    ssh_user          = var.ssh_user
    github_token      = var.github_token
    github_repo_owner = var.github_repo_owner
    github_repo_name  = var.github_repo_name
    tunnel_token      = cloudflare_zero_trust_tunnel_cloudflared.aws_tunnel.tunnel_token
  })


  tags = { Name = "allerac-one-vm-aws" }

  lifecycle {
    ignore_changes = [user_data, ami]
  }
}

resource "aws_eip_association" "main" {
  instance_id   = aws_instance.main.id
  allocation_id = aws_eip.main.id
}
