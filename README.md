# StackBill Ansible Playbook Executor

A lightweight API server for executing Ansible playbooks with dynamic server configurations. Designed to work seamlessly with n8n workflows.

## Features

- 🚀 RESTful API for executing Ansible playbooks
- 🎨 Modern web frontend for easy configuration
- 📦 Support for multiple playbooks:
  - MySQL (with replication)
  - MongoDB (replica set)
  - NFS Server
  - RabbitMQ
- 🔄 Dynamic inventory generation
- 🔌 n8n compatible (lightweight API endpoints)

## Prerequisites

- Node.js 14+ installed
- Ansible installed and configured
  - **Windows users**: Ansible must be installed in WSL (Windows Subsystem for Linux)
  - **Linux/Mac users**: Install Ansible directly
- SSH access to target servers
- Python 3.x on target servers (for Ansible)
- **Windows users**: WSL must be installed and configured

## Installation

1. Install Node.js dependencies:
```bash
npm install
```

2. Verify your setup (optional but recommended):
```bash
npm run verify
```
This will check if Ansible, WSL (Windows), and all required files are properly configured.

3. Ensure Ansible is installed:
```bash
# On Ubuntu/Debian (or WSL)
sudo apt-get update
sudo apt-get install ansible sshpass

# On macOS
brew install ansible
brew install hudochenkov/sshpass/sshpass

# On CentOS/RHEL
sudo yum install ansible

# Windows users: Install in WSL
wsl
sudo apt-get update
sudo apt-get install ansible sshpass
exit
```

Note: `sshpass` is included in the Ansible installation commands above. If you need to install it separately, use the same commands but replace `ansible` with `sshpass`.

## Usage

### Starting the Server

```bash
npm start
```

The server will start on `http://localhost:3000` by default.

### API Endpoints

All endpoints accept POST requests with JSON payloads.

#### Health Check
```
GET /api/health
```

#### Execute MySQL Playbook
```
POST /api/playbook/mysql
```

**Request Body:**
```json
{
  "servers": [
    {
      "hostname": "10.0.0.20",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "role": "primary",
      "ansible_user": "ubuntu"
    },
    {
      "hostname": "10.0.0.21",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "role": "secondary",
      "ansible_user": "ubuntu"
    }
  ],
  "variables": {}
}
```

#### Execute MongoDB Playbook
```
POST /api/playbook/mongodb
```

**Request Body:**
```json
{
  "servers": [
    {
      "hostname": "10.0.0.10",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "role": "primary",
      "ansible_user": "ubuntu"
    },
    {
      "hostname": "10.0.0.11",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "role": "secondary",
      "ansible_user": "ubuntu"
    }
  ],
  "variables": {}
}
```

#### Execute NFS Playbook
```
POST /api/playbook/nfs
```

**Request Body:**
```json
{
  "servers": [
    {
      "hostname": "10.0.0.30",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "ansible_user": "ubuntu"
    }
  ],
  "variables": {
    "disk_device": "/dev/sdb1",
    "client_ip_range": "192.168.43.0/24"
  }
}
```

#### Execute RabbitMQ Playbook
```
POST /api/playbook/rabbitmq
```

**Request Body:**
```json
{
  "servers": [
    {
      "hostname": "10.0.0.40",
      "ssh_port": 22,
      "password": "your-ssh-password",
      "ansible_user": "ubuntu"
    }
  ],
  "variables": {}
}
```

### Response Format

**Success:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "..."
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "stdout": "...",
  "stderr": "..."
}
```

## Web Frontend

Access the web frontend at `http://localhost:3000` after starting the server. The frontend provides:

- Interactive forms for each playbook
- Dynamic server addition/removal
- Real-time execution status
- Output display

## n8n Integration

This API is designed to work seamlessly with n8n workflows. You can use HTTP Request nodes to call the API endpoints.

### Example n8n Workflow Node Configuration

1. Add an HTTP Request node
2. Set method to `POST`
3. Set URL to `http://localhost:3000/api/playbook/mysql` (or your server URL)
4. Set body to JSON with the required structure
5. Enable response parsing

## Server Requirements

### For MySQL/MongoDB Playbooks:
- Ubuntu 22.04+ (recommended)
- SSH access with password or key
- Sudo privileges

### For NFS Playbook:
- Ubuntu 22.04+
- Available disk/partition for NFS storage
- SSH access with password or key
- Sudo privileges

### For RabbitMQ Playbook:
- Ubuntu 22.04+
- SSH access with password or key
- Sudo privileges

## Security Notes

⚠️ **Important Security Considerations:**

1. **Password Storage**: Passwords are passed in plain text. For production:
   - Use SSH keys instead of passwords
   - Implement authentication/authorization
   - Use HTTPS/TLS
   - Store credentials securely

2. **Network Security**: 
   - Don't expose this API to public internet without proper security
   - Use firewall rules to restrict access
   - Consider implementing API authentication

3. **Ansible Configuration**:
   - Review and test playbooks before production use
   - Use Ansible Vault for sensitive data in production

## Troubleshooting

### Windows/WSL Issues

**"ansible-playbook is not recognized"**
- Ensure WSL is installed: `wsl --list --verbose`
- Install Ansible inside WSL: `wsl sudo apt-get install ansible sshpass`
- The API server automatically detects Windows and runs commands through WSL

**Path conversion issues**
- The server automatically converts Windows paths (C:\path) to WSL paths (/mnt/c/path)
- If you encounter path errors, check that WSL can access the files

### Ansible Connection Issues

If you encounter SSH connection issues:

1. Test SSH connection manually:
```bash
# In WSL (Windows) or directly (Linux/Mac)
ssh -p 22 ubuntu@your-server-ip
```

2. Ensure `sshpass` is installed for password authentication:
```bash
# In WSL or Linux
sudo apt-get install sshpass
```

3. For key-based authentication, update the inventory generation in `api-server.js`

### Playbook Execution Errors

1. Check Ansible version:
```bash
# In WSL (Windows) or directly (Linux/Mac)
ansible --version
```

2. Verify Python is available on target servers:
```bash
ansible all -i inventory.ini -m ping
```

3. Review playbook logs in the API response

4. Check WSL can access the playbook files:
```bash
# In WSL
ls -la /mnt/c/stackbill/Course/Node-red/stackwatch-lab/stackbill-ansible/
```

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `nodemon` for automatic server restarts.

### Project Structure

```
stackbill-ansible/
├── ansible/
│   ├── inventories/
│   │   ├── mysql/hosts.ini
│   │   └── mongodb/hosts.ini
│   ├── playbooks/
│   │   ├── mysql.yml
│   │   ├── mongodb.yml
│   │   ├── nfs.yml
│   │   └── rabbitmq.yml
│   └── roles/
│       ├── mysql/
│       ├── mongodb/
│       └── (shared role utilities)
├── backend/
│   ├── api-server.js
│   └── verify-setup.js
├── frontend/
│   └── public/index.html
├── docs/
│   └── QUICKSTART.md
├── integrations/
│   └── n8n-example.json
├── package.json
└── README.md
```

Consult `docs/QUICKSTART.md` for a concise setup walk-through.

## License

MIT

## Support

For issues and questions, please check the playbook-specific documentation in each directory.

