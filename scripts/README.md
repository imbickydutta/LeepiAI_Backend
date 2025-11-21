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

