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
    // Debug authentication attempt
    logger.info('🔐 Authentication attempt:', {
      url: req.url,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderStart: req.headers.authorization ? req.headers.authorization.substring(0, 10) + '...' : 'none',
      userAgent: req.get('User-Agent')
    });

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('❌ Auth failed: No valid token header', {
        authHeader: authHeader ? 'exists but wrong format' : 'missing',
        headerValue: authHeader ? authHeader.substring(0, 20) + '...' : 'undefined'
      });
      
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    logger.info('🔍 Verifying token...', {
      tokenLength: token.length,
      tokenStart: token.substring(0, 10) + '...'
    });

    // Verify token
    const verification = await authService.verifyToken(token);
    
    if (!verification.valid) {
      logger.error('❌ Token verification failed:', {
        error: verification.error,
        tokenLength: token.length
      });
      
      return res.status(401).json({
        success: false,
        error: verification.error || 'Invalid token'
      });
    }

    logger.info('✅ Authentication successful:', {
      userId: verification.user.id,
      email: verification.user.email
    });

    // Add user and session info to request
    req.user = verification.user;
    req.session = verification.session;
    req.token = token;

    next();
  } catch (error) {
    logger.error('❌ Authentication middleware error:', {
      error: error.message,
      stack: error.stack
    });
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