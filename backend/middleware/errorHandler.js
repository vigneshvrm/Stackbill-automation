/**
 * Error Handling Middleware
 * Centralized error handling for the API
 */

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
  }
}

/**
 * Create a bad request error
 * @param {string} message - Error message
 * @returns {ApiError}
 */
function badRequest(message) {
  return new ApiError(message, 400);
}

/**
 * Create a not found error
 * @param {string} resource - Resource name
 * @returns {ApiError}
 */
function notFound(resource = 'Resource') {
  return new ApiError(`${resource} not found`, 404);
}

/**
 * Async handler wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Default to 500 internal server error
  res.status(500).json({ error: err.message || 'Internal server error' });
}

/**
 * Not found handler for undefined routes
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Endpoint not found' });
}

module.exports = {
  ApiError,
  badRequest,
  notFound,
  asyncHandler,
  errorHandler,
  notFoundHandler
};
