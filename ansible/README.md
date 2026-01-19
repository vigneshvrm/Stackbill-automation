# StackBill Ansible Playbooks

This directory contains all Ansible playbooks for deploying the StackBill infrastructure stack.

## Directory Structure

```
ansible/
├── env-check/           # Environment verification playbook
│   └── playbook.yml
├── mysql/               # MySQL installation (single/cluster)
│   ├── playbook.yml
│   └── role/            # MySQL Ansible role
├── mongodb/             # MongoDB installation (single/cluster)
│   ├── playbook.yml
│   └── role/            # MongoDB Ansible role
├── rabbitmq/            # RabbitMQ installation
│   └── playbook.yml
├── nfs/                 # NFS server setup
│   └── playbook.yml
├── kubernetes/          # Kubernetes cluster setup
│   └── playbook.yml
├── loadbalancer/        # Load Balancer (HAProxy/Nginx)
│   ├── playbook.yml
│   └── templates/       # Configuration templates
├── helm/                # Helm package manager installation
│   └── playbook.yml
├── kubectl-istio/       # kubectl and Istio installation
│   └── playbook.yml
├── ssl/                 # SSL certificate generation
│   └── playbook.yml
├── stackbill/           # StackBill application deployment
│   └── playbook.yml
└── inventories/         # Static inventory files (for manual testing)
    ├── mysql/hosts.ini
    ├── mongodb/hosts.ini
    └── kubernetes/hosts.ini
```

## Deployment Order

Follow this order for a complete StackBill deployment (per [StackBill Documentation](https://docs.stackbill.com/docs/deployment/getting-started)):

### 1. Environment Check
```bash
# Verify server prerequisites (network, firewall, connectivity)
ansible-playbook -i inventory.ini env-check/playbook.yml
```

### 2. Kubernetes Cluster
```bash
# Install and initialize K8s cluster (installs NFS client on all nodes)
ansible-playbook -i inventory.ini kubernetes/playbook.yml
```

### 3. RabbitMQ
```bash
# Install RabbitMQ server (installs NFS client)
ansible-playbook -i inventory.ini rabbitmq/playbook.yml
```

### 4. MongoDB (Single or Cluster)
```bash
# Single node (installs NFS client)
ansible-playbook -i inventory.ini mongodb/playbook.yml -e "deployment_mode=single"

# Cluster with Replica Set (Primary + Secondary + Arbiter)
ansible-playbook -i inventory.ini mongodb/playbook.yml -e "deployment_mode=cluster"
```

### 5. MySQL (Single or Cluster)
```bash
# Single node (installs NFS client)
ansible-playbook -i inventory.ini mysql/playbook.yml -e "deployment_mode=single"

# Cluster with Master-Slave Replication (Primary + Secondary)
ansible-playbook -i inventory.ini mysql/playbook.yml -e "deployment_mode=cluster"
```

### 6. NFS Server
```bash
# Setup NFS storage server
ansible-playbook -i inventory.ini nfs/playbook.yml \
  -e "disk_device=/dev/sdb1" \
  -e "client_ip_range=192.168.1.0/24"
```

### 7. Load Balancer
```bash
# Install HAProxy (default)
ansible-playbook -i inventory.ini loadbalancer/playbook.yml \
  -e "load_balancer_type=haproxy" \
  -e "stackbill_domain=stackbill.example.com" \
  -e "backend_servers=192.168.1.31,192.168.1.32"

# Or install Nginx
ansible-playbook -i inventory.ini loadbalancer/playbook.yml \
  -e "load_balancer_type=nginx" \
  -e "stackbill_domain=stackbill.example.com"
```

### 8. Kubectl & Istio
```bash
# Install kubectl CLI and Istio service mesh
ansible-playbook -i inventory.ini kubectl-istio/playbook.yml
```

### 9. Helm
```bash
# Install Helm package manager
ansible-playbook -i inventory.ini helm/playbook.yml
```

### 10. SSL Certificates
```bash
# Self-signed certificate (for testing)
ansible-playbook -i inventory.ini ssl/playbook.yml \
  -e "ssl_certificate_type=self-signed" \
  -e "domain_name=stackbill.example.com"

# Let's Encrypt certificate (recommended for production)
ansible-playbook -i inventory.ini ssl/playbook.yml \
  -e "ssl_certificate_type=letsencrypt" \
  -e "domain_name=stackbill.example.com"
```

### 11. StackBill Application
```bash
ansible-playbook -i inventory.ini stackbill/playbook.yml \
  -e "mysql_server=192.168.1.10" \
  -e "mongodb_server=192.168.1.20" \
  -e "rabbitmq_server=192.168.1.30" \
  -e "nfs_server_ip=192.168.1.40"
```

## NFS Client Installation

All playbooks (MySQL, MongoDB, RabbitMQ, Kubernetes) automatically install `nfs-common` package to enable NFS file storage access for StackBill. This follows the [StackBill documentation](http://docs.stackbill.com/docs/deployment/installing-stackbill-components/installing-nfs/) requirement.

## Inventory File Formats

### MySQL Inventory
```ini
[primary]
mysql-primary ansible_host=192.168.1.10 ansible_user=root ansible_ssh_pass=password

[secondary]
mysql-secondary ansible_host=192.168.1.11 ansible_user=root ansible_ssh_pass=password

[mysql:children]
primary
secondary

[all:vars]
ansible_become=true
```

### MongoDB Inventory
```ini
[primary]
mongo-primary ansible_host=192.168.1.20 ansible_user=root ansible_ssh_pass=password

[secondary]
mongo-secondary ansible_host=192.168.1.21 ansible_user=root ansible_ssh_pass=password

[arbiter]
mongo-arbiter ansible_host=192.168.1.22 ansible_user=root ansible_ssh_pass=password

[mongo:children]
primary
secondary
arbiter

[all:vars]
ansible_become=true
```

### Kubernetes Inventory
```ini
[master]
k8s-master ansible_host=192.168.1.30 ansible_user=root ansible_ssh_pass=password

[worker]
k8s-worker-1 ansible_host=192.168.1.31 ansible_user=root ansible_ssh_pass=password
k8s-worker-2 ansible_host=192.168.1.32 ansible_user=root ansible_ssh_pass=password

[kubernetes:children]
master
worker

[all:vars]
ansible_become=true
```

### Generic Inventory (NFS, RabbitMQ, etc.)
```ini
[all]
server-0 ansible_host=192.168.1.40 ansible_user=root ansible_ssh_pass=password

[all:vars]
ansible_become=true
```

## Playbook Variables Reference

### MySQL Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `deployment_mode` | `single` | `single` or `cluster` |
| `mysql_credentials_path` | `/tmp/mysql_credentials.txt` | Where credentials are stored |

### MongoDB Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `deployment_mode` | `single` | `single` or `cluster` |
| `mongodb_version` | `7.0.14` | MongoDB version to install |
| `mongodb_credentials_path` | `/tmp/mongodb_credentials.txt` | Where credentials are stored |
| `mongodb_repl_set_name` | `sb-mongo-repl` | Replica set name (cluster mode) |

### RabbitMQ Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `creds_file` | `/tmp/rabbitmq_credentials.txt` | Where credentials are stored |

### NFS Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `disk_device` | `/dev/sdb1` | Disk device to format and mount |
| `mount_point` | `/storage` | Mount point directory |
| `export_dir` | `/storage/k8-data` | NFS export directory |
| `client_ip_range` | `192.168.43.0/24` | Allowed client IP range |

### Kubernetes Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `kubernetes_version` | `1.30` | Kubernetes version |
| `pod_network_cidr` | `10.244.0.0/16` | Pod network CIDR (Flannel) |
| `lb_ip` | Master IP | Load balancer / API server IP |

### SSL Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `ssl_certificate_type` | `self-signed` | `self-signed` or `letsencrypt` |
| `domain_name` | `stackbill.local` | Domain name for certificate |
| `validity_days` | `365` | Certificate validity (self-signed) |
| `output_directory` | `/etc/ssl/stackbill` | Where certificates are saved |

### StackBill Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `mysql_server` | (required) | MySQL server IP |
| `mysql_username` | `stackbill` | MySQL username |
| `mysql_password` | (required) | MySQL password |
| `mongodb_server` | (required) | MongoDB server IP |
| `mongodb_username` | `admin` | MongoDB username |
| `mongodb_password` | (required) | MongoDB password |
| `rabbitmq_server` | (required) | RabbitMQ server IP |
| `rabbitmq_username` | `mqadmin` | RabbitMQ username |
| `rabbitmq_password` | (required) | RabbitMQ password |
| `nfs_server_ip` | (required) | NFS server IP |
| `nfs_export_path` | `/storage/k8-data` | NFS export path |
| `stackbill_domain` | `stackbill.local` | Application domain |

## Credential Output Locations

After playbook execution, credentials are stored at:

| Service | File Path | Format |
|---------|-----------|--------|
| MySQL | `/tmp/mysql_credentials.txt` | `MYSQL_USER=xxx`<br>`MYSQL_PASS=xxx` |
| MongoDB | `/tmp/mongodb_credentials.txt` | `MONGODB_ADMIN_USER=xxx`<br>`MONGODB_ADMIN_PASSWORD=xxx` |
| RabbitMQ | `/tmp/rabbitmq_credentials.txt` | `RABBITMQ_USER=xxx`<br>`RABBITMQ_PASS=xxx` |

## Requirements

- **Target OS**: Ubuntu 22.04 or later
- **Ansible**: 2.12 or later
- **Python**: 3.8 or later (on control node)

## API Integration

These playbooks are designed to be executed via the StackBill Deployment Center API. The API:

1. Generates dynamic inventory files based on server configurations
2. Executes playbooks with streaming output (SSE)
3. Parses credential output for storage in the database
4. Supports both password and SSH key authentication

See the [API Documentation](../docs/API_DOCUMENTATION.md) for endpoint details.

## Troubleshooting

### Common Issues

1. **SSH Connection Refused**
   - Ensure SSH is enabled on target servers
   - Check firewall allows port 22
   - Verify credentials are correct

2. **Ansible Command Not Found**
   - Install Ansible: `pip install ansible`
   - On Windows: Use WSL with Ansible installed

3. **Permission Denied**
   - Use `ansible_become=true` for sudo access
   - Provide `ansible_become_pass` if sudo requires password

4. **Playbook Fails on Ubuntu Version Check**
   - Playbooks require Ubuntu 22.04+
   - Consider upgrading target servers

### Debug Mode

Run playbooks with verbose output:
```bash
ansible-playbook -i inventory.ini playbook.yml -vvv
```

### Check Mode (Dry Run)

Preview changes without applying:
```bash
ansible-playbook -i inventory.ini playbook.yml --check
```
