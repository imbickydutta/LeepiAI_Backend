const express = require('express');
const { body, validationResult } = require('express-validator');
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
 * GET /api/settings
 * Get all system settings (admin only)
 */
router.get('/',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const settings = await databaseService.getSystemSettings();
    
    logger.info('⚙️ System settings retrieved', {
      adminId: req.user.id,
      settingsCount: settings.length
    });
    
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
  requireAdmin,
  requireDatabase,
  [
    body('key').notEmpty().withMessage('Setting key is required'),
    body('value').exists().withMessage('Setting value is required')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
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