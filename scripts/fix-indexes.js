require('dotenv').config();
const mongoose = require('mongoose');

async function fixIndexes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.NODE_ENV === 'production' 
      ? process.env.MONGODB_URI_PROD 
      : process.env.MONGODB_URI;
    
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get database
    const db = mongoose.connection.db;
    
    // Collections to fix
    const collections = ['users', 'sessions', 'settings'];
    
    for (const collectionName of collections) {
      try {
        console.log(`\n🔧 Fixing indexes for ${collectionName}...`);
        
        const collection = db.collection(collectionName);
        
        // List current indexes
        const currentIndexes = await collection.indexes();
        console.log(`📋 Current indexes:`, currentIndexes.map(idx => ({ name: idx.name, key: idx.key })));
        
        // Drop all indexes except _id
        for (const index of currentIndexes) {
          if (index.name !== '_id_') {
            try {
              await collection.dropIndex(index.name);
              console.log(`❌ Dropped index: ${index.name}`);
            } catch (error) {
              console.warn(`⚠️ Could not drop index ${index.name}:`, error.message);
            }
          }
        }
        
        // Recreate indexes based on collection
        if (collectionName === 'users') {
          await collection.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
          await collection.createIndex({ id: 1 }, { unique: true, name: 'id_unique' });
          await collection.createIndex({ createdAt: -1 }, { name: 'createdAt_desc' });
          await collection.createIndex({ role: 1 }, { name: 'role_asc' });
          await collection.createIndex({ isActive: 1 }, { name: 'isActive_asc' });
          await collection.createIndex({ role: 1, isActive: 1 }, { name: 'role_isActive' });
          await collection.createIndex({ email: 1, isActive: 1 }, { name: 'email_isActive' });
          console.log('✅ Created users indexes');
        } else if (collectionName === 'sessions') {
          await collection.createIndex({ id: 1 }, { unique: true, name: 'id_unique' });
          await collection.createIndex({ token: 1 }, { unique: true, name: 'token_unique' });
          await collection.createIndex({ refreshToken: 1 }, { unique: true, name: 'refreshToken_unique' });
          await collection.createIndex({ userId: 1 }, { name: 'userId_asc' });
          await collection.createIndex({ expiresAt: 1 }, { name: 'expiresAt_asc' });
          await collection.createIndex({ isActive: 1 }, { name: 'isActive_asc' });
          await collection.createIndex({ userId: 1, isActive: 1 }, { name: 'userId_isActive' });
          await collection.createIndex({ expiresAt: 1, isActive: 1 }, { name: 'expiresAt_isActive' });
          // TTL index for automatic cleanup
          await collection.createIndex({ refreshExpiresAt: 1 }, { expireAfterSeconds: 0, name: 'refreshExpiresAt_ttl' });
          console.log('✅ Created sessions indexes');
        } else if (collectionName === 'settings') {
          await collection.createIndex({ key: 1 }, { unique: true, name: 'key_unique' });
          await collection.createIndex({ category: 1 }, { name: 'category_asc' });
          await collection.createIndex({ updatedAt: -1 }, { name: 'updatedAt_desc' });
          console.log('✅ Created settings indexes');
        }
        
        // List new indexes
        const newIndexes = await collection.indexes();
        console.log(`📋 New indexes:`, newIndexes.map(idx => ({ name: idx.name, key: idx.key })));
        
      } catch (error) {
        console.error(`❌ Error fixing ${collectionName} indexes:`, error.message);
      }
    }
    
    console.log('\n✅ Index fixing complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
fixIndexes(); 