require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Bulk User Creation Script
 * 
 * CSV Format:
 * Username,Name,Phone No,Email,Password
 * 
 * Example:
 * johndoe,John Doe,+1234567890,john@example.com,password123
 * 
 * Usage:
 * node scripts/bulk-create-users.js <path-to-csv-file>
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

function parseName(fullName) {
  const nameParts = fullName.trim().split(/\s+/);
  
  if (nameParts.length === 1) {
    return {
      firstName: nameParts[0],
      lastName: nameParts[0]
    };
  }
  
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ')
  };
}

async function bulkCreateUsers(csvFilePath) {
  let connection;
  
  try {
    // Check if file exists
    if (!fs.existsSync(csvFilePath)) {
      logger.error(`❌ CSV file not found: ${csvFilePath}`);
      process.exit(1);
    }

    logger.info('📄 Reading CSV file...');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      logger.error('❌ CSV file is empty or contains only headers');
      process.exit(1);
    }

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

    // Parse CSV
    const headers = parseCSVLine(lines[0].toLowerCase());
    logger.info(`📋 CSV Headers: ${headers.join(', ')}`);

    // Find column indexes
    const usernameIdx = headers.findIndex(h => h.includes('username') || h.includes('user name'));
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname');
    const phoneIdx = headers.findIndex(h => h.includes('phone'));
    const emailIdx = headers.findIndex(h => h.includes('email'));
    const passwordIdx = headers.findIndex(h => h.includes('password'));

    if (usernameIdx === -1 || nameIdx === -1 || emailIdx === -1 || passwordIdx === -1) {
      logger.error('❌ CSV must contain Username, Name, Email, and Password columns');
      logger.info(`Found indexes: Username=${usernameIdx}, Name=${nameIdx}, Phone=${phoneIdx}, Email=${emailIdx}, Password=${passwordIdx}`);
      process.exit(1);
    }

    // Process users
    const users = [];
    const errors = [];
    let successCount = 0;
    let skipCount = 0;

    logger.info(`\n🔄 Processing ${lines.length - 1} users...\n`);

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        
        if (values.length < headers.length) {
          logger.warn(`⚠️  Line ${i + 1}: Incomplete data, skipping`);
          skipCount++;
          continue;
        }

        const userName = values[usernameIdx];
        const fullName = values[nameIdx];
        const phoneNo = phoneIdx !== -1 ? values[phoneIdx] : '';
        const email = values[emailIdx];
        const password = values[passwordIdx];

        if (!userName || !fullName || !email || !password) {
          logger.warn(`⚠️  Line ${i + 1}: Missing required fields, skipping`);
          skipCount++;
          continue;
        }

        const { firstName, lastName } = parseName(fullName);

        // Check if user already exists
        const existingUser = await User.findOne({
          $or: [
            { userName: userName },
            { email: email.toLowerCase() }
          ]
        });

        if (existingUser) {
          logger.warn(`⚠️  Line ${i + 1}: User already exists (${userName} or ${email}), skipping`);
          skipCount++;
          continue;
        }

        // Create user
        const user = new User({
          userName,
          email: email.toLowerCase(),
          password,
          firstName,
          lastName,
          phoneNo: phoneNo || undefined,
          role: 'user',
          isActive: true
        });

        await user.save();
        successCount++;
        logger.info(`✅ Line ${i + 1}: Created user ${userName} (${email})`);

      } catch (error) {
        errors.push({
          line: i + 1,
          error: error.message
        });
        logger.error(`❌ Line ${i + 1}: ${error.message}`);
      }
    }

    // Summary
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 BULK USER CREATION SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`✅ Successfully created: ${successCount} users`);
    logger.info(`⚠️  Skipped: ${skipCount} users`);
    logger.info(`❌ Errors: ${errors.length} users`);
    logger.info('='.repeat(60) + '\n');

    if (errors.length > 0) {
      logger.info('Error details:');
      errors.forEach(err => {
        logger.error(`  Line ${err.line}: ${err.error}`);
      });
    }

  } catch (error) {
    logger.error('❌ Failed to create users:', error);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('🔌 Disconnected from database');
    }
    process.exit(0);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n📖 Usage: node scripts/bulk-create-users.js <path-to-csv-file>\n');
  console.log('CSV Format:');
  console.log('Username,Name,Phone No,Email,Password\n');
  console.log('Example:');
  console.log('johndoe,John Doe,+1234567890,john@example.com,password123');
  console.log('janedoe,Jane Doe,+0987654321,jane@example.com,password456\n');
  process.exit(0);
}

const csvFilePath = path.resolve(args[0]);
bulkCreateUsers(csvFilePath);

