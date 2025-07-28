require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Session = require('../src/models/Session');
const Settings = require('../src/models/Settings');
const logger = require('../src/utils/logger');

async function createIndexes() {
  try {
    logger.info('🔄 Connecting to database...');
    
    // Connect to MongoDB
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );

    logger.info('✅ Connected to database');

    // Create indexes for all models
    logger.info('🔨 Creating indexes...');

    const results = await Promise.all([
      User.ensureIndexes(),
      Session.ensureIndexes(),
      Settings.ensureIndexes()
    ]);

    logger.info('✅ All indexes created successfully');

    // List all collections and their indexes
    const collections = await mongoose.connection.db.collections();
    
    for (const collection of collections) {
      const indexes = await collection.indexes();
      logger.info(`📊 Indexes for ${collection.collectionName}:`, 
        indexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false
        }))
      );
    }

  } catch (error) {
    logger.error('❌ Failed to create indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createIndexes(); 