const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const sessionSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    default: uuidv4
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  token: {
    type: String,
    required: [true, 'Token is required'],
    unique: true
  },
  refreshToken: {
    type: String,
    required: [true, 'Refresh token is required'],
    unique: true
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required']
  },
  refreshExpiresAt: {
    type: Date,
    required: [true, 'Refresh expiration date is required']
  },
  deviceInfo: {
    platform: String,
    userAgent: String,
    ip: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
sessionSchema.index({ userId: 1 });
sessionSchema.index({ token: 1 });
sessionSchema.index({ refreshToken: 1 });
sessionSchema.index({ expiresAt: 1 });
sessionSchema.index({ refreshExpiresAt: 1 });

// Automatically remove expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to find by token
sessionSchema.statics.findByToken = function(token) {
  return this.findOne({ 
    token, 
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

// Static method to find by refresh token
sessionSchema.statics.findByRefreshToken = function(refreshToken) {
  return this.findOne({ 
    refreshToken, 
    isActive: true,
    refreshExpiresAt: { $gt: new Date() }
  });
};

// Static method to find by custom id
sessionSchema.statics.findByCustomId = function(id) {
  return this.findOne({ id });
};

// Static method to get user's active sessions
sessionSchema.statics.getUserActiveSessions = function(userId) {
  return this.find({
    userId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).sort({ lastUsedAt: -1 });
};

// Static method to cleanup expired sessions
sessionSchema.statics.cleanupExpiredSessions = function() {
  return this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { refreshExpiresAt: { $lt: new Date() } },
      { isActive: false }
    ]
  });
};

// Instance method to check if session is expired
sessionSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

// Instance method to check if refresh token is expired
sessionSchema.methods.isRefreshExpired = function() {
  return this.refreshExpiresAt < new Date();
};

// Instance method to refresh session
sessionSchema.methods.refresh = function(newToken, newRefreshToken, newExpiresAt, newRefreshExpiresAt) {
  this.token = newToken;
  this.refreshToken = newRefreshToken;
  this.expiresAt = newExpiresAt;
  this.refreshExpiresAt = newRefreshExpiresAt;
  this.lastUsedAt = new Date();
  
  return this.save();
};

// Instance method to deactivate session
sessionSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Update lastUsedAt when session is accessed
sessionSchema.methods.updateLastUsed = function() {
  this.lastUsedAt = new Date();
  return this.save();
};

// Virtual for remaining time
sessionSchema.virtual('remainingTime').get(function() {
  const now = new Date();
  if (this.expiresAt <= now) return 0;
  return Math.floor((this.expiresAt - now) / 1000); // seconds
});

// Ensure virtual fields are serialized
sessionSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    delete ret.token;
    delete ret.refreshToken;
    return ret;
  }
});

module.exports = mongoose.model('Session', sessionSchema); 