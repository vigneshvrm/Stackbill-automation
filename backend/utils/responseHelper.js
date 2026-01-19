/**
 * Response Helper Utilities
 * Standardized API response formatting
 */

/**
 * Send success response
 * @param {object} res - Express response object
 * @param {object} data - Data to send
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function success(res, data = {}, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    ...data
  });
}

/**
 * Send error response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 */
function error(res, message, statusCode = 500) {
  res.status(statusCode).json({
    error: message
  });
}

/**
 * Send not found response
 * @param {object} res - Express response object
 * @param {string} resource - Resource name
 */
function notFound(res, resource = 'Resource') {
  error(res, `${resource} not found`, 404);
}

/**
 * Send bad request response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 */
function badRequest(res, message) {
  error(res, message, 400);
}

/**
 * Send created response
 * @param {object} res - Express response object
 * @param {object} data - Created resource data
 */
function created(res, data = {}) {
  success(res, data, 201);
}

module.exports = {
  success,
  error,
  notFound,
  badRequest,
  created
};
