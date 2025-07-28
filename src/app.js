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
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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

app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: database.isDbConnected() ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
      environment: config.env
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
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
    // Connect to database
    await database.connect();
    
    // Start HTTP server
    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 LeepiAI Backend server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`📊 CORS origin: ${config.cors.origin}`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`📴 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('🔌 HTTP server closed');
        
        try {
          await database.disconnect();
          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer }; 