const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');

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
    if (server.ansible_user) {
      line += ` ansible_user=${server.ansible_user}`;
    }
    if (server.password) {
      line += ` ansible_ssh_pass=${server.password}`;
    }
    return line;
  };
  
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
    
  } else {
    // For NFS and RabbitMQ, use 'all' group
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
    const rolesPathNative = path.join(__dirname, '..', 'ansible', 'roles');
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
async function cleanupInventory(inventoryId) {
  try {
    const inventoryPath = path.join(INVENTORY_DIR, `${inventoryId}.ini`);
    await fs.unlink(inventoryPath);
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
      await cleanupInventory(inventoryId);
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
      await cleanupInventory(inventoryId);
      res.end();
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Ansible API Server is running' });
});

// Execute MySQL playbook
app.post('/api/playbook/mysql', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'playbooks', 'mysql.yml');
  
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
      await cleanupInventory(inventoryId);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute MongoDB playbook
app.post('/api/playbook/mongodb', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'playbooks', 'mongodb.yml');
  
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
      await cleanupInventory(inventoryId);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute NFS playbook
app.post('/api/playbook/nfs', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'playbooks', 'nfs.yml');
  
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
      await cleanupInventory(inventoryId);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute RabbitMQ playbook
app.post('/api/playbook/rabbitmq', async (req, res) => {
  const playbookPath = path.join(__dirname, '..', 'ansible', 'playbooks', 'rabbitmq.yml');
  
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
      await cleanupInventory(inventoryId);
      res.json(result);
    } catch (error) {
      await cleanupInventory(inventoryId);
      res.status(500).json(error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
ensureInventoryDir().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Ansible API Server running on http://localhost:${PORT}`);
    console.log(`📋 Frontend available at http://localhost:${PORT}`);
  });
});

module.exports = app;

