const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const databaseService = require('../services/DatabaseService');
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
 * GET /api/analytics
 * Get system analytics (admin only)
 */
router.get('/',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const analytics = await databaseService.getSystemAnalytics();
    
    logger.info('📊 System analytics retrieved', {
      adminId: req.user.id
    });
    
    res.json({
      success: true,
      analytics
    });
  })
);

/**
 * GET /api/analytics/transcripts
 * Get all transcripts from all users (admin only) with filtering
 */
router.get('/transcripts',
  authenticate,
  requireAdmin,
  requireDatabase,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'duration', 'userId']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    query('includeSegments').optional().isBoolean().withMessage('includeSegments must be boolean'),
    query('userId').optional().isString().withMessage('userId must be a string'),
    query('search').optional().isString().withMessage('search must be a string'),
    query('hasSummary').optional().isIn(['true', 'false', '']).withMessage('hasSummary must be true, false, or empty'),
    query('hasDebrief').optional().isIn(['true', 'false', '']).withMessage('hasDebrief must be true, false, or empty')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeSegments = false,
      userId,
      search,
      hasSummary,
      hasDebrief
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1,
      includeSegments: includeSegments === 'true',
      userId: userId && userId.trim() !== '' ? userId : null,
      search: search && search.trim() !== '' ? search : null,
      hasSummary: hasSummary === 'true' ? true : hasSummary === 'false' ? false : null,
      hasDebrief: hasDebrief === 'true' ? true : hasDebrief === 'false' ? false : null
    };

    const result = await databaseService.getAllTranscriptsForAdmin(options);

    logger.info('📊 Admin retrieved all transcripts', {
      adminId: req.user.id,
      filters: options,
      count: result.transcripts.length,
      total: result.total
    });

    res.json({
      success: true,
      transcripts: result.transcripts,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: result.total,
        hasMore: result.transcripts.length === options.limit
      },
      filters: {
        userId: options.userId,
        search: options.search,
        hasSummary: options.hasSummary,
        hasDebrief: options.hasDebrief
      }
    });
  })
);

/**
 * GET /api/analytics/transcripts/:id
 * Get specific transcript with full details (admin only)
 */
router.get('/transcripts/:id',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const transcript = await databaseService.getTranscriptForAdmin(id);

    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    logger.info('📊 Admin retrieved specific transcript', {
      adminId: req.user.id,
      transcriptId: id,
      userId: transcript.userId
    });

    res.json({
      success: true,
      transcript
    });
  })
);

/**
 * GET /api/analytics/users
 * Get all users with their transcript counts (admin only)
 */
router.get('/users',
  authenticate,
  requireAdmin,
  requireDatabase,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('sortBy').optional().isIn(['createdAt', 'lastLoginAt', 'transcriptCount']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    query('search').optional().isString().withMessage('search must be a string'),
    query('role').optional().isIn(['user', 'admin', '']).withMessage('role must be user or admin'),
    query('isActive').optional().isIn(['true', 'false', '']).withMessage('isActive must be true, false, or empty')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      role,
      isActive
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1,
      search: search && search.trim() !== '' ? search : null,
      role: role && role.trim() !== '' ? role : null,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : null
    };

    const result = await databaseService.getAllUsersForAdmin(options);

    logger.info('📊 Admin retrieved all users', {
      adminId: req.user.id,
      filters: options,
      count: result.users.length,
      total: result.total
    });

    res.json({
      success: true,
      users: result.users,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: result.total,
        hasMore: result.users.length === options.limit
      },
      filters: {
        search: options.search,
        role: options.role,
        isActive: options.isActive
      }
    });
  })
);

module.exports = router; 