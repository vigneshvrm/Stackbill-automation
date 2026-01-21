/**
 * Playbook Service
 * Handles Ansible playbook execution with streaming support
 */

const { spawn } = require('child_process');
const config = require('../config');
const { toWslPath, getRolePath } = require('../utils/pathHelper');

/**
 * Parse Ansible output for credentials
 * @param {string} text - Output text
 * @param {string} service - Service name
 * @param {object} credentials - Credentials object to update
 */
function parseCredentials(text, service, credentials) {
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse CREDENTIALS| format
    if (trimmed.startsWith('CREDENTIALS|')) {
      const parts = trimmed.split('|');
      const svc = parts[1]?.toLowerCase();
      if (svc) {
        if (!credentials[svc]) credentials[svc] = {};
        parts.slice(2).forEach(segment => {
          const [k, v] = segment.split('=');
          if (k && v) {
            credentials[svc][k.trim()] = v.trim();
          }
        });
      }
      continue;
    }

    // Parse individual credential lines
    let match;
    if ((match = trimmed.match(/^MySQL user:\s*(.+)$/i))) {
      if (!credentials.mysql) credentials.mysql = {};
      credentials.mysql.username = match[1].trim();
    } else if ((match = trimmed.match(/^MySQL password:\s*(.+)$/i))) {
      if (!credentials.mysql) credentials.mysql = {};
      credentials.mysql.password = match[1].trim();
    } else if ((match = trimmed.match(/^MongoDB admin user:\s*(.+)$/i))) {
      if (!credentials.mongodb) credentials.mongodb = {};
      credentials.mongodb.username = match[1].trim();
    } else if ((match = trimmed.match(/^MongoDB admin password:\s*(.+)$/i))) {
      if (!credentials.mongodb) credentials.mongodb = {};
      credentials.mongodb.password = match[1].trim();
    } else if ((match = trimmed.match(/^MongoDB credentials stored in:\s*(.+)$/i))) {
      if (!credentials.mongodb) credentials.mongodb = {};
      credentials.mongodb.path = match[1].trim();
    } else if ((match = trimmed.match(/^RabbitMQ Username:\s*(.+)$/i))) {
      if (!credentials.rabbitmq) credentials.rabbitmq = {};
      credentials.rabbitmq.username = match[1].trim();
    } else if ((match = trimmed.match(/^RabbitMQ Password:\s*(.+)$/i))) {
      if (!credentials.rabbitmq) credentials.rabbitmq = {};
      credentials.rabbitmq.password = match[1].trim();
    }
  }
}

/**
 * Parse Ansible output for task information
 * @param {string} line - Output line
 * @param {string} currentTask - Current task name
 * @param {object} credentials - Credentials object
 * @param {string} service - Service name
 * @returns {object|null} Parsed event or null
 */
function parseAnsibleOutput(line, currentTask, credentials, service) {
  // Match task results
  const taskResultMatch = line.match(/^(ok|changed|fatal|skipping):\s*\[(.+?)\]\s*(.*)/);
  if (taskResultMatch) {
    const status = taskResultMatch[1];
    const host = taskResultMatch[2];
    let message = taskResultMatch[3] || '';
    let trimmedMessage = message.trim();

    if (trimmedMessage.startsWith('=>')) {
      trimmedMessage = trimmedMessage.replace(/^=>\s*/, '');
    }

    // Parse credentials from message
    parseCredentials(trimmedMessage, service, credentials);

    // Try to parse JSON message
    if (trimmedMessage.startsWith('{')) {
      try {
        const parsedJson = JSON.parse(trimmedMessage);
        if (parsedJson && parsedJson.msg !== undefined) {
          const msgs = Array.isArray(parsedJson.msg) ? parsedJson.msg : [parsedJson.msg];
          msgs.forEach(m => parseCredentials(String(m), service, credentials));
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    let credentialUpdate = null;
    if (credentials[service]) {
      credentialUpdate = {
        service: service,
        data: { ...credentials[service] }
      };
    }

    return {
      type: 'task_result',
      status,
      host,
      task: currentTask,
      message: trimmedMessage,
      line,
      credentialUpdate
    };
  }

  // Match task names
  const taskMatch = line.match(/TASK\s+\[(.+?)\]/);
  if (taskMatch) {
    return { type: 'task', task: taskMatch[1], line };
  }

  // Match play names
  const playMatch = line.match(/PLAY\s+\[(.+?)\]/);
  if (playMatch) {
    return { type: 'play', play: playMatch[1], line };
  }

  // Match summary status
  const statusMatch = line.match(/(ok|changed|failed|unreachable)=(\d+)/);
  if (statusMatch) {
    return { type: 'status', status: statusMatch[1], count: statusMatch[2], line };
  }

  return null;
}

/**
 * Execute an Ansible playbook
 * @param {string} playbookType - Type of playbook
 * @param {string} inventoryPath - Path to inventory file
 * @param {string} playbookPath - Path to playbook file
 * @param {object} extraVars - Extra variables for playbook
 * @param {Function} onOutput - Callback for output events
 * @returns {Promise} Execution result
 */
function executePlaybook(playbookType, inventoryPath, playbookPath, extraVars = {}, onOutput = null) {
  return new Promise((resolve, reject) => {
    const rolesPathNative = getRolePath(playbookType);
    let finalInventoryPath = inventoryPath;
    let finalPlaybookPath = playbookPath;
    let rolesPath = rolesPathNative;

    if (config.platform.isWindows) {
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
      const escapedJson = varsJson.replace(/'/g, "'\\''");
      extraVarsStr = ` -e '${escapedJson}'`;
    }

    // Build command
    const rolesExport = `ANSIBLE_ROLES_PATH=${rolesPath.includes(' ') ? `'${rolesPath}'` : rolesPath}`;
    const ansibleCmd = `${rolesExport} ansible-playbook -i ${finalInventoryPath} ${finalPlaybookPath}${extraVarsStr}`;

    // Set environment
    const env = {
      ...process.env,
      ANSIBLE_HOST_KEY_CHECKING: 'False',
      ANSIBLE_SSH_COMMON_ARGS: '-o StrictHostKeyChecking=no',
      PYTHONUNBUFFERED: '1',
      ANSIBLE_ROLES_PATH: rolesPathNative
    };

    console.log(`Executing: ${ansibleCmd}`);

    // Spawn process
    let child;
    if (config.platform.isWindows) {
      child = spawn('wsl', ['bash', '-c', ansibleCmd], { cwd: config.paths.backend, env });
    } else {
      child = spawn('/bin/sh', ['-c', ansibleCmd], { cwd: config.paths.backend, env });
    }

    let stdout = '';
    let stderr = '';
    let currentTask = '';
    const credentials = {};

    // Determine service name
    const currentService = ['mysql', 'mongodb', 'rabbitmq'].includes(playbookType)
      ? playbookType
      : null;

    // Add default credential paths
    if (currentService && config.credentialDefaults[currentService]) {
      credentials[currentService] = { ...config.credentialDefaults[currentService] };
    }

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.trim() && onOutput) {
          const parsed = parseAnsibleOutput(line, currentTask, credentials, currentService);
          if (parsed) {
            if (parsed.type === 'task') {
              currentTask = parsed.task;
            }
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
      // Apply default credentials if missing
      if (currentService && config.credentialDefaults[currentService]) {
        credentials[currentService] = {
          ...config.credentialDefaults[currentService],
          ...(credentials[currentService] || {})
        };
      }

      // Ansible exit codes:
      // 0 = success
      // 2 = one or more hosts had failures
      // 4 = unreachable hosts
      // Other = errors
      if (code === 0) {
        resolve({
          success: true,
          stdout,
          stderr,
          credentials
        });
      } else {
        reject({
          success: false,
          error: code === 2 ? 'One or more tasks failed' :
                 code === 4 ? 'One or more hosts unreachable' :
                 `Process exited with code ${code}`,
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

module.exports = {
  executePlaybook,
  parseAnsibleOutput,
  parseCredentials
};
