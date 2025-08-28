const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const segmentSchema = new mongoose.Schema({
  start: {
    type: Number,
    required: true
  },
  end: {
    type: Number,
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  source: {
    type: String,
    enum: ['input', 'output'],
    required: true
  },
  speaker: {
    type: String,
    default: 'unknown'
  }
}, { _id: false });

const debriefSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  format: {
    type: String,
    enum: ['text', 'markdown'],
    default: 'markdown'
  },
  questions: [{
    type: String
  }],
  answers: [{
    type: String
  }],
  feedback: String,
  improvements: [{
    type: String
  }],
  strengths: [{
    type: String
  }],
  score: {
    type: Number,
    min: 0,
    max: 100
  }
}, { _id: false });

const transcriptSchema = new mongoose.Schema({
  // Use String UUIDs as primary _id to avoid ObjectId casts
  _id: {
    type: String,
    default: uuidv4
  },
  id: {
    type: String,
    unique: true,
    default: uuidv4,
    required: true
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  title: {
    type: String,
    default: 'Interview Transcript',
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Transcript content is required']
  },
  segments: {
    type: [segmentSchema],
    default: []
  },
  summary: {
    type: String,
    maxlength: [5000, 'Summary cannot exceed 5000 characters']
  },
  debrief: debriefSchema,

  // New interview details fields
  interviewDetails: {
    companyName: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters']
    },
    round: {
      type: String,
      enum: [
        'Screening',
        'Technical Round 1',
        'Technical Round 2',
        'Technical Round 3',
        'System Design',
        'Coding Round',
        'Behavioral',
        'Final Round',
        'HR Round',
        'CTO Round',
        'CEO Round',
        'Manager Round',
        'Panel Interview',
        'Culture Fit',
        'Other'
      ],
      trim: true
    },
    interviewerName: {
      type: String,
      trim: true,
      maxlength: [100, 'Interviewer name cannot exceed 100 characters']
    },
    studentName: {
      type: String,
      trim: true,
      maxlength: [100, 'Student name cannot exceed 100 characters']
    },
    performanceRating: {
      type: Number,
      min: [1, 'Performance rating must be at least 1'],
      max: [10, 'Performance rating cannot exceed 10']
    },
    isUpdated: {
      type: Boolean,
      default: false
    },
    updatedAt: {
      type: Date
    }
  },

  aiAnalysis: {
    sentiment: String,
    keyTopics: [{
      type: String
    }],
    actionItems: [{
      type: String
    }],
    followUpQuestions: [{
      type: String
    }]
  },
  metadata: {
    duration: {
      type: Number,
      min: 0
    },
    segmentCount: {
      type: Number,
      default: 0
    },
    hasInputAudio: {
      type: Boolean,
      default: false
    },
    hasOutputAudio: {
      type: Boolean,
      default: false
    },
    sources: [{
      type: String,
      enum: ['input', 'output']
    }],
    language: {
      type: String,
      default: 'en'
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    originalFilename: String,
    fileSize: Number
  }
}, {
  timestamps: true
});

// Ensure consistency between _id and id
transcriptSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

// Update interview details tracking
transcriptSchema.pre('save', function (next) {
  // Check if interview details have been modified
  if (this.isModified('interviewDetails')) {
    this.interviewDetails.isUpdated = true;
    this.interviewDetails.updatedAt = new Date();
  }
  next();
});

// Indexes for performance
transcriptSchema.index({ userId: 1, createdAt: -1 });
transcriptSchema.index({ id: 1 });
transcriptSchema.index({ 'metadata.duration': 1 });
transcriptSchema.index({ 'interviewDetails.isUpdated': 1 });
transcriptSchema.index({ 'interviewDetails.companyName': 1 });
transcriptSchema.index({ 'interviewDetails.round': 1 });

// Update segmentCount when segments change
transcriptSchema.pre('save', function (next) {
  if (this.isModified('segments')) {
    this.metadata.segmentCount = this.segments.length;
  }
  next();
});

// Static method to find by custom id
transcriptSchema.statics.findByCustomId = function (id) {
  return this.findOne({ id });
};

// Static method to get user transcripts with pagination
transcriptSchema.statics.getUserTranscripts = function (userId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = -1,
    includeSegments = false
  } = options;

  let query = this.find({ userId })
    .sort({ [sortBy]: sortOrder })
    .skip(offset)
    .limit(limit);

  // Exclude segments for list view unless specifically requested
  if (!includeSegments) {
    query = query.select('-segments');
  }

  return query.lean();
};

// Instance method to get summary statistics
transcriptSchema.methods.getStats = function () {
  return {
    id: this.id,
    duration: this.metadata.duration || 0,
    segmentCount: this.segments.length,
    wordCount: this.content.split(/\s+/).length,
    hasSummary: !!this.summary,
    hasDebrief: !!this.debrief?.content,
    hasInterviewDetails: this.interviewDetails?.isUpdated || false,
    quality: this.metadata.quality,
    createdAt: this.createdAt
  };
};

// Instance method to update interview details
transcriptSchema.methods.updateInterviewDetails = async function (details) {
  // Initialize interviewDetails if it doesn't exist
  if (!this.interviewDetails) {
    this.interviewDetails = {};
  }

  // Update only the provided fields
  if (details.companyName !== undefined) {
    this.interviewDetails.companyName = details.companyName;
  }
  if (details.round !== undefined) {
    this.interviewDetails.round = details.round;
  }
  if (details.interviewerName !== undefined) {
    this.interviewDetails.interviewerName = details.interviewerName;
  }
  if (details.studentName !== undefined) {
    this.interviewDetails.studentName = details.studentName;
  }
  if (details.performanceRating !== undefined) {
    this.interviewDetails.performanceRating = details.performanceRating;
  }

  // Mark as updated
  this.interviewDetails.isUpdated = true;
  this.interviewDetails.updatedAt = new Date();

  // Mark the path as modified for nested objects
  this.markModified('interviewDetails');

  try {
    const saved = await this.save();
    return saved;
  } catch (error) {
    console.error('❌ Error saving interview details:', error);
    throw error;
  }
};

// Instance method to get interview details
transcriptSchema.methods.getInterviewDetails = function () {
  return this.interviewDetails || {};
};

// Virtual for word count
transcriptSchema.virtual('wordCount').get(function () {
  return this.content ? this.content.split(/\s+/).length : 0;
});

// Virtual for estimated reading time (assuming 200 wpm)
transcriptSchema.virtual('estimatedReadingTime').get(function () {
  const wordsPerMinute = 200;
  const wordCount = this.wordCount;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Ensure virtual fields are serialized
transcriptSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Transcript', transcriptSchema); 