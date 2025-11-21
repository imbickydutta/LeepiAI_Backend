require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Find Incomplete Users Script
 * 
 * Finds all users who are missing userName or phoneNo
 * and exports them to CSV files
 * 
 * Usage:
 * node scripts/find-incomplete-users.js
 */

function escapeCSV(value) {
  if (value == null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function userToCSV(user) {
  return [
    escapeCSV(user.userName || ''),
    escapeCSV(user.email || ''),
    escapeCSV(user.firstName || ''),
    escapeCSV(user.lastName || ''),
    escapeCSV(user.phoneNo || ''),
    escapeCSV(user.role || ''),
    escapeCSV(user.isActive ? 'Active' : 'Inactive'),
    escapeCSV(user.createdAt ? user.createdAt.toISOString().split('T')[0] : '')
  ].join(',');
}

async function findIncompleteUsers() {
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

    console.log('\n🔍 Searching for incomplete user profiles...\n');

    // Find users without userName
    const usersWithoutUsername = await User.find({
      $or: [
        { userName: { $exists: false } },
        { userName: null },
        { userName: '' }
      ]
    }).sort({ createdAt: -1 });

    // Find users without phoneNo
    const usersWithoutPhone = await User.find({
      $or: [
        { phoneNo: { $exists: false } },
        { phoneNo: null },
        { phoneNo: '' }
      ]
    }).sort({ createdAt: -1 });

    // Find users missing both
    const usersMissingBoth = await User.find({
      $and: [
        {
          $or: [
            { userName: { $exists: false } },
            { userName: null },
            { userName: '' }
          ]
        },
        {
          $or: [
            { phoneNo: { $exists: false } },
            { phoneNo: null },
            { phoneNo: '' }
          ]
        }
      ]
    }).sort({ createdAt: -1 });

    // Get total user count
    const totalUsers = await User.countDocuments();

    // Display summary
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users in database: ${totalUsers}`);
    console.log(`Users without username: ${usersWithoutUsername.length}`);
    console.log(`Users without phone number: ${usersWithoutPhone.length}`);
    console.log(`Users missing both: ${usersMissingBoth.length}`);
    console.log('='.repeat(60) + '\n');

    // CSV Header
    const csvHeader = 'Username,Email,First Name,Last Name,Phone No,Role,Status,Created Date';

    // Export users without username
    if (usersWithoutUsername.length > 0) {
      const csvContent = [csvHeader, ...usersWithoutUsername.map(userToCSV)].join('\n');
      fs.writeFileSync('scripts/users-without-username.csv', csvContent);
      console.log(`✅ Created: scripts/users-without-username.csv (${usersWithoutUsername.length} users)`);
    } else {
      console.log('✅ All users have usernames!');
    }

    // Export users without phone
    if (usersWithoutPhone.length > 0) {
      const csvContent = [csvHeader, ...usersWithoutPhone.map(userToCSV)].join('\n');
      fs.writeFileSync('scripts/users-without-phone.csv', csvContent);
      console.log(`✅ Created: scripts/users-without-phone.csv (${usersWithoutPhone.length} users)`);
    } else {
      console.log('✅ All users have phone numbers!');
    }

    // Export users missing both
    if (usersMissingBoth.length > 0) {
      const csvContent = [csvHeader, ...usersMissingBoth.map(userToCSV)].join('\n');
      fs.writeFileSync('scripts/users-missing-both.csv', csvContent);
      console.log(`✅ Created: scripts/users-missing-both.csv (${usersMissingBoth.length} users)`);
    } else {
      console.log('✅ No users missing both fields!');
    }

    // Show sample of incomplete profiles (first 10)
    if (usersMissingBoth.length > 0) {
      console.log('\n📋 Sample of users missing both username and phone (first 10):');
      console.log('─'.repeat(60));
      usersMissingBoth.slice(0, 10).forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.email}`);
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Created: ${user.createdAt.toISOString().split('T')[0]}`);
        console.log('');
      });
      
      if (usersMissingBoth.length > 10) {
        console.log(`... and ${usersMissingBoth.length - 10} more (see CSV file)`);
      }
    }

    console.log('\n✅ Export complete!\n');

  } catch (error) {
    logger.error('❌ Failed to find incomplete users:', error);
    console.error('\nError:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('🔌 Disconnected from database');
    }
    process.exit(0);
  }
}

findIncompleteUsers();

