// Minimal MongoDB connection test for Railway
require('dotenv').config();
const mongoose = require('mongoose');

async function testMongoDB() {
  console.log('🔍 Testing MongoDB connection...');
  
  const mongoUri = process.env.MONGODB_URI_PROD || process.env.MONGODB_URI;
  console.log('📍 MongoDB URI length:', mongoUri ? mongoUri.length : 0);
  console.log('📍 MongoDB URI prefix:', mongoUri ? mongoUri.substring(0, 30) + '...' : 'MISSING');
  
  if (!mongoUri) {
    console.error('❌ No MongoDB URI found in environment variables');
    process.exit(1);
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
    
    await mongoose.connection.close();
    console.log('🔌 Connection closed successfully');
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    if (error.reason) {
      console.error('   Error reason:', error.reason);
    }
    process.exit(1);
  }
}

testMongoDB(); 