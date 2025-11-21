require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function quickTest(email, password) {
  try {
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log('❌ User not found');
      await mongoose.connection.close();
      process.exit(1);
    }

    const isValid = await user.comparePassword(password);
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`Testing: ${email}`);
    console.log(`Password: "${password}"`);
    console.log(`Result: ${isValid ? '✅ CORRECT' : '❌ WRONG'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(isValid ? 0 : 1);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

quickTest(process.argv[2], process.argv[3]);

