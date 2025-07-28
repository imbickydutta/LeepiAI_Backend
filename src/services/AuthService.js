const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const logger = require('../utils/logger');
const User = require('../models/User');
const Session = require('../models/Session');

class AuthService {
  constructor() {
    this.jwtSecret = config.jwt.secret;
    this.refreshSecret = config.jwt.refreshSecret;
    this.jwtExpiresIn = config.jwt.expiresIn;
    this.refreshExpiresIn = config.jwt.refreshExpiresIn;
    
    logger.info('🔐 AuthService initialized');
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result
   */
  async register(userData) {
    try {
      const { email, password, firstName, lastName } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return {
          success: false,
          error: 'User already exists with this email'
        };
      }

      // Create new user (password will be hashed by pre-save hook)
      const user = new User({
        email,
        password,
        firstName,
        lastName
      });

      await user.save();

      // Generate tokens
      const tokens = await this._generateTokens(user.id);

      // Create session
      await this._createSession(user.id, tokens, userData.deviceInfo);

      logger.info(`👤 New user registered: ${email}`, { userId: user.id });

      return {
        success: true,
        user: user.getPublicProfile(),
        ...tokens
      };
    } catch (error) {
      logger.error('❌ User registration failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Authenticate user login
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} Authentication result
   */
  async login(credentials) {
    try {
      const { email, password, deviceInfo } = credentials;

      // Find user
      const user = await User.findOne({ email, isActive: true });
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      // Generate tokens
      const tokens = await this._generateTokens(user.id);

      // Create session
      await this._createSession(user.id, tokens, deviceInfo);

      logger.info(`🔐 User authenticated: ${email}`, { userId: user.id });

      return {
        success: true,
        user: user.getPublicProfile(),
        ...tokens
      };
    } catch (error) {
      logger.error('❌ User authentication failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} Refresh result
   */
  async refreshToken(refreshToken) {
    try {
      // Find session by refresh token
      const session = await Session.findByRefreshToken(refreshToken);
      if (!session) {
        return {
          success: false,
          error: 'Invalid or expired refresh token'
        };
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshSecret);
      if (decoded.userId !== session.userId) {
        return {
          success: false,
          error: 'Token mismatch'
        };
      }

      // Generate new tokens
      const tokens = await this._generateTokens(session.userId);

      // Update session
      const newExpiresAt = new Date(Date.now() + this._parseExpirationTime(this.jwtExpiresIn));
      const newRefreshExpiresAt = new Date(Date.now() + this._parseExpirationTime(this.refreshExpiresIn));
      
      await session.refresh(tokens.token, tokens.refreshToken, newExpiresAt, newRefreshExpiresAt);

      // Get user info
      const user = await User.findByCustomId(session.userId);

      logger.info('🔄 Token refreshed', { userId: session.userId });

      return {
        success: true,
        user: user.getPublicProfile(),
        ...tokens
      };
    } catch (error) {
      logger.error('❌ Token refresh failed:', error);
      return {
        success: false,
        error: 'Invalid refresh token'
      };
    }
  }

  /**
   * Logout user and invalidate session
   * @param {string} token - Access token
   * @returns {Promise<Object>} Logout result
   */
  async logout(token) {
    try {
      // Find and deactivate session
      const session = await Session.findByToken(token);
      if (session) {
        await session.deactivate();
        logger.info('👋 User logged out', { userId: session.userId });
      }

      return { success: true };
    } catch (error) {
      logger.error('❌ Logout failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Promise<Object>} Verification result
   */
  async verifyToken(token) {
    try {
      logger.info('🔍 Token verification started:', {
        tokenLength: token ? token.length : 0,
        jwtSecretLength: this.jwtSecret ? this.jwtSecret.length : 0,
        tokenStart: token ? token.substring(0, 10) + '...' : 'undefined'
      });

      // Verify JWT signature and expiration
      const decoded = jwt.verify(token, this.jwtSecret);
      
      logger.info('✅ JWT signature verified:', {
        userId: decoded.userId,
        exp: decoded.exp,
        iat: decoded.iat
      });

      // Find active session
      const session = await Session.findByToken(token);
      if (!session) {
        logger.warn('❌ Session not found for token');
        return {
          valid: false,
          error: 'Session not found or expired'
        };
      }

      logger.info('✅ Session found:', {
        sessionId: session.id,
        isActive: session.isActive,
        expiresAt: session.expiresAt
      });

      // Update session last used time
      await session.updateLastUsed();

      // Get user
      const user = await User.findByCustomId(decoded.userId);
      if (!user || !user.isActive) {
        logger.warn('❌ User not found or inactive:', {
          userId: decoded.userId,
          userExists: !!user,
          userActive: user ? user.isActive : 'N/A'
        });
        return {
          valid: false,
          error: 'User not found or inactive'
        };
      }

      logger.info('✅ Token verification successful:', {
        userId: user.id,
        email: user.email
      });

      return {
        valid: true,
        user: user.getPublicProfile(),
        session: session
      };
    } catch (error) {
      logger.error('❌ Token verification error details:', {
        errorName: error.name,
        errorMessage: error.message,
        tokenLength: token ? token.length : 0,
        jwtSecretExists: !!this.jwtSecret
      });

      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired'
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid token'
        };
      }
      
      logger.error('❌ Token verification failed:', error);
      return {
        valid: false,
        error: 'Token verification failed'
      };
    }
  }

  /**
   * Get user active sessions
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Active sessions
   */
  async getUserSessions(userId) {
    try {
      return await Session.getUserActiveSessions(userId);
    } catch (error) {
      logger.error('❌ Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Terminate all user sessions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result
   */
  async terminateAllSessions(userId) {
    try {
      const sessions = await Session.find({ userId, isActive: true });
      
      for (const session of sessions) {
        await session.deactivate();
      }

      logger.info(`🔒 All sessions terminated for user: ${userId}`);
      
      return {
        success: true,
        terminatedSessions: sessions.length
      };
    } catch (error) {
      logger.error('❌ Failed to terminate sessions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up expired sessions
   * @returns {Promise<number>} Number of cleaned sessions
   */
  async cleanupExpiredSessions() {
    try {
      const result = await Session.cleanupExpiredSessions();
      
      if (result.deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.deletedCount} expired sessions`);
      }
      
      return result.deletedCount;
    } catch (error) {
      logger.error('❌ Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Generate JWT and refresh tokens
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Tokens
   */
  async _generateTokens(userId) {
    const tokenPayload = {
      userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    };

    const refreshPayload = {
      userId,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });

    const refreshToken = jwt.sign(refreshPayload, this.refreshSecret, {
      expiresIn: this.refreshExpiresIn
    });

    return { token, refreshToken };
  }

  /**
   * Create session record
   * @param {string} userId - User ID
   * @param {Object} tokens - JWT tokens
   * @param {Object} deviceInfo - Device information
   * @returns {Promise<Object>} Session
   */
  async _createSession(userId, tokens, deviceInfo = {}) {
    const expiresAt = new Date(Date.now() + this._parseExpirationTime(this.jwtExpiresIn));
    const refreshExpiresAt = new Date(Date.now() + this._parseExpirationTime(this.refreshExpiresIn));

    const session = new Session({
      userId,
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      expiresAt,
      refreshExpiresAt,
      deviceInfo
    });

    return await session.save();
  }

  /**
   * Parse expiration time string to milliseconds
   * @param {string} expirationString - Expiration string (e.g., '7d', '1h')
   * @returns {number} Milliseconds
   */
  _parseExpirationTime(expirationString) {
    const unit = expirationString.slice(-1);
    const value = parseInt(expirationString.slice(0, -1));

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000; // Default to 7 days
    }
  }
}

module.exports = new AuthService(); 