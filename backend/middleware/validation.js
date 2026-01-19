/**
 * Validation Middleware
 * Request validation for API endpoints
 */

const { badRequest } = require('./errorHandler');

/**
 * Validate servers array in request body
 */
function validateServers(req, res, next) {
  const { servers } = req.body;

  if (!servers || !Array.isArray(servers) || servers.length === 0) {
    return next(badRequest('Servers array is required'));
  }

  // Validate each server has required fields
  for (let i = 0; i < servers.length; i++) {
    const server = servers[i];
    if (!server.hostname) {
      return next(badRequest(`Server ${i + 1}: hostname is required`));
    }
  }

  next();
}

/**
 * Validate NFS variables
 */
function validateNfsVariables(req, res, next) {
  const { variables = {} } = req.body;

  if (!variables.disk_device || !variables.client_ip_range) {
    return next(badRequest('Variables disk_device and client_ip_range are required'));
  }

  next();
}

/**
 * Validate Kubernetes has at least one master
 */
function validateKubernetesMaster(req, res, next) {
  const { servers } = req.body;

  const hasMaster = servers.some(s => s.role === 'master');
  if (!hasMaster) {
    return next(badRequest('At least one master node is required'));
  }

  next();
}

/**
 * Validate session ID parameter
 */
function validateSessionId(req, res, next) {
  const { id } = req.params;

  if (!id || id.length !== 32) {
    return next(badRequest('Invalid session ID format'));
  }

  next();
}

/**
 * Validate credentials object
 */
function validateCredentials(req, res, next) {
  const { credentials } = req.body;

  if (!credentials || typeof credentials !== 'object') {
    return next(badRequest('Credentials object is required'));
  }

  next();
}

/**
 * Validate mode in request body
 */
function validateMode(req, res, next) {
  const { mode } = req.body;

  if (!mode) {
    return next(badRequest('Mode is required'));
  }

  next();
}

/**
 * Validate SSL config
 */
function validateSSLConfig(req, res, next) {
  const { config } = req.body;

  if (!config) {
    return next(badRequest('Config is required'));
  }

  next();
}

/**
 * Validate file upload fields
 */
function validateFileUpload(req, res, next) {
  const { stepId, filename, content } = req.body;

  if (!stepId || !filename || !content) {
    return next(badRequest('stepId, filename, and content are required'));
  }

  next();
}

/**
 * Validate setting value
 */
function validateSettingValue(req, res, next) {
  const { value } = req.body;

  if (value === undefined) {
    return next(badRequest('Value is required'));
  }

  next();
}

/**
 * Validate new setting
 */
function validateNewSetting(req, res, next) {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return next(badRequest('Key and value are required'));
  }

  next();
}

module.exports = {
  validateServers,
  validateNfsVariables,
  validateKubernetesMaster,
  validateSessionId,
  validateCredentials,
  validateMode,
  validateSSLConfig,
  validateFileUpload,
  validateSettingValue,
  validateNewSetting
};
