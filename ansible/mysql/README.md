# MySQL Installation Playbook

This directory contains the MySQL installation and configuration playbook.

## Structure

```
mysql/
├── playbook.yml          # Main playbook file
├── inventory.example.ini  # Example inventory file
├── role/                 # Ansible role for MySQL
│   ├── defaults/
│   ├── handlers/
│   ├── tasks/
│   └── templates/
└── README.md            # This file
```

## Usage

### From Command Line

```bash
# Single node installation
ansible-playbook -i inventory.ini playbook.yml -e deployment_mode=single

# Cluster installation (primary + secondary)
ansible-playbook -i inventory.ini playbook.yml -e deployment_mode=cluster
```

### Inventory File

Copy `inventory.example.ini` to `inventory.ini` and update with your server details:

```ini
[primary]
mysql-primary ansible_host=YOUR_PRIMARY_IP ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=YOUR_PASSWORD

[secondary]
mysql-secondary ansible_host=YOUR_SECONDARY_IP ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=YOUR_PASSWORD

[mysql:children]
primary
secondary

[all:vars]
ansible_user=ubuntu
ansible_become=true
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
```

## Features

- **Single Mode**: Install MySQL on a single server
- **Cluster Mode**: Set up MySQL replication with primary and secondary nodes
- **Sequential Execution**: Primary completes before secondary starts
- **Automatic Credentials**: Generates and stores MySQL credentials

## Variables

- `deployment_mode`: `single` or `cluster` (default: `single`)

