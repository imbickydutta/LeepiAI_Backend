const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const userSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'dark'
    },
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  lastLoginAt: {
    type: Date
  }
}, {
  timestamps: true,
  // Disable automatic index creation in production
  autoIndex: process.env.NODE_ENV !== 'production'
});

// Define all indexes in one place for better visibility
const indexes = [
  // Unique indexes
  { fields: { email: 1 }, options: { unique: true, name: 'email_unique' } },
  { fields: { id: 1 }, options: { unique: true, name: 'id_unique' } },
  
  // Performance indexes
  { fields: { createdAt: -1 }, options: { name: 'createdAt_desc' } },
  { fields: { role: 1 }, options: { name: 'role_asc' } },
  { fields: { isActive: 1 }, options: { name: 'isActive_asc' } },
  
  // Compound indexes
  { fields: { role: 1, isActive: 1 }, options: { name: 'role_isActive' } },
  { fields: { email: 1, isActive: 1 }, options: { name: 'email_isActive' } }
];

// Don't create indexes automatically - let ensureIndexes handle it
// indexes.forEach(index => {
//   userSchema.index(index.fields, index.options);
// });

// Static method to ensure indexes exist
userSchema.statics.ensureIndexes = async function() {
  try {
    // Wait for connection to be ready
    if (mongoose.connection.readyState !== 1) {
      logger.warn('⚠️ Database connection not ready, skipping index creation');
      return false;
    }

    // Get existing indexes
    const existingIndexes = await mongoose.connection.db
      .collection('users')
      .indexes();

    // Check if we already have the required indexes
    const hasRequiredIndexes = existingIndexes.some(idx => 
      idx.name === 'email_unique' || idx.name === 'id_unique'
    );

    if (hasRequiredIndexes) {
      logger.info('✅ User indexes already exist, skipping creation');
      return true;
    }

    logger.info('🔍 Creating User model indexes...');
    
    // Create indexes manually instead of using syncIndexes
    const collection = mongoose.connection.db.collection('users');
    
    // Create email unique index
    await collection.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
    logger.info('✅ Created email_unique index');
    
    // Create id unique index
    await collection.createIndex({ id: 1 }, { unique: true, name: 'id_unique' });
    logger.info('✅ Created id_unique index');
    
    // Create other performance indexes
    await collection.createIndex({ createdAt: -1 }, { name: 'createdAt_desc' });
    await collection.createIndex({ role: 1 }, { name: 'role_asc' });
    await collection.createIndex({ isActive: 1 }, { name: 'isActive_asc' });
    await collection.createIndex({ role: 1, isActive: 1 }, { name: 'role_isActive' });
    await collection.createIndex({ email: 1, isActive: 1 }, { name: 'email_isActive' });
    
    logger.info('✅ User model indexes created successfully');
    return true;
  } catch (error) {
    logger.error('❌ Failed to create User model indexes:', {
      error: error.message,
      stack: error.stack
    });
    // Don't throw error, just log it
    return false;
  }
};

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get public profile
userSchema.methods.getPublicProfile = function() {
  return {
    id: this.id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    role: this.role,
    isActive: this.isActive,
    preferences: this.preferences,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt
  };
};

// Static method to find user by custom ID
userSchema.statics.findByCustomId = async function(customId) {
  try {
    return await this.findOne({ id: customId });
  } catch (error) {
    logger.error('❌ Error finding user by custom ID:', {
      customId,
      error: error.message
    });
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

// Don't automatically create indexes on model compilation
// Instead, let the app explicitly call ensureIndexes when ready
module.exports = User; 