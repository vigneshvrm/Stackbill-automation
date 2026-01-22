/**
 * Inventory Service
 * Handles Ansible inventory file generation and management
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// Ensure inventory directory exists
async function ensureInventoryDir() {
  try {
    await fs.mkdir(config.paths.inventory, { recursive: true });
  } catch (error) {
    console.error('Error creating inventory directory:', error);
  }
}

/**
 * Format a server line for the inventory file
 * @param {object} server - Server configuration
 * @param {string} name - Server name for inventory
 * @returns {string} Formatted inventory line
 */
function formatServerLine(server, name) {
  let line = `${name} ansible_host=${server.hostname} ansible_port=${server.ssh_port || 22}`;

  const sshUser = server.ssh_user || 'root';
  const sshUserType = server.ssh_user_type || 'root';
  const sshAuthType = server.ssh_auth_type || 'password';

  line += ` ansible_user=${sshUser}`;

  // Handle authentication type
  if (sshAuthType === 'key') {
    if (server.ssh_key) {
      const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
      line += ` ansible_ssh_private_key_file=${keyPath}`;
    }
  } else {
    if (server.password) {
      line += ` ansible_ssh_pass=${server.password}`;
    }
  }

  // Handle sudo escalation
  if (sshUserType === 'sudo') {
    line += ` ansible_become=yes ansible_become_method=sudo`;
    const sudoPass = server.sudo_password || server.password;
    if (sudoPass) {
      line += ` ansible_become_pass=${sudoPass}`;
    }
  }

  return line;
}

/**
 * Write SSH keys to temp files
 * @param {Array} servers - Server configurations
 */
async function writeSSHKeys(servers) {
  for (const server of servers) {
    if (server.ssh_auth_type === 'key' && server.ssh_key) {
      const keyPath = `/tmp/ansible_key_${server.hostname.replace(/\./g, '_')}.pem`;
      await fs.writeFile(keyPath, server.ssh_key, { mode: 0o600 });
    }
  }
}

/**
 * Generate inventory content based on playbook type
 * @param {Array} servers - Server configurations
 * @param {string} playbookType - Type of playbook
 * @returns {string} Inventory file content
 */
function generateInventoryContent(servers, playbookType) {
  let content = '';

  if (playbookType === 'mysql') {
    const primaryServers = servers.filter(s => s.role === 'primary' || !s.role);
    const secondaryServers = servers.filter(s => s.role === 'secondary');

    if (primaryServers.length > 0) {
      content += '[primary]\n';
      primaryServers.forEach((server, idx) => {
        content += formatServerLine(server, `mysql-primary-${idx}`) + '\n';
      });
      content += '\n';
    }

    if (secondaryServers.length > 0) {
      content += '[secondary]\n';
      secondaryServers.forEach((server, idx) => {
        content += formatServerLine(server, `mysql-secondary-${idx}`) + '\n';
      });
      content += '\n';
    }

    content += '[mysql:children]\n';
    if (primaryServers.length > 0) content += 'primary\n';
    if (secondaryServers.length > 0) content += 'secondary\n';

  } else if (playbookType === 'mongodb') {
    const primaryServers = servers.filter(s => s.role === 'primary' || !s.role);
    const secondaryServers = servers.filter(s => s.role === 'secondary');
    const arbiterServers = servers.filter(s => s.role === 'arbiter');

    if (primaryServers.length > 0) {
      content += '[primary]\n';
      primaryServers.forEach((server, idx) => {
        content += formatServerLine(server, `mongo-primary-${idx}`) + '\n';
      });
      content += '\n';
    }

    if (secondaryServers.length > 0) {
      content += '[secondary]\n';
      secondaryServers.forEach((server, idx) => {
        content += formatServerLine(server, `mongo-secondary-${idx}`) + '\n';
      });
      content += '\n';
    }

    if (arbiterServers.length > 0) {
      content += '[arbiter]\n';
      arbiterServers.forEach((server, idx) => {
        content += formatServerLine(server, `mongo-arbiter-${idx}`) + '\n';
      });
      content += '\n';
    }

    content += '[mongo:children]\n';
    if (primaryServers.length > 0) content += 'primary\n';
    if (secondaryServers.length > 0) content += 'secondary\n';
    if (arbiterServers.length > 0) content += 'arbiter\n';

  } else if (playbookType === 'kubernetes') {
    // Support both 'master'/'worker' and 'k8s-master'/'k8s-worker' role names
    const masterServers = servers.filter(s => s.role === 'master' || s.role === 'k8s-master');
    const workerServers = servers.filter(s => s.role === 'worker' || s.role === 'k8s-worker');

    if (masterServers.length > 0) {
      content += '[master]\n';
      masterServers.forEach((server, idx) => {
        content += formatServerLine(server, `k8s-master-${idx}`) + '\n';
      });
      content += '\n';
    }

    if (workerServers.length > 0) {
      content += '[worker]\n';
      workerServers.forEach((server, idx) => {
        content += formatServerLine(server, `k8s-worker-${idx}`) + '\n';
      });
      content += '\n';
    }

    content += '[kubernetes:children]\n';
    if (masterServers.length > 0) content += 'master\n';
    if (workerServers.length > 0) content += 'worker\n';

  } else if (playbookType === 'env-check') {
    // For env-check, deduplicate servers based on hostname+port to avoid apt lock conflicts
    // when multiple roles point to the same physical server
    const uniqueServers = [];
    const seen = new Set();

    for (const server of servers) {
      const key = `${server.hostname}:${server.ssh_port || 22}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueServers.push(server);
      }
    }

    content += '[all]\n';
    uniqueServers.forEach((server, idx) => {
      content += formatServerLine(server, `server-${idx}`) + '\n';
    });
  } else {
    // For NFS, RabbitMQ, kubectl, helm, ssl, stackbill - use 'all' group
    content += '[all]\n';
    servers.forEach((server, idx) => {
      content += formatServerLine(server, `server-${idx}`) + '\n';
    });
  }

  // Add common variables
  content += '\n[all:vars]\n';
  const defaultUser = servers.find(s => s.ansible_user)?.ansible_user || 'ubuntu';
  content += `ansible_user=${defaultUser}\n`;
  content += 'ansible_become=true\n';
  content += `ansible_ssh_common_args='${config.ansible.sshCommonArgs}'\n`;

  return content;
}

/**
 * Generate a dynamic inventory file
 * @param {Array} servers - Server configurations
 * @param {string} playbookType - Type of playbook
 * @returns {object} Inventory ID and path
 */
async function generateInventory(servers, playbookType) {
  await ensureInventoryDir();

  const inventoryId = crypto.randomBytes(8).toString('hex');
  const inventoryPath = path.join(config.paths.inventory, `${inventoryId}.ini`);

  // Write SSH keys if needed
  await writeSSHKeys(servers);

  // Generate and write inventory content
  const inventoryContent = generateInventoryContent(servers, playbookType);
  await fs.writeFile(inventoryPath, inventoryContent);

  return { inventoryId, inventoryPath };
}

/**
 * Cleanup inventory file and SSH keys
 * @param {string} inventoryId - Inventory file ID
 * @param {Array} servers - Server configurations (for SSH key cleanup)
 */
async function cleanupInventory(inventoryId, servers = []) {
  try {
    const inventoryPath = path.join(config.paths.inventory, `${inventoryId}.ini`);
    await fs.unlink(inventoryPath);

    // Clean up SSH key files
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

module.exports = {
  ensureInventoryDir,
  generateInventory,
  cleanupInventory
};
