const express = require('express');
const { authenticate } = require('../middleware/auth');
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
  asyncHandler(async (req, res) => {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const analytics = await databaseService.getSystemAnalytics();
    
    res.json({
      success: true,
      analytics
    });
  })
);

module.exports = router; 