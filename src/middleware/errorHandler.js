const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const errorHandler = (error, req, res, next) => {
  // Log the error
  logger.logApiError(error, req);

  // Default error response
  let statusCode = 500;
  let message = 'Internal server error';
  let details = null;

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    details = Object.values(error.errors).map(err => err.message);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
    const field = Object.keys(error.keyValue)[0];
    details = `${field} already exists`;
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (error.status || error.statusCode) {
    statusCode = error.status || error.statusCode;
    message = error.message;
  }

  // Send error response
  const errorResponse = {
    success: false,
    error: message
  };

  if (details) {
    errorResponse.details = details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Handle 404 errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
};

/**
 * Async error wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler
}; 