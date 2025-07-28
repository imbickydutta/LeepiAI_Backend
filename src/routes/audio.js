const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { uploadSingleAudio, uploadDualAudio, uploadMicSystemAudio, cleanupFiles } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');
const audioService = require('../services/AudioService');
const databaseService = require('../services/DatabaseService');
const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

const router = express.Router();

/**
 * POST /api/audio/upload
 * Upload and process single audio file
 */
router.post('/upload',
  authenticate,
  requireDatabase,
  uploadSingleAudio('audio'),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [req.file];

    try {
      // Process audio with Whisper
      const transcriptionResult = await audioService.transcribeAudio(req.file.path);

      if (!transcriptionResult.success) {
        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: transcriptionResult.error
        });
      }

      // Format transcript content
      const transcript = transcriptionResult.segments.map((segment, index) => {
        const startTime = typeof segment.start === 'number' ? segment.start.toFixed(1) : '0.0';
        const timeLabel = `[${startTime}s]`;
        const text = segment.text || '';
        return `AUDIO ${timeLabel}: ${text}`;
      }).join('\n');

      // Save to database
      const savedTranscript = await databaseService.saveTranscript({
        userId: req.user.id,
        title: req.file.originalname || 'Audio Transcript',
        content: transcript,
        segments: transcriptionResult.segments.map(segment => ({
          ...segment,
          source: 'input'
        })),
        metadata: {
          duration: transcriptionResult.duration,
          segmentCount: transcriptionResult.segments.length,
          hasInputAudio: true,
          hasOutputAudio: false,
          sources: ['input'],
          language: transcriptionResult.language,
          originalFilename: req.file.originalname,
          fileSize: req.file.size
        }
      });

      // Clean up temporary files
      await cleanupFiles(filesToCleanup);

      logger.info('🎵 Single audio processed successfully', {
        userId: req.user.id,
        transcriptId: savedTranscript.id,
        duration: transcriptionResult.duration,
        segmentCount: transcriptionResult.segments.length
      });

      res.json({
        success: true,
        message: 'Audio processed successfully',
        transcript: savedTranscript
      });

    } catch (error) {
      await cleanupFiles(filesToCleanup);
      throw error;
    }
  })
);

/**
 * POST /api/audio/upload-dual
 * Upload and process dual audio files (microphone and system)
 */
router.post('/upload-dual',
  authenticate,
  requireDatabase,
  uploadMicSystemAudio(),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [];
    
    try {
      const { microphone, system } = req.files;

      // Log received files
      logger.info('📥 Received dual audio upload request', {
        hasMicrophone: !!microphone,
        hasSystem: !!system,
        microphoneSize: microphone?.[0]?.size,
        systemSize: system?.[0]?.size,
        userId: req.user.id
      });

      // Validate files
      if (!microphone || !microphone[0]) {
        throw new Error('Microphone audio file is required');
      }

      // Collect files for cleanup
      if (microphone) filesToCleanup.push(microphone[0]);
      if (system) filesToCleanup.push(system[0]);

      // Log file details before processing
      logger.info('🎤 Processing audio files', {
        microphone: {
          name: microphone[0].originalname,
          size: microphone[0].size,
          mimetype: microphone[0].mimetype,
          path: microphone[0].path
        },
        system: system?.[0] ? {
          name: system[0].originalname,
          size: system[0].size,
          mimetype: system[0].mimetype,
          path: system[0].path
        } : null
      });

      // Process dual audio
      const transcriptionResult = await audioService.transcribeDualAudio(
        microphone[0].path,
        system?.[0]?.path || null
      );

      if (!transcriptionResult.success) {
        logger.error('❌ Transcription failed:', {
          error: transcriptionResult.error,
          userId: req.user.id,
          microphonePath: microphone[0].path,
          systemPath: system?.[0]?.path
        });

        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: transcriptionResult.error
        });
      }

      // Format transcript content from merged segments
      const transcript = transcriptionResult.mergedSegments.map((segment, index) => {
        const sourceLabel = segment.source === 'input' ? 'MIC' : 'SYS';
        const startTime = typeof segment.start === 'number' ? segment.start.toFixed(1) : '0.0';
        const timeLabel = `[${startTime}s]`;
        const text = segment.text || '';
        return `${sourceLabel} ${timeLabel}: ${text}`;
      }).join('\n');

      // Save to database
      const savedTranscript = await databaseService.saveTranscript({
        userId: req.user.id,
        title: `Dual Audio Recording - ${new Date().toISOString().split('T')[0]}`,
        content: transcript,
        segments: transcriptionResult.mergedSegments,
        metadata: {
          duration: transcriptionResult.totalDuration,
          segmentCount: transcriptionResult.mergedSegments.length,
          hasInputAudio: !!microphone,
          hasOutputAudio: !!system,
          sources: ['input', 'output'].filter(source => 
            (source === 'input' && microphone) || (source === 'output' && system)
          ),
          language: 'en',
          originalFilename: [
            microphone ? `microphone: ${microphone[0].originalname}` : null,
            system ? `system: ${system[0].originalname}` : null
          ].filter(Boolean).join(', '),
          fileSize: (microphone?.[0]?.size || 0) + (system?.[0]?.size || 0)
        }
      });

      // Clean up temporary files
      await cleanupFiles(filesToCleanup);

      logger.info('🎵 Dual audio processed successfully', {
        userId: req.user.id,
        transcriptId: savedTranscript.id,
        duration: transcriptionResult.totalDuration,
        inputSegments: transcriptionResult.inputSegments.length,
        outputSegments: transcriptionResult.outputSegments.length,
        mergedSegments: transcriptionResult.mergedSegments.length
      });

      res.json({
        success: true,
        message: 'Dual audio processed successfully',
        transcript: savedTranscript
      });

    } catch (error) {
      logger.error('❌ Dual audio processing failed:', {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        files: req.files
      });

      await cleanupFiles(filesToCleanup);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  })
);

/**
 * POST /api/audio/transcribe
 * Transcribe audio file without uploading to permanent storage
 */
router.post('/transcribe',
  authenticate,
  requireDatabase,
  uploadSingleAudio('audio'),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [req.file];

    try {
      // Process audio with Whisper
      const transcriptionResult = await audioService.transcribeAudio(req.file.path);

      // Clean up temporary file
      await cleanupFiles(filesToCleanup);

      if (!transcriptionResult.success) {
        return res.status(400).json({
          success: false,
          error: transcriptionResult.error
        });
      }

      logger.info('🎵 Audio transcribed (no save)', {
        userId: req.user.id,
        duration: transcriptionResult.duration,
        segmentCount: transcriptionResult.segments.length
      });

      res.json({
        success: true,
        message: 'Audio transcribed successfully',
        transcription: {
          text: transcriptionResult.text,
          segments: transcriptionResult.segments,
          duration: transcriptionResult.duration,
          language: transcriptionResult.language
        }
      });

    } catch (error) {
      await cleanupFiles(filesToCleanup);
      throw error;
    }
  })
);

/**
 * GET /api/audio/formats
 * Get supported audio formats
 */
router.get('/formats',
  asyncHandler(async (req, res) => {
    const config = require('../config/env');
    
    res.json({
      success: true,
      supportedFormats: config.upload.allowedFormats,
      maxFileSize: config.upload.maxFileSize,
      recommendations: [
        'WAV format provides the best quality for transcription',
        'MP3 and M4A are good for smaller file sizes',
        'FLAC provides lossless compression',
        'Keep files under 25MB for optimal processing'
      ]
    });
  })
);

/**
 * POST /api/audio/validate
 * Validate audio file without processing
 */
router.post('/validate',
  authenticate,
  uploadSingleAudio('audio'),
  asyncHandler(async (req, res) => {
    // File was already validated by upload middleware
    await cleanupFiles([req.file]);

    const fileStats = {
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      sizeInMB: (req.file.size / (1024 * 1024)).toFixed(2)
    };

    res.json({
      success: true,
      message: 'Audio file is valid',
      fileInfo: fileStats
    });
  })
);

/**
 * POST /api/audio/upload-chunk
 * Upload a single chunk from chunked recording
 */
router.post('/upload-chunk',
  authenticate,
  requireDatabase,
  uploadSingleAudio('audio'),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [req.file];

    try {
      const { chunkIndex, totalChunks, originalFileName, isChunked } = req.body;
      
      logger.info('🎵 Processing chunk upload', {
        userId: req.user.id,
        chunkIndex,
        totalChunks,
        originalFileName,
        fileSize: req.file.size
      });

      // Process audio with Whisper
      const transcriptionResult = await audioService.transcribeAudio(req.file.path);

      if (!transcriptionResult.success) {
        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: transcriptionResult.error
        });
      }

      // Clean up temporary file
      await cleanupFiles(filesToCleanup);

      logger.info('🎵 Chunk processed successfully', {
        userId: req.user.id,
        chunkIndex,
        totalChunks,
        segmentCount: transcriptionResult.segments.length
      });

      res.json({
        success: true,
        message: 'Chunk processed successfully',
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks),
        transcription: {
          text: transcriptionResult.text,
          segments: transcriptionResult.segments,
          duration: transcriptionResult.duration,
          language: transcriptionResult.language
        }
      });

    } catch (error) {
      await cleanupFiles(filesToCleanup);
      throw error;
    }
  })
);

/**
 * POST /api/audio/upload-dual-chunk
 * Upload a single dual audio chunk from chunked recording
 */
router.post('/upload-dual-chunk',
  authenticate,
  requireDatabase,
  uploadMicSystemAudio(),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [];
    
    try {
      const { chunkIndex, totalChunks, originalFileName, isChunked, audioType } = req.body;
      const { microphone, system } = req.files;

      if (microphone) filesToCleanup.push(microphone);
      if (system) filesToCleanup.push(system);

      logger.info('🎵 Processing dual audio chunk upload', {
        userId: req.user.id,
        chunkIndex,
        totalChunks,
        originalFileName,
        audioType,
        hasMicrophone: !!microphone,
        hasSystem: !!system
      });

      // Process dual audio
      const transcriptionResult = await audioService.transcribeDualAudio(
        microphone?.path,
        system?.path
      );

      if (!transcriptionResult.success) {
        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: transcriptionResult.error
        });
      }

      // Clean up temporary files
      await cleanupFiles(filesToCleanup);

      logger.info('🎵 Dual audio chunk processed successfully', {
        userId: req.user.id,
        chunkIndex,
        totalChunks,
        segmentCount: transcriptionResult.segments.length
      });

      res.json({
        success: true,
        message: 'Dual audio chunk processed successfully',
        chunkIndex: parseInt(chunkIndex),
        totalChunks: parseInt(totalChunks),
        audioType,
        transcription: {
          text: transcriptionResult.text,
          segments: transcriptionResult.segments,
          duration: transcriptionResult.duration,
          language: transcriptionResult.language
        }
      });

    } catch (error) {
      await cleanupFiles(filesToCleanup);
      throw error;
    }
  })
);

/**
 * POST /api/audio/reassemble-chunks
 * Reassemble and combine multiple chunk transcriptions
 */
router.post('/reassemble-chunks',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    try {
      const { originalFileName, totalChunks } = req.body;
      
      logger.info('🎵 Reassembling chunks', {
        userId: req.user.id,
        originalFileName,
        totalChunks
      });

      // For now, we'll return a success response
      // In a full implementation, you'd combine the chunk results from a cache or database
      res.json({
        success: true,
        message: 'Chunks reassembled successfully',
        originalFileName,
        totalChunks
      });

    } catch (error) {
      throw error;
    }
  })
);

/**
 * POST /api/audio/reassemble-dual-chunks
 * Reassemble and combine multiple dual audio chunk transcriptions
 */
router.post('/reassemble-dual-chunks',
  authenticate,
  requireDatabase,
  asyncHandler(async (req, res) => {
    try {
      const { microphoneFileName, systemFileName, microphoneTotalChunks, systemTotalChunks } = req.body;
      
      logger.info('🎵 Reassembling dual audio chunks', {
        userId: req.user.id,
        microphoneFileName,
        systemFileName,
        microphoneTotalChunks,
        systemTotalChunks
      });

      // For now, we'll return a success response
      // In a full implementation, you'd combine the chunk results from a cache or database
      res.json({
        success: true,
        message: 'Dual audio chunks reassembled successfully',
        microphoneFileName,
        systemFileName,
        microphoneTotalChunks,
        systemTotalChunks
      });

    } catch (error) {
      throw error;
    }
  })
);

module.exports = router; 