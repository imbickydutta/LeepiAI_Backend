// =====================================================
// IMPORTS & SETUP
// =====================================================

console.log('🔍 Starting app initialization...');

const express = require('express');
console.log('✅ Express loaded');

const cors = require('cors');
console.log('✅ CORS loaded');

const helmet = require('helmet');
console.log('✅ Helmet loaded');

const morgan = require('morgan');
console.log('✅ Morgan loaded');

const logger = require('./utils/logger');
console.log('✅ Logger loaded');

const config = require('./config/env');
console.log('✅ Config loaded');

const database = require('./config/database');
console.log('✅ Database config loaded');

const routes = require('./routes');
console.log('✅ Routes loaded');

// Initialize express app
const app = express();
console.log('✅ Express app initialized');

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// =====================================================
// ROUTES
// =====================================================

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    database: database.getConnectionStatus(),
    memory: process.memoryUsage()
  };
  
  // Log health check
  logger.info('📊 Health Check:', health);
  
  res.json(health);
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
    
    // Connect to database with retries
    logger.info('📡 Initializing database connection...');
    const dbConnected = await database.connect();
    
    if (!dbConnected) {
      throw new Error('Failed to establish database connection after retries');
    }

    // Verify database connection
    if (!database.isDbConnected()) {
      throw new Error('Database connection verification failed');
    }

    // Initialize models
    logger.info('🔍 Loading database models...');
    const User = require('./models/User');
    const Session = require('./models/Session');
    const Settings = require('./models/Settings');

    // Wait for models to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create indexes if needed
    logger.info('📊 Verifying database indexes...');
    
    try {
      await Promise.all([
        User.ensureIndexes(),
        Session.ensureIndexes(),
        Settings.ensureIndexes()
      ]);
      logger.info('✅ Database indexes verified');
    } catch (error) {
      // Log error but continue startup
      logger.error('⚠️ Failed to verify indexes:', {
        error: error.message,
        stack: error.stack
      });
    }

    // Start HTTP server
    const PORT = config.port;
    const server = app.listen(PORT, () => {
      logger.info('✅ Server startup complete:', {
        port: PORT,
        environment: config.env,
        cors: config.cors.origin,
        database: database.getConnectionStatus()
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`📥 Received ${signal}. Starting graceful shutdown...`);
      
      // Close HTTP server
      server.close(() => {
        logger.info('✅ HTTP server closed');
      });
      
      // Disconnect from database
      await database.disconnect();
      
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