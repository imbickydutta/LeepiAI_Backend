const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// Load environment configuration
const config = require('./config/env');
const database = require('./config/database');
const logger = require('./utils/logger');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { handleUploadError } = require('./middleware/upload');

// Import routes
const authRoutes = require('./routes/auth');
const audioRoutes = require('./routes/audio');
const transcriptRoutes = require('./routes/transcripts');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const settingsRoutes = require('./routes/settings');

// Create Express app
const app = express();

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Helmet for security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:*", "https://*"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Electron)
    if (!origin) {
      logger.info('🌐 Allowing request with no origin');
      return callback(null, true);
    }

    const allowedOrigins = config.cors.origin.split(',').map(o => o.trim());
    
    // Check if origin matches any allowed patterns
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        // Convert glob pattern to regex
        const pattern = allowedOrigin
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        const matches = regex.test(origin);
        logger.debug(`🔍 Testing origin ${origin} against pattern ${pattern}: ${matches}`);
        return matches;
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      logger.info(`✅ Allowing origin: ${origin}`);
      callback(null, true);
    } else {
      logger.warn(`🚫 Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Disposition']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// =====================================================
// GENERAL MIDDLEWARE
// =====================================================

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Request logging
app.use(logger.logRequest);

// =====================================================
// HEALTH CHECK ENDPOINTS
// =====================================================

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'LeepiAI Backend API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint with detailed status
app.get('/health', async (req, res) => {
  try {
    const dbStatus = database.getConnectionStatus();
    const health = {
      status: dbStatus.state === 'connected' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.env,
      database: {
        status: dbStatus.state,
        isConnected: dbStatus.isConnected,
        host: dbStatus.host,
        name: dbStatus.name
      },
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB'
      }
    };

    if (health.status === 'unhealthy') {
      return res.status(503).json({
        success: false,
        error: 'Service unhealthy',
        details: health
      });
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('❌ Health check failed:', error);
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

// =====================================================
// API ROUTES
// =====================================================

app.use('/api/auth', authRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================

// Handle upload errors
app.use(handleUploadError);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// =====================================================
// SERVER STARTUP
// =====================================================

const startServer = async () => {
  try {
    // Connect to database with retries
    logger.info('📡 Initializing database connection...');
    await database.connect();

    // Verify database connection
    if (!database.isDbConnected()) {
      throw new Error('Database connection verification failed');
    }

    // Initialize models and ensure indexes
    logger.info('🔍 Verifying database models and indexes...');
    const User = require('./models/User');
    const Session = require('./models/Session');
    const Settings = require('./models/Settings');
    
    // Ensure indexes are created
    await Promise.all([
      User.syncIndexes(),
      Session.syncIndexes(),
      Settings.syncIndexes()
    ]);

    logger.info('✅ Database models and indexes verified');

    // Start HTTP server
    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 LeepiAI Backend server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`📊 CORS origin: ${config.cors.origin}`);
      logger.info(`💾 Database: ${database.getConnectionStatus().state}`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`📴 Received ${signal}. Starting graceful shutdown...`);
      
      // Stop accepting new requests
      server.close(async () => {
        logger.info('🔌 HTTP server closed');
        
        try {
          // Close database connection
          await database.disconnect();
          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('⚠️ Forced shutdown after timeout');
        process.exit(1);
      }, 30000); // 30 seconds timeout
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', {
        error: error.message,
        stack: error.stack,
        type: error.name
      });
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection:', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    return server;
  } catch (error) {
    logger.error('❌ Failed to start server:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    
    // Exit with error
    process.exit(1);
  }
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer }; 