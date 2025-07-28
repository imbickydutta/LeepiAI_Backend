const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['general', 'security', 'transcription', 'ai', 'storage'],
    default: 'general'
  },
  description: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
settingsSchema.index({ key: 1 }, { unique: true });
settingsSchema.index({ category: 1 });

// Default settings
const defaultSettings = [
  {
    key: 'allowRegistration',
    value: true,
    category: 'security',
    description: 'Allow new user registrations'
  },
  {
    key: 'requireEmailVerification',
    value: false,
    category: 'security',
    description: 'Require email verification for new accounts'
  },
  {
    key: 'maxFileSize',
    value: 50 * 1024 * 1024, // 50MB in bytes
    category: 'storage',
    description: 'Maximum file size for audio uploads (in bytes)'
  },
  {
    key: 'autoDeleteDays',
    value: 30,
    category: 'storage',
    description: 'Number of days after which unused files are automatically deleted'
  },
  {
    key: 'defaultAIModel',
    value: 'gpt-4',
    category: 'ai',
    description: 'Default AI model for chat and analysis'
  },
  {
    key: 'transcriptionModel',
    value: 'whisper-1',
    category: 'transcription',
    description: 'Model used for audio transcription'
  }
];

// Static method to ensure default settings exist
settingsSchema.statics.ensureDefaults = async function() {
  for (const setting of defaultSettings) {
    await this.findOneAndUpdate(
      { key: setting.key },
      { $setOnInsert: setting },
      { upsert: true, new: true }
    );
  }
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings; 