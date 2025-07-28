const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config/env');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
fs.ensureDirSync(uploadDir);

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// File filter for audio files
const audioFileFilter = (req, file, cb) => {
  // Check file extension
  const allowedExtensions = config.upload.allowedFormats.map(ext => `.${ext}`);
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    const error = new Error(`Invalid file type. Allowed formats: ${config.upload.allowedFormats.join(', ')}`);
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  // Check MIME type
  const allowedMimeTypes = [
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/flac',
    'audio/x-flac',
    'audio/webm'
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    const error = new Error('Invalid audio file type');
    error.code = 'INVALID_MIME_TYPE';
    return cb(error, false);
  }

  cb(null, true);
};

// Parse file size from config
const parseFileSize = (sizeString) => {
  const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  const match = sizeString.match(/^(\d+)\s*(B|KB|MB|GB)$/i);
  if (!match) return 200 * 1024 * 1024; // Default 200MB
  
  const [, value, unit] = match;
  return parseInt(value) * (units[unit.toUpperCase()] || 1);
};

// Configure multer
const upload = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: parseFileSize(config.upload.maxFileSize),
    files: 2 // Allow up to 2 files for dual audio
  }
});

/**
 * Middleware for single audio file upload
 */
const uploadSingleAudio = (fieldName = 'audio') => {
  return (req, res, next) => {
    const uploadSingle = upload.single(fieldName);
    
    uploadSingle(req, res, (error) => {
      if (error) {
        logger.error('❌ File upload error:', error);
        
        if (error instanceof multer.MulterError) {
          switch (error.code) {
            case 'LIMIT_FILE_SIZE':
              return res.status(400).json({
                success: false,
                error: `File too large. Maximum size is ${config.upload.maxFileSize}`
              });
            case 'LIMIT_FILE_COUNT':
              return res.status(400).json({
                success: false,
                error: 'Too many files uploaded'
              });
            case 'LIMIT_UNEXPECTED_FILE':
              return res.status(400).json({
                success: false,
                error: 'Unexpected file field'
              });
            default:
              return res.status(400).json({
                success: false,
                error: 'File upload error'
              });
          }
        } else if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_MIME_TYPE') {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Internal server error during file upload'
          });
        }
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No audio file uploaded'
        });
      }

      logger.info('📁 File uploaded successfully', {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      next();
    });
  };
};

/**
 * Middleware for dual audio file upload
 */
const uploadDualAudio = () => {
  return (req, res, next) => {
    const uploadFields = upload.fields([
      { name: 'inputAudio', maxCount: 1 },
      { name: 'outputAudio', maxCount: 1 }
    ]);
    
    uploadFields(req, res, (error) => {
      if (error) {
        logger.error('❌ Dual file upload error:', error);
        
        if (error instanceof multer.MulterError) {
          switch (error.code) {
            case 'LIMIT_FILE_SIZE':
              return res.status(400).json({
                success: false,
                error: `File too large. Maximum size is ${config.upload.maxFileSize}`
              });
            case 'LIMIT_FILE_COUNT':
              return res.status(400).json({
                success: false,
                error: 'Too many files uploaded'
              });
            default:
              return res.status(400).json({
                success: false,
                error: 'File upload error'
              });
          }
        } else if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_MIME_TYPE') {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Internal server error during file upload'
          });
        }
      }

      // Check if at least one file was uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No audio files uploaded'
        });
      }

      // Validate that we have the expected files
      const { inputAudio, outputAudio } = req.files;
      
      if (!inputAudio && !outputAudio) {
        return res.status(400).json({
          success: false,
          error: 'No valid audio files found'
        });
      }

      logger.info('📁 Dual audio files uploaded successfully', {
        inputAudio: inputAudio ? inputAudio[0].filename : 'none',
        outputAudio: outputAudio ? outputAudio[0].filename : 'none',
        totalFiles: Object.keys(req.files).length
      });

      next();
    });
  };
};

/**
 * Upload middleware for dual audio with microphone/system field names
 * @returns {Function} Express middleware
 */
const uploadMicSystemAudio = () => {
  return (req, res, next) => {
    const uploadFields = upload.fields([
      { name: 'microphone', maxCount: 1 },
      { name: 'system', maxCount: 1 }
    ]);
    
    uploadFields(req, res, (error) => {
      if (error) {
        logger.error('❌ Mic/System audio upload error:', error);
        
        if (error instanceof multer.MulterError) {
          switch (error.code) {
            case 'LIMIT_FILE_SIZE':
              return res.status(400).json({
                success: false,
                error: `File too large. Maximum size is ${config.upload.maxFileSize}`
              });
            case 'LIMIT_FILE_COUNT':
              return res.status(400).json({
                success: false,
                error: 'Too many files uploaded'
              });
            default:
              return res.status(400).json({
                success: false,
                error: 'File upload error'
              });
          }
        } else if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_MIME_TYPE') {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Internal server error during file upload'
          });
        }
      }

      // Check if at least one file was uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No audio files uploaded'
        });
      }

      // Validate that we have the expected files
      const { microphone, system } = req.files;
      
      if (!microphone && !system) {
        return res.status(400).json({
          success: false,
          error: 'No valid audio files found'
        });
      }

      logger.info('📁 Mic/System audio files uploaded successfully', {
        microphone: microphone ? microphone[0].filename : 'none',
        system: system ? system[0].filename : 'none',
        totalFiles: Object.keys(req.files).length
      });

      next();
    });
  };
};

/**
 * Middleware for segmented dual audio upload (multiple files per field)
 */
const uploadSegmentedDualAudio = () => {
  return (req, res, next) => {
    // Create a multer instance with higher limits for segmented uploads
    const segmentedUpload = multer({
      storage,
      fileFilter: audioFileFilter,
      limits: {
        fileSize: parseFileSize(config.upload.maxFileSize),
        files: 50 // Allow up to 50 files for segmented uploads (25 segments × 2 files each)
      }
    });

    const uploadFields = segmentedUpload.fields([
      { name: 'microphone', maxCount: 25 }, // Allow up to 25 microphone segments
      { name: 'system', maxCount: 25 }      // Allow up to 25 system segments
    ]);
    
    uploadFields(req, res, (error) => {
      if (error) {
        logger.error('❌ Segmented dual audio upload error:', error);
        
        if (error instanceof multer.MulterError) {
          switch (error.code) {
            case 'LIMIT_FILE_SIZE':
              return res.status(400).json({
                success: false,
                error: `File too large. Maximum size is ${config.upload.maxFileSize}`
              });
            case 'LIMIT_FILE_COUNT':
              return res.status(400).json({
                success: false,
                error: 'Too many files uploaded for segmented recording'
              });
            default:
              return res.status(400).json({
                success: false,
                error: 'File upload error'
              });
          }
        } else if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_MIME_TYPE') {
          return res.status(400).json({
            success: false,
            error: error.message
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Internal server error during file upload'
          });
        }
      }

      // Check if at least one file was uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No audio files uploaded'
        });
      }

      // Validate that we have the expected files
      const { microphone, system } = req.files;
      
      if (!microphone || microphone.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No microphone audio files uploaded'
        });
      }

      logger.info('📁 Segmented dual audio files uploaded successfully', {
        microphoneSegments: microphone.length,
        systemSegments: system ? system.length : 0,
        totalFiles: Object.keys(req.files).reduce((sum, key) => sum + req.files[key].length, 0)
      });

      next();
    });
  };
};

/**
 * Cleanup uploaded files (for error cases)
 * @param {Array} files - Array of file objects to cleanup
 */
const cleanupFiles = async (files) => {
  try {
    for (const file of files) {
      if (file && file.path && await fs.pathExists(file.path)) {
        await fs.remove(file.path);
        logger.debug('🗑️ Cleaned up file:', file.path);
      }
    }
  } catch (error) {
    logger.warn('⚠️ Failed to cleanup some files:', error.message);
  }
};

/**
 * Error handling middleware for file upload errors
 */
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    logger.error('❌ Multer error:', error);
    
    // Cleanup any uploaded files
    if (req.file) cleanupFiles([req.file]);
    if (req.files) {
      const allFiles = Object.values(req.files).flat();
      cleanupFiles(allFiles);
    }
    
    return res.status(400).json({
      success: false,
      error: 'File upload error: ' + error.message
    });
  }
  
  next(error);
};

module.exports = {
  uploadSingleAudio,
  uploadDualAudio,
  uploadMicSystemAudio,
  uploadSegmentedDualAudio,
  cleanupFiles,
  handleUploadError
}; 