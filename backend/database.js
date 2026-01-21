/**
 * SQLite Database Module for StackBill Deployment Sessions
 * Handles persistent storage for deployment sessions, servers, and credentials
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Database file location
const DB_PATH = path.join(__dirname, '..', 'data', 'stackbill.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ==================== ENCRYPTION KEY MANAGEMENT ====================
// The encryption key file stores a unique key per installation
const KEY_FILE = path.join(dataDir, '.encryption_key');
const SALT_FILE = path.join(dataDir, '.encryption_salt');

/**
 * Get or generate unique encryption key for this installation
 * Priority: 1. Environment variable, 2. Key file, 3. Generate new
 */
function getEncryptionKey() {
  // 1. Check environment variable (highest priority - for production)
  if (process.env.STACKBILL_ENCRYPTION_KEY) {
    return process.env.STACKBILL_ENCRYPTION_KEY;
  }

  // 2. Check for existing key file
  if (fs.existsSync(KEY_FILE)) {
    try {
      const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (key.length >= 32) return key;
    } catch (e) {
      console.error('Failed to read encryption key file:', e.message);
    }
  }

  // 3. Generate new unique key for this installation
  const newKey = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(KEY_FILE, newKey, { mode: 0o600 }); // Read/write only for owner
    console.log('Generated new encryption key for this installation');
  } catch (e) {
    console.error('Failed to save encryption key:', e.message);
    console.warn('WARNING: Using in-memory key - data will not be decryptable after restart!');
  }
  return newKey;
}

/**
 * Get or generate unique salt for this installation
 */
function getEncryptionSalt() {
  // Check for existing salt file
  if (fs.existsSync(SALT_FILE)) {
    try {
      return fs.readFileSync(SALT_FILE, 'utf8').trim();
    } catch (e) {
      console.error('Failed to read salt file:', e.message);
    }
  }

  // Generate new unique salt
  const newSalt = crypto.randomBytes(16).toString('hex');
  try {
    fs.writeFileSync(SALT_FILE, newSalt, { mode: 0o600 });
  } catch (e) {
    console.error('Failed to save salt:', e.message);
  }
  return newSalt;
}

// Get unique key and salt for this installation
const ENCRYPTION_KEY = getEncryptionKey();
const ENCRYPTION_SALT = getEncryptionSalt();

// Initialize database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
db.exec(`
  -- Sessions table (main deployment sessions)
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Deployment Session',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    current_step INTEGER DEFAULT 0,
    auto_cleanup INTEGER DEFAULT 0,
    automation_mode TEXT DEFAULT 'manual',
    notes TEXT
  );

  -- Completed steps tracking
  CREATE TABLE IF NOT EXISTS completed_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    step_data TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, step_id)
  );

  -- Servers table (all servers across all steps)
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    hostname TEXT NOT NULL,
    ssh_port INTEGER DEFAULT 22,
    ssh_auth_type TEXT DEFAULT 'password',
    ssh_user TEXT DEFAULT 'root',
    ssh_user_type TEXT DEFAULT 'root',
    password_encrypted TEXT,
    ssh_key_encrypted TEXT,
    sudo_password_encrypted TEXT,
    role TEXT,
    purpose TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Credentials table (generated credentials from deployments)
  CREATE TABLE IF NOT EXISTS credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    service TEXT NOT NULL,
    key TEXT NOT NULL,
    value_encrypted TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, service, key)
  );

  -- Step modes (mysql: single/cluster, etc.)
  CREATE TABLE IF NOT EXISTS step_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'single',
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE(session_id, step_id)
  );

  -- SSL Configuration
  CREATE TABLE IF NOT EXISTS ssl_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'generate',
    domain TEXT,
    certificate_encrypted TEXT,
    private_key_encrypted TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- NFS Configuration
  CREATE TABLE IF NOT EXISTS nfs_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    disk_device TEXT DEFAULT '/dev/sdb',
    client_ip_range TEXT DEFAULT '*',
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Load Balancer Configuration
  CREATE TABLE IF NOT EXISTS lb_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    lb_type TEXT DEFAULT 'haproxy',
    backend_port TEXT DEFAULT '30080',
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Generated files for download
  CREATE TABLE IF NOT EXISTS generated_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_encrypted TEXT NOT NULL,
    mime_type TEXT DEFAULT 'text/plain',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    downloaded BOOLEAN DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_servers_session ON servers(session_id);
  CREATE INDEX IF NOT EXISTS idx_servers_step ON servers(session_id, step_id);
  CREATE INDEX IF NOT EXISTS idx_credentials_session ON credentials(session_id);
  CREATE INDEX IF NOT EXISTS idx_completed_steps_session ON completed_steps(session_id);
`);

// Migration: Add automation_mode column if it doesn't exist (for existing databases)
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN automation_mode TEXT DEFAULT 'manual'`);
} catch (e) {
  // Column already exists, ignore error
}

db.exec(`
  -- Global settings table (deployment URLs, versions, etc.)
  CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ==================== DEFAULT SETTINGS ====================
// Insert default settings if they don't exist
const defaultSettings = [
  // Deployment Settings (General)
  { key: 'auto_cleanup', value: 'false', description: 'Automatically remove server passwords from database after deployment completes', category: 'deployment' },

  // Kubernetes URLs
  { key: 'k8s_common_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubernetes/k8-common-installation.sh', description: 'Kubernetes common installation script URL', category: 'kubernetes' },
  { key: 'k8s_init_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubernetes/k8-init.sh', description: 'Kubernetes init script URL (master node)', category: 'kubernetes' },
  { key: 'k8s_default_version', value: '1.30', description: 'Default Kubernetes version', category: 'kubernetes' },

  // Helm/StackBill URLs
  { key: 'helm_deployment_chart_url', value: 'https://sb-deployment-controllers.s3.ap-south-1.amazonaws.com/charts/sb-deployment-controller-0.1.0.tgz', description: 'StackBill deployment controller Helm chart URL', category: 'stackbill' },
  { key: 'helm_release_name', value: 'sb-deployment-controller', description: 'Helm release name for StackBill deployment', category: 'stackbill' },

  // MySQL URLs
  { key: 'mysql_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/MySQL/mysql-install.sh', description: 'MySQL installation script URL', category: 'mysql' },

  // MongoDB URLs
  { key: 'mongodb_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/MongoDB/mongodb-install.sh', description: 'MongoDB installation script URL', category: 'mongodb' },

  // RabbitMQ URLs
  { key: 'rabbitmq_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/RabbitMQ/rabbitmq-install.sh', description: 'RabbitMQ installation script URL', category: 'rabbitmq' },

  // NFS URLs
  { key: 'nfs_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/NFS/nfs-install.sh', description: 'NFS installation script URL', category: 'nfs' },

  // Kubectl/Istio URLs
  { key: 'kubectl_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/Kubectl/kubectl-install.sh', description: 'Kubectl installation script URL', category: 'kubectl' },
  { key: 'istio_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/Istio/istio-install.sh', description: 'Istio installation script URL', category: 'istio' },

  // Helm URLs
  { key: 'helm_install_url', value: 'https://stacbilldeploy.s3.us-east-1.amazonaws.com/Helm/helm-install.sh', description: 'Helm installation script URL', category: 'helm' }
];

// Insert defaults (skip if already exists)
const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO global_settings (key, value, description, category, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

for (const setting of defaultSettings) {
  insertSetting.run(setting.key, setting.value, setting.description, setting.category);
}

// ==================== ENCRYPTION FUNCTIONS ====================
// AES-256-CBC encryption with unique key and salt per installation

// Derive encryption key using scrypt (slow hash to prevent brute force)
let derivedKey = null;
function getDerivedKey() {
  if (!derivedKey) {
    derivedKey = crypto.scryptSync(ENCRYPTION_KEY, ENCRYPTION_SALT, 32);
  }
  return derivedKey;
}

/**
 * Encrypt sensitive data using AES-256-CBC
 * Format: iv:encryptedData (both in hex)
 */
function encrypt(text) {
  if (!text) return null;
  try {
    const key = getDerivedKey();
    const iv = crypto.randomBytes(16); // Random IV for each encryption
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (e) {
    console.error('Encryption error:', e);
    return null;
  }
}

/**
 * Decrypt data encrypted with encrypt()
 */
function decrypt(text) {
  if (!text) return null;
  try {
    const key = getDerivedKey();
    const parts = text.split(':');
    if (parts.length !== 2) {
      console.error('Invalid encrypted data format');
      return null;
    }
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('Decryption error:', e);
    return null;
  }
}

// Generate unique session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// ==================== SESSION OPERATIONS ====================

/**
 * Create a new deployment session
 */
function createSession(name = 'Deployment Session') {
  const id = generateSessionId();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, name, created_at, updated_at, status)
    VALUES (?, ?, datetime('now'), datetime('now'), 'in_progress')
  `);
  stmt.run(id, name);
  return { id, name, status: 'in_progress' };
}

/**
 * Get session by ID
 */
function getSession(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  // Get completed steps
  const completedSteps = db.prepare(
    'SELECT step_id, completed_at, step_data FROM completed_steps WHERE session_id = ?'
  ).all(sessionId);

  // Get servers
  const serversRaw = db.prepare('SELECT * FROM servers WHERE session_id = ?').all(sessionId);
  const servers = {};
  serversRaw.forEach(server => {
    if (!servers[server.step_id]) servers[server.step_id] = [];
    servers[server.step_id].push({
      id: server.id,
      hostname: server.hostname,
      ssh_port: server.ssh_port,
      ssh_auth_type: server.ssh_auth_type,
      ssh_user: server.ssh_user,
      ssh_user_type: server.ssh_user_type,
      password: decrypt(server.password_encrypted),
      ssh_key: decrypt(server.ssh_key_encrypted),
      sudo_password: decrypt(server.sudo_password_encrypted),
      role: server.role,
      purpose: server.purpose,
      name: server.name
    });
  });

  // Get credentials
  const credsRaw = db.prepare('SELECT * FROM credentials WHERE session_id = ?').all(sessionId);
  const credentials = {};
  credsRaw.forEach(cred => {
    if (!credentials[cred.service]) credentials[cred.service] = {};
    credentials[cred.service][cred.key] = decrypt(cred.value_encrypted);
  });

  // Get step modes
  const modesRaw = db.prepare('SELECT step_id, mode FROM step_modes WHERE session_id = ?').all(sessionId);
  const modes = {};
  modesRaw.forEach(m => { modes[m.step_id] = m.mode; });

  // Get SSL config
  const sslRaw = db.prepare('SELECT * FROM ssl_config WHERE session_id = ?').get(sessionId);
  const sslConfig = sslRaw ? {
    type: sslRaw.type,
    domain: sslRaw.domain,
    certificate: decrypt(sslRaw.certificate_encrypted),
    privateKey: decrypt(sslRaw.private_key_encrypted)
  } : { type: 'generate', domain: '', certificate: '', privateKey: '' };

  // Get NFS config
  const nfsRaw = db.prepare('SELECT * FROM nfs_config WHERE session_id = ?').get(sessionId);
  const nfsConfig = nfsRaw ? {
    diskDevice: nfsRaw.disk_device,
    clientIpRange: nfsRaw.client_ip_range
  } : { diskDevice: '/dev/sdb', clientIpRange: '*' };

  // Get Load Balancer config
  const lbRaw = db.prepare('SELECT * FROM lb_config WHERE session_id = ?').get(sessionId);
  const loadBalancerConfig = lbRaw ? {
    type: lbRaw.lb_type,
    backendPort: lbRaw.backend_port
  } : { type: 'haproxy', backendPort: '30080' };

  // Get step data
  const stepData = {};
  completedSteps.forEach(step => {
    stepData[step.step_id] = step.step_data ? JSON.parse(step.step_data) : {};
  });

  return {
    ...session,
    completedSteps: completedSteps.map(s => s.step_id),
    servers,
    credentials,
    modes,
    sslConfig,
    nfsConfig,
    loadBalancerConfig,
    stepData
  };
}

/**
 * List all sessions
 */
function listSessions() {
  return db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM completed_steps WHERE session_id = s.id) as steps_completed,
           (SELECT COUNT(DISTINCT step_id) FROM servers WHERE session_id = s.id) as steps_with_servers
    FROM sessions s
    ORDER BY updated_at DESC
  `).all();
}

/**
 * Update session
 */
function updateSession(sessionId, updates) {
  const allowedFields = ['name', 'status', 'current_step', 'auto_cleanup', 'notes', 'completed_at', 'automation_mode'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      // SQLite only accepts numbers, strings, bigints, buffers, and null - convert booleans
      const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      values.push(sqlValue);
    }
  }

  if (fields.length === 0) return false;

  fields.push("updated_at = datetime('now')");
  values.push(sessionId);

  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(...values).changes > 0;
}

/**
 * Delete session and all related data
 */
function deleteSession(sessionId) {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  return stmt.run(sessionId).changes > 0;
}

// ==================== SERVER OPERATIONS ====================

/**
 * Save servers for a step
 */
function saveServers(sessionId, stepId, servers) {
  // Delete existing servers for this step
  db.prepare('DELETE FROM servers WHERE session_id = ? AND step_id = ?').run(sessionId, stepId);

  // Insert new servers
  const stmt = db.prepare(`
    INSERT INTO servers (session_id, step_id, hostname, ssh_port, ssh_auth_type, ssh_user,
                        ssh_user_type, password_encrypted, ssh_key_encrypted, sudo_password_encrypted,
                        role, purpose, name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((servers) => {
    for (const server of servers) {
      stmt.run(
        sessionId,
        stepId,
        server.hostname,
        server.ssh_port || 22,
        server.ssh_auth_type || 'password',
        server.ssh_user || 'root',
        server.ssh_user_type || 'root',
        encrypt(server.password),
        encrypt(server.ssh_key),
        encrypt(server.sudo_password),
        server.role,
        server.purpose,
        server.name
      );
    }
  });

  insertMany(servers);

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);

  return true;
}

/**
 * Remove a single server
 */
function removeServer(serverId) {
  const stmt = db.prepare('DELETE FROM servers WHERE id = ?');
  return stmt.run(serverId).changes > 0;
}

/**
 * Clear servers for a step
 */
function clearServersForStep(sessionId, stepId) {
  const stmt = db.prepare('DELETE FROM servers WHERE session_id = ? AND step_id = ?');
  return stmt.run(sessionId, stepId).changes > 0;
}

// ==================== CREDENTIALS OPERATIONS ====================

/**
 * Save credentials for a service
 */
function saveCredentials(sessionId, service, credentials) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO credentials (session_id, service, key, value_encrypted, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertMany = db.transaction((creds) => {
    for (const [key, value] of Object.entries(creds)) {
      stmt.run(sessionId, service, key, encrypt(value));
    }
  });

  insertMany(credentials);
  return true;
}

/**
 * Get credentials for a service
 */
function getCredentials(sessionId, service) {
  const rows = db.prepare(
    'SELECT key, value_encrypted FROM credentials WHERE session_id = ? AND service = ?'
  ).all(sessionId, service);

  const result = {};
  rows.forEach(row => {
    result[row.key] = decrypt(row.value_encrypted);
  });
  return result;
}

// ==================== STEP COMPLETION OPERATIONS ====================

/**
 * Mark step as completed
 */
function completeStep(sessionId, stepId, stepData = {}) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO completed_steps (session_id, step_id, completed_at, step_data)
    VALUES (?, ?, datetime('now'), ?)
  `);
  stmt.run(sessionId, stepId, JSON.stringify(stepData));

  // Update session timestamp
  db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);

  return true;
}

/**
 * Unmark step as completed
 */
function uncompleteStep(sessionId, stepId) {
  const stmt = db.prepare('DELETE FROM completed_steps WHERE session_id = ? AND step_id = ?');
  return stmt.run(sessionId, stepId).changes > 0;
}

// ==================== STEP MODES OPERATIONS ====================

/**
 * Set mode for a step (single/cluster)
 */
function setStepMode(sessionId, stepId, mode) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO step_modes (session_id, step_id, mode)
    VALUES (?, ?, ?)
  `);
  return stmt.run(sessionId, stepId, mode).changes > 0;
}

// ==================== SSL CONFIG OPERATIONS ====================

/**
 * Save SSL configuration
 */
function saveSSLConfig(sessionId, config) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ssl_config (session_id, type, domain, certificate_encrypted, private_key_encrypted)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(
    sessionId,
    config.type,
    config.domain,
    encrypt(config.certificate),
    encrypt(config.privateKey)
  ).changes > 0;
}

// ==================== NFS CONFIG OPERATIONS ====================

/**
 * Save NFS configuration
 */
function saveNFSConfig(sessionId, config) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO nfs_config (session_id, disk_device, client_ip_range)
    VALUES (?, ?, ?)
  `);
  return stmt.run(
    sessionId,
    config.diskDevice || '/dev/sdb',
    config.clientIpRange || '*'
  ).changes > 0;
}

/**
 * Get NFS configuration for a session
 */
function getNFSConfig(sessionId) {
  const stmt = db.prepare(`
    SELECT disk_device, client_ip_range FROM nfs_config WHERE session_id = ?
  `);
  const row = stmt.get(sessionId);
  if (row) {
    return {
      diskDevice: row.disk_device,
      clientIpRange: row.client_ip_range
    };
  }
  return { diskDevice: '/dev/sdb', clientIpRange: '*' };
}

/**
 * Save Load Balancer configuration
 */
function saveLBConfig(sessionId, config) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO lb_config (session_id, lb_type, backend_port)
    VALUES (?, ?, ?)
  `);
  return stmt.run(
    sessionId,
    config.type || 'haproxy',
    config.backendPort || '30080'
  ).changes > 0;
}

/**
 * Get Load Balancer configuration for a session
 */
function getLBConfig(sessionId) {
  const stmt = db.prepare(`
    SELECT lb_type, backend_port FROM lb_config WHERE session_id = ?
  `);
  const row = stmt.get(sessionId);
  if (row) {
    return {
      type: row.lb_type,
      backendPort: row.backend_port
    };
  }
  return { type: 'haproxy', backendPort: '30080' };
}

// ==================== GENERATED FILES OPERATIONS ====================

/**
 * Save a generated file
 */
function saveGeneratedFile(sessionId, stepId, filename, content, mimeType = 'text/plain') {
  const stmt = db.prepare(`
    INSERT INTO generated_files (session_id, step_id, filename, content_encrypted, mime_type, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  return stmt.run(sessionId, stepId, filename, encrypt(content), mimeType).lastInsertRowid;
}

/**
 * Get generated files for a session
 */
function getGeneratedFiles(sessionId, stepId = null) {
  let query = 'SELECT id, step_id, filename, mime_type, created_at, downloaded FROM generated_files WHERE session_id = ?';
  const params = [sessionId];

  if (stepId) {
    query += ' AND step_id = ?';
    params.push(stepId);
  }

  return db.prepare(query).all(...params);
}

/**
 * Get file content by ID
 */
function getFileContent(fileId) {
  const file = db.prepare('SELECT * FROM generated_files WHERE id = ?').get(fileId);
  if (!file) return null;

  return {
    ...file,
    content: decrypt(file.content_encrypted)
  };
}

/**
 * Mark file as downloaded
 */
function markFileDownloaded(fileId) {
  const stmt = db.prepare('UPDATE generated_files SET downloaded = 1 WHERE id = ?');
  return stmt.run(fileId).changes > 0;
}

// ==================== CLEANUP OPERATIONS ====================

/**
 * Clean up completed session data (for auto-cleanup after installation)
 */
function cleanupSession(sessionId) {
  // Delete sensitive data but keep the session record
  db.prepare('DELETE FROM servers WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM ssl_config WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM nfs_config WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM lb_config WHERE session_id = ?').run(sessionId);

  // Update session status
  db.prepare(`
    UPDATE sessions
    SET status = 'cleaned', updated_at = datetime('now')
    WHERE id = ?
  `).run(sessionId);

  return true;
}

/**
 * Export all credentials for a session as JSON
 */
function exportSessionCredentials(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  return {
    sessionId,
    sessionName: session.name,
    exportedAt: new Date().toISOString(),
    credentials: session.credentials,
    servers: Object.entries(session.servers).reduce((acc, [stepId, servers]) => {
      acc[stepId] = servers.map(s => ({
        hostname: s.hostname,
        role: s.role,
        purpose: s.purpose,
        name: s.name
      }));
      return acc;
    }, {})
  };
}

// ==================== GLOBAL SETTINGS OPERATIONS ====================

/**
 * Get all global settings
 */
function getAllSettings() {
  return db.prepare('SELECT * FROM global_settings ORDER BY category, key').all();
}

/**
 * Get settings by category
 */
function getSettingsByCategory(category) {
  return db.prepare('SELECT * FROM global_settings WHERE category = ? ORDER BY key').all(category);
}

/**
 * Get a single setting value
 */
function getSetting(key) {
  const row = db.prepare('SELECT value FROM global_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Update a setting
 */
function updateSetting(key, value) {
  const stmt = db.prepare(`
    UPDATE global_settings
    SET value = ?, updated_at = datetime('now')
    WHERE key = ?
  `);
  return stmt.run(value, key).changes > 0;
}

/**
 * Add a new setting
 */
function addSetting(key, value, description = '', category = 'general') {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO global_settings (key, value, description, category, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(key, value, description, category);
  return true; // INSERT OR REPLACE always succeeds
}

/**
 * Delete a setting
 */
function deleteSetting(key) {
  const stmt = db.prepare('DELETE FROM global_settings WHERE key = ?');
  return stmt.run(key).changes > 0;
}

/**
 * Reset a setting to default value
 */
function resetSetting(key) {
  const defaultSetting = defaultSettings.find(s => s.key === key);
  if (defaultSetting) {
    return updateSetting(key, defaultSetting.value);
  }
  return false;
}

/**
 * Reset all settings to defaults
 */
function resetAllSettings() {
  const stmt = db.prepare(`
    UPDATE global_settings
    SET value = ?, updated_at = datetime('now')
    WHERE key = ?
  `);

  const resetMany = db.transaction(() => {
    for (const setting of defaultSettings) {
      stmt.run(setting.value, setting.key);
    }
  });

  resetMany();
  return true;
}

// Export all functions
module.exports = {
  // Session
  createSession,
  getSession,
  listSessions,
  updateSession,
  deleteSession,

  // Servers
  saveServers,
  removeServer,
  clearServersForStep,

  // Credentials
  saveCredentials,
  getCredentials,

  // Step completion
  completeStep,
  uncompleteStep,

  // Step modes
  setStepMode,

  // SSL config
  saveSSLConfig,

  // NFS config
  saveNFSConfig,
  getNFSConfig,

  // Load Balancer config
  saveLBConfig,
  getLBConfig,

  // Generated files
  saveGeneratedFile,
  getGeneratedFiles,
  getFileContent,
  markFileDownloaded,

  // Cleanup
  cleanupSession,
  exportSessionCredentials,

  // Global settings
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  updateSetting,
  addSetting,
  deleteSetting,
  resetSetting,
  resetAllSettings,

  // Utilities
  generateSessionId,
  encrypt,
  decrypt
};
