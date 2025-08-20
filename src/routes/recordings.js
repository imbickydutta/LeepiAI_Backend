const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { asyncHandler } = require('../middleware/errorHandler');
const { body, query, validationResult } = require('express-validator');
const databaseService = require('../services/DatabaseService');
const audioService = require('../services/AudioService');
const logger = require('../utils/logger');

const router = express.Router();

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * GET /api/recordings
 * Get user's recordings with pagination and filtering
 */
router.get('/',
  authenticate,
  requireDatabase,
  [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
    query('status').optional().isIn(['completed', 'failed', 'processing', 'pending']).withMessage('Invalid status'),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'title', 'duration']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const {
      limit = 20,
      offset = 0,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status,
      sortBy,
      sortOrder: sortOrder === 'desc' ? -1 : 1
    };

    const recordings = await databaseService.getUserRecordings(req.user.id, options);

    res.json({
      success: true,
      recordings,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        total: recordings.length
      }
    });
  })
);

/**
 * GET /api/recordings/:id
 * Get specific recording details
 */
router.get('/:id',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const recording = await databaseService.getRecording(req.params.id, req.user.id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      });
    }

    res.json({
      success: true,
      recording
    });
  })
);

/**
 * POST /api/recordings/:id/retry
 * Retry a failed recording upload
 */
router.post('/:id/retry',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const recording = await databaseService.getRecording(req.params.id, req.user.id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      });
    }

    if (recording.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Only failed recordings can be retried'
      });
    }

    // Check if audio files still exist
    if (!recording.audioFiles || recording.audioFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No audio files available for retry'
      });
    }

    try {
      // Update status to processing
      await databaseService.updateRecording(req.params.id, {
        status: 'processing',
        retryCount: (recording.retryCount || 0) + 1,
        lastRetryAt: new Date()
      });

      // Process the audio files again
      let transcriptionResult;
      
      if (recording.audioFiles.length === 1) {
        // Single audio file
        transcriptionResult = await audioService.transcribeAudio(recording.audioFiles[0].path);
      } else {
        // Multiple audio files (segmented)
        const inputFiles = recording.audioFiles.filter(f => f.type === 'input').map(f => f.path);
        const outputFiles = recording.audioFiles.filter(f => f.type === 'output').map(f => f.path);
        
        if (outputFiles.length > 0) {
          transcriptionResult = await audioService.transcribeDualAudio(inputFiles[0], outputFiles[0]);
        } else {
          transcriptionResult = await audioService.transcribeAudio(inputFiles[0]);
        }
      }

      if (!transcriptionResult.success) {
        // Update status back to failed
        await databaseService.updateRecording(req.params.id, {
          status: 'failed',
          error: transcriptionResult.error
        });

        return res.status(400).json({
          success: false,
          error: `Retry failed: ${transcriptionResult.error}`
        });
      }

      // Create transcript from the retry
      const transcript = transcriptionResult.segments.map((segment, index) => {
        const startTime = typeof segment.start === 'number' ? segment.start.toFixed(1) : '0.0';
        const timeLabel = `[${startTime}s]`;
        const text = segment.text || '';
        const sourceLabel = segment.source === 'input' ? 'MIC' : 'SYS';
        return `${sourceLabel} ${timeLabel}: ${text}`;
      }).join('\n');

      // Save transcript
      const savedTranscript = await databaseService.saveTranscript({
        userId: req.user.id,
        title: recording.title || 'Retry Recording Transcript',
        content: transcript,
        segments: transcriptionResult.segments,
        metadata: {
          duration: transcriptionResult.duration || transcriptionResult.totalDuration,
          segmentCount: transcriptionResult.segments.length,
          hasInputAudio: true,
          hasOutputAudio: recording.audioFiles.some(f => f.type === 'output'),
          sources: recording.audioFiles.map(f => f.type),
          language: transcriptionResult.language || 'en',
          originalFilename: recording.audioFiles.map(f => f.originalName).join(', '),
          fileSize: recording.audioFiles.reduce((sum, f) => sum + f.size, 0),
          isRetry: true,
          originalRecordingId: recording.id
        }
      });

      // Update recording status to completed and link transcript
      await databaseService.updateRecording(req.params.id, {
        status: 'completed',
        transcriptId: savedTranscript.id,
        completedAt: new Date(),
        error: null
      });

      logger.info('✅ Recording retry successful', {
        userId: req.user.id,
        recordingId: recording.id,
        transcriptId: savedTranscript.id,
        retryCount: (recording.retryCount || 0) + 1
      });

      res.json({
        success: true,
        message: 'Recording retry successful',
        transcript: savedTranscript
      });

    } catch (error) {
      logger.error('❌ Recording retry failed:', error);
      
      // Update status back to failed
      await databaseService.updateRecording(req.params.id, {
        status: 'failed',
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: `Retry failed: ${error.message}`
      });
    }
  })
);

/**
 * DELETE /api/recordings/:id/audio
 * Delete only the audio files from a recording (keep transcript if exists)
 */
router.delete('/:id/audio',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const recording = await databaseService.getRecording(req.params.id, req.user.id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      });
    }

    if (!recording.audioFiles || recording.audioFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No audio files to delete'
      });
    }

    try {
      // Delete audio files from storage
      for (const audioFile of recording.audioFiles) {
        await audioService.deleteAudioFile(audioFile.path);
      }

      // Update recording to remove audio files
      await databaseService.updateRecording(req.params.id, {
        audioFiles: [],
        audioDeletedAt: new Date()
      });

      logger.info('🗑️ Audio files deleted from recording', {
        userId: req.user.id,
        recordingId: recording.id,
        deletedFiles: recording.audioFiles.length
      });

      res.json({
        success: true,
        message: 'Audio files deleted successfully'
      });

    } catch (error) {
      logger.error('❌ Failed to delete audio files:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete audio files'
      });
    }
  })
);

/**
 * DELETE /api/recordings/:id
 * Delete entire recording (including transcript)
 */
router.delete('/:id',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    const recording = await databaseService.getRecording(req.params.id, req.user.id);
    
    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found'
      });
    }

    try {
      // Delete audio files from storage
      if (recording.audioFiles && recording.audioFiles.length > 0) {
        for (const audioFile of recording.audioFiles) {
          await audioService.deleteAudioFile(audioFile.path);
        }
      }

      // Delete transcript if exists
      if (recording.transcriptId) {
        await databaseService.deleteTranscript(recording.transcriptId, req.user.id);
      }

      // Delete recording record
      await databaseService.deleteRecording(req.params.id);

      logger.info('🗑️ Recording deleted completely', {
        userId: req.user.id,
        recordingId: recording.id,
        transcriptId: recording.transcriptId,
        deletedFiles: recording.audioFiles?.length || 0
      });

      res.json({
        success: true,
        message: 'Recording deleted successfully'
      });

    } catch (error) {
      logger.error('❌ Failed to delete recording:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete recording'
      });
    }
  })
);

module.exports = router; 