const logger = require('../utils/logger');
const User = require('../models/User');
const Transcript = require('../models/Transcript');
const ChatHistory = require('../models/ChatHistory');
const Session = require('../models/Session');
const Recording = require('../models/Recording');

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
      // Ensure id field is set if not provided
      if (!transcriptData.id) {
        transcriptData.id = require('uuid').v4();
      }
      
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

      logger.info('🔍 DatabaseService.getTranscript query:', {
        transcriptId,
        userId,
        query,
        transcriptIdType: typeof transcriptId
      });

      const transcript = await Transcript.findOne(query).lean();
      
      logger.info('🔍 DatabaseService.getTranscript result:', {
        transcriptId,
        userId,
        found: !!transcript,
        transcriptId: transcript?._id,
        transcriptUserId: transcript?.userId
      });
      
      if (!transcript) {
        // Let's check if transcript exists with different query
        const allTranscripts = await Transcript.find({}).limit(3).lean();
        logger.info('🔍 Sample transcripts in database:', {
          count: allTranscripts.length,
          sampleIds: allTranscripts.map(t => ({ _id: t._id, id: t.id, userId: t.userId }))
        });
        
        // Check if transcript exists with 'id' field instead
        const transcriptById = await Transcript.findOne({ id: transcriptId }).lean();
        logger.info('🔍 Transcript search by id field:', {
          transcriptId,
          found: !!transcriptById,
          transcriptId: transcriptById?._id,
          transcriptUserId: transcriptById?.userId
        });
        
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

  async deleteTranscriptAsAdmin(transcriptId) {
    try {
      // First, get the transcript to find the original userId for logging
      const transcript = await Transcript.findOne({ id: transcriptId });
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      const result = await Transcript.deleteOne({ id: transcriptId });
      
      if (result.deletedCount === 0) {
        throw new Error('Transcript not found');
      }

      // Also delete associated chat history
      await ChatHistory.deleteMany({ transcriptId });

      logger.info('🗑️ Transcript deleted by admin', {
        transcriptId,
        originalUserId: transcript.userId
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete transcript as admin:', error);
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
      logger.info('💾 DatabaseService.saveChatMessage called:', {
        transcriptId,
        userId,
        role,
        contentLength: content?.length,
        contentPreview: content?.substring(0, 100)
      });

      let chatHistory = await ChatHistory.findByTranscriptId(transcriptId);
      
      logger.info('💾 Existing chat history found:', {
        transcriptId,
        userId,
        found: !!chatHistory,
        existingMessageCount: chatHistory?.messages?.length || 0
      });

      if (!chatHistory) {
        logger.info('💾 Creating new chat history document');
        chatHistory = new ChatHistory({
          transcriptId,
          userId,
          messages: []
        });
      }

      logger.info('💾 Adding message to chat history:', {
        transcriptId,
        userId,
        role,
        contentLength: content?.length
      });

      await chatHistory.addMessage(role, content);

      logger.info('✅ Chat message saved successfully', {
        transcriptId,
        userId,
        role,
        messageCount: chatHistory.messages.length,
        totalMessages: chatHistory.messages.length
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
  // RECORDING MANAGEMENT
  // =====================================================

  /**
   * Save a new recording with session management
   * @param {Object} recordingData - Recording data
   * @returns {Promise<Object>} Saved recording
   */
  async saveRecording(recordingData) {
    try {
      const Recording = require('../models/Recording');
      
      const recording = new Recording({
        ...recordingData,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await recording.save();
      
      logger.info('💾 Recording saved successfully', {
        recordingId: recording.id,
        userId: recordingData.userId,
        sessionId: recordingData.sessionId,
        isParentSession: recordingData.isParentSession
      });

      return recording;
    } catch (error) {
      logger.error('❌ Failed to save recording:', error);
      throw error;
    }
  }

  /**
   * Create a parent session for segmented recordings
   * @param {Object} sessionData - Session data
   * @returns {Promise<Object>} Created parent session
   */
  async createParentSession(sessionData) {
    try {
      const Recording = require('../models/Recording');
      
      const parentSession = new Recording({
        ...sessionData,
        isParentSession: true,
        status: 'pending',
        metadata: {
          ...sessionData.metadata,
          recordingType: 'segmented',
          sessionStartTime: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await parentSession.save();
      
      logger.info('💾 Parent session created successfully', {
        sessionId: parentSession.sessionId,
        userId: sessionData.userId,
        totalSegments: sessionData.metadata?.totalSegments
      });

      return parentSession;
    } catch (error) {
      logger.error('❌ Failed to create parent session:', error);
      throw error;
    }
  }

  /**
   * Add a chunk recording to a parent session
   * @param {string} parentSessionId - Parent session ID
   * @param {Object} chunkData - Chunk recording data
   * @returns {Promise<Object>} Saved chunk recording
   */
  async addChunkToSession(parentSessionId, chunkData) {
    try {
      const Recording = require('../models/Recording');
      
      // Validate required fields in chunkData
      if (!chunkData.userId) {
        throw new Error('userId is required for chunk recording');
      }
      if (!chunkData.sessionId) {
        throw new Error('sessionId is required for chunk recording');
      }
      
      // Get parent session
      const parentSession = await Recording.findById(parentSessionId);
      if (!parentSession) {
        throw new Error('Parent session not found');
      }

      // Create chunk recording
      const chunkRecording = new Recording({
        ...chunkData,
        isParentSession: false,
        parentSessionId: parentSession.sessionId,
        parentRecordingId: parentSessionId,
        status: chunkData.status || 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Ensure sessionId is set (it should come from chunkData but let's be explicit)
      if (!chunkRecording.sessionId) {
        chunkRecording.sessionId = parentSession.sessionId;
      }

      // Log the chunk recording data for debugging
      logger.info('🔍 Creating chunk recording:', {
        chunkData: {
          userId: chunkData.userId,
          sessionId: chunkData.sessionId,
          title: chunkData.title,
          status: chunkData.status
        },
        finalRecording: {
          userId: chunkRecording.userId,
          sessionId: chunkRecording.sessionId,
          title: chunkRecording.title,
          status: chunkRecording.status,
          isParentSession: chunkRecording.isParentSession,
          parentSessionId: chunkRecording.parentSessionId,
          parentRecordingId: chunkRecording.parentRecordingId
        }
      });

      await chunkRecording.save();

      // Add chunk to parent session
      await parentSession.addChunkRecording(chunkRecording.id);

      // Update parent session metadata
      const totalSegments = parentSession.chunkRecordingIds.length;
      const totalFileSize = (parentSession.metadata?.totalFileSize || 0) + (chunkData.metadata?.fileSize || 0);
      
      await parentSession.updateSessionMetadata({
        totalSegments,
        totalFileSize,
        currentSegment: totalSegments
      });

      logger.info('💾 Chunk added to session successfully', {
        chunkId: chunkRecording.id,
        parentSessionId: parentSessionId,
        totalSegments,
        totalFileSize
      });

      return chunkRecording;
    } catch (error) {
      logger.error('❌ Failed to add chunk to session:', error);
      throw error;
    }
  }

  /**
   * Get user's recordings with session grouping
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of recordings grouped by session
   */
  async getUserRecordings(userId, options = {}) {
    try {
      const Recording = require('../models/Recording');
      
      const {
        limit = 20,
        offset = 0,
        status,
        sortBy = 'createdAt',
        sortOrder = -1,
        groupBySession = true
      } = options;

      if (groupBySession) {
        // Get parent sessions (grouped recordings)
        const parentSessions = await Recording.getParentSessions(userId);
        
        // Apply filtering and sorting
        let filteredSessions = parentSessions;
        if (status) {
          filteredSessions = filteredSessions.filter(session => session.status === status);
        }
        
        // Sort and paginate
        filteredSessions.sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          return sortOrder === -1 ? 
            (bValue > aValue ? 1 : -1) : 
            (aValue > bValue ? 1 : -1);
        });
        
        const paginatedSessions = filteredSessions.slice(offset, offset + limit);
        
        // Format response with session details
        const recordings = await Promise.all(paginatedSessions.map(async (session) => {
          const chunks = await Recording.find({ 
            _id: { $in: session.chunkRecordingIds } 
          }).sort({ 'metadata.currentSegment': 1 });

          return {
            id: session._id,
            sessionId: session.sessionId,
            title: session.title,
            status: session.status,
            isParentSession: true,
            audioFiles: chunks.flatMap(chunk => chunk.audioFiles || []),
            transcriptId: session.transcriptId?._id,
            transcript: session.transcriptId,
            metadata: {
              ...session.metadata,
              totalChunks: chunks.length,
              chunkStatuses: chunks.map(chunk => ({
                id: chunk._id,
                status: chunk.status,
                segmentIndex: chunk.metadata?.segmentIndex,
                error: chunk.error
              }))
            },
            error: session.error,
            retryCount: session.retryCount || 0,
            lastRetryAt: session.lastRetryAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            completedAt: session.completedAt,
            audioDeletedAt: session.audioDeletedAt
          };
        }));

        return recordings;
      } else {
        // Get individual recordings (legacy mode)
        const query = { userId };
        if (status) {
          query.status = status;
        }

        const recordings = await Recording.find(query)
          .sort({ [sortBy]: sortOrder })
          .skip(offset)
          .limit(limit)
          .populate('transcriptId', 'title content createdAt')
          .lean();

        return recordings.map(recording => ({
          id: recording._id,
          sessionId: recording.sessionId,
          title: recording.title,
          status: recording.status,
          isParentSession: recording.isParentSession,
          audioFiles: recording.audioFiles || [],
          transcriptId: recording.transcriptId?._id,
          transcript: recording.transcriptId,
          metadata: recording.metadata,
          error: recording.error,
          retryCount: recording.retryCount || 0,
          lastRetryAt: recording.lastRetryAt,
          createdAt: recording.createdAt,
          updatedAt: recording.updatedAt,
          completedAt: recording.completedAt,
          audioDeletedAt: recording.audioDeletedAt
        }));
      }
    } catch (error) {
      logger.error('❌ Failed to get user recordings:', error);
      throw error;
    }
  }

  /**
   * Get complete session with all chunks
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Complete session or null
   */
  async getCompleteSession(userId, sessionId) {
    try {
      const Recording = require('../models/Recording');
      
      const session = await Recording.getCompleteSession(userId, sessionId);
      if (!session) {
        return null;
      }

      // Get all chunks for this session
      const chunks = await Recording.find({ 
        _id: { $in: session.chunkRecordingIds } 
      }).sort({ 'metadata.currentSegment': 1 });

      return {
        id: session._id,
        sessionId: session.sessionId,
        title: session.title,
        status: session.status,
        isParentSession: true,
        audioFiles: chunks.flatMap(chunk => chunk.audioFiles || []),
        transcriptId: session.transcriptId?._id,
        transcript: session.transcriptId,
        metadata: {
          ...session.metadata,
          totalChunks: chunks.length,
          chunks: chunks.map(chunk => ({
            id: chunk._id,
            status: chunk.status,
            segmentIndex: chunk.metadata?.segmentIndex,
            audioFiles: chunk.audioFiles,
            error: chunk.error,
            createdAt: chunk.createdAt
          }))
        },
        error: session.error,
        retryCount: session.retryCount || 0,
        lastRetryAt: session.lastRetryAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        completedAt: session.completedAt,
        audioDeletedAt: session.audioDeletedAt
      };
    } catch (error) {
      logger.error('❌ Failed to get complete session:', error);
      throw error;
    }
  }

  /**
   * Get specific recording by ID
   * @param {string} recordingId - Recording ID
   * @param {string} userId - User ID for authorization
   * @returns {Promise<Object|null>} Recording or null
   */
  async getRecording(recordingId, userId) {
    try {
      const Recording = require('../models/Recording');
      
      const recording = await Recording.findOne({
        _id: recordingId,
        userId
      }).populate('transcriptId', 'title content createdAt').lean();

      if (!recording) {
        return null;
      }

      // If this is a parent session, get chunk details
      if (recording.isParentSession && recording.chunkRecordingIds?.length > 0) {
        const chunks = await Recording.find({ 
          _id: { $in: recording.chunkRecordingIds } 
        }).sort({ 'metadata.currentSegment': 1 });

        return {
          id: recording._id,
          sessionId: recording.sessionId,
          title: recording.title,
          status: recording.status,
          isParentSession: true,
          audioFiles: chunks.flatMap(chunk => chunk.audioFiles || []),
          transcriptId: recording.transcriptId?._id,
          transcript: recording.transcriptId,
          metadata: {
            ...recording.metadata,
            totalChunks: chunks.length,
            chunkStatuses: chunks.map(chunk => ({
              id: chunk._id,
              status: chunk.status,
              segmentIndex: chunk.metadata?.segmentIndex,
              error: chunk.error
            }))
          },
          error: recording.error,
          retryCount: recording.retryCount || 0,
          lastRetryAt: recording.lastRetryAt,
          createdAt: recording.createdAt,
          updatedAt: recording.updatedAt,
          completedAt: recording.completedAt,
          audioDeletedAt: recording.audioDeletedAt
        };
      }

      return {
        id: recording._id,
        sessionId: recording.sessionId,
        title: recording.title,
        status: recording.status,
        isParentSession: recording.isParentSession,
        audioFiles: recording.audioFiles || [],
        transcriptId: recording.transcriptId?._id,
        transcript: recording.transcriptId,
        metadata: recording.metadata,
        error: recording.error,
        retryCount: recording.retryCount || 0,
        lastRetryAt: recording.lastRetryAt,
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt,
        completedAt: recording.completedAt,
        audioDeletedAt: recording.audioDeletedAt
      };
    } catch (error) {
      logger.error('❌ Failed to get recording:', error);
      throw error;
    }
  }

  /**
   * Update recording
   * @param {string} recordingId - Recording ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Update result
   */
  async updateRecording(recordingId, updates) {
    try {
      const Recording = require('../models/Recording');
      
      const recording = await Recording.findByIdAndUpdate(
        recordingId,
        {
          ...updates,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!recording) {
        throw new Error('Recording not found');
      }

      logger.info('💾 Recording updated successfully', {
        recordingId: recording.id,
        updates: Object.keys(updates)
      });

      return recording;
    } catch (error) {
      logger.error('❌ Failed to update recording:', error);
      throw error;
    }
  }

  /**
   * Delete recording
   * @param {string} recordingId - Recording ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteRecording(recordingId) {
    try {
      const Recording = require('../models/Recording');
      
      const recording = await Recording.findById(recordingId);

      if (!recording) {
        throw new Error('Recording not found');
      }

      // If this is a parent session, delete all chunks first
      if (recording.isParentSession && recording.chunkRecordingIds?.length > 0) {
        for (const chunkId of recording.chunkRecordingIds) {
          try {
            await Recording.findByIdAndDelete(chunkId);
          } catch (chunkError) {
            logger.warn(`⚠️ Failed to delete chunk ${chunkId}:`, chunkError);
          }
        }
      }

      // Delete the main recording
      await Recording.findByIdAndDelete(recordingId);

      logger.info('🗑️ Recording deleted successfully', {
        recordingId: recording.id,
        deletedChunks: recording.chunkRecordingIds?.length || 0
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete recording:', error);
      throw error;
    }
  }

  // =====================================================
  // TRANSCRIPT OPERATIONS
  // =====================================================

  /**
   * Save a new transcript
   * @param {Object} transcriptData - Transcript data
   * @returns {Promise<Object>} Saved transcript
   */
  async saveTranscript(transcriptData) {
    try {
      const Transcript = require('../models/Transcript');
      
      const transcript = new Transcript(transcriptData);
      const savedTranscript = await transcript.save();
      
      logger.info('💾 Transcript saved successfully', {
        transcriptId: savedTranscript.id,
        userId: savedTranscript.userId,
        title: savedTranscript.title
      });
      
      return savedTranscript;
    } catch (error) {
      logger.error('❌ Failed to save transcript:', error);
      throw error;
    }
  }

  // Removed duplicate getTranscript method - using the main one at line 216

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