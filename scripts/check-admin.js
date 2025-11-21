require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Check Admin User Script
 * 
 * This script checks if an admin user exists and shows their details
 * 
 * Usage:
 * node scripts/check-admin.js <email>
 */

async function checkAdmin(email) {
  try {
    logger.info('🔄 Connecting to database...');
    
    // Connect to MongoDB
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );

    logger.info('✅ Connected to database');

    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('\n❌ User not found with email:', email);
      console.log('\nTip: Make sure the email is correct and the user exists in the database.');
    } else {
      console.log('\n✅ User found!');
      console.log('\n📋 User Details:');
      console.log('  Username:', user.userName || 'Not set');
      console.log('  Email:', user.email);
      console.log('  Name:', `${user.firstName} ${user.lastName}`);
      console.log('  Role:', user.role);
      console.log('  Active:', user.isActive);
      console.log('  Phone:', user.phoneNo || 'Not set');
      console.log('  Created:', user.createdAt);
      console.log('  Last Login:', user.lastLoginAt || 'Never');
      
      if (!user.isActive) {
        console.log('\n⚠️  WARNING: This user account is INACTIVE! Set isActive=true to enable login.');
      }
      
      if (user.role !== 'admin') {
        console.log('\n⚠️  WARNING: This user is NOT an admin! Role is:', user.role);
      }
      
      console.log('\n✅ This user should be able to login!');
    }

  } catch (error) {
    logger.error('❌ Failed to check admin:', error);
    console.error('\nError:', error.message);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('🔌 Disconnected from database');
    }
    process.exit(0);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📖 Usage: node scripts/check-admin.js <email>\n');
  console.log('Example:');
  console.log('  node scripts/check-admin.js admin@admin.com\n');
  process.exit(0);
}

const email = args[0];
checkAdmin(email);

