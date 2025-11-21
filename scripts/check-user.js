require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

/**
 * Check if a user exists in the database
 * Usage: node scripts/check-user.js <email>
 */

async function checkUser(email) {
  try {
    console.log('🔄 Connecting to database...');
    
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );

    console.log('✅ Connected to database');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('\n❌ USER NOT FOUND');
      console.log(`   Email: ${email}`);
      console.log(`   Status: User does not exist in database\n`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // User found - display details
    console.log('\n✅ USER FOUND');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Email:          ${user.email}`);
    console.log(`Username:       ${user.userName || '❌ NOT SET'}`);
    console.log(`First Name:     ${user.firstName}`);
    console.log(`Last Name:      ${user.lastName}`);
    console.log(`Phone No:       ${user.phoneNo || '❌ NOT SET'}`);
    console.log(`Role:           ${user.role}`);
    console.log(`Status:         ${user.isActive ? '✅ Active' : '❌ Inactive'}`);
    console.log(`User ID:        ${user.id}`);
    console.log(`Created:        ${user.createdAt}`);
    console.log(`Last Login:     ${user.lastLoginAt || 'Never'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check what's missing
    const missing = [];
    if (!user.userName) missing.push('Username');
    if (!user.phoneNo) missing.push('Phone Number');
    
    if (missing.length > 0) {
      console.log('⚠️  Missing Fields: ' + missing.join(', '));
      console.log('   This user needs to be updated!\n');
    } else {
      console.log('✅ All fields are set!\n');
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

// Main execution
const email = process.argv[2];

if (!email) {
  console.error('❌ Error: Please provide an email address');
  console.log('\nUsage:');
  console.log('  node scripts/check-user.js <email>');
  console.log('\nExample:');
  console.log('  node scripts/check-user.js singh.ichhabal@gmail.com');
  process.exit(1);
}

checkUser(email);

