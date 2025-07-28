const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const aiService = require('../services/AIService');
const databaseService = require('../services/DatabaseService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * POST /api/ai/summary/:transcriptId
 * Generate summary for transcript
 */
router.post('/summary/:transcriptId',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    // Check if summary already exists
    if (transcript.summary) {
      return res.json({
        success: true,
        message: 'Summary already exists',
        summary: transcript.summary,
        cached: true
      });
    }

    // Generate summary
    const result = await aiService.generateSummary(transcript.content);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save summary to database
    await databaseService.updateTranscript(transcriptId, req.user.id, {
      summary: result.summary
    });

    logger.info('📝 Summary generated', {
      transcriptId,
      userId: req.user.id,
      summaryLength: result.summary.length
    });

    res.json({
      success: true,
      message: 'Summary generated successfully',
      summary: result.summary,
      cached: false
    });
  })
);

/**
 * POST /api/ai/debrief/:transcriptId
 * Generate interview debrief for transcript
 */
router.post('/debrief/:transcriptId',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    // Check if debrief already exists
    if (transcript.debrief?.content) {
      return res.json({
        success: true,
        message: 'Debrief already exists',
        debrief: transcript.debrief,
        cached: true
      });
    }

    // Generate debrief
    const result = await aiService.generateInterviewDebrief(transcript.content);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save debrief to database
    await databaseService.updateTranscript(transcriptId, req.user.id, {
      debrief: result.debrief
    });

    logger.info('📊 Debrief generated', {
      transcriptId,
      userId: req.user.id,
      debriefLength: result.debrief.content.length
    });

    res.json({
      success: true,
      message: 'Debrief generated successfully',
      debrief: result.debrief,
      cached: false
    });
  })
);

/**
 * POST /api/ai/admin/summary/:transcriptId
 * Generate summary for any transcript (admin only)
 */
router.post('/admin/summary/:transcriptId',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (no user restriction for admin)
    const transcript = await databaseService.getTranscriptForAdmin(transcriptId);
    
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }
    
    // Check if summary already exists
    if (transcript.summary) {
      return res.json({
        success: true,
        message: 'Summary already exists',
        summary: transcript.summary,
        cached: true
      });
    }

    // Generate summary
    const result = await aiService.generateSummary(transcript.content);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save summary to database (admin can update any transcript)
    await databaseService.updateTranscriptForAdmin(transcriptId, {
      summary: result.summary
    });

    logger.info('📝 Admin generated summary', {
      transcriptId,
      adminId: req.user.id,
      originalUserId: transcript.userId,
      summaryLength: result.summary.length
    });

    res.json({
      success: true,
      message: 'Summary generated successfully',
      summary: result.summary,
      cached: false
    });
  })
);

/**
 * POST /api/ai/admin/debrief/:transcriptId
 * Generate debrief for any transcript (admin only)
 */
router.post('/admin/debrief/:transcriptId',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (no user restriction for admin)
    const transcript = await databaseService.getTranscriptForAdmin(transcriptId);
    
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }
    
    // Check if debrief already exists
    if (transcript.debrief?.content) {
      return res.json({
        success: true,
        message: 'Debrief already exists',
        debrief: transcript.debrief,
        cached: true
      });
    }

    // Generate debrief
    const result = await aiService.generateInterviewDebrief(transcript.content);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save debrief to database (admin can update any transcript)
    await databaseService.updateTranscriptForAdmin(transcriptId, {
      debrief: result.debrief
    });

    logger.info('📊 Admin generated debrief', {
      transcriptId,
      adminId: req.user.id,
      originalUserId: transcript.userId,
      debriefLength: result.debrief.content.length
    });

    res.json({
      success: true,
      message: 'Debrief generated successfully',
      debrief: result.debrief,
      cached: false
    });
  })
);

/**
 * POST /api/ai/chat/:transcriptId
 * Chat with AI about transcript
 */
router.post('/chat/:transcriptId',
  authenticate,
  requireDatabase,
  [
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
    body('saveToHistory').optional().isBoolean().withMessage('saveToHistory must be boolean')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    const { message, saveToHistory = true } = req.body;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    // Get chat history
    const chatHistory = await databaseService.getChatHistory(transcriptId, req.user.id);
    
    // Generate AI response
    const result = await aiService.chatWithTranscript(transcript.content, message, chatHistory);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // Save to chat history if requested
    if (saveToHistory) {
      await databaseService.saveChatMessage(transcriptId, req.user.id, 'user', message);
      await databaseService.saveChatMessage(transcriptId, req.user.id, 'assistant', result.response);
    }

    logger.info('💬 AI chat response generated', {
      transcriptId,
      userId: req.user.id,
      messageLength: message.length,
      responseLength: result.response.length,
      saved: saveToHistory
    });

    res.json({
      success: true,
      message: 'Chat response generated',
      response: result.response,
      conversation: {
        user: message,
        assistant: result.response,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * GET /api/ai/chat/:transcriptId/history
 * Get chat history for transcript
 */
router.get('/chat/:transcriptId/history',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    const chatHistory = await databaseService.getChatHistory(transcriptId, req.user.id);
    
    res.json({
      success: true,
      chatHistory,
      messageCount: chatHistory.length
    });
  })
);

/**
 * DELETE /api/ai/chat/:transcriptId/history
 * Clear chat history for transcript
 */
router.delete('/chat/:transcriptId/history',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    await databaseService.clearChatHistory(transcriptId, req.user.id);
    
    logger.info('🧹 Chat history cleared', {
      transcriptId,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Chat history cleared successfully'
    });
  })
);

/**
 * POST /api/ai/extract-qa/:transcriptId
 * Extract questions and answers from transcript
 */
router.post('/extract-qa/:transcriptId',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    // Extract Q&A pairs
    const result = await aiService.extractQuestionsAndAnswers(transcript.content);
    
    logger.info('❓ Q&A extraction completed', {
      transcriptId,
      userId: req.user.id,
      qaCount: result.questionsAndAnswers.length
    });

    res.json({
      success: true,
      message: 'Questions and answers extracted',
      questionsAndAnswers: result.questionsAndAnswers,
      count: result.questionsAndAnswers.length
    });
  })
);

/**
 * POST /api/ai/follow-up-questions/:transcriptId
 * Generate follow-up questions based on transcript
 */
router.post('/follow-up-questions/:transcriptId',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    // Generate follow-up questions
    const result = await aiService.generateFollowUpQuestions(transcript.content);
    
    logger.info('❓ Follow-up questions generated', {
      transcriptId,
      userId: req.user.id,
      questionCount: result.questions.length
    });

    res.json({
      success: true,
      message: 'Follow-up questions generated',
      questions: result.questions,
      count: result.questions.length
    });
  })
);

/**
 * POST /api/ai/analyze/:transcriptId
 * Generate comprehensive analysis (summary + debrief + Q&A)
 */
router.post('/analyze/:transcriptId',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { transcriptId } = req.params;
    
    // Get transcript (verifies ownership)
    const transcript = await databaseService.getTranscript(transcriptId, req.user.id);
    
    const analysis = {
      summary: null,
      debrief: null,
      questionsAndAnswers: [],
      followUpQuestions: []
    };

    // Generate summary if not exists
    if (!transcript.summary) {
      const summaryResult = await aiService.generateSummary(transcript.content);
      if (summaryResult.success) {
        analysis.summary = summaryResult.summary;
        await databaseService.updateTranscript(transcriptId, req.user.id, {
          summary: summaryResult.summary
        });
      }
    } else {
      analysis.summary = transcript.summary;
    }

    // Generate debrief if not exists
    if (!transcript.debrief?.content) {
      const debriefResult = await aiService.generateInterviewDebrief(transcript.content);
      if (debriefResult.success) {
        analysis.debrief = debriefResult.debrief;
        await databaseService.updateTranscript(transcriptId, req.user.id, {
          debrief: debriefResult.debrief
        });
      }
    } else {
      analysis.debrief = transcript.debrief;
    }

    // Extract Q&A pairs
    const qaResult = await aiService.extractQuestionsAndAnswers(transcript.content);
    if (qaResult.success) {
      analysis.questionsAndAnswers = qaResult.questionsAndAnswers;
    }

    // Generate follow-up questions
    const followUpResult = await aiService.generateFollowUpQuestions(transcript.content);
    if (followUpResult.success) {
      analysis.followUpQuestions = followUpResult.questions;
    }

    logger.info('🔍 Comprehensive analysis completed', {
      transcriptId,
      userId: req.user.id,
      hasSummary: !!analysis.summary,
      hasDebrief: !!analysis.debrief,
      qaCount: analysis.questionsAndAnswers.length,
      followUpCount: analysis.followUpQuestions.length
    });

    res.json({
      success: true,
      message: 'Comprehensive analysis completed',
      analysis
    });
  })
);

/**
 * GET /api/ai/status
 * Check AI service status
 */
router.get('/status',
  asyncHandler(async (req, res) => {
    const status = await aiService.testConnection();
    
    res.json({
      success: true,
      aiService: {
        available: aiService.isAvailable(),
        status: status.success ? 'healthy' : 'error',
        message: status.message || status.error
      }
    });
  })
);





module.exports = router; 