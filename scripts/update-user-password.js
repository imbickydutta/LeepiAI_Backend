require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

/**
 * Update User Password Script
 * Usage: node scripts/update-user-password.js <email> <new-password>
 */

async function updateUserPassword(email, newPassword) {
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
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log('❌ USER NOT FOUND');
      console.log(`   Email: ${email}\n`);
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('✅ USER FOUND');
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.userName}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}\n`);

    // Update password (will be automatically hashed by pre-save hook)
    user.password = newPassword;
    await user.save();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ PASSWORD UPDATED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`User:          ${user.userName || user.email}`);
    console.log(`Email:         ${user.email}`);
    console.log(`New Password:  ${newPassword}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('ℹ️  Note: The password has been securely hashed in the database.\n');

    await mongoose.connection.close();
    console.log('✅ Database connection closed\n');
    
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
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('❌ Error: Please provide both email and new password');
  console.log('\nUsage:');
  console.log('  node scripts/update-user-password.js <email> <new-password>');
  console.log('\nExample:');
  console.log('  node scripts/update-user-password.js user@example.com "NewPassword123"');
  console.log('\nNote: Use quotes around password if it contains special characters\n');
  process.exit(1);
}

// Validate password length
if (newPassword.length < 6) {
  console.error('❌ Error: Password must be at least 6 characters long\n');
  process.exit(1);
}

updateUserPassword(email, newPassword);

