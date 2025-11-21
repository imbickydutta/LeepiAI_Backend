const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * ActivityLog Schema
 * Tracks all user actions in the system for audit purposes
 */
const activityLogSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    index: true
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  userName: {
    type: String,
    index: true
  },
  actionType: {
    type: String,
    required: [true, 'Action type is required'],
    enum: [
      'LOGIN',
      'LOGOUT',
      'LOGIN_FAILED',
      'TRANSCRIPT_GENERATED',
      'TRANSCRIPT_VIEWED',
      'TRANSCRIPT_DELETED',
      'RECORDING_UPLOADED',
      'RECORDING_DELETED',
      'PROFILE_UPDATED',
      'PASSWORD_CHANGED',
      'SETTINGS_UPDATED',
      'OTHER'
    ],
    index: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  success: {
    type: Boolean,
    default: true,
    index: true
  },
  errorMessage: {
    type: String
  },
  duration: {
    type: Number, // Duration in milliseconds (for operations like transcript generation)
  },
  resourceId: {
    type: String, // ID of the resource being acted upon (e.g., transcript ID, recording ID)
    index: true
  },
  resourceType: {
    type: String, // Type of resource (e.g., 'transcript', 'recording')
    enum: ['transcript', 'recording', 'user', 'settings', 'other'],
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  collection: 'activitylogs'
});

// Compound indexes for common queries
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ actionType: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, actionType: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ success: 1, createdAt: -1 });

// Virtual for formatted timestamp
activityLogSchema.virtual('timestamp').get(function() {
  return this.createdAt;
});

// Instance method to get public log data
activityLogSchema.methods.getPublicLog = function() {
  return {
    id: this.id,
    userId: this.userId,
    userEmail: this.userEmail,
    userName: this.userName,
    actionType: this.actionType,
    description: this.description,
    metadata: this.metadata,
    ipAddress: this.ipAddress,
    userAgent: this.userAgent,
    success: this.success,
    errorMessage: this.errorMessage,
    duration: this.duration,
    resourceId: this.resourceId,
    resourceType: this.resourceType,
    timestamp: this.createdAt,
    createdAt: this.createdAt
  };
};

// Static method to log activity
activityLogSchema.statics.logActivity = async function({
  userId,
  userEmail,
  userName,
  actionType,
  description,
  metadata = {},
  ipAddress = null,
  userAgent = null,
  success = true,
  errorMessage = null,
  duration = null,
  resourceId = null,
  resourceType = null
}) {
  try {
    const log = await this.create({
      userId,
      userEmail,
      userName,
      actionType,
      description,
      metadata,
      ipAddress,
      userAgent,
      success,
      errorMessage,
      duration,
      resourceId,
      resourceType
    });
    
    return log;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error to prevent activity logging from breaking main operations
    return null;
  }
};

// Static method to get logs with filters
activityLogSchema.statics.getLogs = async function({
  userId = null,
  actionType = null,
  startDate = null,
  endDate = null,
  success = null,
  page = 1,
  limit = 50,
  sortBy = 'createdAt',
  sortOrder = 'desc'
}) {
  const query = {};
  
  // Apply filters
  if (userId) {
    query.userId = userId;
  }
  
  if (actionType) {
    query.actionType = actionType;
  }
  
  if (success !== null) {
    query.success = success;
  }
  
  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }
  
  // Calculate pagination
  const skip = (page - 1) * limit;
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  // Execute query
  const [logs, total] = await Promise.all([
    this.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to get activity statistics
activityLogSchema.statics.getStatistics = async function({
  userId = null,
  startDate = null,
  endDate = null
}) {
  const query = {};
  
  if (userId) {
    query.userId = userId;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }
  
  const stats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$actionType',
        count: { $sum: 1 },
        successCount: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        failureCount: {
          $sum: { $cond: ['$success', 0, 1] }
        }
      }
    },
    {
      $project: {
        actionType: '$_id',
        count: 1,
        successCount: 1,
        failureCount: 1,
        _id: 0
      }
    },
    { $sort: { count: -1 } }
  ]);
  
  const totalLogs = await this.countDocuments(query);
  
  return {
    totalLogs,
    byActionType: stats
  };
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;

