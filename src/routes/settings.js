const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const databaseService = require('../services/DatabaseService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/settings
 * Get all system settings (admin only)
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

    const settings = await databaseService.getSystemSettings();
    
    res.json({
      success: true,
      settings
    });
  })
);

/**
 * PUT /api/settings
 * Update a system setting (admin only)
 */
router.put('/',
  authenticate,
  [
    body('key').notEmpty().withMessage('Setting key is required'),
    body('value').exists().withMessage('Setting value is required')
  ],
  asyncHandler(async (req, res) => {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { key, value } = req.body;
    
    const result = await databaseService.updateSystemSetting(key, value, req.user.id);
    
    if (result.success) {
      logger.info('⚙️ System setting updated', {
        adminId: req.user.id,
        key,
        value
      });

      res.json({
        success: true,
        message: 'Setting updated successfully',
        setting: result.setting
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Setting not found'
      });
    }
  })
);

module.exports = router; 