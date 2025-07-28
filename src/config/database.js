const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConfig {
  constructor() {
    this.connectionString = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI || 'mongodb://localhost:27017/leepi-backend';
    this.isConnected = false;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Connect to MongoDB with retries
   */
  async connect() {
    let retries = 0;

    while (retries < this.maxRetries) {
      try {
        const options = {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 45000,
          keepAlive: true,
          keepAliveInitialDelay: 300000,
          autoIndex: process.env.NODE_ENV !== 'production', // Disable auto-indexing in production
          retryWrites: true,
          w: 'majority'
        };

        logger.info(`🔄 Attempting MongoDB connection (attempt ${retries + 1}/${this.maxRetries})`);
        
        await mongoose.connect(this.connectionString, options);
        this.isConnected = true;
        
        logger.info('✅ Connected to MongoDB successfully');
        
        // Handle connection events
        mongoose.connection.on('error', (error) => {
          logger.error('❌ MongoDB connection error:', {
            error: error.message,
            code: error.code,
            name: error.name
          });
          this.isConnected = false;
          this._handleConnectionError(error);
        });

        mongoose.connection.on('disconnected', () => {
          logger.warn('⚠️ MongoDB disconnected');
          this.isConnected = false;
          this._attemptReconnection();
        });

        mongoose.connection.on('reconnected', () => {
          logger.info('🔄 MongoDB reconnected');
          this.isConnected = true;
        });

        // Connection successful, break the retry loop
        break;

      } catch (error) {
        this.isConnected = false;
        retries++;

        logger.error('❌ Failed to connect to MongoDB:', {
          error: error.message,
          attempt: retries,
          maxRetries: this.maxRetries
        });

        if (retries === this.maxRetries) {
          logger.error('💥 Max connection retries reached. Exiting...');
          throw new Error(`Failed to connect to MongoDB after ${this.maxRetries} attempts: ${error.message}`);
        }

        // Wait before retrying
        logger.info(`⏳ Waiting ${this.retryDelay/1000}s before next connection attempt...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
  }

  /**
   * Handle connection errors
   * @private
   */
  _handleConnectionError(error) {
    if (error.name === 'MongoServerSelectionError') {
      logger.error('💥 MongoDB server selection error. Check if MongoDB is running and accessible.');
    } else if (error.name === 'MongoNetworkError') {
      logger.error('💥 MongoDB network error. Check network connectivity and firewall settings.');
    }
  }

  /**
   * Attempt reconnection
   * @private
   */
  async _attemptReconnection() {
    try {
      if (!this.isConnected) {
        logger.info('🔄 Attempting to reconnect to MongoDB...');
        await this.connect();
      }
    } catch (error) {
      logger.error('❌ Reconnection attempt failed:', error);
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('💾 MongoDB connection closed');
    } catch (error) {
      logger.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  /**
   * Check if database is connected
   */
  isDbConnected() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get connection status with details
   */
  getConnectionStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return {
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState,
      isConnected: this.isConnected,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }
}

module.exports = new DatabaseConfig(); 