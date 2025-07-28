const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const databaseService = require('../services/DatabaseService');
const logger = require('../utils/logger');

const router = express.Router();

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

module.exports = router; 