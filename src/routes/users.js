const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const databaseService = require('../services/DatabaseService');
const authService = require('../services/AuthService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Validation middleware
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
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/profile',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const user = await databaseService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.getPublicProfile()
    });
  })
);

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile',
  authenticate,
  requireDatabase,
  [
    body('firstName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('First name must be 1-50 characters'),
    body('lastName').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Last name must be 1-50 characters'),
    body('preferences').optional().isObject().withMessage('Preferences must be an object'),
    body('preferences.theme').optional().isIn(['light', 'dark']).withMessage('Theme must be light or dark'),
    body('preferences.language').optional().isString().withMessage('Language must be a string'),
    body('preferences.notifications').optional().isBoolean().withMessage('Notifications must be boolean')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.email;
    delete updates.password;
    delete updates.id;
    delete updates.isActive;

    const updatedUser = await databaseService.updateUserProfile(req.user.id, updates);

    logger.info('👤 User profile updated', {
      userId: req.user.id,
      fields: Object.keys(updates)
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  })
);

/**
 * GET /api/users/stats
 * Get user statistics
 */
router.get('/stats',
  authenticate,
  asyncHandler(async (req, res) => {
    const stats = await databaseService.getUserStats(req.user.id);

    res.json({
      success: true,
      stats
    });
  })
);

/**
 * GET /api/users/preferences
 * Get user preferences
 */
router.get('/preferences',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await databaseService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      preferences: user.preferences
    });
  })
);

/**
 * PUT /api/users/preferences
 * Update user preferences
 */
router.put('/preferences',
  authenticate,
  [
    body('theme').optional().isIn(['light', 'dark']).withMessage('Theme must be light or dark'),
    body('language').optional().isString().isLength({ min: 2, max: 5 }).withMessage('Language must be 2-5 characters'),
    body('notifications').optional().isBoolean().withMessage('Notifications must be boolean')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const preferences = req.body;
    
    const updatedUser = await databaseService.updateUserProfile(req.user.id, { preferences });

    logger.info('⚙️ User preferences updated', {
      userId: req.user.id,
      preferences
    });

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: updatedUser.preferences
    });
  })
);

/**
 * GET /api/users/sessions
 * Get user's active sessions
 */
router.get('/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessions = await authService.getUserSessions(req.user.id);

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
  })
);

/**
 * DELETE /api/users/sessions/:sessionId
 * Terminate specific session
 */
router.delete('/sessions/:sessionId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    // Note: This would require implementing session termination by ID in AuthService
    // For now, we'll return a placeholder response
    res.json({
      success: true,
      message: 'Session termination not yet implemented'
    });
  })
);

/**
 * DELETE /api/users/sessions
 * Terminate all user sessions except current
 */
router.delete('/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await authService.terminateAllSessions(req.user.id);

    logger.info('🔒 All sessions terminated', {
      userId: req.user.id,
      terminatedCount: result.terminatedSessions
    });

    res.json({
      success: true,
      message: `Terminated ${result.terminatedSessions} sessions`
    });
  })
);

/**
 * POST /api/users/change-password
 * Change user password
 */
router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    })
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    const user = await databaseService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Terminate all other sessions for security
    await authService.terminateAllSessions(req.user.id);

    logger.info('🔑 Password changed', {
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.'
    });
  })
);

/**
 * DELETE /api/users/account
 * Delete user account (soft delete)
 */
router.delete('/account',
  authenticate,
  [
    body('password').notEmpty().withMessage('Password is required to delete account'),
    body('confirmation').equals('DELETE').withMessage('Must confirm with "DELETE"')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    
    const user = await databaseService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Password is incorrect'
      });
    }

    // Soft delete - deactivate account
    user.isActive = false;
    await user.save();

    // Terminate all sessions
    await authService.terminateAllSessions(req.user.id);

    logger.info('🗑️ User account deactivated', {
      userId: req.user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Account has been deactivated successfully'
    });
  })
);

/**
 * GET /api/users/export
 * Export user data (GDPR compliance)
 */
router.get('/export',
  authenticate,
  asyncHandler(async (req, res) => {
    // Get user data
    const user = await databaseService.getUserById(req.user.id);
    const transcripts = await databaseService.getUserTranscripts(req.user.id, {
      limit: 1000,
      includeSegments: true
    });
    const stats = await databaseService.getUserStats(req.user.id);

    const exportData = {
      user: user.getPublicProfile(),
      transcripts,
      statistics: stats,
      exportDate: new Date().toISOString(),
      dataRetentionInfo: {
        transcripts: 'Retained until manually deleted',
        userProfile: 'Retained while account is active',
        sessions: 'Automatically deleted after expiration'
      }
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="leepi-data-export-${req.user.id}.json"`);

    logger.info('📤 User data exported', {
      userId: req.user.id,
      transcriptCount: transcripts.length
    });

    res.json(exportData);
  })
);

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    try {
      logger.info('📋 Getting all users list', { adminId: req.user.id });
      
      const users = await databaseService.getAllUsers();
      
      logger.info('✅ Users list retrieved successfully', { 
        adminId: req.user.id,
        count: users.length 
      });
      
      res.json({
        success: true,
        users: users
      });
    } catch (error) {
      logger.error('❌ Failed to get users list:', {
        error: error.message,
        stack: error.stack,
        adminId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * DELETE /api/users/:userId
 * Delete a user (admin only)
 */
router.delete('/:userId',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    
    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const result = await databaseService.deleteUser(userId);
    
    if (result.success) {
      logger.info('🗑️ User deleted by admin', {
        adminId: req.user.id,
        deletedUserId: userId
      });

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  })
);

/**
 * PUT /api/users/:userId/role
 * Update user role (admin only)
 */
router.put('/:userId/role',
  authenticate,
  requireAdmin,
  [
    body('role').isIn(['user', 'admin']).withMessage('Invalid role')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    
    // Prevent self-role change
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own role'
      });
    }

    const result = await databaseService.updateUserRole(userId, role);
    
    if (result.success) {
      logger.info('👑 User role updated by admin', {
        adminId: req.user.id,
        userId,
        newRole: role
      });

      res.json({
        success: true,
        message: 'User role updated successfully',
        user: result.user
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  })
);

module.exports = router; 