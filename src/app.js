// =====================================================
// IMPORTS & SETUP
// =====================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const config = require('./config/env');
const database = require('./config/database');
const routes = require('./routes');

// Initialize express app
const app = express();

// =====================================================
// ERROR HANDLERS
// =====================================================

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 UNCAUGHT EXCEPTION:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 UNHANDLED REJECTION:', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : 'No stack trace',
    promise: promise
  });
  process.exit(1);
});

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Split the allowed origins string into an array
    const allowedOrigins = config.cors.origin.split(',').map(o => o.trim());
    
    // Log the CORS check
    logger.debug('🔒 CORS Check:', {
      requestOrigin: origin,
      allowedOrigins: allowedOrigins,
      isAllowed: !origin || allowedOrigins.some(allowed => {
        // Handle wildcards
        if (allowed.includes('*')) {
          const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
          return pattern.test(origin);
        }
        return allowed === origin;
      })
    });

    // No origin (like mobile apps) or matches allowed origins
    if (!origin || allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
        return pattern.test(origin);
      }
      return allowed === origin;
    })) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition']
};

// Apply middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// =====================================================
// ROUTES
// =====================================================

// Basic status endpoint (no database required)
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'LeepiAI Backend API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    const health = {
      uptime: process.uptime(),
      timestamp: Date.now(),
      database: {
        connected: database.isDbConnected(),
        status: database.isDbConnected() ? 'connected' : 'connecting'
      },
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    };
    
    // Log health check
    logger.info('📊 Health Check:', health);
    
    res.json({
      success: true,
      ...health
    });
  } catch (error) {
    logger.error('❌ Health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  logger.warn(`❌ Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('💥 Express error handler:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// =====================================================
// SERVER STARTUP
// =====================================================

const startServer = async () => {
  try {
    // Log startup
    logger.info('🚀 Starting LeepiAI Backend server...');
    
    // Start HTTP server first (don't wait for database)
    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info('✅ Server startup complete:', {
        port: PORT,
        environment: config.env,
        cors: config.cors.origin
      });
    });

    // Connect to database asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        logger.info('📡 Initializing database connection...');
        const dbConnected = await database.connect();
        
        if (dbConnected && database.isDbConnected()) {
          logger.info('✅ Database connected successfully');
          
          // Initialize models and indexes after connection
          const User = require('./models/User');
          const Session = require('./models/Session');
          const Settings = require('./models/Settings');

          // Temporarily disable index creation to prevent infinite loop
          logger.info('⚠️ Index creation temporarily disabled to prevent infinite loop');
          
          // TODO: Re-enable index creation once the infinite loop issue is resolved
          // const createIndexes = async () => {
          //   try {
          //     logger.info('🔧 Starting database index verification...');
          //     
          //     if (typeof User.ensureIndexes === 'function') {
          //       await User.ensureIndexes();
          //       logger.info('✅ User indexes verified');
          //     }
          //     
          //     logger.info('✅ Database indexes verification completed');
          //   } catch (error) {
          //     logger.error('❌ Index creation process failed:', error.message);
          //   }
          // };
          // 
          // setTimeout(() => {
          //   createIndexes().catch(error => {
          //     logger.warn('⚠️ Index creation process failed:', error.message);
          //   });
          // }, 1000);
        } else {
          logger.warn('⚠️ Database connection failed, but server is running');
        }
      } catch (error) {
        logger.warn('⚠️ Database initialization failed, but server is running:', error.message);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`📥 Received ${signal}. Starting graceful shutdown...`);
      
      // Close HTTP server
      server.close(() => {
        logger.info('✅ HTTP server closed');
      });
      
      // Disconnect from database
      try {
        await database.disconnect();
      } catch (error) {
        logger.warn('⚠️ Error disconnecting from database:', error.message);
      }
      
      // Exit process
      process.exit(0);
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('💥 Failed to start server:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Start the server
startServer(); 