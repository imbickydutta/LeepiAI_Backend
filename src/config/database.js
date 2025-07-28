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
      keepAlive: true,
      keepAliveInitialDelay: 300000,
      retryWrites: true,
      w: 'majority',
      autoIndex: process.env.NODE_ENV !== 'production'
    };

    // Log connection attempt
    logger.info('📡 Attempting database connection...', {
      retry: this.currentRetry + 1,
      maxRetries: this.maxRetries,
      environment: process.env.NODE_ENV,
      uri: config.mongodbUri ? config.mongodbUri.substring(0, 20) + '...[HIDDEN]' : 'undefined',
      uriLength: config.mongodbUri ? config.mongodbUri.length : 0
    });

    try {
      // Clear any existing connections
      if (mongoose.connection.readyState !== 0) {
        logger.info('🔄 Clearing existing database connections...');
        await mongoose.connection.close();
      }

      // Connect to MongoDB
      await mongoose.connect(config.mongodbUri, options);
      
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

    logger.info('📊 Database connection state:', {
      state: stateMap[state],
      readyState: state,
      name: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port
    });

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