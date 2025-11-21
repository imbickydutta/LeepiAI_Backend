const express = require('express');
const router = express.Router();
const ActivityLogService = require('../services/ActivityLogService');
const { authenticate, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Utility function to wrap async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * GET /api/activity-logs
 * Get activity logs with filters (Admin only)
 * 
 * Query params:
 * - userId: Filter by user ID
 * - actionType: Filter by action type (LOGIN, TRANSCRIPT_GENERATED, etc.)
 * - startDate: Start date for date range (ISO 8601 format)
 * - endDate: End date for date range (ISO 8601 format)
 * - success: Filter by success status (true/false)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - sortBy: Sort field (default: createdAt)
 * - sortOrder: Sort order (asc/desc, default: desc)
 */
router.get('/', 
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      userId,
      actionType,
      startDate,
      endDate,
      success,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Validate and sanitize inputs
    const filters = {
      page: Math.max(1, parseInt(page)),
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      sortBy,
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
    };
    
    if (userId) filters.userId = userId;
    if (actionType) filters.actionType = actionType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (success !== undefined) filters.success = success === 'true';
    
    logger.info('Admin fetching activity logs', {
      adminId: req.user.id,
      filters
    });
    
    const result = await ActivityLogService.getLogs(filters);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch activity logs',
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result.data.logs,
      pagination: result.data.pagination,
      filters: {
        userId: userId || null,
        actionType: actionType || null,
        startDate: startDate || null,
        endDate: endDate || null,
        success: success !== undefined ? success === 'true' : null
      }
    });
  })
);

/**
 * GET /api/activity-logs/statistics
 * Get activity statistics (Admin only)
 * 
 * Query params:
 * - userId: Filter by user ID
 * - startDate: Start date for date range
 * - endDate: End date for date range
 */
router.get('/statistics',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId, startDate, endDate } = req.query;
    
    const filters = {};
    if (userId) filters.userId = userId;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    logger.info('Admin fetching activity statistics', {
      adminId: req.user.id,
      filters
    });
    
    const result = await ActivityLogService.getStatistics(filters);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result.data,
      filters
    });
  })
);

/**
 * GET /api/activity-logs/user/:userId
 * Get activity logs for a specific user (Admin only)
 */
router.get('/user/:userId',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { days = 30 } = req.query;
    
    logger.info('Admin fetching user activity summary', {
      adminId: req.user.id,
      targetUserId: userId,
      days
    });
    
    const result = await ActivityLogService.getUserActivitySummary(
      userId, 
      parseInt(days)
    );
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user activity',
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result.data
    });
  })
);

/**
 * GET /api/activity-logs/action-types
 * Get available action types (Admin only)
 */
router.get('/action-types',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const actionTypes = [
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'TRANSCRIPT_GENERATED',
      'TRANSCRIPT_VIEWED',
      'TRANSCRIPT_DELETED',
      'RECORDING_UPLOADED',
      'RECORDING_DELETED',
      'PROFILE_UPDATED',
      'PASSWORD_CHANGED',
      'SETTINGS_UPDATED',
      'OTHER'
    ];
    
    res.json({
      success: true,
      data: actionTypes
    });
  })
);

/**
 * GET /api/activity-logs/my-activity
 * Get current user's own activity logs
 */
router.get('/my-activity',
  authenticate,
  asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    
    logger.info('User fetching own activity', {
      userId: req.user.id
    });
    
    const result = await ActivityLogService.getUserActivitySummary(
      req.user.id,
      parseInt(days)
    );
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch activity',
        message: result.error
      });
    }
    
    res.json({
      success: true,
      data: result.data
    });
  })
);

module.exports = router;

