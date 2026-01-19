/**
 * Session Routes
 * /api/sessions/* endpoints for deployment session management
 */

const express = require('express');
const router = express.Router();
const { session, server, credential, step, ssl, file } = require('../controllers');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validateServers,
  validateCredentials,
  validateMode,
  validateSSLConfig,
  validateFileUpload
} = require('../middleware/validation');

// =====================================================
// SESSION CRUD OPERATIONS
// =====================================================

/**
 * @route   POST /api/sessions
 * @desc    Create a new deployment session
 * @access  Public
 */
router.post('/', asyncHandler(session.createSession));

/**
 * @route   GET /api/sessions
 * @desc    List all deployment sessions
 * @access  Public
 */
router.get('/', asyncHandler(session.listSessions));

/**
 * @route   GET /api/sessions/:id
 * @desc    Get session by ID with full details
 * @access  Public
 */
router.get('/:id', asyncHandler(session.getSession));

/**
 * @route   PATCH /api/sessions/:id
 * @desc    Update session properties
 * @access  Public
 */
router.patch('/:id', asyncHandler(session.updateSession));

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Delete a session and all related data
 * @access  Public
 */
router.delete('/:id', asyncHandler(session.deleteSession));

// =====================================================
// SERVER MANAGEMENT
// =====================================================

/**
 * @route   POST /api/sessions/:id/servers/:stepId
 * @desc    Save servers for a specific step
 * @access  Public
 */
router.post('/:id/servers/:stepId',
  validateServers,
  asyncHandler(server.saveServers)
);

/**
 * @route   DELETE /api/sessions/:id/servers/:serverId
 * @desc    Remove a single server by ID
 * @access  Public
 */
router.delete('/:id/servers/:serverId', asyncHandler(server.removeServer));

// =====================================================
// CREDENTIAL MANAGEMENT
// =====================================================

/**
 * @route   POST /api/sessions/:id/credentials/:service
 * @desc    Save credentials for a service
 * @access  Public
 */
router.post('/:id/credentials/:service',
  validateCredentials,
  asyncHandler(credential.saveCredentials)
);

// =====================================================
// STEP MANAGEMENT
// =====================================================

/**
 * @route   POST /api/sessions/:id/steps/:stepId/complete
 * @desc    Mark a step as completed
 * @access  Public
 */
router.post('/:id/steps/:stepId/complete', asyncHandler(step.completeStep));

/**
 * @route   POST /api/sessions/:id/steps/:stepId/mode
 * @desc    Set the mode for a step
 * @access  Public
 */
router.post('/:id/steps/:stepId/mode',
  validateMode,
  asyncHandler(step.setStepMode)
);

// =====================================================
// SSL CONFIGURATION
// =====================================================

/**
 * @route   POST /api/sessions/:id/ssl-config
 * @desc    Save SSL configuration
 * @access  Public
 */
router.post('/:id/ssl-config',
  validateSSLConfig,
  asyncHandler(ssl.saveSSLConfig)
);

// =====================================================
// FILE MANAGEMENT
// =====================================================

/**
 * @route   POST /api/sessions/:id/files
 * @desc    Save a generated file
 * @access  Public
 */
router.post('/:id/files',
  validateFileUpload,
  asyncHandler(file.saveFile)
);

/**
 * @route   GET /api/sessions/:id/files
 * @desc    List generated files for a session
 * @access  Public
 */
router.get('/:id/files', asyncHandler(file.listFiles));

/**
 * @route   GET /api/sessions/:id/files/:fileId/download
 * @desc    Download a generated file
 * @access  Public
 */
router.get('/:id/files/:fileId/download', asyncHandler(file.downloadFile));

// =====================================================
// SESSION UTILITIES
// =====================================================

/**
 * @route   GET /api/sessions/:id/export
 * @desc    Export session credentials as JSON
 * @access  Public
 */
router.get('/:id/export', asyncHandler(session.exportSession));

/**
 * @route   POST /api/sessions/:id/cleanup
 * @desc    Cleanup session sensitive data
 * @access  Public
 */
router.post('/:id/cleanup', asyncHandler(session.cleanupSession));

module.exports = router;
