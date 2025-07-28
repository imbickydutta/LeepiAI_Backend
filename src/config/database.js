const mongoose = require('mongoose');
const logger = require('../utils/logger');
const config = require('./env');

class Database {
  constructor() {
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.currentRetry = 0;
    this.isConnected = false;
  }

  async connect() {
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      autoIndex: process.env.NODE_ENV !== 'production',
      // Modern MongoDB driver options
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      heartbeatFrequencyMS: 10000
    };

    // Debug environment variables
    const debugInfo = {
      NODE_ENV: process.env.NODE_ENV,
      MONGODB_URI_exists: !!process.env.MONGODB_URI,
      MONGODB_URI_PROD_exists: !!process.env.MONGODB_URI_PROD,
      configType: typeof config,
      configDatabaseExists: !!config.database,
      configDatabaseUri: config.database ? !!config.database.uri : 'config.database is undefined'
    };
    
    logger.info('🔍 Environment Debug:');
    console.log('DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
    
    if (!process.env.MONGODB_URI_PROD && process.env.NODE_ENV === 'production') {
      logger.error('❌ CRITICAL: MONGODB_URI_PROD environment variable is missing!');
      console.log('Available env vars starting with MONGO:', Object.keys(process.env).filter(key => key.includes('MONGO')));
    }

    // Log connection attempt
    logger.info('📡 Attempting database connection...', {
      retry: this.currentRetry + 1,
      maxRetries: this.maxRetries,
      environment: process.env.NODE_ENV,
      uri: config.database.uri ? config.database.uri.substring(0, 20) + '...[HIDDEN]' : 'undefined',
      uriLength: config.database.uri ? config.database.uri.length : 0
    });

    // Check if URI is missing
    if (!config.database.uri) {
      const error = new Error('Database URI is not configured. Please check environment variables.');
      logger.error('❌ Database URI missing:', {
        NODE_ENV: process.env.NODE_ENV,
        expectedVariable: process.env.NODE_ENV === 'production' ? 'MONGODB_URI_PROD' : 'MONGODB_URI'
      });
      throw error;
    }

    try {
      // Clear any existing connections
      if (mongoose.connection.readyState !== 0) {
        logger.info('🔄 Clearing existing database connections...');
        await mongoose.connection.close();
      }

      // Connect to MongoDB
      await mongoose.connect(config.database.uri, options);
      
      this.isConnected = true;
      this.currentRetry = 0;
      
      // Set up connection event handlers
      mongoose.connection.on('connected', () => {
        logger.info('✅ Database connection established');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('❌ Database connection error:', {
          error: err.message,
          stack: err.stack
        });
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️ Database disconnected');
        this.isConnected = false;
      });

      // Log successful connection
      logger.info('✅ Database connection successful', {
        database: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        readyState: mongoose.connection.readyState
      });

      return true;
    } catch (error) {
      logger.error('❌ Database connection failed:', {
        error: error.message,
        stack: error.stack,
        retry: this.currentRetry + 1,
        maxRetries: this.maxRetries
      });
      
      // Additional error logging for debugging
      console.log('DATABASE CONNECTION ERROR:');
      console.log('Error message:', error.message);
      console.log('Error code:', error.code);
      console.log('Error name:', error.name);
      if (error.reason) {
        console.log('Error reason:', JSON.stringify(error.reason, null, 2));
      }

      this.isConnected = false;

      // Retry logic
      if (this.currentRetry < this.maxRetries) {
        this.currentRetry++;
        logger.info(`🔄 Retrying database connection in ${this.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connect();
      } else {
        logger.error('❌ Max database connection retries reached');
        return false;
      }
    }
  }

  isDbConnected() {
    const state = mongoose.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized'
    };

    const connectionInfo = {
      state: stateMap[state] || 'unknown',
      readyState: state,
      name: mongoose.connection.name || 'undefined',
      host: mongoose.connection.host || 'undefined',
      port: mongoose.connection.port || 'undefined',
      isConnected: state === 1
    };

    logger.info('📊 Database connection state:', connectionInfo);

    return state === 1;
  }

  getConnectionStatus() {
    const state = mongoose.connection.readyState;
    return {
      state: state,
      isConnected: state === 1,
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port
    };
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('✅ Database disconnected successfully');
    } catch (error) {
      logger.error('❌ Error disconnecting from database:', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = new Database(); 