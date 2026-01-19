# MongoDB Installation Playbook

This directory contains the MongoDB installation and configuration playbook.

## Structure

```
mongodb/
├── playbook.yml          # Main playbook file
├── inventory.example.ini  # Example inventory file
├── role/                 # Ansible role for MongoDB
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

# Cluster installation (replica set with primary, secondary, arbiter)
ansible-playbook -i inventory.ini playbook.yml -e deployment_mode=cluster
```

### Inventory File

Copy `inventory.example.ini` to `inventory.ini` and update with your server details:

```ini
[primary]
mongo-primary ansible_host=YOUR_PRIMARY_IP ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=YOUR_PASSWORD

[secondary]
mongo-secondary ansible_host=YOUR_SECONDARY_IP ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=YOUR_PASSWORD

[arbiter]
mongo-arbiter ansible_host=YOUR_ARBITER_IP ansible_port=22 ansible_user=ubuntu ansible_ssh_pass=YOUR_PASSWORD

[mongo:children]
primary
secondary
arbiter

[all:vars]
ansible_user=ubuntu
ansible_become=true
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
```

## Features

- **Single Mode**: Install MongoDB on a single server
- **Cluster Mode**: Set up MongoDB replica set with primary, secondary, and arbiter nodes
- **Sequential Execution**: Primary completes before secondary/arbiter start
- **Keyfile Distribution**: Automatically distributes keyfile from primary to other nodes
- **Automatic Credentials**: Generates and stores MongoDB admin credentials

## Variables

- `deployment_mode`: `single` or `cluster` (default: `single`)

