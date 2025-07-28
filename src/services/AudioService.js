// audioService.js
// Single-file AudioService with model selection, optional ffmpeg compression/segmentation,
// dual-audio merge, word/segment timestamps (where supported), and SRT/VTT exporters.

const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const { spawn } = require('child_process');
const config = require('../config/env');
const logger = require('../utils/logger');



class AudioService {
  constructor(userConfig = {}) {
    // -------------------------
    // Default config (env-driven)
    // -------------------------
    const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
    const DEFAULT_MAX_FILE_SIZE = process.env.UPLOAD_MAX_FILE_SIZE || '200MB';
    const DEFAULT_MODEL = process.env.OPENAI_AUDIO_MODEL || 'whisper-1';
    const DEFAULT_SEGMENT_SECONDS = parseInt(process.env.TRANSCRIBE_SEGMENT_SECONDS || '600', 10); // 10 min
    const DEFAULT_BITRATE = process.env.TRANSCODE_BITRATE || '48k';

    this.config = {
      apis: {
        openai: config.apis.openai || process.env.OPENAI_API_KEY || null
      },
      openai: {
        audioModel: DEFAULT_MODEL
      },
      upload: {
        dir: DEFAULT_UPLOAD_DIR,
        maxFileSize: DEFAULT_MAX_FILE_SIZE,
        allowedFormats: [
          'wav', 'mp3', 'mp4', 'm4a', 'aac', 'flac', 'webm', 'ogg'
        ]
      },
      transcode: {
        enable: true,        // try to transcode if too large/unsupported
        bitrate: DEFAULT_BITRATE,
        sampleRate: 16000,   // target 16 kHz
        channels: 1,         // mono
      },
      segment: {
        enable: true,               // segment long files (requires ffmpeg)
        seconds: DEFAULT_SEGMENT_SECONDS
      },
      ...userConfig
    };

    // Logger
    this.logger = userConfig.logger || logger;

    // OpenAI client
    if (!this.config.apis.openai) {
      this.logger.error('❌ OpenAI API key is missing. Audio transcription will not work.');
      this.openai = null;
        } else {
      this.openai = new OpenAI({
        apiKey: this.config.apis.openai,
        timeout: 120000, // 2 min
        maxRetries: 5
      });
    }

    // Upload configuration
    this.uploadPath = this.config.upload.dir;
    this.maxFileSize = this._parseFileSize(this.config.upload.maxFileSize);
    this.allowedFormats = this.config.upload.allowedFormats;
    
    // Ensure upload dir
    fs.ensureDirSync(this.uploadPath);
    
    this.logger.info('🎵 AudioService initialized');
    
    // Warmup: verify OpenAI model availability after short delay
    if (this.openai) {
      setTimeout(() => {
      this._testOpenAIConnection()
          .then(ok => {
            if (ok) this.logger.info('✅ OpenAI API connection verified');
        })
          .catch(err => {
            this.logger.warn('⚠️ OpenAI API connection test failed (service may still work):', err?.message);
        });
      }, 5000);
    } else {
      this.logger.error('❌ OpenAI API key is missing. Transcription features disabled.');
    }

    // Detect ffmpeg availability (lazy; cached)
    this._ffmpegAvailable = null;
  }

  // --------------------------------------------------
  // Public: Upload & validate
  // --------------------------------------------------
  async uploadAudio(file) {
    try {
      const validation = this._validateAudioFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const ext = path.extname(file.originalname);
      const uniqueFilename = `${uuidv4()}${ext}`;
      const destPath = path.join(this.uploadPath, uniqueFilename);

      await fs.move(file.path, destPath);

      const stats = await fs.stat(destPath);
      const metadata = {
        originalName: file.originalname,
        filename: uniqueFilename,
        path: destPath,
        size: stats.size,
        mimetype: file.mimetype,
        uploadedAt: new Date()
      };

      this.logger.info('📁 Audio file uploaded', {
        filename: uniqueFilename,
        size: stats.size,
        originalName: file.originalname
      });

      return { success: true, metadata };
    } catch (error) {
      this.logger.error('❌ Audio upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  // --------------------------------------------------
  // Public: Transcribe single audio (auto-compress/segment if needed)
  // --------------------------------------------------
  async transcribeAudio(audioFilePath, options = {}) {
    let fileStats = null;
    try {
      if (!this.openai) {
        throw new Error('OpenAI API is not configured. Please set OPENAI_API_KEY.');
      }
      if (!await fs.pathExists(audioFilePath)) {
        throw new Error('Audio file not found');
      }

      fileStats = await fs.stat(audioFilePath);
      const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
      this.logger.info(`🔄 Starting transcription for ${fileSizeMB}MB file using model: ${this.config.openai.audioModel}`);

      // Ensure suitable format/size: transcode if necessary (ffmpeg), then maybe segment
      const prepared = await this._prepareAudioForTranscription(audioFilePath);

      // If segmentation produced multiple files, transcribe sequentially and merge
      if (prepared.type === 'segments') {
        this.logger.info(`🧩 Transcribing ${prepared.files.length} segments...`);
        let offset = 0;
        const allSegments = [];
        let fullText = '';
        let language = 'en';
        let totalDuration = 0;

        for (const segPath of prepared.files) {
          const res = await this._transcribeSingleFile(segPath, options);
          if (!res.success) {
            throw new Error(`Segment transcription failed: ${res.error}`);
        }
        
          // offset segments
          const segs = (res.segments || []).map(s => ({
            ...s,
            start: (s.start || 0) + offset,
            end: (s.end || 0) + offset,
            source: s.source || 'input',
            speaker: s.speaker || 'unknown'
          }));

          allSegments.push(...segs);
          if (res.text) {
            if (fullText && !fullText.endsWith(' ')) fullText += ' ';
            fullText += res.text;
          }
          language = res.language || language;
          totalDuration = Math.max(totalDuration, offset + (res.duration || 0));

          // Advance offset
          offset += res.duration || this._estimateDurationFromText(res.text);
        }

        await this._cleanupTemp(prepared.tempDir);

        this.logger.info('✅ Multi-segment transcription completed');

        return {
          success: true,
          text: fullText,
          segments: allSegments,
          duration: totalDuration,
          language
        };
      }

      // Otherwise, single prepared file
      const result = await this._transcribeSingleFile(prepared.file, options);
      await this._cleanupTemp(prepared.tempDir);

      if (!result.success) return result;

      this.logger.info('✅ Transcription completed successfully');
      return result;

    } catch (error) {
      this.logger.error('❌ Transcription process failed:', {
        error: error.message,
        file: audioFilePath,
        size: fileStats?.size || 'unknown'
      });
      return { success: false, error: error.message };
    }
  }

  // --------------------------------------------------
  // Public: Transcribe dual audio (input & output), merge by timestamps
  // --------------------------------------------------
  async transcribeDualAudio(inputAudioPath, outputAudioPath, opts = {}) {
    try {
      this.logger.info('🔄 Starting dual audio transcription', {
        hasInputAudio: !!inputAudioPath,
        hasOutputAudio: !!outputAudioPath
      });

      if (!inputAudioPath) throw new Error('Input audio file is required');

        await fs.access(inputAudioPath, fs.constants.R_OK);
      if (outputAudioPath) await fs.access(outputAudioPath, fs.constants.R_OK);

      const [inputStats, outputStats] = await Promise.all([
        fs.stat(inputAudioPath),
        outputAudioPath ? fs.stat(outputAudioPath) : null
      ]);

      this.logger.info('📊 Audio file stats:', {
        input: { size: inputStats.size, created: inputStats.birthtime, modified: inputStats.mtime },
        output: outputStats ? { size: outputStats.size, created: outputStats.birthtime, modified: outputStats.mtime } : null
      });

      // Transcribe in parallel
      const [inputRes, outputRes] = await Promise.all([
        this.transcribeAudio(inputAudioPath, opts),
        outputAudioPath ? this.transcribeAudio(outputAudioPath, opts) : Promise.resolve(null)
      ]);

      if (!inputRes.success) {
        this.logger.error('❌ Input transcription failed:', { error: inputRes.error, code: inputRes.code, status: inputRes.status });
        throw new Error(`Input transcription failed: ${inputRes.error}`);
      }
      if (outputAudioPath && (!outputRes || !outputRes.success)) {
        this.logger.error('❌ Output transcription failed:', { error: outputRes?.error, code: outputRes?.code, status: outputRes?.status });
        throw new Error(`Output transcription failed: ${outputRes?.error}`);
      }

      const speakerMap = {
        input: opts.inputLabel || 'user',
        output: opts.outputLabel || 'interviewer'
      };

      const inputSegments = (inputRes.segments || []).map(s => ({ ...s, source: 'input', speaker: speakerMap.input }));
      let outputSegments = [];
      if (outputRes && outputRes.success) {
        outputSegments = (outputRes.segments || []).map(s => ({ ...s, source: 'output', speaker: speakerMap.output }));
      }

      const mergedSegments = this._mergeSegmentsByTimestamp(inputSegments, outputSegments, { gapPause: true });

      this.logger.info('✅ Dual transcription completed', {
        inputSegments: inputSegments.length,
        outputSegments: outputSegments.length,
        mergedSegments: mergedSegments.length,
        totalDuration: Math.max(inputRes.duration || 0, outputRes?.duration || 0)
      });

      return {
        success: true,
        inputSegments,
        outputSegments,
        mergedSegments,
        inputText: inputRes.text,
        outputText: outputRes?.text,
        totalDuration: Math.max(inputRes.duration || 0, outputRes?.duration || 0)
      };
    } catch (error) {
      this.logger.error('❌ Dual transcription failed:', {
        error: error.message,
        stack: error.stack,
        inputPath: inputAudioPath,
        outputPath: outputAudioPath
      });

      return {
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          inputPath: inputAudioPath,
          outputPath: outputAudioPath
        } : undefined
      };
    }
  }

  // --------------------------------------------------
  // Public: Cleanup helper
  // --------------------------------------------------
  async cleanupFiles(filePaths) {
    try {
      for (const p of filePaths) {
        if (await fs.pathExists(p)) {
          await fs.remove(p);
          this.logger.debug('🗑️ Cleaned up file:', p);
        }
      }
    } catch (error) {
      this.logger.warn('⚠️ Failed to cleanup some files:', error.message);
    }
  }

  // --------------------------------------------------
  // Public: Exporters (SRT/VTT)
  // --------------------------------------------------
  toSRT(segments = []) {
    const fmt = n => this._formatSrtTime(n);
    return segments.map((s, i) => {
      const start = fmt(s.start || 0);
      const end = fmt(s.end || (s.start || 0) + 2);
      const speaker = s.speaker ? `[${s.speaker}] ` : '';
      const text = (s.text || '').trim();
      return `${i + 1}\n${start} --> ${end}\n${speaker}${text}\n`;
    }).join('\n');
  }

  toVTT(segments = []) {
    const fmt = n => this._formatVttTime(n);
    let out = 'WEBVTT\n\n';
    segments.forEach((s, idx) => {
      const start = fmt(s.start || 0);
      const end = fmt(s.end || (s.start || 0) + 2);
      const speaker = s.speaker ? `[${s.speaker}] ` : '';
      const text = (s.text || '').trim();
      out += `${idx + 1}\n${start} --> ${end}\n${speaker}${text}\n\n`;
    });
    return out;
  }

  // ====================================================
  // PRIVATE
  // ====================================================

  async _testOpenAIConnection() {
    try {
      const model = this.config.openai.audioModel;
      await this.openai.models.retrieve(model);
      this.logger.info(`✅ Model "${model}" is retrievable`);
      return true;
    } catch (error) {
      this.logger.error('❌ OpenAI connection test failed:', {
        error: error.message,
        type: error.constructor?.name,
        status: error.status
      });
      return false;
    }
  }

  _validateAudioFile(file) {
    if (!file) return { valid: false, error: 'No file provided' };

    // Size
    if (file.size > this.maxFileSize) {
      return { valid: false, error: `File too large. Maximum size is ${this.config.upload.maxFileSize}` };
    }

    // Extension allow-list
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (!this.allowedFormats.includes(ext)) {
      return { valid: false, error: `Unsupported file format. Allowed: ${this.allowedFormats.join(', ')}` };
    }

    // MIME allow-list (expanded)
    const allowedMimeTypes = [
      'audio/wav',
      'audio/mpeg',      // mp3
      'audio/mp4',
      'audio/x-m4a',
      'audio/m4a',
      'audio/aac',
      'audio/flac',
      'audio/x-flac',
      'audio/webm',
      'audio/ogg',
      'application/ogg'
    ];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return { valid: false, error: 'Invalid audio file type' };
    }

    return { valid: true };
  }

  async _transcribeSingleFile(audioFilePath, options = {}) {
    try {
      const {
        model = this.config.openai.audioModel,
        language = 'en',
        responseFormat = 'verbose_json', // json|text|srt|vtt|verbose_json
        timestampGranularities = ['word'], // 'word' incurs extra latency; 'segment' is cheaper
        temperature = 0,
        prompt
      } = options;

      const audioStream = fs.createReadStream(audioFilePath);

      // Only send timestamp granularities if we believe model supports it well (conservative: Whisper)
      const wantsWord = Array.isArray(timestampGranularities) && timestampGranularities.includes('word');
      const supportsTimestampGranularities = model === 'whisper-1'; // safe assumption

      const req = {
        file: audioStream,
        model,
        language,
        response_format: responseFormat,
        temperature
      };
      if (prompt) req.prompt = prompt;

      if (responseFormat === 'verbose_json' && supportsTimestampGranularities) {
        req.timestamp_granularities = timestampGranularities;
      } else if (responseFormat === 'verbose_json' && !supportsTimestampGranularities && wantsWord) {
        this.logger.warn(`ℹ️ Model "${model}" may not return word-level timestamps; proceeding without 'word' granularity flag.`);
      }

      const transcription = await this.openai.audio.transcriptions.create(req);
      const processed = this._processTranscriptionResult(transcription, 'input', 'unknown');

      return { success: true, ...processed };
    } catch (err) {
      this.logger.error('❌ Transcription request failed:', {
        error: err.message,
        status: err.status,
        type: err.constructor.name,
        file: audioFilePath,
        model: options.model || this.config.openai.audioModel
      });
      
      const friendly = this._mapOpenAIError(err);
      return { success: false, error: friendly.hint || err.message, code: friendly.code, status: friendly.status };
    }
  }

  _processTranscriptionResult(transcription, source = 'input', speaker = 'unknown') {
    let segments = [];
    // Prefer explicit segments if provided
    if (transcription.segments && transcription.segments.length > 0) {
      segments = transcription.segments.map(s => ({
        start: s.start,
        end: s.end,
        text: (s.text || '').trim(),
        source: s.source || source,
        speaker: s.speaker || speaker
      }));
    } else if (transcription.words && transcription.words.length > 0) {
      segments = this._groupWordsIntoSegments(transcription.words, source, speaker);
    } else if (transcription.text) {
      segments = this._createSegmentsFromText(transcription.text, source, speaker);
    }

    // Filter out segments with empty text to prevent validation errors
    segments = segments.filter(segment => segment.text && segment.text.trim().length > 0);

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

  _groupWordsIntoSegments(words, source = 'input', speaker = 'unknown') {
    const segments = [];
    let current = null;
    let bucket = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!current) {
        current = { start: w.start, end: w.end, text: w.word };
        bucket = [w];
      } else {
        current.end = w.end;
        current.text += ' ' + w.word;
        bucket.push(w);

        const gapNext = i < words.length - 1 ? (words[i + 1].start - w.end) : 0;
        const boundary = /[.!?]/.test(w.word) || gapNext > 1.0 || bucket.length >= 20;

        if (boundary) {
          const segmentText = current.text.trim();
          if (segmentText && segmentText.length > 0) {
            segments.push({ 
              start: current.start, 
              end: current.end, 
              text: segmentText,
              source: source,
              speaker: speaker
            });
          }
          current = null;
          bucket = [];
        }
      }
    }
    if (current) {
      const segmentText = current.text.trim();
      if (segmentText && segmentText.length > 0) {
        segments.push({ 
          start: current.start, 
          end: current.end, 
          text: segmentText,
          source: source,
          speaker: speaker
        });
      }
    }
    return segments;
  }

  _createSegmentsFromText(text, source = 'input', speaker = 'unknown') {
    if (!text) return [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const segs = [];
    let t = 0;
    sentences.forEach(sentence => {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence && trimmedSentence.length > 0) {
        const d = Math.max(2, trimmedSentence.length * 0.05);
        segs.push({ 
          start: t, 
          end: t + d, 
          text: trimmedSentence,
          source: source,
          speaker: speaker
        });
        t += d + 0.5;
      }
    });
    return segs;
  }

  _mergeSegmentsByTimestamp(inputSegments, outputSegments, opts = {}) {
    const all = [...(inputSegments || []), ...(outputSegments || [])];
    all.sort((a, b) => (a.start || 0) - (b.start || 0));
    
    const dedup = this._removeDuplicateSegments(all);
    if (!opts.gapPause) return dedup;

    // Optionally inject [pause] markers for large gaps (readability)
    const result = [];
    const GAP_SEC = 1.2;
    for (let i = 0; i < dedup.length; i++) {
      const curr = dedup[i];
      const prev = result[result.length - 1];
      if (prev && (curr.start - prev.end) > GAP_SEC) {
        result.push({ 
          start: prev.end, 
          end: curr.start, 
          text: '[pause]',
          source: 'input', // Default source for pause segments
          speaker: 'system'
        });
      }
      result.push(curr);
    }
    return result;
  }

  _removeDuplicateSegments(segments) {
    if (segments.length === 0) return segments;
    const out = [];
    const timeWindow = 2.0;
    const threshold = 0.8;

    for (const seg of segments) {
      let dup = false;
      for (let i = out.length - 1; i >= 0; i--) {
        const ex = out[i];
        if (Math.abs((seg.start || 0) - (ex.start || 0)) > timeWindow) break;
        const sim = this._textSim(seg.text || '', ex.text || '');
        if (sim > threshold) { dup = true; break; }
      }
      if (!dup) out.push(seg);
      }
    return out;
  }

  _textSim(a, b) {
    if (!a || !b) return 0;
    const s1 = new Set(a.toLowerCase().split(/\s+/));
    const s2 = new Set(b.toLowerCase().split(/\s+/));
    const inter = new Set([...s1].filter(x => s2.has(x)));
    const uni = new Set([...s1, ...s2]);
    return inter.size / uni.size;
  }

  _estimateDurationFromText(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    const wps = 2.5;
    return Math.ceil(words / wps);
  }

  _formatSrtTime(sec) {
    const ms = Math.floor((sec % 1) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, '0')}`;
  }

  _formatVttTime(sec) {
    const ms = Math.floor((sec % 1) * 1000);
    const s = Math.floor(sec) % 60;
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3, '0')}`;
  }

  _parseFileSize(sizeString) {
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = String(sizeString || '').trim().match(/^(\d+)\s*(B|KB|MB|GB)$/i);
    if (!match) return 200 * 1024 * 1024; // default 200MB
    const [, value, unit] = match;
    return parseInt(value, 10) * (units[unit.toUpperCase()] || 1);
  }

  _mapOpenAIError(err) {
    const status = err?.status || err?.response?.status;
    const type = err?.constructor?.name;
    let hint = err?.message || 'Unknown error';
    let code = 'UNKNOWN';

    if (status === 400) { code = 'BAD_REQUEST'; hint = 'Invalid parameters or unsupported media. Try transcoding to m4a/mp3 and retry.'; }
    else if (status === 401) { code = 'UNAUTHORIZED'; hint = 'Invalid API key.'; }
    else if (status === 403) { code = 'FORBIDDEN'; hint = 'This model may not be available on your project.'; }
    else if (status === 404) { code = 'NOT_FOUND'; hint = 'Endpoint/model not found. Check model name.'; }
    else if (status === 413) { code = 'PAYLOAD_TOO_LARGE'; hint = 'File too large. Consider transcoding or segmenting the file.'; }
    else if (status === 429) { code = 'RATE_LIMIT'; hint = 'Rate limited. Back off and retry using Retry-After header.'; }
    else if (status >= 500) { code = 'SERVER_ERROR'; hint = 'Temporary server issue. Retry with backoff.'; }

    this.logger.error('OpenAI error:', { 
      status, 
      type, 
      code, 
      hint,
      message: err?.message,
      stack: err?.stack,
      response: err?.response?.data,
      request: err?.request?.method
    });
    return { status, type, code, hint };
  }

  // ----------------------------
  // Prep audio: transcode/segment
  // ----------------------------
  async _prepareAudioForTranscription(inputPath) {
    const tempDir = path.join(this.uploadPath, `.tmp-${uuidv4()}`);
    await fs.ensureDir(tempDir);

    const stats = await fs.stat(inputPath);
    const withinLimit = stats.size <= this.maxFileSize;

    // If within size limit, keep as-is
    if (withinLimit) {
      return { type: 'single', file: inputPath, tempDir };
    }

    // Try transcode (if ffmpeg present)
    if (await this._hasFfmpeg() && this.config.transcode.enable) {
      const transcoded = await this._transcodeAudio(inputPath, path.join(tempDir, `${uuidv4()}.m4a`));
      const tStats = await fs.stat(transcoded);
      if (tStats.size <= this.maxFileSize) {
        return { type: 'single', file: transcoded, tempDir };
      }

      // If still too big and segmentation enabled: split into chunks
      if (this.config.segment.enable) {
        const parts = await this._segmentAudio(transcoded, tempDir, this.config.segment.seconds);
        return { type: 'segments', files: parts, tempDir };
      }
      return { type: 'single', file: transcoded, tempDir }; // fallback
    }

    // If no ffmpeg, proceed but warn
    this.logger.warn('⚠️ ffmpeg not available; proceeding with original file (may exceed API limits).');
    return { type: 'single', file: inputPath, tempDir };
  }

  async _hasFfmpeg() {
    if (this._ffmpegAvailable !== null) return this._ffmpegAvailable;
    this._ffmpegAvailable = await new Promise(resolve => {
      const p = spawn('ffmpeg', ['-version']);
      let ok = true;
      p.on('error', () => resolve(false));
      p.on('exit', code => resolve(code === 0 && ok));
    });
    return this._ffmpegAvailable;
  }

  async _transcodeAudio(input, output) {
    this.logger.info('🎛️ Transcoding audio (mono, 16kHz)...');
    await this._runFfmpeg([
      '-y',
      '-i', input,
      '-ac', String(this.config.transcode.channels),
      '-ar', String(this.config.transcode.sampleRate),
      '-b:a', this.config.transcode.bitrate,
      '-vn',
      output
    ]);
    this.logger.info('✅ Transcode done:', output);
    return output;
  }

  async _segmentAudio(input, outDir, seconds = 600) {
    this.logger.info(`✂️  Segmenting audio into ~${seconds}s chunks...`);
    const pattern = path.join(outDir, 'chunk-%03d.m4a');
    await this._runFfmpeg([
      '-y',
      '-i', input,
      '-f', 'segment',
      '-segment_time', String(seconds),
      '-reset_timestamps', '1',
      '-ac', String(this.config.transcode.channels),
      '-ar', String(this.config.transcode.sampleRate),
      '-b:a', this.config.transcode.bitrate,
      '-vn',
      pattern
    ]);

    // Collect chunk files (sorted)
    const files = (await fs.readdir(outDir))
      .filter(f => f.startsWith('chunk-') && f.endsWith('.m4a'))
      .map(f => path.join(outDir, f))
      .sort();
    this.logger.info(`✅ Segmentation produced ${files.length} chunks`);
    return files;
  }

  async _runFfmpeg(args) {
    return new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', args, { stdio: 'ignore' });
      p.on('error', reject);
      p.on('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });
  }

  async _cleanupTemp(tempDir) {
    try {
      if (tempDir && tempDir.includes(`${path.sep}.tmp-`) && await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
        this.logger.debug('🧹 Temp cleaned:', tempDir);
      }
    } catch (e) {
      this.logger.warn('⚠️ Temp cleanup failed:', e.message);
    }
  }
}

module.exports = new AudioService(); 