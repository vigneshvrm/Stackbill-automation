/**
 * Health Controller
 * Handles health check endpoints
 */

const response = require('../utils/responseHelper');

/**
 * GET /api/health
 * Check if the API server is running
 */
function getHealth(req, res) {
  res.json({
    status: 'ok',
    message: 'Ansible API Server is running'
  });
}

module.exports = {
  getHealth
};
