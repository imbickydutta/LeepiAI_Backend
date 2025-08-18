const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { uploadSingleAudio, uploadDualAudio, uploadMicSystemAudio, uploadSegmentedDualAudio, cleanupFiles } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');
const audioService = require('../services/AudioService');
const databaseService = require('../services/DatabaseService');
const logger = require('../utils/logger');

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
        // Save failed recording for retry
        try {
          await databaseService.saveRecording({
            userId: req.user.id,
            title: req.file.originalname || 'Failed Audio Recording',
            status: 'failed',
            audioFiles: [{
              path: req.file.path,
              originalName: req.file.originalname,
              filename: req.file.filename,
              size: req.file.size,
              mimetype: req.file.mimetype,
              type: 'input'
            }],
            metadata: {
              recordingType: 'single',
              hasInputAudio: true,
              hasOutputAudio: false,
              sources: ['input'],
              language: 'en',
              originalFilename: req.file.originalname,
              fileSize: req.file.size
            },
            error: transcriptionResult.error
          });
          
          logger.info('💾 Failed recording saved for retry', {
            userId: req.user.id,
            originalFilename: req.file.originalname,
            error: transcriptionResult.error
          });
        } catch (saveError) {
          logger.error('❌ Failed to save failed recording:', saveError);
        }

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

      // Save successful recording
      try {
        await databaseService.saveRecording({
          userId: req.user.id,
          title: req.file.originalname || 'Audio Recording',
          status: 'completed',
          audioFiles: [{
            path: req.file.path,
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            type: 'input'
          }],
          transcriptId: savedTranscript.id,
          metadata: {
            duration: transcriptionResult.duration,
            segmentCount: transcriptionResult.segments.length,
            recordingType: 'single',
            hasInputAudio: true,
            hasOutputAudio: false,
            sources: ['input'],
            language: transcriptionResult.language || 'en',
            originalFilename: req.file.originalname,
            fileSize: req.file.size
          }
        });
      } catch (saveError) {
        logger.error('❌ Failed to save successful recording:', saveError);
      }

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
      // Save failed recording for retry
      try {
        await databaseService.saveRecording({
          userId: req.user.id,
          title: req.file.originalname || 'Failed Audio Recording',
          status: 'failed',
          audioFiles: [{
            path: req.file.path,
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            type: 'input'
          }],
          metadata: {
            recordingType: 'single',
            hasInputAudio: true,
            hasOutputAudio: false,
            sources: ['input'],
            language: 'en',
            originalFilename: req.file.originalname,
            fileSize: req.file.size
          },
          error: error.message
        });
        
        logger.info('💾 Failed recording saved for retry', {
          userId: req.user.id,
          originalFilename: req.file.originalname,
          error: error.message
        });
      } catch (saveError) {
        logger.error('❌ Failed to save failed recording:', saveError);
      }

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
 * POST /api/audio/upload-segmented-dual
 * Upload and process segmented dual audio files (multiple 1-minute segments)
 */
router.post('/upload-segmented-dual',
  authenticate,
  requireDatabase,
  uploadSegmentedDualAudio(),
  asyncHandler(async (req, res) => {
    const filesToCleanup = [];
    
    try {
      const { microphone, system } = req.files;

      // Log received files
      logger.info('📥 Received segmented dual audio upload request', {
        hasMicrophone: !!microphone,
        hasSystem: !!system,
        microphoneSegments: microphone?.length || 0,
        systemSegments: system?.length || 0,
        userId: req.user.id
      });

      // Validate files
      if (!microphone || microphone.length === 0) {
        throw new Error('Microphone audio files are required');
      }

      // Collect files for cleanup
      if (microphone) filesToCleanup.push(...microphone);
      if (system) filesToCleanup.push(...system);

      // Generate session ID for this recording session
      const sessionId = `session_${Date.now()}_${req.user.id}`;
      
      // Create parent session for this segmented recording
      const parentSession = await databaseService.createParentSession({
        userId: req.user.id,
        sessionId: sessionId,
        title: `Segmented Dual Audio Recording - ${new Date().toISOString().split('T')[0]}`,
        metadata: {
          totalSegments: microphone.length,
          recordingType: 'segmented',
          hasInputAudio: true,
          hasOutputAudio: !!system && system.length > 0,
          sources: ['input', 'output'].filter(source => 
            (source === 'input' && microphone) || (source === 'output' && system)
          ),
          language: 'en',
          originalFilename: `segmented-recording-${microphone.length}-segments`,
          fileSize: 0, // Will be calculated as chunks are added
          totalFileSize: 0,
          sessionStartTime: new Date()
        }
      });

      // Process each segment pair
      const allSegments = [];
      let totalDuration = 0;
      let currentTimeOffset = 0;
      let successfulChunks = 0;
      let failedChunks = 0;

      for (let i = 0; i < microphone.length; i++) {
        const micFile = microphone[i];
        const sysFile = system?.[i] || null;

        logger.info(`🎤 Processing segment ${i + 1}/${microphone.length}`, {
          microphone: {
            name: micFile.originalname,
            size: micFile.size,
            path: micFile.path
          },
          system: sysFile ? {
            name: sysFile.originalname,
            size: sysFile.size,
            path: sysFile.path
          } : null,
          sessionId: sessionId,
          segmentIndex: i
        });

        try {
          // Process dual audio for this segment
          const transcriptionResult = await audioService.transcribeDualAudio(
            micFile.path,
            sysFile?.path || null
          );

          if (!transcriptionResult.success) {
            logger.error(`❌ Transcription failed for segment ${i + 1}:`, {
              error: transcriptionResult.error,
              userId: req.user.id,
              microphonePath: micFile.path,
              systemPath: sysFile?.path,
              sessionId: sessionId,
              segmentIndex: i
            });

            // Save failed chunk for retry
            await databaseService.addChunkToSession(parentSession.id, {
              userId: req.user.id,
              sessionId: sessionId,
              title: `Segment ${i + 1} - Failed`,
              status: 'failed',
              audioFiles: [
                {
                  path: micFile.path,
                  originalName: micFile.originalname,
                  filename: micFile.filename,
                  size: micFile.size,
                  mimetype: micFile.mimetype,
                  type: 'input',
                  segmentIndex: i
                },
                ...(sysFile ? [{
                  path: sysFile.path,
                  originalName: sysFile.originalname,
                  filename: sysFile.filename,
                  size: sysFile.size,
                  mimetype: sysFile.mimetype,
                  type: 'output',
                  segmentIndex: i
                }] : [])
              ],
              metadata: {
                segmentIndex: i,
                recordingType: 'segmented',
                hasInputAudio: true,
                hasOutputAudio: !!sysFile,
                sources: ['input', 'output'].filter(source => 
                  (source === 'input') || (source === 'output' && sysFile)
                ),
                language: 'en',
                originalFilename: `segment-${i + 1}`,
                fileSize: micFile.size + (sysFile?.size || 0)
              },
              error: transcriptionResult.error
            });

            failedChunks++;
            continue; // Skip to next segment
          }

          // Save successful chunk
          await databaseService.addChunkToSession(parentSession.id, {
            userId: req.user.id,
            sessionId: sessionId,
            title: `Segment ${i + 1} - Success`,
            status: 'completed',
            audioFiles: [
              {
                path: micFile.path,
                originalName: micFile.originalname,
                filename: micFile.filename,
                size: micFile.size,
                mimetype: micFile.mimetype,
                type: 'input',
                segmentIndex: i
              },
              ...(sysFile ? [{
                path: sysFile.path,
                originalName: sysFile.originalname,
                filename: sysFile.filename,
                size: sysFile.size,
                mimetype: sysFile.mimetype,
                type: 'output',
                segmentIndex: i
              }] : [])
            ],
            metadata: {
              segmentIndex: i,
              recordingType: 'segmented',
              duration: transcriptionResult.totalDuration,
              hasInputAudio: true,
              hasOutputAudio: !!sysFile,
              sources: ['input', 'output'].filter(source => 
                (source === 'input') || (source === 'output' && sysFile)
              ),
              language: transcriptionResult.language || 'en',
              originalFilename: `segment-${i + 1}`,
              fileSize: micFile.size + (sysFile?.size || 0)
            }
          });

          // Adjust timestamps for this segment
          const adjustedSegments = transcriptionResult.mergedSegments.map(segment => ({
            ...segment,
            start: segment.start + currentTimeOffset,
            end: segment.end + currentTimeOffset
          }));

          allSegments.push(...adjustedSegments);
          totalDuration += transcriptionResult.totalDuration;
          currentTimeOffset += transcriptionResult.totalDuration;
          successfulChunks++;

          logger.info(`✅ Segment ${i + 1} processed successfully`, {
            segmentDuration: transcriptionResult.totalDuration,
            segmentSegments: transcriptionResult.mergedSegments.length,
            currentTimeOffset,
            sessionId: sessionId,
            segmentIndex: i
          });

        } catch (segmentError) {
          logger.error(`❌ Unexpected error processing segment ${i + 1}:`, {
            error: segmentError.message,
            userId: req.user.id,
            sessionId: sessionId,
            segmentIndex: i
          });

          // Save failed chunk for retry
          await databaseService.addChunkToSession(parentSession.id, {
            userId: req.user.id,
            sessionId: sessionId,
            title: `Segment ${i + 1} - Error`,
            status: 'failed',
            audioFiles: [
              {
                path: micFile.path,
                originalName: micFile.originalname,
                filename: micFile.filename,
                size: micFile.size,
                mimetype: micFile.mimetype,
                type: 'input',
                segmentIndex: i
              },
              ...(sysFile ? [{
                path: sysFile.path,
                originalName: sysFile.originalname,
                filename: sysFile.filename,
                size: sysFile.size,
                mimetype: sysFile.mimetype,
                type: 'output',
                segmentIndex: i
              }] : [])
            ],
            metadata: {
              segmentIndex: i,
              recordingType: 'segmented',
              hasInputAudio: true,
              hasOutputAudio: !!sysFile,
              sources: ['input', 'output'].filter(source => 
                (source === 'input') || (source === 'output' && sysFile)
              ),
              language: 'en',
              originalFilename: `segment-${i + 1}`,
              fileSize: micFile.size + (sysFile?.size || 0)
            },
            error: segmentError.message
          });

          failedChunks++;
        }
      }

      // Filter out segments with empty text to prevent validation errors
      const validSegments = allSegments.filter(segment => 
        segment.text && segment.text.trim().length > 0
      );

      if (validSegments.length === 0) {
        // Update parent session status to failed
        await databaseService.updateRecording(parentSession.id, {
          status: 'failed',
          error: 'No valid segments were processed'
        });

        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: 'No valid segments were processed'
        });
      }

      // Create transcript from all segments
      const transcript = validSegments.map((segment, index) => {
        const sourceLabel = segment.source === 'input' ? 'MIC' : 'SYS';
        const startTime = typeof segment.start === 'number' ? segment.start.toFixed(1) : '0.0';
        const timeLabel = `[${startTime}s]`;
        const text = segment.text || '';
        return `${sourceLabel} ${timeLabel}: ${text}`;
      }).join('\n');

      // Save transcript
      const savedTranscript = await databaseService.saveTranscript({
        userId: req.user.id,
        title: `Segmented Dual Audio Recording - ${new Date().toISOString().split('T')[0]}`,
        content: transcript,
        segments: validSegments,
        metadata: {
          duration: totalDuration,
          segmentCount: validSegments.length,
          totalSegments: microphone.length,
          hasInputAudio: true,
          hasOutputAudio: !!system && system.length > 0,
          sources: ['input', 'output'].filter(source => 
            (source === 'input' && microphone) || (source === 'output' && system)
          ),
          language: 'en',
          originalFilename: `segmented-recording-${microphone.length}-segments`,
          fileSize: microphone.reduce((sum, file) => sum + file.size, 0) + 
                   (system ? system.reduce((sum, file) => sum + file.size, 0) : 0),
          isSegmented: true,
          sessionId: sessionId
        }
      });

      // Update parent session with transcript and final status
      const finalStatus = failedChunks === 0 ? 'completed' : 'completed_with_errors';
      await databaseService.updateRecording(parentSession.id, {
        status: finalStatus,
        transcriptId: savedTranscript.id,
        completedAt: new Date(),
        metadata: {
          ...parentSession.metadata,
          sessionEndTime: new Date(),
          totalDuration: totalDuration,
          successfulChunks: successfulChunks,
          failedChunks: failedChunks
        }
      });

      // Clean up temporary files
      await cleanupFiles(filesToCleanup);

      logger.info('🎵 Segmented dual audio processed successfully', {
        userId: req.user.id,
        sessionId: sessionId,
        transcriptId: savedTranscript.id,
        totalDuration: totalDuration,
        totalSegments: microphone.length,
        successfulChunks: successfulChunks,
        failedChunks: failedChunks,
        validSegments: validSegments.length
      });

      res.json({
        success: true,
        message: 'Segmented dual audio processed successfully',
        transcript: savedTranscript,
        session: {
          id: parentSession.id,
          sessionId: sessionId,
          status: finalStatus,
          totalSegments: microphone.length,
          successfulChunks: successfulChunks,
          failedChunks: failedChunks,
          totalDuration: totalDuration
        }
      });

    } catch (error) {
      logger.error('❌ Segmented dual audio processing failed:', {
        error: error.message,
        userId: req.user.id,
        stack: error.stack
      });

      // Clean up temporary files
      await cleanupFiles(filesToCleanup);
      
      throw error;
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

module.exports = router; 