require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function compareUsers() {
  try {
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );

    const user1 = await User.findOne({ email: 'singh.ichhabal@gmail.com' });
    const user2 = await User.findOne({ email: 'bicky@bicky.com' });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('WORKING USER (bicky@bicky.com):');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Email:         "${user2.email}" (length: ${user2.email.length})`);
    console.log(`Username:      "${user2.userName}" (length: ${user2.userName.length})`);
    console.log(`Password Hash: ${user2.password.substring(0, 20)}...`);
    console.log(`Role:          ${user2.role}`);
    console.log(`Active:        ${user2.isActive}`);
    console.log(`Has Password:  ${!!user2.password}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('NOT WORKING USER (singh.ichhabal@gmail.com):');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Email:         "${user1.email}" (length: ${user1.email.length})`);
    console.log(`Username:      "${user1.userName}" (length: ${user1.userName.length})`);
    console.log(`Password Hash: ${user1.password.substring(0, 20)}...`);
    console.log(`Role:          ${user1.role}`);
    console.log(`Active:        ${user1.isActive}`);
    console.log(`Has Password:  ${!!user1.password}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('BYTE-BY-BYTE ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Check for hidden characters in email
    console.log('\nEmail bytes (singh.ichhabal@gmail.com):');
    for (let i = 0; i < user1.email.length; i++) {
      const char = user1.email[i];
      const code = user1.email.charCodeAt(i);
      if (code < 32 || code > 126) {
        console.log(`  ⚠️  Position ${i}: '${char}' (code: ${code}) - SUSPICIOUS!`);
      }
    }
    
    // Check for hidden characters in username
    console.log('\nUsername bytes (iitmcs_2406148):');
    for (let i = 0; i < user1.userName.length; i++) {
      const char = user1.userName[i];
      const code = user1.userName.charCodeAt(i);
      if (code < 32 || code > 126) {
        console.log(`  ⚠️  Position ${i}: '${char}' (code: ${code}) - SUSPICIOUS!`);
      }
    }
    
    console.log('\n✅ No suspicious characters found\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('LOGIN CREDENTIALS TO SHARE:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Email:    singh.ichhabal@gmail.com');
    console.log('Password: Ich@8427025033');
    console.log('\n⚠️  IMPORTANT: Tell user to type EXACTLY as shown above!');
    console.log('   - Email must be all lowercase');
    console.log('   - Password is case-sensitive: "Ich" has capital I');
    console.log('   - No spaces before or after');
    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

compareUsers();

