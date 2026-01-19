# StackBill Deployment Center - API Documentation

Complete API reference for frontend development. All endpoints are RESTful and return JSON responses.

---

## Table of Contents

1. [Overview](#overview)
2. [Health Check API](#health-check-api)
3. [Playbook Execution APIs](#playbook-execution-apis)
4. [Session Management APIs](#session-management-apis)
5. [Server Management APIs](#server-management-apis)
6. [Credentials APIs](#credentials-apis)
7. [Step Management APIs](#step-management-apis)
8. [SSL Configuration APIs](#ssl-configuration-apis)
9. [File Management APIs](#file-management-apis)
10. [Global Settings APIs](#global-settings-apis)
11. [Data Models](#data-models)
12. [Server-Sent Events (SSE)](#server-sent-events-sse)
13. [Error Handling](#error-handling)

---

## Overview

### Base URL
```
http://localhost:3000
```

### Default Port
The server runs on port `3000` by default. Override with `PORT` environment variable.

### Request Headers
```
Content-Type: application/json
Accept: application/json
```

For streaming endpoints:
```
Accept: text/event-stream
```

### Standard Response Format

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "error": "Error message description"
}
```

### Static Files
Static files are served from `frontend/public/` directory.

| Path | Description |
|------|-------------|
| `/` | Redirects to `/sessions.html` |
| `/sessions.html` | Main deployment sessions page |
| `/settings.html` | Global settings configuration |
| `/index.html` | Deployment wizard interface |

---

## Health Check API

### GET /api/health
Check if the API server is running.

**Request:**
```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "message": "Ansible API Server is running"
}
```

**Usage:**
```javascript
const response = await fetch('/api/health');
const data = await response.json();
console.log(data.status); // "ok"
```

---

## Playbook Execution APIs

All playbook endpoints support two modes:
1. **Standard Mode**: Returns full result after completion
2. **Streaming Mode**: Returns real-time progress via Server-Sent Events (SSE)

### Common Request Body Structure

```typescript
interface PlaybookRequest {
  servers: Server[];         // Required: Array of target servers
  variables?: object;        // Optional: Extra variables for playbook
}

interface Server {
  hostname: string;          // Required: IP address or hostname
  ssh_port?: number;         // Default: 22
  ssh_auth_type?: 'password' | 'key';  // Default: 'password'
  ssh_user?: string;         // Default: 'root'
  ssh_user_type?: 'root' | 'sudo';     // Default: 'root'
  password?: string;         // Required if ssh_auth_type is 'password'
  ssh_key?: string;          // Required if ssh_auth_type is 'key'
  sudo_password?: string;    // Required if ssh_user_type is 'sudo'
  role?: string;             // Role for inventory grouping
}
```

### Enable Streaming Mode

Add query parameter `?stream=true` OR set header `Accept: text/event-stream`

---

### POST /api/playbook/mysql
Execute MySQL installation and configuration playbook.

**Roles:**
- `primary` - MySQL primary/master node
- `secondary` - MySQL replica/slave node

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.10",
      "password": "server_password",
      "role": "primary"
    },
    {
      "hostname": "192.168.1.11",
      "password": "server_password",
      "role": "secondary"
    }
  ],
  "variables": {}
}
```

**Response (Standard):**
```json
{
  "success": true,
  "stdout": "PLAY [Install MySQL]...",
  "stderr": "",
  "credentials": {
    "mysql": {
      "username": "root",
      "password": "generated_password",
      "path": "/tmp/mysql_credentials.txt"
    }
  }
}
```

**Usage (Standard):**
```javascript
const response = await fetch('/api/playbook/mysql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    servers: [
      { hostname: '192.168.1.10', password: 'pass123', role: 'primary' }
    ]
  })
});
const result = await response.json();
```

**Usage (Streaming):**
```javascript
const eventSource = new EventSource('/api/playbook/mysql?stream=true');

// Or with POST:
const response = await fetch('/api/playbook/mysql?stream=true', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  },
  body: JSON.stringify({ servers: [...] })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      handleEvent(event);
    }
  }
}
```

---

### POST /api/playbook/mongodb
Execute MongoDB installation and replica set configuration playbook.

**Roles:**
- `primary` - MongoDB primary node
- `secondary` - MongoDB secondary node(s)
- `arbiter` - MongoDB arbiter node (optional)

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.20",
      "password": "server_password",
      "role": "primary"
    },
    {
      "hostname": "192.168.1.21",
      "password": "server_password",
      "role": "secondary"
    },
    {
      "hostname": "192.168.1.22",
      "password": "server_password",
      "role": "arbiter"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "",
  "credentials": {
    "mongodb": {
      "username": "admin",
      "password": "generated_password",
      "path": "/tmp/mongodb_credentials.txt"
    }
  }
}
```

---

### POST /api/playbook/nfs
Execute NFS server installation playbook.

**Required Variables:**
- `disk_device` - Block device for NFS storage (e.g., `/dev/sdb`)
- `client_ip_range` - CIDR range for allowed clients (e.g., `192.168.1.0/24`)

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.30",
      "password": "server_password"
    }
  ],
  "variables": {
    "disk_device": "/dev/sdb",
    "client_ip_range": "192.168.1.0/24"
  }
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": ""
}
```

**Error (Missing Variables):**
```json
{
  "error": "Variables disk_device and client_ip_range are required"
}
```

---

### POST /api/playbook/rabbitmq
Execute RabbitMQ installation and cluster configuration playbook.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.40",
      "password": "server_password"
    },
    {
      "hostname": "192.168.1.41",
      "password": "server_password"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "...",
  "stderr": "",
  "credentials": {
    "rabbitmq": {
      "username": "admin",
      "password": "generated_password"
    }
  }
}
```

---

### POST /api/playbook/env-check
Execute environment verification playbook. Checks network connectivity, firewall, internet access, and system requirements.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.50",
      "password": "server_password"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "Environment checks passed...",
  "stderr": ""
}
```

---

### POST /api/playbook/kubernetes
Execute Kubernetes cluster setup playbook.

**Roles (Required):**
- `master` - Kubernetes control plane node(s) - At least ONE required
- `worker` - Kubernetes worker node(s)

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.100",
      "password": "server_password",
      "role": "master"
    },
    {
      "hostname": "192.168.1.101",
      "password": "server_password",
      "role": "worker"
    },
    {
      "hostname": "192.168.1.102",
      "password": "server_password",
      "role": "worker"
    }
  ]
}
```

**Error (No Master):**
```json
{
  "error": "At least one master node is required"
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "Kubernetes cluster initialized...",
  "stderr": ""
}
```

---

### POST /api/playbook/kubectl
Execute kubectl and Istio installation playbook.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.100",
      "password": "server_password"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "kubectl and Istio installed...",
  "stderr": ""
}
```

---

### POST /api/playbook/helm
Execute Helm package manager installation playbook.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.100",
      "password": "server_password"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "Helm installed...",
  "stderr": ""
}
```

---

### POST /api/playbook/ssl
Execute SSL certificate generation/installation playbook.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.100",
      "password": "server_password"
    }
  ],
  "variables": {
    "domain": "example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "SSL certificates generated...",
  "stderr": ""
}
```

---

### POST /api/playbook/stackbill
Execute StackBill application deployment playbook.

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.100",
      "password": "server_password"
    }
  ],
  "variables": {
    "helm_chart_url": "https://charts.example.com/stackbill-1.0.0.tgz"
  }
}
```

**Response:**
```json
{
  "success": true,
  "stdout": "StackBill deployed...",
  "stderr": ""
}
```

---

## Session Management APIs

Sessions track the complete deployment workflow state, including servers, credentials, and completed steps.

### POST /api/sessions
Create a new deployment session.

**Request:**
```json
{
  "name": "Production Deployment"  // Optional, defaults to "Deployment Session"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "a1b2c3d4e5f67890abcdef1234567890",
    "name": "Production Deployment",
    "status": "in_progress"
  }
}
```

**Usage:**
```javascript
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Deployment' })
});
const { session } = await response.json();
const sessionId = session.id;
```

---

### GET /api/sessions
List all deployment sessions.

**Request:**
```http
GET /api/sessions
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "a1b2c3d4...",
      "name": "Production Deployment",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T12:45:00.000Z",
      "completed_at": null,
      "status": "in_progress",
      "current_step": 3,
      "auto_cleanup": 0,
      "notes": null,
      "steps_completed": 3,
      "steps_with_servers": 2
    }
  ]
}
```

**Usage:**
```javascript
const response = await fetch('/api/sessions');
const { sessions } = await response.json();
sessions.forEach(session => {
  console.log(`${session.name}: ${session.status}`);
});
```

---

### GET /api/sessions/:id
Get complete session details including servers, credentials, and step data.

**Request:**
```http
GET /api/sessions/a1b2c3d4e5f67890abcdef1234567890
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "a1b2c3d4e5f67890abcdef1234567890",
    "name": "Production Deployment",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T12:45:00.000Z",
    "completed_at": null,
    "status": "in_progress",
    "current_step": 3,
    "auto_cleanup": 0,
    "notes": null,
    "completedSteps": ["mysql", "mongodb", "rabbitmq"],
    "servers": {
      "mysql": [
        {
          "id": 1,
          "hostname": "192.168.1.10",
          "ssh_port": 22,
          "ssh_auth_type": "password",
          "ssh_user": "root",
          "ssh_user_type": "root",
          "password": "decrypted_password",
          "ssh_key": null,
          "sudo_password": null,
          "role": "primary",
          "purpose": null,
          "name": null
        }
      ],
      "mongodb": [...]
    },
    "credentials": {
      "mysql": {
        "username": "root",
        "password": "mysql_pass_123"
      },
      "mongodb": {
        "username": "admin",
        "password": "mongo_pass_456"
      }
    },
    "modes": {
      "mysql": "cluster",
      "mongodb": "cluster"
    },
    "sslConfig": {
      "type": "generate",
      "domain": "example.com",
      "certificate": "-----BEGIN CERTIFICATE-----...",
      "privateKey": "-----BEGIN PRIVATE KEY-----..."
    },
    "stepData": {
      "mysql": { "replication_enabled": true },
      "mongodb": { "replica_set_name": "rs0" }
    }
  }
}
```

**Usage:**
```javascript
const response = await fetch(`/api/sessions/${sessionId}`);
const { session } = await response.json();

// Access servers for a specific step
const mysqlServers = session.servers.mysql || [];

// Check if a step is completed
const isMysqlDone = session.completedSteps.includes('mysql');

// Get credentials
const mysqlCreds = session.credentials.mysql;
```

---

### PATCH /api/sessions/:id
Update session properties.

**Allowed Fields:**
- `name` - Session display name
- `status` - `in_progress` | `completed` | `cleaned`
- `current_step` - Current step index (integer)
- `auto_cleanup` - Boolean (0 or 1)
- `notes` - Free-form text
- `completed_at` - ISO datetime string

**Request:**
```json
{
  "name": "Renamed Session",
  "status": "completed",
  "notes": "Deployment completed successfully"
}
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Session not found or no changes made"
}
```

**Usage:**
```javascript
await fetch(`/api/sessions/${sessionId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'completed',
    completed_at: new Date().toISOString()
  })
});
```

---

### DELETE /api/sessions/:id
Delete a session and all related data (servers, credentials, files).

**Request:**
```http
DELETE /api/sessions/a1b2c3d4e5f67890abcdef1234567890
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Session not found"
}
```

**Usage:**
```javascript
if (confirm('Delete this session?')) {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
}
```

---

## Server Management APIs

Manage target servers for each deployment step.

### POST /api/sessions/:id/servers/:stepId
Save servers for a specific step. Replaces any existing servers for that step.

**Path Parameters:**
- `id` - Session ID
- `stepId` - Step identifier (e.g., `mysql`, `mongodb`, `kubernetes`)

**Request:**
```json
{
  "servers": [
    {
      "hostname": "192.168.1.10",
      "ssh_port": 22,
      "ssh_auth_type": "password",
      "ssh_user": "root",
      "ssh_user_type": "root",
      "password": "server_password",
      "role": "primary",
      "name": "MySQL Primary"
    },
    {
      "hostname": "192.168.1.11",
      "ssh_port": 22,
      "ssh_auth_type": "key",
      "ssh_user": "ubuntu",
      "ssh_user_type": "sudo",
      "ssh_key": "-----BEGIN OPENSSH PRIVATE KEY-----...",
      "sudo_password": "sudo_pass",
      "role": "secondary",
      "name": "MySQL Secondary"
    }
  ]
}
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Servers array is required"
}
```

**Usage:**
```javascript
const servers = [
  {
    hostname: '192.168.1.10',
    password: 'pass123',
    role: 'primary'
  }
];

await fetch(`/api/sessions/${sessionId}/servers/mysql`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ servers })
});
```

---

### DELETE /api/sessions/:id/servers/:serverId
Remove a single server by its database ID.

**Path Parameters:**
- `id` - Session ID
- `serverId` - Server database ID (integer)

**Request:**
```http
DELETE /api/sessions/abc123/servers/42
```

**Response:**
```json
{
  "success": true
}
```

**Note:** The `serverId` is the `id` field returned when fetching session details, not the array index.

**Usage:**
```javascript
// Remove a specific server
await fetch(`/api/sessions/${sessionId}/servers/${server.id}`, {
  method: 'DELETE'
});
```

---

## Credentials APIs

Store and retrieve generated credentials from deployments.

### POST /api/sessions/:id/credentials/:service
Save credentials for a service. Uses upsert logic (insert or update).

**Path Parameters:**
- `id` - Session ID
- `service` - Service name (e.g., `mysql`, `mongodb`, `rabbitmq`)

**Request:**
```json
{
  "credentials": {
    "username": "admin",
    "password": "generated_secure_password",
    "host": "192.168.1.10",
    "port": "3306"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Credentials object is required"
}
```

**Usage:**
```javascript
// Save credentials received from playbook execution
await fetch(`/api/sessions/${sessionId}/credentials/mysql`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    credentials: {
      username: result.credentials.mysql.username,
      password: result.credentials.mysql.password
    }
  })
});
```

**Note:** Credentials are automatically saved to the session when executing playbooks via streaming mode. Use this endpoint for manual credential management.

---

## Step Management APIs

Track step completion status and configuration modes.

### POST /api/sessions/:id/steps/:stepId/complete
Mark a step as completed with optional step data.

**Path Parameters:**
- `id` - Session ID
- `stepId` - Step identifier

**Request:**
```json
{
  "stepData": {
    "replication_enabled": true,
    "backup_configured": true,
    "notes": "Completed with 3 replicas"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

**Usage:**
```javascript
// Mark step complete after successful deployment
await fetch(`/api/sessions/${sessionId}/steps/mysql/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stepData: { replication_enabled: true }
  })
});
```

---

### POST /api/sessions/:id/steps/:stepId/mode
Set the configuration mode for a step (e.g., single vs cluster).

**Path Parameters:**
- `id` - Session ID
- `stepId` - Step identifier

**Request:**
```json
{
  "mode": "cluster"
}
```

**Valid Modes (by step):**
- `mysql`: `single`, `cluster`
- `mongodb`: `single`, `cluster`
- `kubernetes`: `single-master`, `multi-master`

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Mode is required"
}
```

**Usage:**
```javascript
// Set MySQL to cluster mode
await fetch(`/api/sessions/${sessionId}/steps/mysql/mode`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'cluster' })
});
```

---

## SSL Configuration APIs

Manage SSL certificate configuration for the deployment.

### POST /api/sessions/:id/ssl-config
Save SSL configuration (generate or upload).

**Request (Generate):**
```json
{
  "config": {
    "type": "generate",
    "domain": "app.example.com"
  }
}
```

**Request (Upload):**
```json
{
  "config": {
    "type": "upload",
    "domain": "app.example.com",
    "certificate": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

**Usage:**
```javascript
// Save SSL config before deployment
await fetch(`/api/sessions/${sessionId}/ssl-config`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    config: {
      type: 'generate',
      domain: 'myapp.example.com'
    }
  })
});
```

---

## File Management APIs

Store and download generated files (configs, certificates, etc.).

### POST /api/sessions/:id/files
Save a generated file to the session.

**Request:**
```json
{
  "stepId": "ssl",
  "filename": "server.crt",
  "content": "-----BEGIN CERTIFICATE-----\n...",
  "mimeType": "application/x-x509-ca-cert"
}
```

**Response:**
```json
{
  "success": true,
  "fileId": 42
}
```

**Common MIME Types:**
- `text/plain` - Default
- `application/json` - JSON configs
- `application/x-x509-ca-cert` - Certificates
- `application/x-pem-file` - PEM files
- `application/x-yaml` - YAML configs

**Usage:**
```javascript
const response = await fetch(`/api/sessions/${sessionId}/files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stepId: 'ssl',
    filename: 'server.crt',
    content: certificateContent,
    mimeType: 'application/x-x509-ca-cert'
  })
});
const { fileId } = await response.json();
```

---

### GET /api/sessions/:id/files
List generated files for a session.

**Query Parameters:**
- `stepId` (optional) - Filter by step

**Request:**
```http
GET /api/sessions/abc123/files
GET /api/sessions/abc123/files?stepId=ssl
```

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "id": 42,
      "step_id": "ssl",
      "filename": "server.crt",
      "mime_type": "application/x-x509-ca-cert",
      "created_at": "2024-01-15T12:00:00.000Z",
      "downloaded": 0
    },
    {
      "id": 43,
      "step_id": "ssl",
      "filename": "server.key",
      "mime_type": "application/x-pem-file",
      "created_at": "2024-01-15T12:00:00.000Z",
      "downloaded": 1
    }
  ]
}
```

**Usage:**
```javascript
const response = await fetch(`/api/sessions/${sessionId}/files?stepId=ssl`);
const { files } = await response.json();
files.forEach(file => {
  console.log(`${file.filename} (downloaded: ${file.downloaded})`);
});
```

---

### GET /api/sessions/:id/files/:fileId/download
Download a generated file. Marks the file as downloaded.

**Request:**
```http
GET /api/sessions/abc123/files/42/download
```

**Response Headers:**
```
Content-Type: application/x-x509-ca-cert
Content-Disposition: attachment; filename="server.crt"
```

**Response Body:**
Raw file content

**Error:**
```json
{
  "error": "File not found"
}
```

**Usage:**
```javascript
// Trigger file download
const link = document.createElement('a');
link.href = `/api/sessions/${sessionId}/files/${fileId}/download`;
link.download = file.filename;
link.click();

// Or fetch content programmatically
const response = await fetch(`/api/sessions/${sessionId}/files/${fileId}/download`);
const content = await response.text();
```

---

### GET /api/sessions/:id/export
Export all session credentials as a JSON file.

**Request:**
```http
GET /api/sessions/abc123/export
```

**Response Headers:**
```
Content-Type: application/json
Content-Disposition: attachment; filename="stackbill-credentials-abc12345.json"
```

**Response Body:**
```json
{
  "sessionId": "abc123...",
  "sessionName": "Production Deployment",
  "exportedAt": "2024-01-15T14:30:00.000Z",
  "credentials": {
    "mysql": {
      "username": "root",
      "password": "mysql_pass"
    },
    "mongodb": {
      "username": "admin",
      "password": "mongo_pass"
    }
  },
  "servers": {
    "mysql": [
      {
        "hostname": "192.168.1.10",
        "role": "primary",
        "purpose": null,
        "name": "MySQL Primary"
      }
    ]
  }
}
```

**Usage:**
```javascript
// Download credentials export
window.location.href = `/api/sessions/${sessionId}/export`;
```

---

### POST /api/sessions/:id/cleanup
Clean up sensitive session data (passwords, keys) while preserving the session record.

**Request:**
```http
POST /api/sessions/abc123/cleanup
```

**Response:**
```json
{
  "success": true,
  "message": "Session cleaned up successfully"
}
```

**What Gets Cleaned:**
- Server passwords and SSH keys
- SSL private keys and certificates
- Session status changes to `cleaned`

**What Is Preserved:**
- Session metadata (name, dates)
- Credentials (separate from SSH passwords)
- Completed steps
- Generated files

**Usage:**
```javascript
// Clean up after successful deployment
await fetch(`/api/sessions/${sessionId}/cleanup`, { method: 'POST' });
```

---

## Global Settings APIs

Manage application-wide configuration settings like deployment URLs.

### GET /api/settings
Get all global settings.

**Request:**
```http
GET /api/settings
```

**Response:**
```json
{
  "success": true,
  "settings": [
    {
      "key": "k8s_common_install_url",
      "value": "https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubernetes/k8-common-installation.sh",
      "description": "Kubernetes common installation script URL",
      "category": "kubernetes",
      "updated_at": "2024-01-15T10:00:00.000Z"
    },
    {
      "key": "helm_deployment_chart_url",
      "value": "https://sb-deployment-controllers.s3.ap-south-1.amazonaws.com/charts/sb-deployment-controller-0.1.0.tgz",
      "description": "StackBill deployment controller Helm chart URL",
      "category": "stackbill",
      "updated_at": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

**Default Settings:**

| Key | Category | Description |
|-----|----------|-------------|
| `k8s_common_install_url` | kubernetes | Kubernetes common installation script |
| `k8s_init_url` | kubernetes | Kubernetes init script (master node) |
| `k8s_default_version` | kubernetes | Default Kubernetes version |
| `helm_deployment_chart_url` | stackbill | StackBill Helm chart URL |
| `helm_release_name` | stackbill | Helm release name |
| `mysql_install_url` | mysql | MySQL installation script |
| `mongodb_install_url` | mongodb | MongoDB installation script |
| `rabbitmq_install_url` | rabbitmq | RabbitMQ installation script |
| `nfs_install_url` | nfs | NFS installation script |
| `kubectl_install_url` | kubectl | Kubectl installation script |
| `istio_install_url` | istio | Istio installation script |
| `helm_install_url` | helm | Helm installation script |

**Usage:**
```javascript
const response = await fetch('/api/settings');
const { settings } = await response.json();

// Group by category
const grouped = settings.reduce((acc, s) => {
  if (!acc[s.category]) acc[s.category] = [];
  acc[s.category].push(s);
  return acc;
}, {});
```

---

### GET /api/settings/category/:category
Get settings for a specific category.

**Request:**
```http
GET /api/settings/category/kubernetes
```

**Response:**
```json
{
  "success": true,
  "settings": [
    {
      "key": "k8s_common_install_url",
      "value": "https://...",
      "description": "...",
      "category": "kubernetes",
      "updated_at": "..."
    }
  ]
}
```

---

### GET /api/settings/:key
Get a single setting by key.

**Request:**
```http
GET /api/settings/helm_deployment_chart_url
```

**Response:**
```json
{
  "success": true,
  "key": "helm_deployment_chart_url",
  "value": "https://sb-deployment-controllers.s3.ap-south-1.amazonaws.com/charts/sb-deployment-controller-0.1.0.tgz"
}
```

**Error:**
```json
{
  "error": "Setting not found"
}
```

**Usage:**
```javascript
const response = await fetch('/api/settings/helm_deployment_chart_url');
const { value } = await response.json();
console.log(`Helm chart URL: ${value}`);
```

---

### PATCH /api/settings/:key
Update a setting's value.

**Request:**
```json
{
  "value": "https://new-url.example.com/chart.tgz"
}
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Setting not found"
}
```

**Usage:**
```javascript
await fetch('/api/settings/helm_deployment_chart_url', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    value: 'https://new-location.com/chart-v2.tgz'
  })
});
```

---

### POST /api/settings
Add a new custom setting.

**Request:**
```json
{
  "key": "custom_script_url",
  "value": "https://example.com/custom.sh",
  "description": "Custom deployment script",
  "category": "custom"
}
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Key and value are required"
}
```

**Usage:**
```javascript
await fetch('/api/settings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'my_custom_url',
    value: 'https://example.com/script.sh',
    description: 'My custom script',
    category: 'custom'
  })
});
```

---

### POST /api/settings/:key/reset
Reset a setting to its default value.

**Request:**
```http
POST /api/settings/helm_deployment_chart_url/reset
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Setting not found or no default available"
}
```

**Note:** Only settings with predefined defaults can be reset. Custom settings will fail.

---

### POST /api/settings/reset-all
Reset ALL settings to their default values.

**Request:**
```http
POST /api/settings/reset-all
```

**Response:**
```json
{
  "success": true,
  "message": "All settings reset to defaults"
}
```

**Warning:** This will overwrite any custom values with the original defaults.

---

### DELETE /api/settings/:key
Delete a setting entirely.

**Request:**
```http
DELETE /api/settings/custom_script_url
```

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "error": "Setting not found"
}
```

---

## Data Models

### Session

```typescript
interface Session {
  id: string;                    // 32-character hex string
  name: string;                  // Display name
  created_at: string;            // ISO datetime
  updated_at: string;            // ISO datetime
  completed_at: string | null;   // ISO datetime when completed
  status: 'in_progress' | 'completed' | 'cleaned';
  current_step: number;          // Current step index
  auto_cleanup: 0 | 1;           // Boolean as integer
  notes: string | null;          // Free-form notes
}
```

### Session (Full Detail)

```typescript
interface SessionDetail extends Session {
  completedSteps: string[];      // Array of step IDs
  servers: {
    [stepId: string]: Server[];  // Servers grouped by step
  };
  credentials: {
    [service: string]: {         // Credentials by service
      [key: string]: string;     // Key-value pairs
    };
  };
  modes: {
    [stepId: string]: string;    // Mode per step
  };
  sslConfig: {
    type: 'generate' | 'upload';
    domain: string;
    certificate: string;
    privateKey: string;
  };
  stepData: {
    [stepId: string]: object;    // Custom data per step
  };
}
```

### Server

```typescript
interface Server {
  id?: number;                   // Database ID (in responses)
  hostname: string;              // IP or hostname
  ssh_port: number;              // Default: 22
  ssh_auth_type: 'password' | 'key';
  ssh_user: string;              // Default: 'root'
  ssh_user_type: 'root' | 'sudo';
  password?: string;             // SSH password
  ssh_key?: string;              // SSH private key
  sudo_password?: string;        // Sudo password
  role?: string;                 // Role for inventory grouping
  purpose?: string;              // Server purpose
  name?: string;                 // Display name
}
```

### Credentials

```typescript
interface Credentials {
  mysql?: {
    username: string;
    password: string;
    path?: string;              // Path to credentials file
  };
  mongodb?: {
    username: string;
    password: string;
    path?: string;
  };
  rabbitmq?: {
    username: string;
    password: string;
  };
}
```

### Setting

```typescript
interface Setting {
  key: string;                   // Unique identifier
  value: string;                 // Setting value
  description: string;           // Human-readable description
  category: string;              // Grouping category
  updated_at: string;            // ISO datetime
}
```

### Generated File

```typescript
interface GeneratedFile {
  id: number;                    // Database ID
  step_id: string;               // Associated step
  filename: string;              // File name
  mime_type: string;             // MIME type
  created_at: string;            // ISO datetime
  downloaded: 0 | 1;             // Boolean as integer
}
```

---

## Server-Sent Events (SSE)

When using streaming mode (`?stream=true`), the server sends events in SSE format.

### Event Format

```
data: {"type":"event_type","field1":"value1","field2":"value2"}\n\n
```

### Event Types

#### task
Indicates a new Ansible task started.

```json
{
  "type": "task",
  "task": "Install MySQL packages",
  "line": "TASK [Install MySQL packages]"
}
```

#### play
Indicates a new Ansible play started.

```json
{
  "type": "play",
  "play": "Configure MySQL Server",
  "line": "PLAY [Configure MySQL Server]"
}
```

#### task_result
Result of a task execution on a host.

```json
{
  "type": "task_result",
  "status": "ok",           // "ok" | "changed" | "fatal" | "skipping"
  "host": "192.168.1.10",
  "task": "Install MySQL packages",
  "message": "Package installed successfully",
  "line": "ok: [192.168.1.10]",
  "credentialUpdate": null  // or { "service": "mysql", "data": {...} }
}
```

**Status Values:**
- `ok` - Task succeeded, no changes made
- `changed` - Task succeeded, changes were made
- `fatal` - Task failed
- `skipping` - Task was skipped

#### status
Ansible playbook status summary.

```json
{
  "type": "status",
  "status": "ok",
  "count": "5",
  "line": "ok=5 changed=2 failed=0"
}
```

#### error
Error output from Ansible.

```json
{
  "type": "error",
  "line": "ERROR: Unable to connect to host"
}
```

#### complete
Playbook execution finished.

**Success:**
```json
{
  "type": "complete",
  "success": true,
  "credentials": {
    "mysql": {
      "username": "root",
      "password": "generated_pass",
      "path": "/tmp/mysql_credentials.txt"
    }
  },
  "stdout": "Full playbook output...",
  "stderr": ""
}
```

**Failure:**
```json
{
  "type": "complete",
  "success": false,
  "error": "Process exited with code 1",
  "stdout": "Partial output...",
  "stderr": "Error details...",
  "credentials": {}
}
```

### JavaScript SSE Client Example

```javascript
async function executePlaybookWithStreaming(endpoint, data, callbacks) {
  const response = await fetch(`${endpoint}?stream=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          handleEvent(event, callbacks);
        } catch (e) {
          console.error('Failed to parse SSE event:', e);
        }
      }
    }
  }
}

function handleEvent(event, callbacks) {
  switch (event.type) {
    case 'task':
      callbacks.onTask?.(event.task);
      break;
    case 'task_result':
      callbacks.onTaskResult?.(event);
      break;
    case 'error':
      callbacks.onError?.(event.line);
      break;
    case 'complete':
      callbacks.onComplete?.(event);
      break;
  }
}

// Usage
executePlaybookWithStreaming('/api/playbook/mysql', {
  servers: [{ hostname: '192.168.1.10', password: 'pass' }]
}, {
  onTask: (task) => console.log(`Running: ${task}`),
  onTaskResult: (result) => {
    console.log(`${result.host}: ${result.status}`);
    if (result.credentialUpdate) {
      console.log('Credentials:', result.credentialUpdate.data);
    }
  },
  onError: (error) => console.error(error),
  onComplete: (result) => {
    if (result.success) {
      console.log('Deployment complete!', result.credentials);
    } else {
      console.error('Deployment failed:', result.error);
    }
  }
});
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Missing or invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error - Server-side error |

### Error Response Format

```json
{
  "error": "Descriptive error message"
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Servers array is required` | Missing servers in playbook request | Provide `servers` array |
| `Session not found` | Invalid session ID | Check session ID exists |
| `Setting not found` | Invalid setting key | Check key spelling |
| `At least one master node is required` | Kubernetes without master | Add server with `role: "master"` |
| `Variables disk_device and client_ip_range are required` | NFS missing config | Provide required variables |

### Error Handling Example

```javascript
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error.message);
    throw error;
  }
}

// Usage
try {
  const result = await apiRequest('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name: 'My Session' })
  });
  console.log('Session created:', result.session.id);
} catch (error) {
  alert(`Failed to create session: ${error.message}`);
}
```

---

## Security Notes

1. **Encryption**: All sensitive data (passwords, SSH keys, credentials) is encrypted at rest using AES-256-CBC with a unique key per installation.

2. **Encryption Key**: Generated automatically and stored in `data/.encryption_key`. Can be overridden with `STACKBILL_ENCRYPTION_KEY` environment variable.

3. **Session Cleanup**: Use `/api/sessions/:id/cleanup` after deployment to remove sensitive data while preserving records.

4. **No Authentication**: The API has no built-in authentication. Deploy behind a reverse proxy with authentication for production use.

5. **HTTPS**: Use HTTPS in production. The API runs on HTTP by default.

---

## Quick Reference

### Playbook Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/playbook/mysql` | POST | MySQL installation |
| `/api/playbook/mongodb` | POST | MongoDB installation |
| `/api/playbook/nfs` | POST | NFS server setup |
| `/api/playbook/rabbitmq` | POST | RabbitMQ installation |
| `/api/playbook/env-check` | POST | Environment verification |
| `/api/playbook/kubernetes` | POST | Kubernetes cluster setup |
| `/api/playbook/kubectl` | POST | kubectl/Istio installation |
| `/api/playbook/helm` | POST | Helm installation |
| `/api/playbook/ssl` | POST | SSL certificate generation |
| `/api/playbook/stackbill` | POST | StackBill deployment |

### Session Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create session |
| `/api/sessions` | GET | List sessions |
| `/api/sessions/:id` | GET | Get session details |
| `/api/sessions/:id` | PATCH | Update session |
| `/api/sessions/:id` | DELETE | Delete session |
| `/api/sessions/:id/servers/:stepId` | POST | Save servers |
| `/api/sessions/:id/servers/:serverId` | DELETE | Remove server |
| `/api/sessions/:id/credentials/:service` | POST | Save credentials |
| `/api/sessions/:id/steps/:stepId/complete` | POST | Complete step |
| `/api/sessions/:id/steps/:stepId/mode` | POST | Set step mode |
| `/api/sessions/:id/ssl-config` | POST | Save SSL config |
| `/api/sessions/:id/files` | POST | Save file |
| `/api/sessions/:id/files` | GET | List files |
| `/api/sessions/:id/files/:fileId/download` | GET | Download file |
| `/api/sessions/:id/export` | GET | Export credentials |
| `/api/sessions/:id/cleanup` | POST | Cleanup session |

### Settings Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get all settings |
| `/api/settings` | POST | Add setting |
| `/api/settings/category/:category` | GET | Get by category |
| `/api/settings/:key` | GET | Get single setting |
| `/api/settings/:key` | PATCH | Update setting |
| `/api/settings/:key` | DELETE | Delete setting |
| `/api/settings/:key/reset` | POST | Reset to default |
| `/api/settings/reset-all` | POST | Reset all defaults |

---

*Documentation generated for StackBill Deployment Center v1.0*
