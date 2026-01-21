/**
 * Config Controller
 * Handles NFS and Load Balancer configuration management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/nfs-config
 * Save NFS configuration
 */
function saveNFSConfig(req, res) {
  try {
    const { config } = req.body;
    if (!config) {
      return response.badRequest(res, 'Config is required');
    }
    db.saveNFSConfig(req.params.id, config);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id/nfs-config
 * Get NFS configuration
 */
function getNFSConfig(req, res) {
  try {
    const config = db.getNFSConfig(req.params.id);
    response.success(res, { config });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/sessions/:id/lb-config
 * Save Load Balancer configuration
 */
function saveLBConfig(req, res) {
  try {
    const { config } = req.body;
    if (!config) {
      return response.badRequest(res, 'Config is required');
    }
    db.saveLBConfig(req.params.id, config);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id/lb-config
 * Get Load Balancer configuration
 */
function getLBConfig(req, res) {
  try {
    const config = db.getLBConfig(req.params.id);
    response.success(res, { config });
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  saveNFSConfig,
  getNFSConfig,
  saveLBConfig,
  getLBConfig
};
