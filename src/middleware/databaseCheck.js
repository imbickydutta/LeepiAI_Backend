const database = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware to check if database is connected before proceeding
 */
const requireDatabase = (req, res, next) => {
  if (!database.isDbConnected()) {
    logger.warn('📊 Database not connected, returning temporary error', {
      path: req.path,
      method: req.method
    });
    
    return res.status(503).json({
      success: false,
      error: 'Database temporarily unavailable',
      message: 'Please try again in a few moments',
      code: 'DATABASE_CONNECTING'
    });
  }
  
  next();
};

/**
 * Middleware that allows requests to proceed even without database
 * but sets a flag for the route to handle gracefully
 */
const checkDatabase = (req, res, next) => {
  req.dbConnected = database.isDbConnected();
  
  if (!req.dbConnected) {
    logger.debug('📊 Database not connected, route should handle gracefully', {
      path: req.path,
      method: req.method
    });
  }
  
  next();
};

module.exports = {
  requireDatabase,
  checkDatabase
}; 