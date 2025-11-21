require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

/**
 * Create a single user
 * Usage: node scripts/create-single-user.js <username> "<name>" <phone> <email> "<password>"
 */

async function createUser(userName, name, phoneNo, email, password) {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );
    console.log('✅ Connected to database\n');

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log('❌ USER ALREADY EXISTS');
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Username: ${existingUser.userName}`);
      console.log(`   Created: ${existingUser.createdAt}\n`);
      await mongoose.connection.close();
      process.exit(1);
    }

    // Split name into first and last name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;

    // Create user (password will be hashed automatically by the User model's pre-save hook)
    console.log('👤 Creating user...');
    const newUser = new User({
      userName: userName.trim(),
      firstName,
      lastName,
      phoneNo: phoneNo.trim(),
      email: email.toLowerCase().trim(),
      password: password, // Plain password - will be hashed by pre-save hook
      role: 'user',
      isActive: true
    });

    await newUser.save();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ USER CREATED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Username:      ${newUser.userName}`);
    console.log(`Name:          ${newUser.firstName} ${newUser.lastName}`);
    console.log(`Email:         ${newUser.email}`);
    console.log(`Phone:         ${newUser.phoneNo}`);
    console.log(`Password:      ${password} (hashed in DB)`);
    console.log(`Role:          ${newUser.role}`);
    console.log(`Active:        ${newUser.isActive}`);
    console.log(`User ID:       ${newUser.id}`);
    console.log(`Created:       ${newUser.createdAt}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating user:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key error - user with this email or username already exists');
    }
    console.error(error);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Main execution
const userName = process.argv[2];
const name = process.argv[3];
const phoneNo = process.argv[4];
const email = process.argv[5];
const password = process.argv[6];

if (!userName || !name || !phoneNo || !email || !password) {
  console.error('❌ Error: Please provide all required fields\n');
  console.log('Usage:');
  console.log('  node scripts/create-single-user.js <username> "<name>" <phone> <email> "<password>"\n');
  console.log('Example:');
  console.log('  node scripts/create-single-user.js john_doe "John Doe" 1234567890 john@example.com "Pass@123"\n');
  console.log('Note: Use quotes around name and password if they contain spaces or special characters\n');
  process.exit(1);
}

createUser(userName, name, phoneNo, email, password);

