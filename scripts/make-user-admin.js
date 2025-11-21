require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function makeUserAdmin(email) {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );
    console.log('✅ Connected to database\n');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ User not found\n');
      await mongoose.connection.close();
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log('✅ USER ROLE UPDATED TO ADMIN');
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.userName}`);
    console.log(`   Role: ${user.role}\n`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/make-user-admin.js <email>');
  process.exit(1);
}

makeUserAdmin(email);

