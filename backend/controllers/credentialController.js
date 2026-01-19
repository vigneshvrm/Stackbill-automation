/**
 * Credential Controller
 * Handles credential management within sessions
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/credentials/:service
 * Save credentials for a service
 */
function saveCredentials(req, res) {
  try {
    const { credentials } = req.body;
    db.saveCredentials(req.params.id, req.params.service, credentials);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  saveCredentials
};
