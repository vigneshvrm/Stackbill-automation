const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Database module for persistent storage
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Store for temporary inventory files
const INVENTORY_DIR = path.join(__dirname, '.inventory');

// Detect if running on Windows
const IS_WINDOWS = process.platform === 'win32';

// Convert Windows path to WSL path
function toWslPath(windowsPath) {
  if (!IS_WINDOWS) return windowsPath;
  
  // Convert C:\path\to\file to /mnt/c/path/to/file
  // Handle both absolute and relative paths
  let normalized = path.normalize(windowsPath);
  
  // Extract drive letter (C, D, etc.)
  const driveMatch = normalized.match(/^([A-Za-z]):/);
  if (!driveMatch) {
    // No drive letter found, return as-is or handle relative path
    return normalized.replace(/\\/g, '/');
  }
  
  const drive = driveMatch[1].toLowerCase();
  // Get everything after "C:" or "C:\"
  let rest = normalized.substring(2);
  
  // Remove leading slashes/backslashes
  rest = rest.replace(/^[\\\/]+/, '');
  
  // Convert backslashes to forward slashes
  rest = rest.replace(/\\/g, '/');
  
  // Ensure we have a proper path
  const wslPath = `/mnt/${drive}/${rest}`;
  
  // Escape spaces and special characters for shell
  return wslPath.includes(' ') ? `"${wslPath}"` : wslPath;
}

// Ensure inventory directory exists
async function ensureInventoryDir() {
  try {
    await fs.mkdir(INVENTORY_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating inventory directory:', error);
  }
}

// Generate dynamic inventory file
async function generateInventory(servers, playbookType) {
  const inventoryId = crypto.randomBytes(8).toString('hex');
  const inventoryPath = path.join(INVENTORY_DIR, `${inventoryId}.ini`);
  
  let inventoryContent = '';
  
  // Helper function to format server line with all variables
  const formatServerLine = (server, name) => {
    let line = `${name} ansible_host=${server.hostname} ansible_port=${server.ssh_port || 22}`;

    // Set ansible user based on ssh_user_type
    const sshUser = server.ssh_user || 'root';
    const sshUserType = server.ssh_user_type || 'root';
    const sshAuthType = server.ssh_auth_type || 'password';

    line += ` ansible_user=${sshUser}`;

    // Handle authentication type
    if (sshAuthType === 'key') {
      // SSH Key based authentication
      if (server.ssh_key) {
        // Reference the temp key file (created before inventory generation)
        const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
        line += ` ansible_ssh_private_key_file=${keyPath}`;
      }
    } else {
      // Password based authentication
      if (server.password) {
        line += ` ansible_ssh_pass=${server.password}`;
      }
    }

    // Handle sudo escalation
    if (sshUserType === 'sudo') {
      line += ` ansible_become=yes ansible_become_method=sudo`;
      // Use sudo_password if provided, otherwise use the SSH password
      const sudoPass = server.sudo_password || server.password;
      if (sudoPass) {
        line += ` ansible_become_pass=${sudoPass}`;
      }
    }

    return line;
  };

  // Write SSH keys to temp files if needed
  for (const server of servers) {
    if (server.ssh_auth_type === 'key' && server.ssh_key) {
      const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
      await fs.writeFile(keyPath, server.ssh_key, { mode: 0o600 });
    }
  }
  
  if (playbookType === 'mysql') {
    // MySQL expects primary and secondary groups
    const primaryServers = servers.filter(s => s.role === 'primary' || !s.role);
    const secondaryServers = servers.filter(s => s.role === 'secondary');
    
    if (primaryServers.length > 0) {
      inventoryContent += '[primary]\n';
      primaryServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `mysql-primary-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }
    
    if (secondaryServers.length > 0) {
      inventoryContent += '[secondary]\n';
      secondaryServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `mysql-secondary-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }
    
    inventoryContent += '[mysql:children]\n';
    if (primaryServers.length > 0) inventoryContent += 'primary\n';
    if (secondaryServers.length > 0) inventoryContent += 'secondary\n';
    
  } else if (playbookType === 'mongodb') {
    // MongoDB expects primary, secondary, and arbiter groups
    const primaryServers = servers.filter(s => s.role === 'primary' || !s.role);
    const secondaryServers = servers.filter(s => s.role === 'secondary');
    const arbiterServers = servers.filter(s => s.role === 'arbiter');
    
    if (primaryServers.length > 0) {
      inventoryContent += '[primary]\n';
      primaryServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `mongo-primary-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }
    
    if (secondaryServers.length > 0) {
      inventoryContent += '[secondary]\n';
      secondaryServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `mongo-secondary-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }
    
    if (arbiterServers.length > 0) {
      inventoryContent += '[arbiter]\n';
      arbiterServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `mongo-arbiter-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }
    
    inventoryContent += '[mongo:children]\n';
    if (primaryServers.length > 0) inventoryContent += 'primary\n';
    if (secondaryServers.length > 0) inventoryContent += 'secondary\n';
    if (arbiterServers.length > 0) inventoryContent += 'arbiter\n';
    
  } else if (playbookType === 'kubernetes') {
    // Kubernetes expects master and worker groups
    const masterServers = servers.filter(s => s.role === 'master');
    const workerServers = servers.filter(s => s.role === 'worker');

    if (masterServers.length > 0) {
      inventoryContent += '[master]\n';
      masterServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `k8s-master-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }

    if (workerServers.length > 0) {
      inventoryContent += '[worker]\n';
      workerServers.forEach((server, idx) => {
        inventoryContent += formatServerLine(server, `k8s-worker-${idx}`) + '\n';
      });
      inventoryContent += '\n';
    }

    inventoryContent += '[kubernetes:children]\n';
    if (masterServers.length > 0) inventoryContent += 'master\n';
    if (workerServers.length > 0) inventoryContent += 'worker\n';

  } else {
    // For NFS, RabbitMQ, env-check, kubectl, helm, ssl, stackbill - use 'all' group
    inventoryContent += '[all]\n';
    servers.forEach((server, idx) => {
      inventoryContent += formatServerLine(server, `server-${idx}`) + '\n';
    });
  }
  
  // Add common variables
  inventoryContent += '\n[all:vars]\n';
  const defaultUser = servers.find(s => s.ansible_user)?.ansible_user || 'ubuntu';
  inventoryContent += `ansible_user=${defaultUser}\n`;
  inventoryContent += 'ansible_become=true\n';
  inventoryContent += "ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no'\n";
  
  await fs.writeFile(inventoryPath, inventoryContent);
  return { inventoryId, inventoryPath };
}

// Execute Ansible playbook with streaming support
function executePlaybook(playbookType, inventoryPath, playbookPath, extraVars = {}, onOutput = null) {
  return new Promise((resolve, reject) => {
    // Convert paths to WSL format if on Windows
    let finalInventoryPath = inventoryPath;
    let finalPlaybookPath = playbookPath;
    // Determine role path based on playbook type (service-specific)
    let rolesPathNative;
    if (playbookType === 'mysql') {
      rolesPathNative = path.join(__dirname, '..', 'ansible', 'mysql', 'role');
    } else if (playbookType === 'mongodb') {
      rolesPathNative = path.join(__dirname, '..', 'ansible', 'mongodb', 'role');
    } else {
      // For NFS and RabbitMQ, use old path (they don't use roles)
      rolesPathNative = path.join(__dirname, '..', 'ansible', 'roles');
    }
    let rolesPath = rolesPathNative;
    let command;
    
    if (IS_WINDOWS) {
      // Convert Windows paths to WSL paths
      finalInventoryPath = toWslPath(inventoryPath);
      finalPlaybookPath = toWslPath(playbookPath);
      rolesPath = toWslPath(rolesPathNative);
      if (rolesPath.startsWith('"') && rolesPath.endsWith('"')) {
        rolesPath = rolesPath.slice(1, -1);
      }
    }
    
    // Build extra vars string
    let extraVarsStr = '';
    if (Object.keys(extraVars).length > 0) {
      const varsJson = JSON.stringify(extraVars);
      // Escape single quotes for shell, and handle WSL properly
      const escapedJson = varsJson.replace(/'/g, "'\\''");
      extraVarsStr = ` -e '${escapedJson}'`;
    }
    
    if (IS_WINDOWS) {
      // Execute through WSL - paths are already converted
      const rolesExport = `ANSIBLE_ROLES_PATH=${rolesPath.includes(' ') ? `'${rolesPath}'` : rolesPath}`;
      command = `wsl ${rolesExport} ansible-playbook -i ${finalInventoryPath} ${finalPlaybookPath}${extraVarsStr}`;
    } else {
      // Use paths as-is on Linux/Mac
      const rolesExport = `ANSIBLE_ROLES_PATH=${rolesPath.includes(' ') ? `'${rolesPath}'` : rolesPath}`;
      command = `${rolesExport} ansible-playbook -i ${finalInventoryPath} ${finalPlaybookPath}${extraVarsStr}`;
    }
    
    // Set environment variables for Ansible
    const env = {
      ...process.env,
      ANSIBLE_HOST_KEY_CHECKING: 'False',
      ANSIBLE_SSH_COMMON_ARGS: '-o StrictHostKeyChecking=no',
      PYTHONUNBUFFERED: '1', // Ensure Python output is unbuffered
      ANSIBLE_ROLES_PATH: rolesPathNative
    };
    
    console.log(`Executing: ${command}`);
    console.log(`Platform: ${process.platform}, IS_WINDOWS: ${IS_WINDOWS}`);
    
    let child;
    if (IS_WINDOWS) {
      // On Windows, execute through WSL directly
      const wslCommand = command.replace(/^wsl /, '');
      child = spawn('wsl', ['bash', '-c', wslCommand], {
        cwd: __dirname,
        env: env
      });
    } else {
      // On Linux/Mac, use shell directly
      child = spawn('/bin/sh', ['-c', command], {
        cwd: __dirname,
        env: env
      });
    }
    
    let stdout = '';
    let stderr = '';
    let currentTask = '';
    const credentials = {};
    const credentialDefaults = {
      mysql: { path: '/tmp/mysql_credentials.txt' },
      mongodb: { path: '/tmp/mongodb_credentials.txt' } // RabbitMQ intentionally omitted
    };
    const currentService = playbookType === 'mysql'
      ? 'mysql'
      : playbookType === 'mongodb'
        ? 'mongodb'
        : playbookType === 'rabbitmq'
          ? 'rabbitmq'
          : null;

    const recordCredential = (service, key, value) => {
      if (!service || !key || value === undefined || value === null) return;
      const normalizedService = service.toLowerCase();
      if (!credentials[normalizedService]) {
        credentials[normalizedService] = { ...(credentialDefaults[normalizedService] || {}) };
      }
      credentials[normalizedService][key] = value;
    };
 
    // Parse Ansible output to extract task names and results
    const parseAnsibleOutput = (line) => {
      // Match task results like "ok: [host]", "changed: [host]", "fatal: [host]"
      const taskResultMatch = line.match(/^(ok|changed|fatal|skipping):\s*\[(.+?)\]\s*(.*)/);
      if (taskResultMatch) {
        const status = taskResultMatch[1];
        const host = taskResultMatch[2];
        let message = taskResultMatch[3] || '';
        let trimmedMessage = message.trim();
        if (trimmedMessage.startsWith('=>')) {
          trimmedMessage = trimmedMessage.replace(/^=>\s*/, '');
        }

        const displayMessages = [];
        let credentialUpdate = null;

        const processText = (text) => {
          const trimmedText = String(text).trim();
          if (!trimmedText) return;
          let matched = false;
          let match;

          if (trimmedText.startsWith('CREDENTIALS|')) {
            const parts = trimmedText.split('|');
            const service = parts[1];
            parts.slice(2).forEach(segment => {
              const [k, v] = segment.split('=');
              if (k && v) {
                recordCredential(service, k.trim(), v.trim());
              }
            });
            matched = true;
            const normalizedService = service.toLowerCase();
            if (credentials[normalizedService]) {
              credentialUpdate = {
                service: normalizedService,
                data: { ...credentials[normalizedService] }
              };
            }
          } else if ((match = trimmedText.match(/^MySQL user:\s*(.+)$/i))) {
            recordCredential('mysql', 'username', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^MySQL password:\s*(.+)$/i))) {
            recordCredential('mysql', 'password', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^MongoDB admin user:\s*(.+)$/i))) {
            recordCredential('mongodb', 'username', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^MongoDB admin password:\s*(.+)$/i))) {
            recordCredential('mongodb', 'password', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^MongoDB credentials stored in:\s*(.+)$/i))) {
            recordCredential('mongodb', 'path', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^RabbitMQ Username:\s*(.+)$/i))) {
            recordCredential('rabbitmq', 'username', match[1].trim());
            matched = true;
          } else if ((match = trimmedText.match(/^RabbitMQ Password:\s*(.+)$/i))) {
            recordCredential('rabbitmq', 'password', match[1].trim());
            matched = true;
          }

          if (!matched) {
            displayMessages.push(trimmedText);
          }
        };

        if (trimmedMessage.startsWith('{')) {
          try {
            const parsedJson = JSON.parse(trimmedMessage);
            if (parsedJson && parsedJson.msg !== undefined) {
              const rawMessages = Array.isArray(parsedJson.msg) ? parsedJson.msg : [parsedJson.msg];
              rawMessages.forEach(processText);
            } else if (parsedJson && parsedJson.stdout) {
              processText(parsedJson.stdout);
            } else {
              processText(trimmedMessage);
            }
          } catch (err) {
            processText(trimmedMessage);
          }
        } else {
          processText(trimmedMessage);
        }

        const displayMessage = displayMessages.join(' | ');
        if (currentService === 'mysql' && !credentials.mysql && credentialDefaults.mysql) {
          credentials.mysql = { ...credentialDefaults.mysql };
        }
        if (currentService === 'mongodb' && !credentials.mongodb && credentialDefaults.mongodb) {
          credentials.mongodb = { ...credentialDefaults.mongodb };
        }
 
        return { 
          type: 'task_result', 
          status: status, 
          host: host, 
          task: currentTask,
          message: displayMessage,
          line,
          credentialUpdate
        };
      }
      
      // Match task names like "TASK [task name]"
      const taskMatch = line.match(/TASK\s+\[(.+?)\]/);
      if (taskMatch) {
        currentTask = taskMatch[1];
        return { type: 'task', task: currentTask, line };
      }
      
      // Match play names
      const playMatch = line.match(/PLAY\s+\[(.+?)\]/);
      if (playMatch) {
        return { type: 'play', play: playMatch[1], line };
      }
      
      // Match summary status like "ok=5 changed=2 failed=0"
      const statusMatch = line.match(/(ok|changed|failed|unreachable)=(\d+)/);
      if (statusMatch) {
        return { type: 'status', status: statusMatch[1], count: statusMatch[2], line };
      }
      
      // Skip verbose output lines
      return null;
    };
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim() && onOutput) {
          const parsed = parseAnsibleOutput(line);
          if (parsed) {
            onOutput(parsed);
          }
        }
      });
    });
    
    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (onOutput) {
        onOutput({ type: 'error', line: text });
      }
    });
    
    child.on('close', (code) => {
      if (code === 0 || code === 2) {
        if (currentService && (!credentials[currentService] || Object.keys(credentials[currentService]).length <= 1)) {
          const regex = new RegExp(`CREDENTIALS\\|${currentService}\\|([^\\n]+)`, 'g');
          let match;
          while ((match = regex.exec(stdout)) !== null) {
            const segments = match[1].split('|');
            segments.forEach(segment => {
              const [k, v] = segment.split('=');
              if (k && v) {
                recordCredential(currentService, k.trim(), v.trim());
              }
            });
          }
        }
        if (currentService && credentialDefaults[currentService]) {
          credentials[currentService] = {
            ...credentialDefaults[currentService],
            ...(credentials[currentService] || {})
          };
        }
        resolve({
          success: true,
          stdout,
          stderr,
          credentials
        });
      } else {
        if (currentService && credentialDefaults[currentService]) {
          credentials[currentService] = {
            ...credentialDefaults[currentService],
            ...(credentials[currentService] || {})
          };
        }
        // Include more detailed error information
        const errorMsg = stderr || stdout || `Process exited with code ${code}`;
        reject({
          success: false,
          error: `Process exited with code ${code}`,
          exitCode: code,
          stdout,
          stderr,
          fullOutput: stdout + '\n' + stderr,
          credentials
        });
      }
    });
    
    child.on('error', (error) => {
      reject({
        success: false,
        error: error.message,
        stdout,
        stderr
      });
    });
  });
}

// Cleanup inventory file
async function cleanupInventory(inventoryId, servers = []) {
  try {
    const inventoryPath = path.join(INVENTORY_DIR, `${inventoryId}.ini`);
    await fs.unlink(inventoryPath);

    // Clean up SSH key files if any were created
    for (const server of servers) {
      if (server.ssh_auth_type === 'key' && server.ssh_key) {
        const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
        try {
          await fs.unlink(keyPath);
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up inventory:', error);
  }
}

// Helper function to handle streaming playbook execution
async function executePlaybookStream(req, res, playbookType, playbookPath) {
  try {
    const { servers, variables = {} } = req.body;
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }
    
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    const { inventoryId, inventoryPath } = await generateInventory(servers, playbookType);
    
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    try {
      const result = await executePlaybook(playbookType, inventoryPath, playbookPath, variables, (output) => {
        sendEvent(output);
      });
      
      sendEvent({
        type: 'complete',
        success: true,
        credentials: result.credentials || {},
        stdout: result.stdout,
        stderr: result.stderr
      });
      await cleanupInventory(inventoryId, servers);
      res.end();
    } catch (error) {
      sendEvent({
        type: 'complete',
        success: false,
        error: error.error || error.message,
        stdout: error.stdout,
        stderr: error.stderr,
        credentials: error.credentials || {}
      });
      await cleanupInventory(inventoryId, servers);
      res.end();
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}

// API Routes

// Redirect root to sessions page (home)
app.get('/', (req, res) => {
  res.redirect('/sessions.html');
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Ansible API Server is running' });
});

// Execute MySQL playbook
app.post('/api/playbook/mysql', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'mysql', 'playbook.yml');
  
  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'mysql', playbookPath);
  }
  
  try {
    const { servers, variables = {} } = req.body;
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }
    
    const { inventoryId, inventoryPath } = await generateInventory(servers, 'mysql');
    
    try {
      const result = await executePlaybook('mysql', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute MongoDB playbook
app.post('/api/playbook/mongodb', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'mongodb', 'playbook.yml');
  
  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'mongodb', playbookPath);
  }
  
  try {
    const { servers, variables = {} } = req.body;
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }
    
    const { inventoryId, inventoryPath } = await generateInventory(servers, 'mongodb');
    
    try {
      const result = await executePlaybook('mongodb', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute NFS playbook
app.post('/api/playbook/nfs', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'nfs', 'playbook.yml');
  
  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'nfs', playbookPath);
  }
  
  try {
    const { servers, variables = {} } = req.body;
    
    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }
    
    if (!variables.disk_device || !variables.client_ip_range) {
      return res.status(400).json({ 
        error: 'Variables disk_device and client_ip_range are required' 
      });
    }
    
    const { inventoryId, inventoryPath } = await generateInventory(servers, 'nfs');
    
    try {
      const result = await executePlaybook('nfs', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute RabbitMQ playbook
app.post('/api/playbook/rabbitmq', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'rabbitmq', 'playbook.yml');

  // Check if streaming is requested
  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'rabbitmq', playbookPath);
  }

  // Legacy non-streaming endpoint
  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'rabbitmq');

    try {
      const result = await executePlaybook('rabbitmq', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// NEW ENDPOINTS FOR STACKBILL DEPLOYMENT WORKFLOW
// =====================================================

// Environment Check - Verify network, firewall, internet access
app.post('/api/playbook/env-check', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'env-check', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'env-check', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'env-check');

    try {
      const result = await executePlaybook('env-check', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kubernetes Cluster Setup - Master and Worker nodes
app.post('/api/playbook/kubernetes', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'kubernetes', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'kubernetes', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    // Validate that we have at least one master
    const hasMaster = servers.some(s => s.role === 'master');
    if (!hasMaster) {
      return res.status(400).json({ error: 'At least one master node is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'kubernetes');

    try {
      const result = await executePlaybook('kubernetes', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kubectl and Istio Installation
app.post('/api/playbook/kubectl', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'kubectl-istio', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'kubectl', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'kubectl');

    try {
      const result = await executePlaybook('kubectl', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helm Installation
app.post('/api/playbook/helm', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'helm', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'helm', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'helm');

    try {
      const result = await executePlaybook('helm', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SSL Certificate Generation
app.post('/api/playbook/ssl', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'ssl', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'ssl', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'ssl');

    try {
      const result = await executePlaybook('ssl', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// StackBill Application Deployment
app.post('/api/playbook/stackbill', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'stackbill', 'playbook.yml');

  if (req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream')) {
    return executePlaybookStream(req, res, 'stackbill', playbookPath);
  }

  try {
    const { servers, variables = {} } = req.body;

    if (!servers || !Array.isArray(servers) || servers.length === 0) {
      return res.status(400).json({ error: 'Servers array is required' });
    }

    const { inventoryId, inventoryPath } = await generateInventory(servers, 'stackbill');

    try {
      const result = await executePlaybook('stackbill', inventoryPath, playbookPath, variables);
      await cleanupInventory(inventoryId, servers);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId, servers);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// SESSION MANAGEMENT API ENDPOINTS
// =====================================================

// Create a new session
app.post('/api/sessions', (req, res) => {
  try {
    const { name } = req.body;
    const session = db.createSession(name || 'Deployment Session');
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = db.listSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session by ID
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = db.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update session
app.patch('/api/sessions/:id', (req, res) => {
  try {
    const success = db.updateSession(req.params.id, req.body);
    if (!success) {
      return res.status(404).json({ error: 'Session not found or no changes made' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete session
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const success = db.deleteSession(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save servers for a step
app.post('/api/sessions/:id/servers/:stepId', (req, res) => {
  try {
    const { servers } = req.body;
    if (!servers || !Array.isArray(servers)) {
      return res.status(400).json({ error: 'Servers array is required' });
    }
    db.saveServers(req.params.id, req.params.stepId, servers);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove a single server
app.delete('/api/sessions/:id/servers/:serverId', (req, res) => {
  try {
    const success = db.removeServer(parseInt(req.params.serverId));
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save credentials for a service
app.post('/api/sessions/:id/credentials/:service', (req, res) => {
  try {
    const { credentials } = req.body;
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ error: 'Credentials object is required' });
    }
    db.saveCredentials(req.params.id, req.params.service, credentials);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark step as completed
app.post('/api/sessions/:id/steps/:stepId/complete', (req, res) => {
  try {
    const { stepData } = req.body;
    db.completeStep(req.params.id, req.params.stepId, stepData || {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set step mode
app.post('/api/sessions/:id/steps/:stepId/mode', (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode) {
      return res.status(400).json({ error: 'Mode is required' });
    }
    db.setStepMode(req.params.id, req.params.stepId, mode);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save SSL configuration
app.post('/api/sessions/:id/ssl-config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Config is required' });
    }
    db.saveSSLConfig(req.params.id, config);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save NFS configuration
app.post('/api/sessions/:id/nfs-config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Config is required' });
    }
    db.saveNFSConfig(req.params.id, config);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save Load Balancer configuration
app.post('/api/sessions/:id/lb-config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Config is required' });
    }
    db.saveLBConfig(req.params.id, config);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save generated file
app.post('/api/sessions/:id/files', (req, res) => {
  try {
    const { stepId, filename, content, mimeType } = req.body;
    if (!stepId || !filename || !content) {
      return res.status(400).json({ error: 'stepId, filename, and content are required' });
    }
    const fileId = db.saveGeneratedFile(req.params.id, stepId, filename, content, mimeType);
    res.json({ success: true, fileId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get generated files for a session
app.get('/api/sessions/:id/files', (req, res) => {
  try {
    const files = db.getGeneratedFiles(req.params.id, req.query.stepId);
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download a generated file
app.get('/api/sessions/:id/files/:fileId/download', (req, res) => {
  try {
    const file = db.getFileContent(parseInt(req.params.fileId));
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Mark as downloaded
    db.markFileDownloaded(file.id);

    // Send file
    res.setHeader('Content-Type', file.mime_type || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export all credentials for a session (legacy)
app.get('/api/sessions/:id/export', (req, res) => {
  try {
    const exportData = db.exportSessionCredentials(req.params.id);
    if (!exportData) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="stackbill-credentials-${req.params.id.substring(0, 8)}.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export full session (for sharing across machines)
app.get('/api/sessions/:id/export-full', (req, res) => {
  try {
    const session = db.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Build comprehensive export data
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      session: {
        name: session.name,
        status: session.status,
        current_step: session.current_step,
        auto_cleanup: session.auto_cleanup,
        notes: session.notes,
        created_at: session.created_at,
        completedSteps: session.completedSteps || [],
        modes: session.modes || {},
        sslConfig: session.sslConfig || {},
        nfsConfig: session.nfsConfig || {},
        loadBalancerConfig: session.loadBalancerConfig || {},
        stepData: session.stepData || {}
      },
      servers: session.servers || {},
      credentials: session.credentials || {}
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="stackbill-session-${req.params.id.substring(0, 8)}.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import session (create new session from exported data)
app.post('/api/sessions/import', (req, res) => {
  try {
    const importData = req.body;

    // Validate import data structure
    if (!importData || !importData.session) {
      return res.status(400).json({ error: 'Invalid import data: missing session object' });
    }

    // Create new session
    const sessionData = importData.session;
    const newSession = db.createSession(sessionData.name || 'Imported Session');

    // Update session metadata
    db.updateSession(newSession.id, {
      status: sessionData.status || 'in_progress',
      current_step: sessionData.current_step || 0,
      auto_cleanup: sessionData.auto_cleanup || false,
      notes: sessionData.notes || ''
    });

    // Import servers
    if (importData.servers) {
      for (const [stepId, servers] of Object.entries(importData.servers)) {
        if (Array.isArray(servers) && servers.length > 0) {
          db.saveServers(newSession.id, stepId, servers);
        }
      }
    }

    // Import credentials
    if (importData.credentials) {
      for (const [service, creds] of Object.entries(importData.credentials)) {
        if (creds && typeof creds === 'object') {
          db.saveCredentials(newSession.id, service, creds);
        }
      }
    }

    // Import completed steps
    if (sessionData.completedSteps && Array.isArray(sessionData.completedSteps)) {
      for (const stepId of sessionData.completedSteps) {
        const stepData = sessionData.stepData?.[stepId] || {};
        db.completeStep(newSession.id, stepId, stepData);
      }
    }

    // Import step modes
    if (sessionData.modes) {
      for (const [stepId, mode] of Object.entries(sessionData.modes)) {
        db.setStepMode(newSession.id, stepId, mode);
      }
    }

    // Import SSL config
    if (sessionData.sslConfig && sessionData.sslConfig.type) {
      db.saveSSLConfig(newSession.id, sessionData.sslConfig);
    }

    // Import NFS config
    if (sessionData.nfsConfig) {
      db.saveNFSConfig(newSession.id, sessionData.nfsConfig);
    }

    // Import Load Balancer config
    if (sessionData.loadBalancerConfig) {
      db.saveLBConfig(newSession.id, sessionData.loadBalancerConfig);
    }

    // Return the new session
    const createdSession = db.getSession(newSession.id);
    res.json({
      success: true,
      message: 'Session imported successfully',
      session: createdSession
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup session (remove sensitive data after completion)
app.post('/api/sessions/:id/cleanup', (req, res) => {
  try {
    db.cleanupSession(req.params.id);
    res.json({ success: true, message: 'Session cleaned up successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GLOBAL SETTINGS API ENDPOINTS
// =====================================================

// Get all settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get settings by category
app.get('/api/settings/category/:category', (req, res) => {
  try {
    const settings = db.getSettingsByCategory(req.params.category);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single setting
app.get('/api/settings/:key', (req, res) => {
  try {
    const value = db.getSetting(req.params.key);
    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ success: true, key: req.params.key, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a setting
app.patch('/api/settings/:key', (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    const success = db.updateSetting(req.params.key, value);
    if (!success) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new setting
app.post('/api/settings', (req, res) => {
  try {
    const { key, value, description, category } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    db.addSetting(key, value, description || '', category || 'custom');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all settings to defaults (must be before :key routes)
app.post('/api/settings/reset-all', (req, res) => {
  try {
    db.resetAllSettings();
    res.json({ success: true, message: 'All settings reset to defaults' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset a single setting to default
app.post('/api/settings/:key/reset', (req, res) => {
  try {
    const success = db.resetSetting(req.params.key);
    if (!success) {
      return res.status(404).json({ error: 'Setting not found or no default available' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a setting
app.delete('/api/settings/:key', (req, res) => {
  try {
    const success = db.deleteSetting(req.params.key);
    if (!success) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
ensureInventoryDir().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Ansible API Server running on http://localhost:${PORT}`);
    console.log(`📋 Frontend available at http://localhost:${PORT}`);
    console.log(`💾 Database location: ./data/stackbill.db`);
  });
});

module.exports = app;

