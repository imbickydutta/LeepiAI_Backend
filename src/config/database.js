const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConfig {
  constructor() {
    this.connectionString = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI || 'mongodb://localhost:27017/leepi-backend';
    this.isConnected = false;
  }

  /**
   * Connect to MongoDB
   */
  async connect() {
    try {
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      await mongoose.connect(this.connectionString, options);
      this.isConnected = true;
      
      logger.info('✅ Connected to MongoDB successfully');
      
      // Handle connection events
      mongoose.connection.on('error', (error) => {
        logger.error('❌ MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('🔄 MongoDB reconnected');
        this.isConnected = true;
      });

    } catch (error) {
      logger.error('❌ Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
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
   * Get connection status
   */
  getConnectionStatus() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    return states[mongoose.connection.readyState] || 'unknown';
  }
}

module.exports = new DatabaseConfig(); 