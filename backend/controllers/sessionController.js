/**
 * Session Controller
 * Handles deployment session management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions
 * Create a new deployment session
 */
function createSession(req, res) {
  try {
    const { name } = req.body;
    const session = db.createSession(name || 'Deployment Session');
    response.success(res, { session });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions
 * List all deployment sessions
 */
function listSessions(req, res) {
  try {
    const sessions = db.listSessions();
    response.success(res, { sessions });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id
 * Get session by ID with full details
 */
function getSession(req, res) {
  try {
    const session = db.getSession(req.params.id);
    if (!session) {
      return response.notFound(res, 'Session');
    }
    response.success(res, { session });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * PATCH /api/sessions/:id
 * Update session properties
 */
function updateSession(req, res) {
  try {
    const success = db.updateSession(req.params.id, req.body);
    if (!success) {
      return response.notFound(res, 'Session');
    }
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * DELETE /api/sessions/:id
 * Delete a session and all related data
 */
function deleteSession(req, res) {
  try {
    const success = db.deleteSession(req.params.id);
    if (!success) {
      return response.notFound(res, 'Session');
    }
    response.success(res);
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * POST /api/sessions/:id/cleanup
 * Cleanup session sensitive data
 */
function cleanupSession(req, res) {
  try {
    db.cleanupSession(req.params.id);
    response.success(res, { message: 'Session cleaned up successfully' });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id/export
 * Export session credentials as JSON
 */
function exportSession(req, res) {
  try {
    const exportData = db.exportSessionCredentials(req.params.id);
    if (!exportData) {
      return response.notFound(res, 'Session');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="stackbill-credentials-${req.params.id.substring(0, 8)}.json"`);
    res.json(exportData);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  cleanupSession,
  exportSession
};
