# NFS Server Installation Playbook

This directory contains the NFS server installation and configuration playbook.

## Structure

```
nfs/
├── playbook.yml          # Main playbook file
└── README.md            # This file
```

## Usage

### From Command Line

```bash
ansible-playbook -i inventory.ini playbook.yml \
  -e disk_device=/dev/sdb1 \
  -e client_ip_range=192.168.43.0/24
```

### Required Variables

- `disk_device`: Disk device to format and mount (e.g., `/dev/sdb1`)
- `client_ip_range`: IP range allowed to access NFS share (e.g., `192.168.43.0/24`)

## Features

- Formats disk with XFS filesystem
- Creates NFS export directory
- Configures NFS exports
- Enables and starts NFS service

