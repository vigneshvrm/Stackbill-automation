# Quick Start Guide

## 1. Install Dependencies

```bash
# Install Node.js packages
npm install

# Install Ansible (if not already installed)
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install ansible sshpass

# macOS:
brew install ansible hudochenkov/sshpass/sshpass

# Windows (must install in WSL):
wsl
sudo apt-get update && sudo apt-get install ansible sshpass
exit
```

## 2. Start the Server

```bash
npm start
```

The server will be available at `http://localhost:3000`

## 3. Use the Web Interface

1. Open your browser and go to `http://localhost:3000`
2. Click on the playbook you want to execute (MySQL, MongoDB, NFS, or RabbitMQ)
3. Fill in the server details:
   - **Hostname/IP**: The IP address or hostname of your server
   - **SSH Port**: Usually 22 (default)
   - **SSH Password**: The password for SSH access
   - **Role**: For MySQL/MongoDB, select primary/secondary/arbiter
4. For NFS, also provide:
   - **Disk Device**: e.g., `/dev/sdb1`
   - **Client IP Range**: e.g., `192.168.43.0/24`
5. Click "Execute Playbook"
6. Wait for the execution to complete and view the results

## 4. Use the API (for n8n or other integrations)

### Example: Execute MySQL Playbook

```bash
curl -X POST http://localhost:3000/api/playbook/mysql \
  -H "Content-Type: application/json" \
  -d '{
    "servers": [
      {
        "hostname": "10.0.0.20",
        "ssh_port": 22,
        "password": "your-password",
        "role": "primary",
        "ansible_user": "ubuntu"
      }
    ],
    "variables": {}
  }'
```

### Example: Execute NFS Playbook

```bash
curl -X POST http://localhost:3000/api/playbook/nfs \
  -H "Content-Type: application/json" \
  -d '{
    "servers": [
      {
        "hostname": "10.0.0.30",
        "ssh_port": 22,
        "password": "your-password",
        "ansible_user": "ubuntu"
      }
    ],
    "variables": {
      "disk_device": "/dev/sdb1",
      "client_ip_range": "192.168.43.0/24"
    }
  }'
```

## 5. n8n Integration

1. Import the example workflow from `n8n-example.json` (optional)
2. Create an HTTP Request node in n8n
3. Configure it to POST to `http://localhost:3000/api/playbook/{playbook-type}`
4. Set the body to JSON with the required structure
5. Connect it to other nodes for notifications or further processing

## Troubleshooting

### "ansible-playbook: command not found"
- **Windows users**: Install Ansible in WSL: `wsl sudo apt-get install ansible sshpass`
- **Linux/Mac users**: Make sure Ansible is installed and in your PATH
- Try: `which ansible-playbook` (in WSL for Windows)
- The API server automatically runs Ansible through WSL on Windows

### SSH Connection Failed
- Verify SSH access manually: `ssh -p 22 user@hostname`
- Ensure `sshpass` is installed for password authentication
- Check firewall rules

### Permission Denied
- Ensure the user has sudo privileges on target servers
- Verify the password is correct

## Next Steps

- Review the full [README.md](../README.md) for detailed documentation
- Customize playbooks in their respective directories
- Set up proper authentication for production use
