/**
 * File Controller
 * Handles generated file management
 */

const db = require('../database');
const response = require('../utils/responseHelper');

/**
 * POST /api/sessions/:id/files
 * Save a generated file
 */
function saveFile(req, res) {
  try {
    const { stepId, filename, content, mimeType } = req.body;
    const fileId = db.saveGeneratedFile(req.params.id, stepId, filename, content, mimeType);
    response.success(res, { fileId });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id/files
 * List generated files for a session
 */
function listFiles(req, res) {
  try {
    const files = db.getGeneratedFiles(req.params.id, req.query.stepId);
    response.success(res, { files });
  } catch (error) {
    response.error(res, error.message);
  }
}

/**
 * GET /api/sessions/:id/files/:fileId/download
 * Download a generated file
 */
function downloadFile(req, res) {
  try {
    const file = db.getFileContent(parseInt(req.params.fileId));
    if (!file) {
      return response.notFound(res, 'File');
    }

    // Mark as downloaded
    db.markFileDownloaded(file.id);

    // Send file
    res.setHeader('Content-Type', file.mime_type || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.content);
  } catch (error) {
    response.error(res, error.message);
  }
}

module.exports = {
  saveFile,
  listFiles,
  downloadFile
};
