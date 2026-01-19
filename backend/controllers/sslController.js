/**
 * SSL Controller
 * Handles SSL configuration management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/ssl-config
 * Save SSL configuration
 */
function saveSSLConfig(req, res) {
  try {
    const { config } = req.body;
    db.saveSSLConfig(req.params.id, config);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  saveSSLConfig
};
