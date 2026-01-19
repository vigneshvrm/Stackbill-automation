/**
 * Application Configuration
 * Centralized configuration management for the StackBill Deployment Center
 */

const path = require('path');

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  // Paths
  paths: {
    root: path.join(__dirname, '..', '..'),
    backend: path.join(__dirname, '..'),
    frontend: path.join(__dirname, '..', '..', 'frontend', 'public'),
    ansible: path.join(__dirname, '..', '..', 'ansible'),
    data: path.join(__dirname, '..', '..', 'data'),
    inventory: path.join(__dirname, '..', '.inventory')
  },

  // Playbook paths
  playbooks: {
    mysql: 'mysql/playbook.yml',
    mongodb: 'mongodb/playbook.yml',
    nfs: 'nfs/playbook.yml',
    rabbitmq: 'rabbitmq/playbook.yml',
    'env-check': 'env-check/playbook.yml',
    kubernetes: 'kubernetes/playbook.yml',
    loadbalancer: 'loadbalancer/playbook.yml',
    kubectl: 'kubectl-istio/playbook.yml',
    helm: 'helm/playbook.yml',
    ssl: 'ssl/playbook.yml',
    stackbill: 'stackbill/playbook.yml'
  },

  // Role paths for Ansible
  rolePaths: {
    mysql: 'mysql/role',
    mongodb: 'mongodb/role',
    default: 'roles'
  },

  // Platform detection
  platform: {
    isWindows: process.platform === 'win32',
    isMac: process.platform === 'darwin',
    isLinux: process.platform === 'linux'
  },

  // Ansible configuration
  ansible: {
    hostKeyChecking: false,
    sshCommonArgs: '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no'
  },

  // Credential defaults
  credentialDefaults: {
    mysql: { path: '/tmp/mysql_credentials.txt' },
    mongodb: { path: '/tmp/mongodb_credentials.txt' }
  }
};
