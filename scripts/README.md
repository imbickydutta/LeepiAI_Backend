# Scripts

This directory contains utility scripts for managing the LeepiAI Backend.

## Available Scripts

### 1. Create Indexes (`create-indexes.js`)

Creates database indexes for all models.

```bash
node scripts/create-indexes.js
```

### 2. Fix Indexes (`fix-indexes.js`)

Fixes and rebuilds database indexes if needed.

```bash
node scripts/fix-indexes.js
```

### 3. Bulk Create Users (`bulk-create-users.js`)

**Temporary utility** for creating multiple users from a CSV file.

#### Usage

```bash
node scripts/bulk-create-users.js <path-to-csv-file>
```

#### CSV Format

The CSV file must contain the following columns (in any order):

- **Username** - Unique username for the user (3-30 characters)
- **Name** - Full name (will be split into firstName and lastName)
- **Phone No** - Phone number (optional)
- **Email** - User's email address (must be unique)
- **Password** - Plain text password (will be hashed automatically, minimum 6 characters)

#### Example CSV

```csv
Username,Name,Phone No,Email,Password
john_doe,John Doe,+1234567890,john.doe@example.com,password123
jane_smith,Jane Smith,+0987654321,jane.smith@example.com,securepass456
bob_wilson,Bob Wilson,,bob.wilson@example.com,mypass789
```

#### Sample File

A sample CSV file is provided: `sample-users.csv`

To test with the sample file:

```bash
node scripts/bulk-create-users.js scripts/sample-users.csv
```

#### Features

- ✅ Validates all required fields
- ✅ Checks for duplicate usernames and emails
- ✅ Automatically hashes passwords
- ✅ Handles names with multiple parts (e.g., "John Michael Doe")
- ✅ Optional phone number support
- ✅ Detailed logging and error reporting
- ✅ Summary report at the end

#### Notes

- The script will skip users that already exist (same username or email)
- All passwords are automatically hashed before storage using bcrypt
- The script connects to the database specified in your `.env` file
- Phone numbers are optional and can be left empty
- Names with spaces are automatically split into firstName and lastName

### 4. Test Advanced Statistics (`test-advanced-stats.js`)

Tests the advanced statistics API endpoint and displays comprehensive metrics about user activities.

#### Usage

```bash
# Test with last 30 days (default)
node scripts/test-advanced-stats.js

# Test with specific date range
node scripts/test-advanced-stats.js <start-date> <end-date>
```

#### Examples

```bash
# Last 30 days
node scripts/test-advanced-stats.js

# Specific month (January 2025)
node scripts/test-advanced-stats.js 2025-01-01 2025-01-31

# Entire year (2025)
node scripts/test-advanced-stats.js 2025-01-01 2025-12-31
```

#### What It Tests

The script verifies and displays:

**Login Metrics:**
- Unique users who tried to login
- Unique users who successfully logged in
- Unique users who failed all login attempts
- Total login attempts (all users)
- Success/failure counts and rates

**Transcript Metrics:**
- Unique users who generated transcripts
- Total transcripts generated
- Trial transcripts (< 5 minutes duration)
- Actual transcripts (≥ 5 minutes duration)
- Transcripts without duration information
- Percentage breakdown

**Additional Insights:**
- User conversion rates
- Average transcripts per user
- Engagement indicators

#### Sample Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

📊 Fetching Advanced Statistics...
Date Range: 2025-01-01T00:00:00.000Z to 2025-01-31T23:59:59.999Z

📈 RESULTS:

═══════════════════════════════════════════════════════
🔐 LOGIN METRICS
═══════════════════════════════════════════════════════
  👥 Unique Users Tried Login:          245
  ✅ Unique Users Successful Login:     230
  ❌ Unique Users Failed Only:          15
  📊 Total Login Attempts:              1820
  ✔️  Total Successful Logins:           1765
  ✖️  Total Failed Logins:               55
  📈 Success Rate:                      97.02%

═══════════════════════════════════════════════════════
📝 TRANSCRIPT METRICS
═══════════════════════════════════════════════════════
  👤 Unique Users Generated Transcripts: 180
  📄 Total Transcripts:                  542
  ⏱️  Trial Transcripts (< 5 min):       123 (22.69%)
  ⏰ Actual Transcripts (≥ 5 min):      398 (73.43%)
  ℹ️  Without Duration Info:             21
═══════════════════════════════════════════════════════

💡 INSIGHTS:
  • 93.88% of users who tried to login succeeded at least once
  • 6.12% of users never successfully logged in (potential issues)
  • Average transcripts per user: 3.01
  • Users are creating more actual interviews than trials (good engagement!)

✅ Test completed successfully!

🔌 Database connection closed
```

#### Use Cases

1. **Verify Implementation:** Test that the advanced statistics endpoint works correctly
2. **Monitor System Health:** Check login success rates and user engagement
3. **Generate Reports:** Get quick statistics for specific date ranges
4. **Debug Issues:** Investigate authentication or transcript generation problems

