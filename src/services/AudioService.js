const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');
const logger = require('../utils/logger');

class AudioService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.apis.openai
    });
    this.uploadPath = config.upload.path;
    this.maxFileSize = this._parseFileSize(config.upload.maxFileSize);
    this.allowedFormats = config.upload.allowedFormats;
    
    // Ensure upload directory exists
    fs.ensureDirSync(this.uploadPath);
    
    logger.info('🎵 AudioService initialized');
  }

  /**
   * Upload and validate audio file
   * @param {Object} file - Multer file object
   * @returns {Promise<Object>} Upload result
   */
  async uploadAudio(file) {
    try {
      // Validate file
      const validation = this._validateAudioFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const uniqueFilename = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.uploadPath, uniqueFilename);

      // Save file to disk
      await fs.move(file.path, filePath);

      // Get file metadata
      const fileStats = await fs.stat(filePath);
      const metadata = {
        originalName: file.originalname,
        filename: uniqueFilename,
        path: filePath,
        size: fileStats.size,
        mimetype: file.mimetype,
        uploadedAt: new Date()
      };

      logger.info('📁 Audio file uploaded', {
        filename: uniqueFilename,
        size: fileStats.size,
        originalName: file.originalname
      });

      return {
        success: true,
        metadata
      };
    } catch (error) {
      logger.error('❌ Audio upload failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper
   * @param {string} audioFilePath - Path to audio file
   * @param {Object} options - Transcription options
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioFilePath, options = {}) {
    try {
      const {
        language = 'en',
        responseFormat = 'verbose_json',
        timestampGranularities = ['word'],
        temperature = 0
      } = options;

      // Validate file exists and size
      if (!await fs.pathExists(audioFilePath)) {
        throw new Error('Audio file not found');
      }

      const fileStats = await fs.stat(audioFilePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      
      logger.info(`🔄 Starting Whisper transcription for ${fileSizeMB.toFixed(2)}MB file`);

      // Check file size limit (OpenAI has 25MB limit)
      if (fileSizeMB > 24) {
        logger.warn('⚠️ File too large, attempting compression...');
        const compressedPath = await this._compressAudioFile(audioFilePath);
        audioFilePath = compressedPath;
      }

      // Create readable stream
      const audioStream = fs.createReadStream(audioFilePath);

      // Call OpenAI Whisper API
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1',
        language,
        response_format: responseFormat,
        timestamp_granularities: timestampGranularities,
        temperature
      });

      // Process transcription result
      const result = this._processTranscriptionResult(transcription);

      logger.info('✅ Whisper transcription completed', {
        duration: result.duration,
        segmentCount: result.segments.length,
        wordCount: result.text.split(/\s+/).length
      });

      return {
        success: true,
        ...result
      };
    } catch (error) {
      logger.error('❌ Whisper transcription failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transcribe dual audio streams (input and output)
   * @param {string} inputAudioPath - Path to input audio
   * @param {string} outputAudioPath - Path to output audio
   * @returns {Promise<Object>} Dual transcription result
   */
  async transcribeDualAudio(inputAudioPath, outputAudioPath) {
    try {
      logger.info('🔄 Starting dual audio transcription');

      // Transcribe both streams in parallel
      const [inputResult, outputResult] = await Promise.all([
        this.transcribeAudio(inputAudioPath),
        this.transcribeAudio(outputAudioPath)
      ]);

      if (!inputResult.success || !outputResult.success) {
        throw new Error('Failed to transcribe one or both audio streams');
      }

      // Tag segments with source
      const inputSegments = inputResult.segments.map(segment => ({
        ...segment,
        source: 'input'
      }));

      const outputSegments = outputResult.segments.map(segment => ({
        ...segment,
        source: 'output'
      }));

      // Merge segments by timestamp
      const mergedSegments = this._mergeSegmentsByTimestamp(inputSegments, outputSegments);

      logger.info('✅ Dual transcription completed', {
        inputSegments: inputSegments.length,
        outputSegments: outputSegments.length,
        mergedSegments: mergedSegments.length
      });

      return {
        success: true,
        inputSegments,
        outputSegments,
        mergedSegments,
        inputText: inputResult.text,
        outputText: outputResult.text,
        totalDuration: Math.max(inputResult.duration || 0, outputResult.duration || 0)
      };
    } catch (error) {
      logger.error('❌ Dual transcription failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up temporary audio files
   * @param {Array<string>} filePaths - Paths to clean up
   * @returns {Promise<void>}
   */
  async cleanupFiles(filePaths) {
    try {
      for (const filePath of filePaths) {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.debug('🗑️ Cleaned up file:', filePath);
        }
      }
    } catch (error) {
      logger.warn('⚠️ Failed to cleanup some files:', error.message);
    }
  }

  // =====================================================
  // PRIVATE METHODS
  // =====================================================

  /**
   * Validate audio file
   * @param {Object} file - Multer file object
   * @returns {Object} Validation result
   */
  _validateAudioFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${config.upload.maxFileSize}`
      };
    }

    // Check file format
    const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
    if (!this.allowedFormats.includes(fileExtension)) {
      return {
        valid: false,
        error: `Unsupported file format. Allowed formats: ${this.allowedFormats.join(', ')}`
      };
    }

    // Check MIME type
    const allowedMimeTypes = [
      'audio/wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/flac',
      'audio/x-flac'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: 'Invalid audio file type'
      };
    }

    return { valid: true };
  }

  /**
   * Process transcription result from OpenAI
   * @param {Object} transcription - Raw transcription result
   * @returns {Object} Processed result
   */
  _processTranscriptionResult(transcription) {
    let segments = [];
    
    // Use segments if available, otherwise create from words or text
    if (transcription.segments && transcription.segments.length > 0) {
      segments = transcription.segments.map(segment => ({
        start: segment.start,
        end: segment.end,
        text: segment.text.trim()
      }));
    } else if (transcription.words && transcription.words.length > 0) {
      segments = this._groupWordsIntoSegments(transcription.words);
    } else if (transcription.text) {
      segments = this._createSegmentsFromText(transcription.text);
    }

    // Calculate duration from segments or estimate
    const duration = segments.length > 0 
      ? Math.max(...segments.map(s => s.end || 0))
      : this._estimateDurationFromText(transcription.text);

    return {
      text: transcription.text,
      segments,
      duration,
      language: transcription.language || 'en'
    };
  }

  /**
   * Group words into sentence-level segments
   * @param {Array} words - Word-level timestamps
   * @returns {Array} Sentence segments
   */
  _groupWordsIntoSegments(words) {
    const segments = [];
    let currentSegment = null;
    let segmentWords = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (!currentSegment) {
        currentSegment = {
          start: word.start,
          end: word.end,
          text: word.word
        };
        segmentWords = [word];
      } else {
        currentSegment.end = word.end;
        currentSegment.text += ' ' + word.word;
        segmentWords.push(word);

        // Check for sentence boundaries
        const isEndOfSentence = word.word.match(/[.!?]/) || 
                               (i < words.length - 1 && words[i + 1].start - word.end > 1.0) ||
                               segmentWords.length >= 20;

        if (isEndOfSentence) {
          segments.push({
            start: currentSegment.start,
            end: currentSegment.end,
            text: currentSegment.text.trim()
          });
          currentSegment = null;
          segmentWords = [];
        }
      }
    }

    // Add remaining segment
    if (currentSegment) {
      segments.push({
        start: currentSegment.start,
        end: currentSegment.end,
        text: currentSegment.text.trim()
      });
    }

    return segments;
  }

  /**
   * Create segments from plain text (fallback)
   * @param {string} text - Plain text
   * @returns {Array} Text segments
   */
  _createSegmentsFromText(text) {
    if (!text) return [];

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const segments = [];
    let currentTime = 0;

    sentences.forEach(sentence => {
      const duration = Math.max(2, sentence.length * 0.05);
      segments.push({
        start: currentTime,
        end: currentTime + duration,
        text: sentence.trim()
      });
      currentTime += duration + 0.5;
    });

    return segments;
  }

  /**
   * Merge segments from dual audio by timestamp
   * @param {Array} inputSegments - Input audio segments
   * @param {Array} outputSegments - Output audio segments
   * @returns {Array} Merged segments
   */
  _mergeSegmentsByTimestamp(inputSegments, outputSegments) {
    const allSegments = [...inputSegments, ...outputSegments];
    
    // Sort by start time
    allSegments.sort((a, b) => (a.start || 0) - (b.start || 0));
    
    // Remove duplicates and merge overlapping segments
    const deduplicated = this._removeDuplicateSegments(allSegments);
    
    return deduplicated;
  }

  /**
   * Remove duplicate segments based on text similarity and timing
   * @param {Array} segments - All segments
   * @returns {Array} Deduplicated segments
   */
  _removeDuplicateSegments(segments) {
    if (segments.length === 0) return segments;

    const deduplicated = [];
    const timeWindow = 2.0; // 2 seconds
    const similarityThreshold = 0.8;

    for (const segment of segments) {
      let isDuplicate = false;

      // Check against recent segments
      for (let i = deduplicated.length - 1; i >= 0; i--) {
        const existing = deduplicated[i];

        if (Math.abs((segment.start || 0) - (existing.start || 0)) > timeWindow) {
          break;
        }

        const similarity = this._calculateTextSimilarity(segment.text || '', existing.text || '');
        if (similarity > similarityThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        deduplicated.push(segment);
      }
    }

    return deduplicated;
  }

  /**
   * Calculate text similarity (Jaccard similarity)
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  _calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Estimate duration from text length
   * @param {string} text - Text content
   * @returns {number} Estimated duration in seconds
   */
  _estimateDurationFromText(text) {
    if (!text) return 0;
    const words = text.split(/\s+/).length;
    const wordsPerSecond = 2.5; // Average speaking rate
    return Math.ceil(words / wordsPerSecond);
  }

  /**
   * Parse file size string to bytes
   * @param {string} sizeString - Size string (e.g., '50MB')
   * @returns {number} Size in bytes
   */
  _parseFileSize(sizeString) {
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = sizeString.match(/^(\d+)\s*(B|KB|MB|GB)$/i);
    if (!match) return 50 * 1024 * 1024; // Default 50MB
    
    const [, value, unit] = match;
    return parseInt(value) * (units[unit.toUpperCase()] || 1);
  }

  /**
   * Compress audio file (placeholder - would need ffmpeg or similar)
   * @param {string} inputPath - Input file path
   * @returns {Promise<string>} Compressed file path
   */
  async _compressAudioFile(inputPath) {
    // For now, just return the original path
    // In production, implement audio compression using ffmpeg
    logger.warn('⚠️ Audio compression not implemented - using original file');
    return inputPath;
  }
}

module.exports = new AudioService(); 