/**
 * Server Controller
 * Handles server management within sessions
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/servers/:stepId
 * Save servers for a specific step
 */
function saveServers(req, res) {
  try {
    const { servers } = req.body;
    db.saveServers(req.params.id, req.params.stepId, servers);
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * DELETE /api/sessions/:id/servers/:serverId
 * Remove a single server by ID
 */
function removeServer(req, res) {
  try {
    const success = db.removeServer(parseInt(req.params.serverId));
    response.success(res, { success });
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  saveServers,
  removeServer
};
