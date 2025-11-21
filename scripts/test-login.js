require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

/**
 * Test Login Credentials
 * Usage: node scripts/test-login.js <email> <password>
 */

async function testLogin(email, password) {
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

    console.log('✅ Connected to database\n');

    // Find user by email
    console.log(`🔍 Looking for user: ${email}`);
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('\n❌ LOGIN FAILED');
      console.log('   Reason: User not found with this email\n');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('✅ User found\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('USER DETAILS:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Email:        ${user.email}`);
    console.log(`Username:     ${user.userName || '❌ NOT SET'}`);
    console.log(`Name:         ${user.firstName} ${user.lastName}`);
    console.log(`Role:         ${user.role}`);
    console.log(`Active:       ${user.isActive ? '✅ Yes' : '❌ No'}`);
    console.log(`User ID:      ${user.id}`);
    console.log(`Password Hash: ${user.password ? user.password.substring(0, 30) + '...' : '❌ NO PASSWORD'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check if user is active
    if (!user.isActive) {
      console.log('❌ LOGIN FAILED');
      console.log('   Reason: User account is inactive\n');
      await mongoose.connection.close();
      process.exit(1);
    }

    // Check if password exists
    if (!user.password) {
      console.log('❌ LOGIN FAILED');
      console.log('   Reason: User has no password set in database\n');
      await mongoose.connection.close();
      process.exit(1);
    }

    // Test password
    console.log('🔐 Testing password...');
    console.log(`   Provided password: "${password}"`);
    
    const isPasswordValid = await user.comparePassword(password);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    if (isPasswordValid) {
      console.log('✅ LOGIN TEST SUCCESSFUL');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('The credentials are CORRECT!');
      console.log(`Email:    ${user.email}`);
      console.log(`Password: ${password}`);
      console.log('\nThe user should be able to login with these credentials.');
      console.log('If login still fails, the issue might be:');
      console.log('  1. App version check (non-admin users need appVersion in request)');
      console.log('  2. Network/API issues');
      console.log('  3. Frontend not sending correct payload');
    } else {
      console.log('❌ LOGIN TEST FAILED');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('The password is INCORRECT!');
      console.log(`Email:    ${user.email}`);
      console.log(`Password: ${password}`);
      console.log('\nThe password does not match what\'s stored in the database.');
      console.log('Please update the password again or verify you\'re using the correct one.');
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(isPasswordValid ? 0 : 1);

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
const password = process.argv[3];

if (!email || !password) {
  console.error('❌ Error: Please provide both email and password');
  console.log('\nUsage:');
  console.log('  node scripts/test-login.js <email> <password>');
  console.log('\nExample:');
  console.log('  node scripts/test-login.js user@example.com "Password123"');
  console.log('\nNote: Use quotes around password if it contains special characters\n');
  process.exit(1);
}

testLogin(email, password);

