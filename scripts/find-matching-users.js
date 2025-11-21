const fs = require('fs');

/**
 * Find Matching Users Script
 * 
 * Finds common users between users-missing-both.csv and the main CSV
 * Creates a new CSV with only matched users and all required fields
 * 
 * Usage:
 * node scripts/find-matching-users.js
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

function escapeCSV(value) {
  if (value == null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function readCSV(filePath, description) {
  console.log(`\n📄 Reading ${description}: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    console.error(`❌ CSV file is empty: ${filePath}`);
    process.exit(1);
  }
  
  const headers = parseCSVLine(lines[0]);
  console.log(`   Headers: ${headers.join(', ')}`);
  console.log(`   Total rows: ${lines.length - 1}`);
  
  return { headers, lines };
}

function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           FIND MATCHING USERS BETWEEN CSVs                ');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Read users-missing-both.csv
  const missingFile = 'scripts/users-missing-both.csv';
  const { headers: missingHeaders, lines: missingLines } = readCSV(
    missingFile, 
    'users-missing-both.csv'
  );
  
  // Find email column in missing file
  const missingEmailIndex = missingHeaders.findIndex(h => 
    h.toLowerCase().includes('email')
  );
  
  if (missingEmailIndex === -1) {
    console.error('❌ Email column not found in users-missing-both.csv');
    process.exit(1);
  }
  
  // Extract emails from users-missing-both
  const missingEmails = new Set();
  for (let i = 1; i < missingLines.length; i++) {
    const values = parseCSVLine(missingLines[i]);
    const email = values[missingEmailIndex]?.toLowerCase().trim();
    if (email && email !== '') {
      missingEmails.add(email);
    }
  }
  
  console.log(`\n✅ Found ${missingEmails.size} unique emails in users-missing-both.csv`);
  
  // Read main CSV
  const mainFile = 'scripts/LeepiAI - Roll Out Plan - Bicky.csv';
  const { headers: mainHeaders, lines: mainLines } = readCSV(
    mainFile,
    'Main CSV (LeepiAI - Roll Out Plan - Bicky.csv)'
  );
  
  // Find column indexes in main CSV
  const usernameIndex = mainHeaders.findIndex(h => h.toLowerCase().includes('username'));
  const emailIndex = mainHeaders.findIndex(h => h.toLowerCase().includes('email'));
  const phoneIndex = mainHeaders.findIndex(h => h.toLowerCase().includes('phone'));
  const passwordIndex = mainHeaders.findIndex(h => h.toLowerCase().includes('password'));
  const nameIndex = mainHeaders.findIndex(h => h.toLowerCase() === 'name');
  
  if (usernameIndex === -1 || emailIndex === -1 || passwordIndex === -1) {
    console.error('❌ Required columns not found in main CSV');
    console.error(`   Username: ${usernameIndex}, Email: ${emailIndex}, Password: ${passwordIndex}`);
    process.exit(1);
  }
  
  console.log(`\n🔍 Searching for matching users...`);
  
  // Find matches
  const matchedUsers = [];
  const matchedEmails = [];
  
  for (let i = 1; i < mainLines.length; i++) {
    const values = parseCSVLine(mainLines[i]);
    const email = values[emailIndex]?.toLowerCase().trim();
    
    if (email && missingEmails.has(email)) {
      const username = values[usernameIndex]?.trim();
      const phoneNo = phoneIndex !== -1 ? values[phoneIndex]?.trim() : '';
      const password = values[passwordIndex]?.trim();
      const name = nameIndex !== -1 ? values[nameIndex]?.trim() : '';
      
      // Skip if missing critical data
      if (!username || !email || !password || 
          username === '' || email === '' || password === '' ||
          email.toLowerCase() === 'na' || username.toLowerCase() === 'na') {
        console.log(`   ⚠️  Skipping ${email} - missing critical data`);
        continue;
      }
      
      matchedUsers.push({
        username,
        name,
        phoneNo: (phoneNo && phoneNo !== '' && phoneNo.toLowerCase() !== 'na') ? phoneNo : '',
        email: values[emailIndex], // Keep original case
        password
      });
      
      matchedEmails.push(email);
      console.log(`   ✅ Matched: ${email} → ${username}`);
    }
  }
  
  // Find unmatched emails from missing file
  const unmatchedEmails = Array.from(missingEmails).filter(
    email => !matchedEmails.includes(email)
  );
  
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`                    MATCH SUMMARY                           `);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`📊 Users in users-missing-both.csv:  ${missingEmails.size}`);
  console.log(`✅ Matched users found:              ${matchedUsers.length}`);
  console.log(`❌ Unmatched users:                  ${unmatchedEmails.length}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  
  if (unmatchedEmails.length > 0) {
    console.log(`⚠️  Unmatched emails:`);
    unmatchedEmails.forEach(email => console.log(`   - ${email}`));
    console.log();
  }
  
  if (matchedUsers.length === 0) {
    console.log('❌ No matching users found. No CSV will be created.');
    process.exit(0);
  }
  
  // Create output CSV
  const outputFile = 'scripts/users-to-update.csv';
  const csvLines = [
    'Username,Name,Phone No,Email,Password',
    ...matchedUsers.map(user => 
      `${escapeCSV(user.username)},${escapeCSV(user.name)},${escapeCSV(user.phoneNo)},${escapeCSV(user.email)},${escapeCSV(user.password)}`
    )
  ];
  
  fs.writeFileSync(outputFile, csvLines.join('\n'));
  
  console.log(`✅ Created: ${outputFile}`);
  console.log(`   Contains ${matchedUsers.length} users ready for update\n`);
  
  console.log(`🚀 Next step: Run the update script with:`);
  console.log(`   node scripts/update-users-from-csv.js "${outputFile}"\n`);
  
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

// Run the script
try {
  main();
} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}

