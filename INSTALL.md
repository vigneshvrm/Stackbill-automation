# StackBill Deployment Center - Installation Guide

This document provides instructions for installing and deploying the StackBill Deployment Center on a production server.

## Table of Contents

- [Requirements](#requirements)
- [Quick Install](#quick-install)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Service Management](#service-management)
- [Patch Management](#patch-management)
- [Troubleshooting](#troubleshooting)
- [Upgrading](#upgrading)
- [Uninstallation](#uninstallation)

## Requirements

### Minimum System Requirements

- **OS**: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+
- **CPU**: 2 cores
- **RAM**: 2GB minimum, 4GB recommended
- **Disk**: 20GB free space
- **Network**: Internet access for package installation

### Software Dependencies

- Node.js 18.x or higher
- Ansible 2.9 or higher
- Python 3.8 or higher
- Git

## Quick Install

For a quick installation on a supported Linux distribution:

```bash
# Clone the repository
git clone https://github.com/vigneshvrm/Stackbill-automation.git
cd Stackbill-automation

# Run the installer (as root)
sudo bash scripts/install.sh
```

### Installation Options

```bash
# Custom port
sudo bash scripts/install.sh --port 8080

# Custom installation directory
sudo bash scripts/install.sh --install-dir /srv/stackbill

# Custom service user
sudo bash scripts/install.sh --user myuser
```

## Manual Installation

### Step 1: Install Dependencies

#### Ubuntu/Debian

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Ansible and Python
sudo apt-get install -y ansible python3-pip git
```

#### CentOS/RHEL

```bash
# Update system
sudo dnf update -y

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install Ansible
sudo dnf install -y epel-release
sudo dnf install -y ansible python3-pip git
```

### Step 2: Create Service User

```bash
# Create a dedicated user for the service
sudo useradd -r -m -d /home/stackbill -s /bin/bash stackbill
```

### Step 3: Install Application

```bash
# Clone repository
sudo git clone https://github.com/vigneshvrm/Stackbill-automation.git /opt/stackbill-deploy

# Set ownership
sudo chown -R stackbill:stackbill /opt/stackbill-deploy

# Install dependencies
cd /opt/stackbill-deploy
sudo -u stackbill npm install --production

# Create required directories
sudo -u stackbill mkdir -p data logs backend/.inventory
sudo chmod 700 data logs
```

### Step 4: Configure Systemd Service

```bash
# Copy service file
sudo cp scripts/stackbill-deploy.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable stackbill-deploy
sudo systemctl start stackbill-deploy
```

### Step 5: Configure Firewall

#### UFW (Ubuntu/Debian)

```bash
sudo ufw allow 3000/tcp
```

#### Firewalld (CentOS/RHEL)

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## Configuration

### Environment Variables

Create a `.env` file in the installation directory:

```bash
# Port to run the server on
PORT=3000

# Node environment
NODE_ENV=production
```

### Ansible Configuration

The application uses Ansible to execute playbooks. Ensure the service user has:

1. SSH key-based authentication to target servers
2. Sudo privileges on target servers (if required)

```bash
# Generate SSH key for stackbill user
sudo -u stackbill ssh-keygen -t ed25519 -N "" -f /home/stackbill/.ssh/id_ed25519

# Copy SSH key to target servers
sudo -u stackbill ssh-copy-id user@target-server
```

### Reverse Proxy (Optional)

For production, it's recommended to use Nginx as a reverse proxy:

```nginx
# /etc/nginx/sites-available/stackbill
server {
    listen 80;
    server_name deploy.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # SSE support for streaming playbook output
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

## Service Management

### Common Commands

```bash
# Check service status
sudo systemctl status stackbill-deploy

# Start service
sudo systemctl start stackbill-deploy

# Stop service
sudo systemctl stop stackbill-deploy

# Restart service
sudo systemctl restart stackbill-deploy

# View logs (systemd journal)
sudo journalctl -u stackbill-deploy -f

# View application logs
sudo tail -f /opt/stackbill-deploy/logs/stackbill.log
```

### Health Check

```bash
# Check if API is responding
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"ok","message":"Ansible API Server is running"}
```

## Patch Management

The Patch Manager provides zero-downtime updates, automatic backups, and easy rollback capabilities.

### Using the Patch Manager

```bash
# Check current status and version
sudo /opt/stackbill-deploy/scripts/patch-manager.sh status

# Check for available updates
sudo /opt/stackbill-deploy/scripts/patch-manager.sh check

# Apply updates (automatically creates backup)
sudo /opt/stackbill-deploy/scripts/patch-manager.sh update

# Force update even if no changes detected
sudo /opt/stackbill-deploy/scripts/patch-manager.sh update --force

# Run health checks
sudo /opt/stackbill-deploy/scripts/patch-manager.sh health
```

### Backup Management

```bash
# Create a manual backup
sudo /opt/stackbill-deploy/scripts/patch-manager.sh backup

# List all available backups
sudo /opt/stackbill-deploy/scripts/patch-manager.sh backups

# Rollback to a specific backup
sudo /opt/stackbill-deploy/scripts/patch-manager.sh rollback backup_20240115_143022_abc123

# Rollback to the most recent backup
sudo /opt/stackbill-deploy/scripts/patch-manager.sh rollback-last
```

### Update Process

When you run `patch-manager.sh update`, the following happens:

1. **Check for updates** - Compares local version with remote
2. **Create backup** - Saves current state (data, config, version)
3. **Pull changes** - Downloads latest code from repository
4. **Update dependencies** - Runs `npm install --production`
5. **Graceful restart** - Restarts service with minimal downtime
6. **Verify** - Checks if service started successfully
7. **Auto-rollback** - If service fails, automatically restores backup

### Backup Retention

- Backups are stored in `/opt/stackbill-deploy/backups/`
- Maximum 5 backups are kept (configurable)
- Each backup includes: database, logs, configuration, version info

### Zero-Downtime Updates

The service is configured for graceful shutdown:
- Active connections are allowed to complete (up to 25 seconds)
- New connections are held briefly during restart
- Typical restart time: 2-3 seconds

## Troubleshooting

### Service Won't Start

1. Check logs for errors:
   ```bash
   sudo journalctl -u stackbill-deploy -n 100
   ```

2. Verify Node.js is installed:
   ```bash
   node -v
   ```

3. Check file permissions:
   ```bash
   ls -la /opt/stackbill-deploy/
   ```

### Playbook Execution Fails

1. Verify Ansible is installed:
   ```bash
   ansible --version
   ```

2. Test SSH connectivity:
   ```bash
   sudo -u stackbill ssh user@target-server
   ```

3. Check playbook logs:
   ```bash
   sudo tail -f /opt/stackbill-deploy/logs/stackbill.log
   ```

### Database Issues

1. Check database file permissions:
   ```bash
   ls -la /opt/stackbill-deploy/data/
   ```

2. Reset database (WARNING: This will delete all data):
   ```bash
   sudo -u stackbill rm /opt/stackbill-deploy/data/stackbill.db
   sudo systemctl restart stackbill-deploy
   ```

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process or change the port in .env
```

## Upgrading

### From Git

```bash
# Stop service
sudo systemctl stop stackbill-deploy

# Backup data
sudo cp -r /opt/stackbill-deploy/data /opt/stackbill-deploy-backup

# Pull latest changes
cd /opt/stackbill-deploy
sudo -u stackbill git pull origin main

# Install any new dependencies
sudo -u stackbill npm install --production

# Start service
sudo systemctl start stackbill-deploy
```

### Verify Upgrade

```bash
# Check service status
sudo systemctl status stackbill-deploy

# Check logs for any errors
sudo journalctl -u stackbill-deploy -n 50
```

## Uninstallation

### Using Uninstall Script

```bash
sudo bash /opt/stackbill-deploy/scripts/uninstall.sh
```

### Manual Uninstallation

```bash
# Stop and disable service
sudo systemctl stop stackbill-deploy
sudo systemctl disable stackbill-deploy

# Remove service file
sudo rm /etc/systemd/system/stackbill-deploy.service
sudo systemctl daemon-reload

# Remove application (optional: keep data)
sudo rm -rf /opt/stackbill-deploy

# Remove user (optional)
sudo userdel -r stackbill
```

## Security Recommendations

1. **Use HTTPS**: Always use a reverse proxy with SSL/TLS certificates
2. **Firewall**: Only expose necessary ports
3. **SSH Keys**: Use SSH key-based authentication for Ansible
4. **Regular Updates**: Keep Node.js, Ansible, and the system updated
5. **Backup**: Regularly backup the `/opt/stackbill-deploy/data/` directory
6. **Access Control**: Limit access to the web interface via IP whitelisting

## Support

For issues and feature requests, please visit:
https://github.com/vigneshvrm/Stackbill-automation/issues
