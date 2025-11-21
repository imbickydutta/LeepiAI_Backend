require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

/**
 * Compare password hash formats between users
 */

async function compareHashes() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(
      process.env.NODE_ENV === 'production' 
        ? process.env.MONGODB_URI_PROD 
        : process.env.MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );
    console.log('✅ Connected to database\n');

    // Get the specific user
    const targetUser = await User.findOne({ email: 'singh.ichhabal@gmail.com' });
    
    // Get a few other users for comparison
    const otherUsers = await User.find({ 
      email: { $ne: 'singh.ichhabal@gmail.com' },
      password: { $exists: true }
    }).limit(3);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('TARGET USER (singh.ichhabal@gmail.com):');
    console.log('═══════════════════════════════════════════════════════════');
    if (targetUser) {
      console.log(`Email:         ${targetUser.email}`);
      console.log(`Username:      ${targetUser.userName}`);
      console.log(`Password Hash: ${targetUser.password}`);
      console.log(`Hash Length:   ${targetUser.password.length} characters`);
      console.log(`Hash Prefix:   ${targetUser.password.substring(0, 7)} (bcrypt format)`);
      console.log(`Created:       ${targetUser.createdAt}`);
      
      // Check if it's a bcrypt hash
      const isBcrypt = targetUser.password.startsWith('$2a$') || 
                       targetUser.password.startsWith('$2b$') || 
                       targetUser.password.startsWith('$2y$');
      console.log(`Is Bcrypt:     ${isBcrypt ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log('❌ Target user not found');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('COMPARISON USERS (for reference):');
    console.log('═══════════════════════════════════════════════════════════');
    
    otherUsers.forEach((user, index) => {
      console.log(`\nUser ${index + 1}:`);
      console.log(`  Email:         ${user.email}`);
      console.log(`  Username:      ${user.userName || 'N/A'}`);
      console.log(`  Password Hash: ${user.password}`);
      console.log(`  Hash Length:   ${user.password.length} characters`);
      console.log(`  Hash Prefix:   ${user.password.substring(0, 7)}`);
      
      const isBcrypt = user.password.startsWith('$2a$') || 
                       user.password.startsWith('$2b$') || 
                       user.password.startsWith('$2y$');
      console.log(`  Is Bcrypt:     ${isBcrypt ? '✅ YES' : '❌ NO'}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('HASH FORMAT ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════');
    
    if (targetUser) {
      const targetIsBcrypt = targetUser.password.startsWith('$2a$') || 
                             targetUser.password.startsWith('$2b$') || 
                             targetUser.password.startsWith('$2y$');
      
      const allUsersBcrypt = otherUsers.every(u => 
        u.password.startsWith('$2a$') || 
        u.password.startsWith('$2b$') || 
        u.password.startsWith('$2y$')
      );

      if (targetIsBcrypt && allUsersBcrypt) {
        console.log('✅ ALL PASSWORDS ARE PROPERLY HASHED WITH BCRYPT');
        console.log('   Target user password format matches other users.');
        console.log('   The password is ENCRYPTED/HASHED correctly.\n');
      } else if (!targetIsBcrypt) {
        console.log('❌ WARNING: Target user password is NOT properly hashed!');
        console.log('   This could be a plain text password or incorrect hash.\n');
      } else {
        console.log('⚠️  Some users have different hash formats.\n');
      }

      // Verify the hash structure
      const bcryptRegex = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
      if (bcryptRegex.test(targetUser.password)) {
        console.log('✅ Target user password hash structure is VALID');
        console.log('   Format: $2a$[cost]$[salt][hash]');
        console.log('   Length: 60 characters (standard bcrypt)\n');
      } else {
        console.log(`⚠️  Target user password hash structure may be non-standard`);
        console.log(`   Length: ${targetUser.password.length} characters\n`);
      }
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

compareHashes();

