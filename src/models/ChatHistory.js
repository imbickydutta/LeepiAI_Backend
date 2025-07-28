const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: [true, 'Message role is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    maxlength: [10000, 'Message content cannot exceed 10000 characters']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const chatHistorySchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    default: uuidv4
  },
  transcriptId: {
    type: String,
    required: [true, 'Transcript ID is required'],
    ref: 'Transcript'
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  messages: {
    type: [messageSchema],
    default: []
  }
}, {
  timestamps: true
});

// Indexes for performance
chatHistorySchema.index({ transcriptId: 1 });
chatHistorySchema.index({ userId: 1 });
chatHistorySchema.index({ updatedAt: -1 });

// Static method to find by transcript ID
chatHistorySchema.statics.findByTranscriptId = function(transcriptId) {
  return this.findOne({ transcriptId });
};

// Static method to find by custom id
chatHistorySchema.statics.findByCustomId = function(id) {
  return this.findOne({ id });
};

// Instance method to add message
chatHistorySchema.methods.addMessage = function(role, content) {
  const message = {
    role,
    content,
    timestamp: new Date()
  };
  
  this.messages.push(message);
  this.updatedAt = new Date();
  
  return this.save();
};

// Instance method to get recent messages
chatHistorySchema.methods.getRecentMessages = function(limit = 10) {
  return this.messages.slice(-limit);
};

// Instance method to clear messages
chatHistorySchema.methods.clearMessages = function() {
  this.messages = [];
  this.updatedAt = new Date();
  return this.save();
};

// Virtual for message count
chatHistorySchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Virtual for last message timestamp
chatHistorySchema.virtual('lastMessageAt').get(function() {
  if (this.messages.length === 0) return null;
  return this.messages[this.messages.length - 1].timestamp;
});

// Ensure virtual fields are serialized
chatHistorySchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('ChatHistory', chatHistorySchema); 