const logger = require('../utils/logger');
const User = require('../models/User');
const Transcript = require('../models/Transcript');
const ChatHistory = require('../models/ChatHistory');
const Session = require('../models/Session');

class DatabaseService {
  constructor() {
    logger.info('💾 DatabaseService initialized');
  }

  // =====================================================
  // USER OPERATIONS
  // =====================================================

  /**
   * Get all users
   * @returns {Promise<Array>} List of users
   */
  async getAllUsers() {
    try {
      logger.info('🔍 Fetching all users from database');
      
      const users = await User.find({ isActive: true })
        .sort({ createdAt: -1 })
        .select('-password -__v')
        .lean();
      
      if (!users) {
        logger.error('❌ Failed to fetch users: null result from database');
        throw new Error('Failed to fetch users from database');
      }
      
      logger.info(`✅ Successfully fetched ${users.length} users`);
      
      return users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'user', // Default to 'user' if role is missing
        isActive: user.isActive,
        preferences: user.preferences,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
      }));
    } catch (error) {
      logger.error('❌ Failed to get all users:', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to get users: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    try {
      return await User.findByCustomId(userId);
    } catch (error) {
      logger.error('❌ Failed to get user by ID:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated user
   */
  async updateUserProfile(userId, updates) {
    try {
      const user = await User.findByCustomId(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Only allow certain fields to be updated
      const allowedFields = ['firstName', 'lastName', 'preferences'];
      const filteredUpdates = {};
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      Object.assign(user, filteredUpdates);
      await user.save();

      return user.getPublicProfile();
    } catch (error) {
      logger.error('❌ Failed to update user profile:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats(userId) {
    try {
      const [
        transcriptCount,
        totalDuration,
        recentTranscripts,
        activeSessions
      ] = await Promise.all([
        Transcript.countDocuments({ userId }),
        Transcript.aggregate([
          { $match: { userId } },
          { $group: { _id: null, totalDuration: { $sum: '$metadata.duration' } } }
        ]),
        Transcript.find({ userId })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('id title createdAt metadata.duration'),
        Session.countDocuments({ userId, isActive: true, expiresAt: { $gt: new Date() } })
      ]);

      return {
        transcriptCount,
        totalDuration: totalDuration[0]?.totalDuration || 0,
        recentTranscripts,
        activeSessions
      };
    } catch (error) {
      logger.error('❌ Failed to get user stats:', error);
      throw error;
    }
  }

  // =====================================================
  // TRANSCRIPT OPERATIONS
  // =====================================================

  /**
   * Save transcript to database
   * @param {Object} transcriptData - Transcript data
   * @returns {Promise<Object>} Saved transcript
   */
  async saveTranscript(transcriptData) {
    try {
      const transcript = new Transcript(transcriptData);
      await transcript.save();

      logger.info('💾 Transcript saved', {
        transcriptId: transcript.id,
        userId: transcript.userId,
        segmentCount: transcript.segments.length
      });

      return transcript.toObject();
    } catch (error) {
      logger.error('❌ Failed to save transcript:', error);
      throw error;
    }
  }

  /**
   * Get user's transcripts with pagination
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User transcripts
   */
  async getUserTranscripts(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = -1,
        includeSegments = false
      } = options;

      const transcripts = await Transcript.getUserTranscripts(userId, {
        limit,
        offset,
        sortBy,
        sortOrder,
        includeSegments
      });

      logger.debug('📄 Retrieved user transcripts', {
        userId,
        count: transcripts.length,
        includeSegments
      });

      return transcripts;
    } catch (error) {
      logger.error('❌ Failed to get user transcripts:', error);
      throw error;
    }
  }

  /**
   * Get specific transcript by ID
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Transcript object
   */
  async getTranscript(transcriptId, userId = null) {
    try {
      const query = { id: transcriptId };
      if (userId) {
        query.userId = userId;
      }

      const transcript = await Transcript.findOne(query).lean();
      
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      return transcript;
    } catch (error) {
      logger.error('❌ Failed to get transcript:', error);
      throw error;
    }
  }

  /**
   * Update transcript
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for authorization)
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated transcript
   */
  async updateTranscript(transcriptId, userId, updates) {
    try {
      const transcript = await Transcript.findOne({ id: transcriptId, userId });
      
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      // Apply updates
      Object.assign(transcript, updates);
      transcript.updatedAt = new Date();
      
      await transcript.save();

      logger.info('📝 Transcript updated', {
        transcriptId,
        userId,
        updateFields: Object.keys(updates)
      });

      return transcript.toObject();
    } catch (error) {
      logger.error('❌ Failed to update transcript:', error);
      throw error;
    }
  }

  /**
   * Delete transcript
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Delete result
   */
  async deleteTranscript(transcriptId, userId) {
    try {
      const result = await Transcript.deleteOne({ id: transcriptId, userId });
      
      if (result.deletedCount === 0) {
        throw new Error('Transcript not found');
      }

      // Also delete associated chat history
      await ChatHistory.deleteMany({ transcriptId });

      logger.info('🗑️ Transcript deleted', {
        transcriptId,
        userId
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete transcript:', error);
      throw error;
    }
  }

  // =====================================================
  // CHAT HISTORY OPERATIONS
  // =====================================================

  /**
   * Save chat message
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID
   * @param {string} role - Message role (user/assistant)
   * @param {string} content - Message content
   * @returns {Promise<Object>} Updated chat history
   */
  async saveChatMessage(transcriptId, userId, role, content) {
    try {
      let chatHistory = await ChatHistory.findByTranscriptId(transcriptId);

      if (!chatHistory) {
        chatHistory = new ChatHistory({
          transcriptId,
          userId,
          messages: []
        });
      }

      await chatHistory.addMessage(role, content);

      logger.debug('💬 Chat message saved', {
        transcriptId,
        userId,
        role,
        messageCount: chatHistory.messages.length
      });

      return chatHistory.toObject();
    } catch (error) {
      logger.error('❌ Failed to save chat message:', error);
      throw error;
    }
  }

  /**
   * Get chat history for transcript
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Array>} Chat messages
   */
  async getChatHistory(transcriptId, userId) {
    try {
      // Verify user owns the transcript
      const transcript = await this.getTranscript(transcriptId, userId);
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      const chatHistory = await ChatHistory.findByTranscriptId(transcriptId);
      return chatHistory ? chatHistory.messages : [];
    } catch (error) {
      logger.error('❌ Failed to get chat history:', error);
      throw error;
    }
  }

  /**
   * Clear chat history for transcript
   * @param {string} transcriptId - Transcript ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Result
   */
  async clearChatHistory(transcriptId, userId) {
    try {
      // Verify user owns the transcript
      await this.getTranscript(transcriptId, userId);

      const chatHistory = await ChatHistory.findByTranscriptId(transcriptId);
      if (chatHistory) {
        await chatHistory.clearMessages();
      }

      logger.info('🧹 Chat history cleared', {
        transcriptId,
        userId
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to clear chat history:', error);
      throw error;
    }
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getStats() {
    try {
      const [
        userCount,
        transcriptCount,
        activeSessionCount,
        chatHistoryCount
      ] = await Promise.all([
        User.countDocuments({ isActive: true }),
        Transcript.countDocuments(),
        Session.countDocuments({ isActive: true, expiresAt: { $gt: new Date() } }),
        ChatHistory.countDocuments()
      ]);

      return {
        users: userCount,
        transcripts: transcriptCount,
        activeSessions: activeSessionCount,
        chatHistories: chatHistoryCount
      };
    } catch (error) {
      logger.error('❌ Failed to get database stats:', error);
      return {};
    }
  }

  /**
   * Search transcripts by content
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async searchTranscripts(userId, query, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      const searchRegex = new RegExp(query, 'i');
      
      const results = await Transcript.find({
        userId,
        $or: [
          { title: searchRegex },
          { content: searchRegex }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .select('-segments') // Exclude segments for performance
      .lean();

      logger.debug('🔍 Transcript search completed', {
        userId,
        query,
        resultCount: results.length
      });

      return results;
    } catch (error) {
      logger.error('❌ Failed to search transcripts:', error);
      throw error;
    }
  }

  // =====================================================
  // ADMIN ANALYTICS
  // =====================================================

  /**
   * Get system-wide analytics
   * @returns {Promise<Object>} System analytics
   */
  async getSystemAnalytics() {
    try {
      const [
        userStats,
        transcriptStats,
        storageStats,
        recentActivity
      ] = await Promise.all([
        // User statistics
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
              adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } }
            }
          }
        ]),

        // Transcript statistics with null-safe operations
        Transcript.aggregate([
          {
            $group: {
              _id: null,
              totalTranscripts: { $sum: 1 },
              totalDuration: { $sum: { $ifNull: ['$metadata.duration', 0] } },
              avgDuration: { $avg: { $ifNull: ['$metadata.duration', 0] } },
              totalStorage: { $sum: { $ifNull: ['$metadata.fileSize', 0] } }
            }
          }
        ]),

        // Storage usage by type with null-safe operations
        Transcript.aggregate([
          {
            $group: {
              _id: { $ifNull: ['$metadata.fileType', 'unknown'] },
              count: { $sum: 1 },
              totalSize: { $sum: { $ifNull: ['$metadata.fileSize', 0] } }
            }
          }
        ]),

        // Recent activity (last 10 transcripts)
        Transcript.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .select('title createdAt metadata.duration userId')
          .lean()
      ]);

      // Format user stats
      const users = userStats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        adminUsers: 0
      };

      // Format transcript stats
      const transcripts = transcriptStats[0] || {
        totalTranscripts: 0,
        totalDuration: 0,
        avgDuration: 0,
        totalStorage: 0
      };

      // Format storage stats
      const storage = {
        byType: storageStats.map(stat => ({
          type: stat._id || 'unknown',
          count: stat.count,
          size: stat.totalSize || 0
        })),
        total: transcripts.totalStorage || 0
      };

      // Format recent activity with null-safe access and manual user lookup
      const activity = await Promise.all(recentActivity.map(async (t) => {
        let user = null;
        if (t.userId) {
          const userDoc = await User.findOne({ id: t.userId }).select('firstName lastName email').lean();
          if (userDoc) {
            user = {
              name: `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() || 'Unknown User',
              email: userDoc.email || 'No email'
            };
          }
        }
        
        return {
          id: t.id,
          title: t.title || 'Untitled',
          duration: t.metadata?.duration || 0,
          createdAt: t.createdAt,
          user
        };
      }));

      return {
        users: {
          total: users.totalUsers || 0,
          active: users.activeUsers || 0,
          admin: users.adminUsers || 0,
          inactivePercent: users.totalUsers ? 
            ((users.totalUsers - users.activeUsers) / users.totalUsers * 100).toFixed(1) : 0
        },
        transcripts: {
          total: transcripts.totalTranscripts || 0,
          totalDuration: transcripts.totalDuration || 0,
          averageDuration: transcripts.avgDuration || 0,
          perUser: users.activeUsers ? 
            (transcripts.totalTranscripts / users.activeUsers).toFixed(1) : 0
        },
        storage: {
          total: storage.total,
          byType: storage.byType,
          averagePerTranscript: transcripts.totalTranscripts ?
            (storage.total / transcripts.totalTranscripts).toFixed(2) : 0
        },
        recentActivity: activity
      };
    } catch (error) {
      logger.error('❌ Failed to get system analytics:', error);
      throw error;
    }
  }

  // =====================================================
  // ADMIN OPERATIONS
  // =====================================================

  /**
   * Get all transcripts for admin with filtering
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Object>} Transcripts and total count
   */
  async getAllTranscriptsForAdmin(options = {}) {
    try {
      logger.info('🔍 getAllTranscriptsForAdmin called with options:', options);
      
      const {
        limit = 20,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = -1,
        includeSegments = false,
        userId = null,
        search = null,
        hasSummary = null,
        hasDebrief = null
      } = options;

      // Build query
      let query = {};

      if (userId) {
        query.userId = userId;
      }

      if (hasSummary !== null) {
        query.summary = hasSummary ? { $exists: true, $ne: null, $ne: '' } : { $in: [null, '', undefined] };
      }

      if (hasDebrief !== null) {
        query.debrief = hasDebrief ? { $exists: true, $ne: null } : { $in: [null, undefined] };
      }

      logger.info('🔍 Built query:', query);

      // Build aggregation pipeline
      let pipeline = [
        { $match: query }
      ];

      // Add search if provided
      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { title: { $regex: search, $options: 'i' } },
              { content: { $regex: search, $options: 'i' } },
              { summary: { $regex: search, $options: 'i' } }
            ]
          }
        });
      }

      // Add lookup for user information
      pipeline.push({
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: 'id',
          as: 'user'
        }
      });

      // Unwind user array
      pipeline.push({
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true
        }
      });

      // Add user info to transcript
      pipeline.push({
        $addFields: {
          userInfo: {
            name: {
              $concat: [
                { $ifNull: ['$user.firstName', ''] },
                ' ',
                { $ifNull: ['$user.lastName', ''] }
              ]
            },
            email: { $ifNull: ['$user.email', 'Unknown'] }
          }
        }
      });

      // Get total count
      const countPipeline = [...pipeline, { $count: 'total' }];
      logger.info('🔍 Count pipeline:', JSON.stringify(countPipeline, null, 2));
      const countResult = await Transcript.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;
      logger.info('🔍 Total count:', total);

      // Add sorting and pagination
      pipeline.push(
        { $sort: { [sortBy]: sortOrder } },
        { $skip: offset },
        { $limit: limit }
      );

      // Remove segments if not requested
      if (!includeSegments) {
        pipeline.push({
          $project: {
            segments: 0
          }
        });
      }

      logger.info('🔍 Main pipeline:', JSON.stringify(pipeline, null, 2));
      const transcripts = await Transcript.aggregate(pipeline);
      logger.info('🔍 Found transcripts:', transcripts.length);

      return {
        transcripts,
        total
      };
    } catch (error) {
      logger.error('❌ Failed to get all transcripts for admin:', error);
      throw error;
    }
  }

  /**
   * Get specific transcript for admin (no user restriction)
   * @param {string} transcriptId - Transcript ID
   * @returns {Promise<Object|null>} Transcript object or null
   */
  async getTranscriptForAdmin(transcriptId) {
    try {
      const transcript = await Transcript.findOne({ id: transcriptId }).lean();

      if (!transcript) {
        return null;
      }

      // Manually fetch user info since userId is a string, not ObjectId
      let userInfo = null;
      if (transcript.userId) {
        const user = await User.findOne({ id: transcript.userId }).select('firstName lastName email').lean();
        if (user) {
          userInfo = {
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User',
            email: user.email || 'No email'
          };
        }
      }

      // Add user info
      transcript.userInfo = userInfo;

      return transcript;
    } catch (error) {
      logger.error('❌ Failed to get transcript for admin:', error);
      throw error;
    }
  }

  /**
   * Update transcript for admin (no user restriction)
   * @param {string} transcriptId - Transcript ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated transcript
   */
  async updateTranscriptForAdmin(transcriptId, updates) {
    try {
      const transcript = await Transcript.findOne({ id: transcriptId });
      
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      // Remove read-only fields
      delete updates.id;
      delete updates.userId;
      delete updates.createdAt;
      delete updates.updatedAt;

      // Apply updates
      Object.assign(transcript, updates);
      await transcript.save();

      logger.info('📝 Admin updated transcript', {
        transcriptId,
        fields: Object.keys(updates)
      });

      return transcript.toObject();
    } catch (error) {
      logger.error('❌ Failed to update transcript for admin:', error);
      throw error;
    }
  }

  /**
   * Get all users for admin with filtering and transcript counts
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Object>} Users and total count
   */
  async getAllUsersForAdmin(options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = -1,
        search = null,
        role = null,
        isActive = null
      } = options;

      // Build query
      let query = {};

      if (role) {
        query.role = role;
      }

      if (isActive !== null) {
        query.isActive = isActive;
      }

      // Build aggregation pipeline
      let pipeline = [
        { $match: query }
      ];

      // Add search if provided
      if (search) {
        pipeline.push({
          $match: {
            $or: [
              { firstName: { $regex: search, $options: 'i' } },
              { lastName: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } }
            ]
          }
        });
      }

      // Add lookup for transcript count
      pipeline.push({
        $lookup: {
          from: 'transcripts',
          localField: 'id',
          foreignField: 'userId',
          as: 'transcripts'
        }
      });

      // Add transcript count
      pipeline.push({
        $addFields: {
          transcriptCount: { $size: '$transcripts' },
          lastTranscriptAt: {
            $max: '$transcripts.createdAt'
          }
        }
      });

      // Get total count
      const countPipeline = [...pipeline, { $count: 'total' }];
      const countResult = await User.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;

      // Add sorting and pagination
      pipeline.push(
        { $sort: { [sortBy]: sortOrder } },
        { $skip: offset },
        { $limit: limit }
      );

      // Project final fields
      pipeline.push({
        $project: {
          id: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          role: 1,
          isActive: 1,
          lastLoginAt: 1,
          createdAt: 1,
          transcriptCount: 1,
          lastTranscriptAt: 1,
          preferences: 1
        }
      });

      const users = await User.aggregate(pipeline);

      return {
        users,
        total
      };
    } catch (error) {
      logger.error('❌ Failed to get all users for admin:', error);
      throw error;
    }
  }

  // =====================================================
  // SETTINGS MANAGEMENT
  // =====================================================

  /**
   * Get all system settings
   * @returns {Promise<Array>} List of settings
   */
  async getSystemSettings() {
    try {
      const Settings = require('../models/Settings');
      
      // Ensure default settings exist
      await Settings.ensureDefaults();
      
      // Get all settings
      const settings = await Settings.find()
        .sort({ category: 1, key: 1 })
        .select('-__v');

      return settings;
    } catch (error) {
      logger.error('❌ Failed to get system settings:', error);
      throw error;
    }
  }

  /**
   * Update a system setting
   * @param {string} key - Setting key
   * @param {any} value - New value
   * @param {string} userId - Admin user ID
   * @returns {Promise<Object>} Update result
   */
  async updateSystemSetting(key, value, userId) {
    try {
      const Settings = require('../models/Settings');
      
      const setting = await Settings.findOneAndUpdate(
        { key },
        { 
          $set: { 
            value,
            updatedBy: userId
          }
        },
        { new: true }
      );

      if (!setting) {
        return { success: false };
      }

      return {
        success: true,
        setting
      };
    } catch (error) {
      logger.error('❌ Failed to update system setting:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService(); 