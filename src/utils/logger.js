const winston = require('winston');
const path = require('path');

// Production-safe logger that doesn't write to filesystem
const isProduction = process.env.NODE_ENV === 'production';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ' ' + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for JSON output (production)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports based on environment
const transports = [];

if (isProduction) {
  // Production: only console output in JSON format for cloud logging
  transports.push(
    new winston.transports.Console({
      format: jsonFormat,
      level: 'info'
    })
  );
} else {
  // Development: console + file logging
  const fs = require('fs-extra');
  
  try {
    // Ensure logs directory exists (only in development)
    const logsDir = path.join(__dirname, '../../logs');
    fs.ensureDirSync(logsDir);
    
    // Console transport
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
      })
    );
    
    // File transports
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: jsonFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: jsonFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
  } catch (error) {
    // Fallback to console only if file system fails
    console.warn('Failed to setup file logging, using console only:', error.message);
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
      })
    );
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? jsonFormat : consoleFormat,
  transports: transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true
});

// Add request logging middleware
logger.logRequest = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = logger; 