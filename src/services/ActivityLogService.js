const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

/**
 * ActivityLogService
 * Service for logging user activities and retrieving activity logs
 */
class ActivityLogService {
  /**
   * Log a user activity
   */
  static async logActivity({
    userId,
    userEmail,
    userName = null,
    actionType,
    description,
    metadata = {},
    req = null,
    success = true,
    errorMessage = null,
    duration = null,
    resourceId = null,
    resourceType = null
  }) {
    try {
      // Extract IP and user agent from request if provided
      let ipAddress = null;
      let userAgent = null;
      
      if (req) {
        ipAddress = req.ip || req.connection?.remoteAddress || null;
        userAgent = req.get('User-Agent') || null;
      }
      
      const log = await ActivityLog.logActivity({
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
      
      if (log) {
        logger.info(`Activity logged: ${actionType} by ${userEmail}`, {
          userId,
          actionType,
          success
        });
      }
      
      return log;
    } catch (error) {
      logger.error('Error in logActivity:', error);
      // Don't throw - logging should not break main operations
      return null;
    }
  }
  
  /**
   * Log user login
   */
  static async logLogin(user, req, success = true, errorMessage = null) {
    return this.logActivity({
      userId: user.id || user._id,
      userEmail: user.email,
      userName: user.userName,
      actionType: success ? 'LOGIN' : 'LOGIN_FAILED',
      description: success 
        ? `User logged in successfully` 
        : `Login attempt failed: ${errorMessage}`,
      metadata: {
        role: user.role,
        appVersion: req.body?.appVersion || 'unknown'
      },
      req,
      success,
      errorMessage
    });
  }
  
  /**
   * Log user logout
   */
  static async logLogout(user, req) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'LOGOUT',
      description: 'User logged out',
      req
    });
  }
  
  /**
   * Log transcript generation
   */
  static async logTranscriptGeneration({
    user,
    transcriptId,
    duration,
    success = true,
    errorMessage = null,
    metadata = {},
    req = null
  }) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'TRANSCRIPT_GENERATED',
      description: success 
        ? `Transcript generated successfully` 
        : `Transcript generation failed: ${errorMessage}`,
      metadata: {
        ...metadata,
        transcriptLength: metadata.transcriptLength || null,
        audioFile: metadata.audioFile || null
      },
      duration,
      resourceId: transcriptId,
      resourceType: 'transcript',
      req,
      success,
      errorMessage
    });
  }
  
  /**
   * Log transcript view
   */
  static async logTranscriptView(user, transcriptId, req = null) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'TRANSCRIPT_VIEWED',
      description: 'User viewed transcript',
      resourceId: transcriptId,
      resourceType: 'transcript',
      req
    });
  }
  
  /**
   * Log transcript deletion
   */
  static async logTranscriptDeletion(user, transcriptId, req = null) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'TRANSCRIPT_DELETED',
      description: 'User deleted transcript',
      resourceId: transcriptId,
      resourceType: 'transcript',
      req
    });
  }
  
  /**
   * Log recording upload
   */
  static async logRecordingUpload({
    user,
    recordingId,
    metadata = {},
    success = true,
    errorMessage = null,
    req = null
  }) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'RECORDING_UPLOADED',
      description: success 
        ? 'Recording uploaded successfully' 
        : `Recording upload failed: ${errorMessage}`,
      metadata,
      resourceId: recordingId,
      resourceType: 'recording',
      req,
      success,
      errorMessage
    });
  }
  
  /**
   * Log profile update
   */
  static async logProfileUpdate(user, updatedFields, req = null) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'PROFILE_UPDATED',
      description: 'User updated profile',
      metadata: {
        updatedFields: Object.keys(updatedFields)
      },
      resourceId: user.id,
      resourceType: 'user',
      req
    });
  }
  
  /**
   * Log password change
   */
  static async logPasswordChange(user, req = null) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'PASSWORD_CHANGED',
      description: 'User changed password',
      resourceId: user.id,
      resourceType: 'user',
      req
    });
  }
  
  /**
   * Log settings update
   */
  static async logSettingsUpdate(user, settingsType, req = null) {
    return this.logActivity({
      userId: user.id,
      userEmail: user.email,
      userName: user.userName,
      actionType: 'SETTINGS_UPDATED',
      description: `User updated ${settingsType} settings`,
      metadata: { settingsType },
      resourceId: user.id,
      resourceType: 'settings',
      req
    });
  }
  
  /**
   * Get activity logs with filters (Admin only)
   */
  static async getLogs(filters) {
    try {
      const result = await ActivityLog.getLogs(filters);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('Error fetching activity logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get activity statistics (Admin only)
   */
  static async getStatistics(filters) {
    try {
      const stats = await ActivityLog.getStatistics(filters);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Error fetching activity statistics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get advanced statistics with user metrics (Admin only)
   */
  static async getAdvancedStatistics(filters) {
    try {
      const stats = await ActivityLog.getAdvancedStatistics(filters);
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      logger.error('Error fetching advanced statistics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get user activity summary
   */
  static async getUserActivitySummary(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const result = await ActivityLog.getLogs({
        userId,
        startDate,
        limit: 1000 // Get more logs for summary
      });
      
      // Aggregate by action type
      const summary = {};
      result.logs.forEach(log => {
        if (!summary[log.actionType]) {
          summary[log.actionType] = 0;
        }
        summary[log.actionType]++;
      });
      
      return {
        success: true,
        data: {
          userId,
          period: `Last ${days} days`,
          totalActivities: result.pagination.total,
          byActionType: summary,
          recentActivities: result.logs.slice(0, 10) // Latest 10
        }
      };
    } catch (error) {
      logger.error('Error fetching user activity summary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ActivityLogService;

