require('dotenv').config();
const Joi = require('joi');
const logger = require('../utils/logger');

// Define environment variables schema
const envSchema = Joi.object({
  // Node environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  // Server
  PORT: Joi.number()
    .default(process.env.PORT || 3001),
  
  // Database
  MONGODB_URI: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.optional(),
      otherwise: Joi.required()
    }),
  MONGODB_URI_PROD: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  
  // JWT (with more secure defaults)
  JWT_SECRET: Joi.string()
    .min(32)
    .default('your-development-jwt-secret-key-minimum-32-chars'),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .default('your-development-refresh-secret-key-minimum-32-chars'),
  JWT_EXPIRES_IN: Joi.string()
    .default('7d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .default('30d'),
  
  // API Keys (optional in development)
  OPENAI_API_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  GEMINI_API_KEY: Joi.string()
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
  
  // App Version Control
  APP_CURRENT_VERSION: Joi.string()
    .default('1.0.0'),
  APP_DOWNLOAD_URL: Joi.string()
    .pattern(/^https?:\/\/.+/)
    .default('https://your-app-download-url.com'),
  
  // CORS (with secure defaults)
  CORS_ORIGIN: Joi.string()
    .default(process.env.NODE_ENV === 'production' 
      ? 'app://*,capacitor://localhost' 
      : 'http://localhost:3000,http://localhost:*,app://*,capacitor://localhost'),
  
  // File Upload
  UPLOAD_PATH: Joi.string()
    .default('./uploads'),
  MAX_FILE_SIZE: Joi.string()
    .default('200MB'),
  ALLOWED_AUDIO_FORMATS: Joi.string()
    .default('wav,mp3,m4a,flac,webm'),
  
  // Logging
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
  LOG_FILE: Joi.string()
    .default('./logs/app.log'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number()
    .default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .default(100)
}).unknown();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env, {
  stripUnknown: true,
  abortEarly: false
});

if (error) {
  const missingVars = error.details.map(detail => detail.message).join('\n');
  logger.error('❌ Environment validation failed:', {
    errors: error.details,
    env: process.env.NODE_ENV
  });
  throw new Error(`Environment validation error:\n${missingVars}`);
}

// Log environment status
logger.info('✅ Environment variables loaded:', {
  nodeEnv: envVars.NODE_ENV,
  port: envVars.PORT,
  dbConnected: !!envVars[envVars.NODE_ENV === 'production' ? 'MONGODB_URI_PROD' : 'MONGODB_URI'],
  openAiKey: !!envVars.OPENAI_API_KEY,
  geminiKey: !!envVars.GEMINI_API_KEY,
  corsOrigin: envVars.CORS_ORIGIN
});

// Export validated config
module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  
  database: {
    uri: envVars.NODE_ENV === 'production' 
      ? envVars.MONGODB_URI_PROD 
      : envVars.MONGODB_URI
  },
  
  jwt: {
    secret: envVars.JWT_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN
  },
  
  apis: {
    openai: envVars.OPENAI_API_KEY,
    gemini: envVars.GEMINI_API_KEY
  },
  
  cors: {
    origin: envVars.CORS_ORIGIN
  },
  
  upload: {
    path: envVars.UPLOAD_PATH,
    maxFileSize: envVars.MAX_FILE_SIZE,
    allowedFormats: envVars.ALLOWED_AUDIO_FORMATS.split(',')
  },
  
  logging: {
    level: envVars.LOG_LEVEL,
    file: envVars.LOG_FILE
  },
  
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS
  },
  
  app: {
    currentVersion: envVars.APP_CURRENT_VERSION,
    downloadUrl: envVars.APP_DOWNLOAD_URL
  }
}; 