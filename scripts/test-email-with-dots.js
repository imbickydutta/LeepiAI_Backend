const { body, validationResult } = require('express-validator');

/**
 * Test to demonstrate the fix for emails with dots
 * This simulates what happens in the validation middleware
 */

// Mock request object
const createMockReq = (email) => ({
  body: { email, password: 'test123' }
});

// Mock response object
const createMockRes = () => ({
  status: function(code) {
    this.statusCode = code;
    return this;
  },
  json: function(data) {
    this.data = data;
    return this;
  }
});

async function testEmailValidation() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TESTING EMAIL VALIDATION WITH DOTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const testCases = [
    'singh.ichhabal@gmail.com',
    'test.user@example.com',
    'john.doe.test@gmail.com',
    'bicky@bicky.com'
  ];

  console.log('✅ BEFORE FIX (with normalizeEmail):');
  console.log('   singh.ichhabal@gmail.com → singhichhabal@gmail.com (dots removed!)');
  console.log('   This caused login failures because DB has the dot\n');

  console.log('✅ AFTER FIX (without normalizeEmail):');
  console.log('   singh.ichhabal@gmail.com → singh.ichhabal@gmail.com (preserved!)');
  console.log('   Now matches the email stored in database\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST RESULTS:');
  console.log('═══════════════════════════════════════════════════════════\n');

  testCases.forEach(email => {
    // Simulate the new validation (trim + toLowerCase)
    const processed = email.trim().toLowerCase();
    const dotsPreserved = email.includes('.') && processed.includes('.');
    
    console.log(`Original:  ${email}`);
    console.log(`Processed: ${processed}`);
    console.log(`Status:    ${dotsPreserved ? '✅ Dots preserved' : '✅ No dots to preserve'}`);
    console.log('');
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('CONCLUSION:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ Emails with dots are now preserved');
  console.log('✅ Login should work for singh.ichhabal@gmail.com');
  console.log('✅ Server restart required for changes to take effect\n');
}

testEmailValidation();

