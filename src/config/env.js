require('dotenv').config();
const Joi = require('joi');

// Define environment variables schema
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  
  // Database
  MONGODB_URI: Joi.string().required(),
  MONGODB_URI_PROD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  
  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  
  // API Keys
  OPENAI_API_KEY: Joi.string().required(),
  GEMINI_API_KEY: Joi.string().required(),
  
  // CORS
  CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
  
  // File Upload
  UPLOAD_PATH: Joi.string().default('./uploads'),
  MAX_FILE_SIZE: Joi.string().default('50MB'),
  ALLOWED_AUDIO_FORMATS: Joi.string().default('wav,mp3,m4a,flac'),
  
  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().default('./logs/app.log'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100)
}).unknown();

// Validate environment variables
const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  
  database: {
    uri: envVars.NODE_ENV === 'production' ? envVars.MONGODB_URI_PROD : envVars.MONGODB_URI
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
  }
}; 