const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/AuthService');
const ActivityLogService = require('../services/ActivityLogService');
const { authenticate } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Validation middleware for registration
 */
const validateRegister = [
  body('email')
    .isEmail()
    .trim()
    .toLowerCase()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('firstName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Last name is required'),
  body('appVersion')
    .optional()
    .isString()
    .withMessage('App version must be a string')
];

/**
 * Validation middleware for login
 */
const validateLogin = [
  body('email')
    .isEmail()
    .trim()
    .toLowerCase()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('appVersion')
    .optional()
    .isString()
    .withMessage('App version must be a string')
];

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * POST /api/auth/register
 * Register a new user (DISABLED)
 * Registration is disabled. Users can only be created by administrators.
 */
router.post('/register', 
  asyncHandler(async (req, res) => {
    // Registration is disabled - users must be created by admin
    logger.warn('⚠️  Registration attempt blocked', { 
      email: req.body?.email,
      ip: req.ip 
    });

    res.status(403).json({
      success: false,
      error: 'Registration is currently disabled. Please login with the credentials shared by our team. If you have not received your credentials, please reach out to our team for access.',
      message: 'Registration is currently disabled. Please login with the credentials shared by our team. If you have not received your credentials, please reach out to our team for access.',
      errorCode: 'REGISTRATION_DISABLED'
    });
  })
);

/**
 * POST /api/auth/login
 * Authenticate user login
 */
router.post('/login',
  validateLogin,
  handleValidationErrors,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { email, password, appVersion } = req.body;
    
    // Get device info from request
    const deviceInfo = {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      platform: req.get('X-Platform') || 'web'
    };

    const result = await authService.login({
      email,
      password,
      appVersion,
      deviceInfo
    });

    if (result.success) {
      logger.info('🔐 User logged in', { 
        email,
        userId: result.user.id 
      });

      // Log successful login
      await ActivityLogService.logLogin(result.user, req, true);

      res.json({
        success: true,
        message: 'Login successful',
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken
      });
    } else {
      // Log failed login attempt
      await ActivityLogService.logLogin(
        { id: 'unknown', email, userName: null, role: 'user' }, 
        req, 
        false, 
        result.error || result.message
      );

      res.status(401).json({
        success: false,
        error: result.error,
        message: result.message || result.error,
        ...(result.errorCode && { errorCode: result.errorCode }),
        ...(result.downloadUrl && { downloadUrl: result.downloadUrl })
      });
    }
  })
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh',
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    const result = await authService.refreshToken(refreshToken);

    if (result.success) {
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error
      });
    }
  })
);

/**
 * POST /api/auth/logout
 * Logout user and invalidate session
 */
router.post('/logout',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const result = await authService.logout(req.token);

    if (result.success) {
      logger.info('👋 User logged out', { userId: req.user.id });

      // Log logout activity
      await ActivityLogService.logLogout(req.user, req);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  })
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      user: req.user
    });
  })
);

/**
 * GET /api/auth/sessions
 * Get user's active sessions
 */
router.get('/sessions',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const sessions = await authService.getUserSessions(req.user.id);

    res.json({
      success: true,
      sessions
    });
  })
);

/**
 * DELETE /api/auth/sessions
 * Terminate all user sessions
 */
router.delete('/sessions',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const result = await authService.terminateAllSessions(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: `Terminated ${result.terminatedSessions} sessions`
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  })
);

/**
 * POST /api/auth/verify
 * Verify token validity (for frontend)
 */
router.post('/verify',
  body('token').notEmpty().withMessage('Token is required'),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    const verification = await authService.verifyToken(token);

    if (verification.valid) {
      res.json({
        success: true,
        valid: true,
        user: verification.user
      });
    } else {
      res.status(401).json({
        success: false,
        valid: false,
        error: verification.error
      });
    }
  })
);

module.exports = router; 