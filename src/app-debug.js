// Debug version to identify the exact issue
require('dotenv').config();
const express = require('express');
const cors = require('cors');

console.log('🔍 Starting debug server...');

const app = express();
app.use(cors());
app.use(express.json());

// Test MongoDB connection separately
async function testMongoConnection() {
  try {
    console.log('🧪 Testing MongoDB connection...');
    const mongoose = require('mongoose');
    
    const mongoUri = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI;
    
    console.log('🔗 MongoDB URI length:', mongoUri ? mongoUri.length : 0);
    console.log('🔗 MongoDB URI prefix:', mongoUri ? mongoUri.substring(0, 30) + '...' : 'undefined');
    
    // Test connection with minimal options
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Short timeout for testing
      socketTimeoutMS: 5000
    });
    
    console.log('✅ MongoDB connection successful!');
    console.log('📊 Database name:', mongoose.connection.name);
    console.log('📊 Connection state:', mongoose.connection.readyState);
    
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    
    return { success: true };
  } catch (error) {
    console.error('❌ MongoDB connection failed:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    return { success: false, error: error.message };
  }
}

// Test OpenAI connection separately
async function testOpenAIConnection() {
  try {
    console.log('🧪 Testing OpenAI connection...');
    const OpenAI = require('openai');
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    const models = await openai.models.list();
    console.log('✅ OpenAI connection successful!');
    console.log('📊 Available models count:', models.data?.length || 0);
    
    return { success: true };
  } catch (error) {
    console.error('❌ OpenAI connection failed:', {
      message: error.message,
      status: error.status,
      type: error.type
    });
    return { success: false, error: error.message };
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Debug server running',
    timestamp: new Date().toISOString()
  });
});

app.get('/test-mongo', async (req, res) => {
  const result = await testMongoConnection();
  res.json(result);
});

app.get('/test-openai', async (req, res) => {
  const result = await testOpenAIConnection();
  res.json(result);
});

app.get('/test-all', async (req, res) => {
  console.log('🧪 Running all tests...');
  
  const mongoResult = await testMongoConnection();
  const openaiResult = await testOpenAIConnection();
  
  res.json({
    success: mongoResult.success && openaiResult.success,
    tests: {
      mongodb: mongoResult,
      openai: openaiResult
    },
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Debug server running on port ${PORT}`);
  console.log('🔗 Visit /test-all to run all connection tests');
}); 