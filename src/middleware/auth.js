const authService = require('../services/AuthService');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate requests using JWT
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const verification = await authService.verifyToken(token);
    
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: verification.error || 'Invalid token'
      });
    }

    // Add user and session info to request
    req.user = verification.user;
    req.session = verification.session;
    req.token = token;

    next();
  } catch (error) {
    logger.error('❌ Authentication middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const verification = await authService.verifyToken(token);
      
      if (verification.valid) {
        req.user = verification.user;
        req.session = verification.session;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    logger.warn('⚠️ Optional auth failed:', error.message);
    next();
  }
};

/**
 * Middleware to check if user has specific permissions
 * @param {Array|string} permissions - Required permissions
 * @returns {Function} Middleware function
 */
const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // For now, all authenticated users have all permissions
    // This can be extended with role-based access control
    next();
  };
};

/**
 * Middleware to check if user is active
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const requireActiveUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  if (!req.user.isActive) {
    return res.status(403).json({
      success: false,
      error: 'Account is deactivated'
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requirePermissions,
  requireActiveUser
}; 