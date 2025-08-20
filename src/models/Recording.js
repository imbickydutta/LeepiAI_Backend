const mongoose = require('mongoose');

const audioFileSchema = new mongoose.Schema({
  path: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filename: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['input', 'output'],
    required: true
  },
  segmentIndex: {
    type: Number,
    default: 0
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const recordingSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  
  // Session management
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  
  // Parent session for grouped recordings
  parentSessionId: {
    type: String,
    default: null,
    index: true
  },
  
  // Indicates if this is a parent session or a chunk
  isParentSession: {
    type: Boolean,
    default: true
  },
  
  // For chunked recordings, reference to parent
  parentRecordingId: {
    type: String,  // Changed from ObjectId to String since Recording uses String IDs
    ref: 'Recording',
    default: null
  },
  
  // For parent sessions, array of chunk recordings
  chunkRecordingIds: [{
    type: String,  // Changed from ObjectId to String since Recording uses String IDs
    ref: 'Recording'
  }],
  
  title: {
    type: String,
    default: 'Untitled Recording'
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  audioFiles: [audioFileSchema],
  
  transcriptId: {
    type: String,  // Changed from ObjectId to String since Transcript uses UUID strings
    ref: 'Transcript',
    index: true
  },
  
  metadata: {
    duration: Number,
    segmentCount: Number,
    totalSegments: Number, // Total segments in the session
    currentSegment: Number, // Current segment being processed
    hasInputAudio: Boolean,
    hasOutputAudio: Boolean,
    sources: [String],
    language: {
      type: String,
      default: 'en'
    },
    originalFilename: String,
    fileSize: Number,
    totalFileSize: Number, // Total size of all segments
    recordingType: {
      type: String,
      enum: ['single', 'dual', 'segmented'],
      default: 'single'
    },
    sessionStartTime: Date,
    sessionEndTime: Date
  },
  
  error: {
    type: String,
    default: null
  },
  
  retryCount: {
    type: Number,
    default: 0
  },
  
  lastRetryAt: {
    type: Date,
    default: null
  },
  
  completedAt: {
    type: Date,
    default: null
  },
  
  audioDeletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
recordingSchema.index({ userId: 1, status: 1 });
recordingSchema.index({ userId: 1, createdAt: -1 });
recordingSchema.index({ status: 1, createdAt: -1 });
recordingSchema.index({ sessionId: 1 });
recordingSchema.index({ parentSessionId: 1 });
recordingSchema.index({ userId: 1, sessionId: 1 });

// Virtual for checking if recording has audio files
recordingSchema.virtual('hasAudioFiles').get(function() {
  return this.audioFiles && this.audioFiles.length > 0;
});

// Virtual for checking if recording has transcript
recordingSchema.virtual('hasTranscript').get(function() {
  return !!this.transcriptId;
});

// Virtual for checking if this is a segmented recording
recordingSchema.virtual('isSegmented').get(function() {
  return this.metadata?.recordingType === 'segmented' || this.chunkRecordingIds?.length > 0;
});

// Virtual for getting total session duration
recordingSchema.virtual('totalSessionDuration').get(function() {
  if (this.isParentSession && this.chunkRecordingIds?.length > 0) {
    return this.metadata?.totalSegments * (this.metadata?.duration || 0);
  }
  return this.metadata?.duration || 0;
});

// Method to get recording summary
recordingSchema.methods.getSummary = function() {
  return {
    id: this._id,
    sessionId: this.sessionId,
    title: this.title,
    status: this.status,
    isSegmented: this.isSegmented,
    isParentSession: this.isParentSession,
    hasAudioFiles: this.hasAudioFiles,
    hasTranscript: this.hasTranscript,
    audioFileCount: this.audioFiles ? this.audioFiles.length : 0,
    totalSegments: this.metadata?.totalSegments || 1,
    duration: this.metadata?.duration,
    totalSessionDuration: this.totalSessionDuration,
    fileSize: this.metadata?.fileSize,
    totalFileSize: this.metadata?.totalFileSize,
    createdAt: this.createdAt,
    error: this.error,
    retryCount: this.retryCount
  };
};

// Method to mark as completed
recordingSchema.methods.markCompleted = function(transcriptId) {
  this.status = 'completed';
  this.transcriptId = transcriptId;
  this.completedAt = new Date();
  this.error = null;
  return this.save();
};

// Method to mark as failed
recordingSchema.methods.markFailed = function(error) {
  this.status = 'failed';
  this.error = error;
  return this.save();
};

// Method to increment retry count
recordingSchema.methods.incrementRetry = function() {
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  return this.save();
};

// Method to add chunk recording
recordingSchema.methods.addChunkRecording = function(chunkRecordingId) {
  if (!this.chunkRecordingIds) {
    this.chunkRecordingIds = [];
  }
  if (!this.chunkRecordingIds.includes(chunkRecordingId)) {
    this.chunkRecordingIds.push(chunkRecordingId);
  }
  return this.save();
};

// Method to update session metadata
recordingSchema.methods.updateSessionMetadata = function(metadata) {
  this.metadata = { ...this.metadata, ...metadata };
  return this.save();
};

// Static method to get recordings by status
recordingSchema.statics.getByStatus = function(userId, status) {
  return this.find({ userId, status }).sort({ createdAt: -1 });
};

// Static method to get failed recordings
recordingSchema.statics.getFailedRecordings = function(userId) {
  return this.find({ userId, status: 'failed' }).sort({ createdAt: -1 });
};

// Static method to get recordings with audio files
recordingSchema.statics.getWithAudioFiles = function(userId) {
  return this.find({ 
    userId, 
    audioFiles: { $exists: true, $ne: [] } 
  }).sort({ createdAt: -1 });
};

// Static method to get parent sessions (grouped recordings)
recordingSchema.statics.getParentSessions = function(userId) {
  return this.find({ 
    userId, 
    isParentSession: true 
  }).populate('chunkRecordingIds').sort({ createdAt: -1 });
};

// Static method to get session by sessionId
recordingSchema.statics.getBySessionId = function(userId, sessionId) {
  return this.find({ 
    userId, 
    $or: [
      { sessionId: sessionId },
      { parentSessionId: sessionId }
    ]
  }).sort({ createdAt: -1 });
};

// Static method to get complete session (parent + chunks)
recordingSchema.statics.getCompleteSession = function(userId, sessionId) {
  return this.findOne({ 
    userId, 
    sessionId: sessionId,
    isParentSession: true 
  }).populate('chunkRecordingIds');
};

// Pre-save middleware to update timestamps
recordingSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-remove middleware to clean up files
recordingSchema.pre('remove', async function(next) {
  try {
    // Clean up audio files if they exist
    if (this.audioFiles && this.audioFiles.length > 0) {
      const fs = require('fs').promises;
      const path = require('path');
      
      for (const audioFile of this.audioFiles) {
        try {
          await fs.unlink(audioFile.path);
        } catch (error) {
          console.warn(`Failed to delete audio file: ${audioFile.path}`, error);
        }
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Recording', recordingSchema); 