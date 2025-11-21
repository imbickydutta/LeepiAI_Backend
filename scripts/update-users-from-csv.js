require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Update Users from CSV Script
 * 
 * This script updates users who are missing username/phoneNo/password
 * by matching their email with the CSV file and updating from CSV data
 * 
 * Updates:
 * - userName (from Username column)
 * - phoneNo (from Phone No column)
 * - password (from Password column - will be hashed automatically)
 * 
 * Usage:
 * node scripts/update-users-from-csv.js <path-to-csv-file>
 */

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Find column indexes
  const usernameIndex = headers.findIndex(h => h.toLowerCase().includes('username'));
  const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
  const phoneIndex = headers.findIndex(h => h.toLowerCase().includes('phone'));
  const passwordIndex = headers.findIndex(h => h.toLowerCase().includes('password'));
  
  if (usernameIndex === -1 || emailIndex === -1 || passwordIndex === -1) {
    throw new Error('CSV must contain Username, Email, and Password columns');
  }

  // Parse data rows
  const csvData = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    
    const email = values[emailIndex]?.toLowerCase().trim();
    const username = values[usernameIndex]?.trim();
    const phoneNo = phoneIndex !== -1 ? values[phoneIndex]?.trim() : '';
    const password = values[passwordIndex]?.trim();
    
    // Skip rows with missing required data
    if (!email || !username || !password || username === '' || email === '' || password === '' ||
        email.toLowerCase() === 'na' || username.toLowerCase() === 'na') {
      continue;
    }
    
    csvData.push({
      email,
      userName: username,
      phoneNo: (phoneNo && phoneNo !== '' && phoneNo.toLowerCase() !== 'na') ? phoneNo : null,
      password
    });
  }

  return csvData;
}

async function updateUsersFromCSV(csvFilePath) {
  try {
    logger.info('🔄 Starting user update process...');
    
    // Check if CSV file exists
    if (!fs.existsSync(csvFilePath)) {
      logger.error(`❌ CSV file not found: ${csvFilePath}`);
      process.exit(1);
    }

    // Read and parse CSV
    logger.info(`📄 Reading CSV file: ${csvFilePath}`);
    const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
    const csvData = parseCSV(csvContent);
    
    logger.info(`✅ Parsed ${csvData.length} valid entries from CSV`);

    // Create email to data mapping
    const emailToDataMap = new Map();
    csvData.forEach(entry => {
      emailToDataMap.set(entry.email, entry);
    });

    // Connect to MongoDB
    logger.info('🔄 Connecting to database...');
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

    // Find users without username
    logger.info('🔍 Finding users without username...');
    const usersWithoutUsername = await User.find({
      $or: [
        { userName: { $exists: false } },
        { userName: null },
        { userName: '' }
      ]
    });

    logger.info(`📊 Found ${usersWithoutUsername.length} users without username`);

    // Match and update users
    const updates = [];
    const matchedEmails = [];
    const unmatchedUsers = [];
    
    for (const user of usersWithoutUsername) {
      const userEmail = user.email.toLowerCase().trim();
      
      if (emailToDataMap.has(userEmail)) {
        const csvEntry = emailToDataMap.get(userEmail);
        matchedEmails.push(userEmail);
        
        updates.push({
          user,
          csvEntry
        });
      } else {
        unmatchedUsers.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        });
      }
    }

    logger.info(`\n📊 Match Summary:`);
    logger.info(`   ✅ Matched: ${updates.length} users`);
    logger.info(`   ❌ Unmatched: ${unmatchedUsers.length} users`);

    if (updates.length === 0) {
      logger.info('\n⚠️  No matching users found to update');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Perform updates
    logger.info(`\n🔄 Updating ${updates.length} users...`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const { user, csvEntry } of updates) {
      try {
        // Check if username already exists (duplicate check)
        const existingUser = await User.findOne({ 
          userName: csvEntry.userName,
          _id: { $ne: user._id }
        });
        
        if (existingUser) {
          logger.warn(`⚠️  Username "${csvEntry.userName}" already exists for ${existingUser.email}, skipping ${user.email}`);
          errorCount++;
          errors.push({
            email: user.email,
            error: `Username "${csvEntry.userName}" already taken`
          });
          continue;
        }

        // Update user
        user.userName = csvEntry.userName;
        if (csvEntry.phoneNo) {
          user.phoneNo = csvEntry.phoneNo;
        }
        user.password = csvEntry.password; // Will be auto-hashed by pre-save hook
        
        await user.save();
        
        successCount++;
        logger.info(`✅ Updated: ${user.email} → userName: ${csvEntry.userName}, password updated`);
        
      } catch (error) {
        errorCount++;
        errors.push({
          email: user.email,
          error: error.message
        });
        logger.error(`❌ Error updating ${user.email}: ${error.message}`);
      }
    }

    // Summary
    logger.info(`\n\n═══════════════════════════════════════════════════════════`);
    logger.info(`                    UPDATE SUMMARY                          `);
    logger.info(`═══════════════════════════════════════════════════════════`);
    logger.info(`✅ Successfully updated:  ${successCount} users`);
    logger.info(`❌ Errors:                ${errorCount} users`);
    logger.info(`⚠️  Unmatched in CSV:     ${unmatchedUsers.length} users`);
    logger.info(`═══════════════════════════════════════════════════════════\n`);

    // Save unmatched users report
    if (unmatchedUsers.length > 0) {
      const unmatchedCSV = [
        'Email,First Name,Last Name',
        ...unmatchedUsers.map(u => `${u.email},${u.firstName},${u.lastName}`)
      ].join('\n');
      
      const unmatchedFilePath = csvFilePath.replace('.csv', '-unmatched-users.csv');
      fs.writeFileSync(unmatchedFilePath, unmatchedCSV);
      logger.info(`📄 Unmatched users saved to: ${unmatchedFilePath}`);
    }

    // Save error report if any
    if (errors.length > 0) {
      const errorsCSV = [
        'Email,Error',
        ...errors.map(e => `${e.email},"${e.error}"`)
      ].join('\n');
      
      const errorsFilePath = csvFilePath.replace('.csv', '-update-errors.csv');
      fs.writeFileSync(errorsFilePath, errorsCSV);
      logger.info(`📄 Errors saved to: ${errorsFilePath}`);
    }

    // Close connection
    await mongoose.connection.close();
    logger.info('\n✅ Database connection closed');
    
    process.exit(0);

  } catch (error) {
    logger.error(`❌ Fatal error: ${error.message}`);
    console.error(error);
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
}

// Main execution
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('❌ Error: Please provide CSV file path');
  console.log('\nUsage:');
  console.log('  node scripts/update-users-from-csv.js <path-to-csv-file>');
  console.log('\nExample:');
  console.log('  node scripts/update-users-from-csv.js "scripts/LeepiAI - Roll Out Plan - Bicky.csv"');
  process.exit(1);
}

updateUsersFromCSV(csvFilePath);

