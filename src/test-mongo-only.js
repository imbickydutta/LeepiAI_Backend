// MongoDB test with HTTP server for Railway
require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.use(express.json());

let mongoTestResult = null;
let mongoTesting = false;

async function testMongoDB() {
  if (mongoTesting) return mongoTestResult;
  
  mongoTesting = true;
  console.log('🔍 Testing MongoDB connection...');
  
  const mongoUri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
  console.log('📍 MongoDB URI length:', mongoUri ? mongoUri.length : 0);
  console.log('📍 MongoDB URI prefix:', mongoUri ? mongoUri.substring(0, 30) + '...' : 'MISSING');
  
  if (!mongoUri) {
    const error = 'No MongoDB URI found in environment variables';
    console.error('❌', error);
    mongoTestResult = { success: false, error };
    return mongoTestResult;
  }
  
  try {
    console.log('🔗 Attempting connection...');
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000, // 15 seconds
      socketTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 5,
      retryWrites: true,
      w: 'majority'
    });
    
    console.log('✅ MongoDB connection successful!');
    console.log('📊 Database:', mongoose.connection.name);
    console.log('📊 Host:', mongoose.connection.host);
    console.log('📊 Port:', mongoose.connection.port);
    console.log('📊 Ready state:', mongoose.connection.readyState);
    
    // Test a simple operation
    const adminDb = mongoose.connection.db.admin();
    const serverStatus = await adminDb.serverStatus();
    console.log('✅ Server status check passed');
    console.log('📊 MongoDB version:', serverStatus.version);
    
    mongoTestResult = {
      success: true,
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      version: serverStatus.version,
      readyState: mongoose.connection.readyState
    };
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    if (error.reason) {
      console.error('   Error reason:', error.reason);
    }
    
    mongoTestResult = {
      success: false,
      error: error.message,
      errorName: error.name,
      errorCode: error.code,
      errorReason: error.reason
    };
  }
  
  mongoTesting = false;
  return mongoTestResult;
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'MongoDB Test Server',
    timestamp: new Date().toISOString(),
    mongoResult: mongoTestResult
  });
});

app.get('/test-mongo', async (req, res) => {
  const result = await testMongoDB();
  res.json(result);
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: process.env.NODE_ENV,
    mongoTest: mongoTestResult
  });
});

// Start server
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`🚀 MongoDB test server running on port ${PORT}`);
  console.log('🔗 Visit /test-mongo to run MongoDB test');
  
  // Run MongoDB test automatically on startup
  testMongoDB().then(result => {
    console.log('🧪 Initial MongoDB test completed:', result.success ? 'SUCCESS' : 'FAILED');
  });
});

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
}); 