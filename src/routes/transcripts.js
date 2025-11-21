const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/databaseCheck');
const databaseService = require('../services/DatabaseService');
const ActivityLogService = require('../services/ActivityLogService');
const Transcript = require('../models/Transcript');
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
 * GET /api/transcripts
 * Get user's transcripts with pagination
 */
router.get('/',
  authenticate,
  requireDatabase,  // Add database check
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'duration']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    query('includeSegments').optional().isBoolean().withMessage('includeSegments must be boolean')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeSegments = false
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1,
      includeSegments: includeSegments === 'true'
    };

    const transcripts = await databaseService.getUserTranscripts(req.user.id, options);

    res.json({
      success: true,
      transcripts,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: transcripts.length
      }
    });
  })
);

/**
 * GET /api/transcripts/search
 * Search transcripts by content
 */
router.get('/search',
  authenticate,
  requireDatabase,
  [
    query('q').notEmpty().withMessage('Search query is required'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { q: query, limit = 10, offset = 0 } = req.query;

    const results = await databaseService.searchTranscripts(req.user.id, query, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      query,
      results,
      count: results.length
    });
  })
);

/**
 * GET /api/transcripts/:id
 * Get specific transcript
 */
router.get('/:id',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const transcript = await databaseService.getTranscript(id, req.user.id);

    // Log transcript view activity
    await ActivityLogService.logTranscriptView(req.user, id, req);

    res.json({
      success: true,
      transcript
    });
  })
);

/**
 * PUT /api/transcripts/:id
 * Update transcript
 */
router.put('/:id',
  authenticate,
  requireDatabase,
  [
    body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
    body('content').optional().trim().isLength({ min: 1 }).withMessage('Content cannot be empty'),
    body('summary').optional().trim().isLength({ max: 5000 }).withMessage('Summary cannot exceed 5000 characters'),
    body('debrief').optional().isObject().withMessage('Debrief must be an object')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Remove read-only fields
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;
    delete updates.segments; // Segments should not be updated directly

    const updatedTranscript = await databaseService.updateTranscript(id, req.user.id, updates);

    logger.info('📝 Transcript updated via API', {
      transcriptId: id,
      userId: req.user.id,
      fields: Object.keys(updates)
    });

    res.json({
      success: true,
      message: 'Transcript updated successfully',
      transcript: updatedTranscript
    });
  })
);

/**
 * DELETE /api/transcripts/:id
 * Delete transcript
 */
router.delete('/:id',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
      await databaseService.deleteTranscript(id, req.user.id);

      logger.info('🗑️ Transcript deleted via API', {
        transcriptId: id,
        userId: req.user.id
      });

      // Log transcript deletion activity
      await ActivityLogService.logTranscriptDeletion(req.user, id, req);

      return res.json({
        success: true,
        message: 'Transcript deleted successfully'
      });
    } catch (error) {
      if (error && error.message === 'Transcript not found') {
        return res.status(404).json({ success: false, error: 'Transcript not found' });
      }
      throw error;
    }
  })
);

/**
 * DELETE /api/transcripts/admin/:id
 * Admin endpoint to delete any transcript
 */
router.delete('/admin/:id',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
      await databaseService.deleteTranscriptAsAdmin(id);

      logger.info('🗑️ Transcript deleted by admin via API', {
        transcriptId: id,
        adminId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Transcript deleted successfully'
      });
    } catch (error) {
      if (error && error.message === 'Transcript not found') {
        return res.status(404).json({ success: false, error: 'Transcript not found' });
      }
      throw error;
    }
  })
);

/**
 * GET /api/transcripts/:id/stats
 * Get transcript statistics
 */
router.get('/:id/stats',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const transcript = await databaseService.getTranscript(id, req.user.id);

    // Calculate statistics
    const stats = {
      id: transcript.id,
      title: transcript.title,
      wordCount: transcript.content ? transcript.content.split(/\s+/).length : 0,
      segmentCount: transcript.segments ? transcript.segments.length : 0,
      duration: transcript.metadata?.duration || 0,
      sources: transcript.metadata?.sources || [],
      language: transcript.metadata?.language || 'en',
      hasSummary: !!transcript.summary,
      hasDebrief: !!transcript.debrief?.content,
      createdAt: transcript.createdAt,
      updatedAt: transcript.updatedAt
    };

    res.json({
      success: true,
      stats
    });
  })
);

/**
 * POST /api/transcripts/:id/export
 * Export transcript in different formats
 */
router.post('/:id/export',
  authenticate,
  requireDatabase,
  [
    body('format').isIn(['txt', 'json', 'md']).withMessage('Format must be txt, json, or md'),
    body('includeAnalysis').optional().isBoolean().withMessage('includeAnalysis must be boolean')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { format, includeAnalysis = true } = req.body;

    const transcript = await databaseService.getTranscript(id, req.user.id);

    let content = '';
    let mimeType = 'text/plain';
    let filename = `interview-transcript-${transcript.id}`;

    switch (format) {
      case 'txt':
        content = transcript.content;
        if (includeAnalysis && transcript.summary) {
          content += '\n\n--- SUMMARY ---\n' + transcript.summary;
        }
        if (includeAnalysis && transcript.debrief?.content) {
          content += '\n\n--- DEBRIEF ---\n' + transcript.debrief.content;
        }
        filename += '.txt';
        break;

      case 'json':
        const jsonData = { ...transcript };
        if (!includeAnalysis) {
          delete jsonData.summary;
          delete jsonData.debrief;
          delete jsonData.aiAnalysis;
        }
        content = JSON.stringify(jsonData, null, 2);
        mimeType = 'application/json';
        filename += '.json';
        break;

      case 'md':
        content = `# ${transcript.title}\n\n`;
        content += `**Created:** ${new Date(transcript.createdAt).toLocaleString()}\n`;
        content += `**Duration:** ${transcript.metadata?.duration || 0} seconds\n\n`;
        content += '## Transcript\n\n';
        content += transcript.content.replace(/\n/g, '\n\n');

        if (includeAnalysis && transcript.summary) {
          content += '\n\n## Summary\n\n' + transcript.summary;
        }
        if (includeAnalysis && transcript.debrief?.content) {
          content += '\n\n## Debrief\n\n' + transcript.debrief.content;
        }
        filename += '.md';
        break;
    }

    // Set headers for file download
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(content));

    logger.info('📤 Transcript exported', {
      transcriptId: id,
      userId: req.user.id,
      format,
      includeAnalysis
    });

    res.send(content);
  })
);

/**
 * PUT /api/transcripts/:id/interview-details
 * Update interview details for a transcript
 */
router.put('/:id/interview-details',
  authenticate,
  requireDatabase,
  [
    body('companyName').optional().isString().trim().isLength({ max: 100 }).withMessage('Company name cannot exceed 100 characters'),
    body('round').optional().isIn(['Screening', 'Technical Round 1', 'Technical Round 2', 'System Design', 'Behavioral', 'Final Round', 'HR Round', 'Other']).withMessage('Invalid round type'),
    body('interviewerName').optional().isString().trim().isLength({ max: 100 }).withMessage('Interviewer name cannot exceed 100 characters'),
    body('studentName').optional().isString().trim().isLength({ max: 100 }).withMessage('Student name cannot exceed 100 characters'),
    body('performanceRating').optional().isInt({ min: 1, max: 10 }).withMessage('Performance rating must be between 1 and 10')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Get the transcript to verify it exists
    const transcript = await Transcript.findOne({ id, userId: req.user.id });
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    // Prepare interview details update
    const interviewDetailsUpdate = {
      ...updateData,
      isUpdated: true,
      updatedAt: new Date()
    };

    // Update interview details using findOneAndUpdate to avoid _id issues
    const updatedTranscript = await Transcript.findOneAndUpdate(
      { id, userId: req.user.id },
      {
        $set: {
          interviewDetails: interviewDetailsUpdate
        }
      },
      { new: true }
    );

    logger.info('📝 Interview details updated', {
      transcriptId: id,
      userId: req.user.id,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      interviewDetails: updatedTranscript.interviewDetails
    });
  })
);

/**
 * GET /api/transcripts/:id/interview-details
 * Get interview details for a transcript
 */
router.get('/:id/interview-details',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get the transcript (need full document, not lean, for methods)
    const transcript = await Transcript.findOne({ id, userId: req.user.id });
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    res.json({
      success: true,
      interviewDetails: transcript.getInterviewDetails()
    });
  })
);

/**
 * PUT /api/transcripts/admin/:id/interview-details
 * Admin endpoint to update interview details for any transcript
 */
router.put('/admin/:id/interview-details',
  authenticate,
  requireAdmin,
  requireDatabase,
  [
    body('companyName').optional().isString().trim().isLength({ max: 100 }).withMessage('Company name cannot exceed 100 characters'),
    body('round').optional().isIn(['Screening', 'Technical Round 1', 'Technical Round 2', 'Technical Round 3', 'System Design', 'Coding Round', 'Behavioral', 'Final Round', 'HR Round', 'CTO Round', 'CEO Round', 'Manager Round', 'Panel Interview', 'Culture Fit', 'Other']).withMessage('Invalid round type'),
    body('interviewerName').optional().isString().trim().isLength({ max: 100 }).withMessage('Interviewer name cannot exceed 100 characters'),
    body('studentName').optional().isString().trim().isLength({ max: 100 }).withMessage('Student name cannot exceed 100 characters'),
    body('performanceRating').optional().isInt({ min: 1, max: 10 }).withMessage('Performance rating must be between 1 and 10')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Get the transcript (admin can access any transcript)
    const transcript = await Transcript.findOne({ id });
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    // Prepare interview details update
    const interviewDetailsUpdate = {
      ...updateData,
      isUpdated: true,
      updatedAt: new Date()
    };

    // Update interview details using findOneAndUpdate to avoid _id issues
    const updatedTranscript = await Transcript.findOneAndUpdate(
      { id },
      {
        $set: {
          interviewDetails: interviewDetailsUpdate
        }
      },
      { new: true }
    );

    logger.info('📝 Interview details updated by admin', {
      transcriptId: id,
      adminId: req.user.id,
      originalUserId: transcript.userId,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      interviewDetails: updatedTranscript.interviewDetails
    });
  })
);

/**
 * GET /api/transcripts/admin/:id/interview-details
 * Admin endpoint to get interview details for any transcript
 */
router.get('/admin/:id/interview-details',
  authenticate,
  requireAdmin,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get the transcript (admin can access any transcript)
    const transcript = await Transcript.findOne({ id });
    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }

    res.json({
      success: true,
      interviewDetails: transcript.getInterviewDetails()
    });
  })
);

/**
 * POST /api/transcripts/bulk-delete
 * Delete multiple transcripts
 */
router.post('/bulk-delete',
  authenticate,
  requireDatabase,
  [
    body('transcriptIds').isArray({ min: 1 }).withMessage('Must provide array of transcript IDs'),
    body('transcriptIds.*').isString().withMessage('Each transcript ID must be a string')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { transcriptIds } = req.body;

    const results = {
      deleted: [],
      failed: []
    };

    for (const id of transcriptIds) {
      try {
        await databaseService.deleteTranscript(id, req.user.id);
        results.deleted.push(id);
      } catch (error) {
        results.failed.push({ id, error: error.message });
      }
    }

    logger.info('🗑️ Bulk transcript deletion', {
      userId: req.user.id,
      requested: transcriptIds.length,
      deleted: results.deleted.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      message: `Deleted ${results.deleted.length} of ${transcriptIds.length} transcripts`,
      results
    });
  })
);

/**
 * POST /api/transcripts/admin/bulk-delete
 * Admin endpoint to bulk delete any transcripts
 */
router.post('/admin/bulk-delete',
  authenticate,
  requireAdmin,
  requireDatabase,
  [
    body('transcriptIds').isArray({ min: 1 }).withMessage('Must provide array of transcript IDs'),
    body('transcriptIds.*').isString().withMessage('Each transcript ID must be a string')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { transcriptIds } = req.body;
    
    const results = {
      deleted: [],
      failed: []
    };

    for (const id of transcriptIds) {
      try {
        await databaseService.deleteTranscriptAsAdmin(id);
        results.deleted.push(id);
      } catch (error) {
        results.failed.push({ id, error: error.message });
      }
    }

    logger.info('🗑️ Bulk transcript deletion by admin', {
      adminId: req.user.id,
      requested: transcriptIds.length,
      deleted: results.deleted.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      message: `Deleted ${results.deleted.length} of ${transcriptIds.length} transcripts`,
      results
    });
  })
);

/**
 * GET /api/transcripts/admin/all
 * Get all transcripts from all users (admin only)
 */
router.get('/admin/all',
  authenticate,
  requireDatabase,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'duration']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    query('includeSegments').optional().isBoolean().withMessage('includeSegments must be boolean'),
    query('userId').optional().isString().withMessage('userId must be a string'),
    query('hasSummary').optional().isBoolean().withMessage('hasSummary must be boolean'),
    query('hasDebrief').optional().isBoolean().withMessage('hasDebrief must be boolean'),
    query('search').optional().isString().withMessage('search must be a string')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const {
      limit = 20,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeSegments = false,
      userId = null,
      hasSummary = null,
      hasDebrief = null,
      search = null
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1,
      includeSegments: includeSegments === 'true',
      userId,
      hasSummary: hasSummary === 'true' ? true : hasSummary === 'false' ? false : null,
      hasDebrief: hasDebrief === 'true' ? true : hasDebrief === 'false' ? false : null,
      search
    };

    const result = await databaseService.getAllTranscriptsForAdmin(options);

    res.json({
      success: true,
      transcripts: result.transcripts,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: result.total
      }
    });
  })
);

module.exports = router; 