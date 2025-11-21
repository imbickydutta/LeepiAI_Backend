const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireDatabase } = require('../middleware/databaseCheck');
const { uploadSingleAudio, uploadMicSystemAudio, uploadSegmentedDualAudio, cleanupFiles } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');
const audioService = require('../services/AudioService');
const databaseService = require('../services/DatabaseService');
const ActivityLogService = require('../services/ActivityLogService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Utility function to validate and fix segment timestamps
 * @param {Array} segments - Array of transcript segments
 * @returns {Array} - Segments with valid timestamps
 */
function validateAndFixSegmentTimestamps(segments) {
  // Filter out segments with empty text
  let validSegments = segments.filter(segment => 
    segment.text && segment.text.trim().length > 0
  );

  // Ensure all segments have valid start/end timestamps
  let currentTime = 0;
  validSegments = validSegments.map((segment) => {
    const hasValidStart = Number.isFinite(segment.start);
    const hasValidEnd = Number.isFinite(segment.end);
    const needsEstimation = !hasValidStart || !hasValidEnd || (hasValidStart && hasValidEnd && segment.end <= segment.start);
    
    if (needsEstimation) {
      const estimatedDuration = segment.text ? Math.max(2, segment.text.length * 0.05) : 2;
      const startTime = currentTime;
      const endTime = startTime + estimatedDuration;
      currentTime = endTime + 0.5;
      return { ...segment, start: startTime, end: endTime };
    }
    
    // Ensure proper sequencing even for valid timestamps
    if (segment.start < currentTime) {
      const duration = Math.max(0.5, segment.end - segment.start);
      segment.start = currentTime;
      segment.end = segment.start + duration;
    }
    currentTime = segment.end + 0.5;
    return segment;
  });

  return validSegments;
}

/**
 * Utility function to create audio file metadata
 * @param {Object} file - Multer file object
 * @param {string} type - Audio type ('input' or 'output')
 * @param {number} segmentIndex - Optional segment index
 * @returns {Object} - Formatted audio file metadata
 */
function createAudioFileMetadata(file, type, segmentIndex = null) {
  const metadata = {
    path: file.path,
    originalName: file.originalname,
    filename: file.filename,
    size: file.size,
    mimetype: file.mimetype,
    type: type
  };
  
  if (segmentIndex !== null) {
    metadata.segmentIndex = segmentIndex;
  }
  
  return metadata;
}

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
            audioFiles: [createAudioFileMetadata(req.file, 'input')],
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

      // Validate and fix segment timestamps
      const validSegments = validateAndFixSegmentTimestamps(transcriptionResult.segments);

      // Log segment validation results
      logger.info('🔍 Single audio segment validation results:', {
        totalSegments: transcriptionResult.segments.length,
        validSegments: validSegments.length,
        invalidSegments: transcriptionResult.segments.length - validSegments.length,
        sampleInvalidSegments: transcriptionResult.segments
          .filter(segment => !segment.text || !segment.text.trim() || typeof segment.start !== 'number' || typeof segment.end !== 'number')
          .slice(0, 3)
          .map(s => ({
            hasText: !!s.text,
            textLength: s.text?.length || 0,
            hasStart: typeof s.start === 'number',
            hasEnd: typeof s.end === 'number',
            start: s.start,
            end: s.end
          }))
      });

      // Final validation: ensure all segments have required fields
      const finalValidation = validSegments.every(segment => 
        segment.text && 
        segment.text.trim().length > 0 && 
        typeof segment.start === 'number' && 
        typeof segment.end === 'number' &&
        segment.start >= 0 &&
        segment.end > segment.start
      );

      if (!finalValidation) {
        logger.error('❌ Final segment validation failed - segments still missing required fields');
        throw new Error('Segment validation failed - segments missing required start/end timestamps');
      }

      // Save to database
      const savedTranscript = await databaseService.saveTranscript({
        userId: req.user.id,
        title: req.file.originalname || 'Audio Transcript',
        content: transcript,
        segments: validSegments.map(segment => ({
          ...segment,
          source: 'input'
        })),
        metadata: {
          duration: transcriptionResult.duration,
          segmentCount: validSegments.length,
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
          audioFiles: [createAudioFileMetadata(req.file, 'input')],
          transcriptId: savedTranscript.id,
          metadata: {
            duration: transcriptionResult.duration,
            segmentCount: validSegments.length,
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
        segmentCount: validSegments.length
      });

      // Log transcript generation activity
      await ActivityLogService.logTranscriptGeneration({
        user: req.user,
        transcriptId: savedTranscript.id,
        duration: transcriptionResult.duration || 0,
        success: true,
        metadata: {
          transcriptLength: transcript.length,
          segmentCount: validSegments.length,
          audioFile: req.file.originalname
        },
        req
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
          audioFiles: [createAudioFileMetadata(req.file, 'input')],
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

// (Removed duplicate legacy '/upload-segmented-dual' route. The modern implementation below handles
// dual-channel merging with MIC/SYS tags, timestamp alignment, and parent session updates.)

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

      // Validate and fix segment timestamps
      const validSegments = validateAndFixSegmentTimestamps(transcriptionResult.mergedSegments);

      // Log segment validation results
      logger.info('🔍 Dual audio segment validation results:', {
        totalSegments: transcriptionResult.mergedSegments.length,
        validSegments: validSegments.length,
        invalidSegments: transcriptionResult.mergedSegments.length - validSegments.length,
        sampleInvalidSegments: transcriptionResult.mergedSegments
          .filter(segment => !segment.text || !segment.text.trim() || typeof segment.start !== 'number' || typeof segment.end !== 'number')
          .slice(0, 3)
          .map(s => ({
            hasText: !!s.text,
            textLength: s.text?.length || 0,
            hasStart: typeof s.start === 'number',
            hasEnd: typeof s.end === 'number',
            start: s.start,
            end: s.end
          }))
      });

      // Final validation: ensure all segments have required fields
      const finalValidation = validSegments.every(segment => 
        segment.text && 
        segment.text.trim().length > 0 && 
        typeof segment.start === 'number' && 
        typeof segment.end === 'number' &&
        segment.start >= 0 &&
        segment.end > segment.start
      );

      if (!finalValidation) {
        logger.error('❌ Final segment validation failed - segments still missing required fields');
        throw new Error('Segment validation failed - segments missing required start/end timestamps');
      }

      // Format transcript content from merged segments
      const transcript = validSegments.map((segment, index) => {
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
        segments: validSegments,
        metadata: {
          duration: transcriptionResult.totalDuration,
          segmentCount: validSegments.length,
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

      // Log transcript generation activity
      await ActivityLogService.logTranscriptGeneration({
        user: req.user,
        transcriptId: savedTranscript.id,
        duration: transcriptionResult.totalDuration || 0,
        success: true,
        metadata: {
          transcriptLength: transcript.length,
          segmentCount: transcriptionResult.mergedSegments.length,
          audioFile: 'Dual Audio Recording',
          inputSegments: transcriptionResult.inputSegments.length,
          outputSegments: transcriptionResult.outputSegments.length
        },
        req
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
          // Debug: Log what files are being processed
          logger.info(`🔍 Processing segment ${i + 1} files:`, {
            microphoneFile: {
              name: micFile.originalname,
              size: micFile.size,
              path: micFile.path
            },
            systemFile: sysFile ? {
              name: sysFile.originalname,
              size: sysFile.size,
              path: sysFile.path
            } : null,
            willCallTranscribeDual: !!sysFile
          });

          // Process audio for this segment (single or dual)
          let transcriptionResult;
          if (sysFile && sysFile.size > 0) {
            // Dual audio processing
            transcriptionResult = await audioService.transcribeDualAudio(
              micFile.path,
              sysFile.path
            );
          } else {
            // Single audio processing (microphone only)
            transcriptionResult = await audioService.transcribeAudio(micFile.path);
            // Convert single audio result to dual audio format for consistency
            if (transcriptionResult.success) {
              transcriptionResult.inputSegments = transcriptionResult.segments.map(seg => ({
                ...seg,
                source: 'input'
              }));
              transcriptionResult.outputSegments = [];
              transcriptionResult.mergedSegments = transcriptionResult.inputSegments;
              transcriptionResult.totalDuration = transcriptionResult.duration;
            }
          }

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
                createAudioFileMetadata(micFile, 'input', i),
                ...(sysFile ? [createAudioFileMetadata(sysFile, 'output', i)] : [])
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
              createAudioFileMetadata(micFile, 'input', i),
              ...(sysFile ? [createAudioFileMetadata(sysFile, 'output', i)] : [])
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

          // Debug: Log segments from transcription result
          logger.info(`🔍 Transcription result for segment ${i + 1}:`, {
            hasMergedSegments: !!transcriptionResult.mergedSegments,
            mergedSegmentsCount: transcriptionResult.mergedSegments?.length || 0,
            sampleMergedSegments: transcriptionResult.mergedSegments?.slice(0, 3).map(s => ({
              text: s.text?.substring(0, 50) + '...',
              source: s.source,
              speaker: s.speaker,
              start: s.start,
              end: s.end
            })) || []
          });

          // Adjust timestamps for this segment
          const adjustedSegments = transcriptionResult.mergedSegments.map(segment => ({
            ...segment,
            start: segment.start + currentTimeOffset,
            end: segment.end + currentTimeOffset
          }));

          // Debug: Log adjusted segments
          logger.info(`🔍 Adjusted segments for segment ${i + 1}:`, {
            adjustedSegmentsCount: adjustedSegments.length,
            sampleAdjustedSegments: adjustedSegments.slice(0, 3).map(s => ({
              text: s.text?.substring(0, 50) + '...',
              source: s.source,
              speaker: s.speaker,
              start: s.start,
              end: s.end
            }))
          });

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
              createAudioFileMetadata(micFile, 'input', i),
              ...(sysFile ? [createAudioFileMetadata(sysFile, 'output', i)] : [])
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

      // Log raw segments before validation
      logger.info('🔍 Raw segments before validation:', {
        totalSegments: allSegments.length,
        validTextSegments: allSegments.filter(segment => 
          segment.text && segment.text.trim().length > 0
        ).length,
        sampleRawSegments: allSegments.slice(0, 3).map(s => ({
          hasText: !!s.text,
          textLength: s.text?.length || 0,
          hasStart: s.hasOwnProperty('start'),
          hasEnd: s.hasOwnProperty('end'),
          start: s.start,
          end: s.end,
          startType: typeof s.start,
          endType: typeof s.end
        }))
      });

      // Validate and fix segment timestamps
      const validSegments = validateAndFixSegmentTimestamps(allSegments);

      // Log segment validation results
      logger.info('🔍 Segment validation results:', {
        totalSegments: allSegments.length,
        validSegments: validSegments.length,
        invalidSegments: allSegments.length - validSegments.length,
        sampleInvalidSegments: allSegments
          .filter(segment => !segment.text || !segment.text.trim() || typeof segment.start !== 'number' || typeof segment.end !== 'number')
          .slice(0, 3)
          .map(s => ({
            hasText: !!s.text,
            textLength: s.text?.length || 0,
            hasStart: typeof s.start === 'number',
            hasEnd: typeof s.end === 'number',
            start: s.start,
            end: s.end
          }))
      });

      // Final validation: ensure all segments have required fields
      const finalValidation = validSegments.every(segment => 
        segment.text && 
        segment.text.trim().length > 0 && 
        typeof segment.start === 'number' && 
        typeof segment.end === 'number' &&
        segment.start >= 0 &&
        segment.end > segment.start
      );

      if (!finalValidation) {
        logger.error('❌ Final segment validation failed - segments still missing required fields');
        throw new Error('Segment validation failed - segments missing required start/end timestamps');
      }

      if (validSegments.length === 0) {
        // Update parent session status to failed
        await databaseService.updateRecording(parentSession.id, {
          status: 'failed',
          error: 'No valid segments were processed - all segments must have start/end timestamps and non-empty text'
        });

        await cleanupFiles(filesToCleanup);
        return res.status(400).json({
          success: false,
          error: 'No valid segments were processed - all segments must have start/end timestamps and non-empty text'
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

      // Debug: Log segments before saving transcript
      logger.info('🔍 Segments being saved to transcript:', {
        totalSegments: validSegments.length,
        sampleSegments: validSegments.slice(0, 3).map(s => ({
          hasText: !!s.text,
          textLength: s.text?.length || 0,
          hasStart: s.hasOwnProperty('start'),
          hasEnd: s.hasOwnProperty('end'),
          start: s.start,
          end: s.end,
          startType: typeof s.start,
          endType: typeof s.end,
          source: s.source,
          speaker: s.speaker
        }))
      });

      // Debug: Check source distribution
      const sourceCounts = validSegments.reduce((acc, segment) => {
        acc[segment.source || 'unknown'] = (acc[segment.source || 'unknown'] || 0) + 1;
        return acc;
      }, {});
      logger.info('🔍 Source distribution in final segments:', sourceCounts);

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

      // Log transcript generation activity
      await ActivityLogService.logTranscriptGeneration({
        user: req.user,
        transcriptId: savedTranscript.id,
        duration: totalDuration || 0,
        success: true,
        metadata: {
          transcriptLength: transcript.length,
          segmentCount: validSegments.length,
          audioFile: 'Segmented Dual Audio Recording',
          totalChunks: microphone.length,
          successfulChunks,
          failedChunks
        },
        req
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