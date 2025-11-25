/**
 * Test script for Advanced Statistics API
 * 
 * This script demonstrates how to use the advanced statistics endpoint
 * and verifies that it returns the expected data structure.
 * 
 * Usage:
 *   node scripts/test-advanced-stats.js [startDate] [endDate]
 * 
 * Example:
 *   node scripts/test-advanced-stats.js 2025-01-01 2025-12-31
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../src/models/ActivityLog');

async function testAdvancedStatistics() {
  try {
    // Parse command line arguments for date range
    const startDate = process.argv[2] 
      ? new Date(process.argv[2]).toISOString() 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const endDate = process.argv[3]
      ? new Date(process.argv[3]).toISOString()
      : new Date().toISOString();

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/leepiAI', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    console.log('📊 Fetching Advanced Statistics...');
    console.log(`Date Range: ${startDate} to ${endDate}\n`);

    const stats = await ActivityLog.getAdvancedStatistics({
      startDate,
      endDate
    });

    console.log('📈 RESULTS:\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔐 LOGIN METRICS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  👥 Unique Users Tried Login:          ${stats.loginMetrics.uniqueUsersTriedLogin}`);
    console.log(`  ✅ Unique Users Successful Login:     ${stats.loginMetrics.uniqueUsersSuccessfulLogin}`);
    console.log(`  ❌ Unique Users Failed Only:          ${stats.loginMetrics.uniqueUsersFailedOnly}`);
    console.log(`  📊 Total Login Attempts:              ${stats.loginMetrics.totalLoginAttempts}`);
    console.log(`  ✔️  Total Successful Logins:           ${stats.loginMetrics.totalSuccessfulLogins}`);
    console.log(`  ✖️  Total Failed Logins:               ${stats.loginMetrics.totalFailedLogins}`);
    console.log(`  📈 Success Rate:                      ${stats.loginMetrics.successRate}`);
    console.log('');
    
    // Display user details for failed only users
    if (stats.loginMetrics.users.failedOnlyUsers.length > 0) {
      console.log('  ⚠️  Users Who Failed All Login Attempts:');
      stats.loginMetrics.users.failedOnlyUsers.slice(0, 5).forEach(user => {
        console.log(`     • ${user.userEmail} (${user.userName || 'N/A'}) - ${user.failedAttempts} failed attempts`);
      });
      if (stats.loginMetrics.users.failedOnlyUsers.length > 5) {
        console.log(`     ... and ${stats.loginMetrics.users.failedOnlyUsers.length - 5} more`);
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📝 TRANSCRIPT METRICS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  👤 Unique Users Generated Transcripts: ${stats.transcriptMetrics.uniqueUsersGeneratedTranscripts}`);
    console.log(`  📄 Total Transcripts:                  ${stats.transcriptMetrics.totalTranscripts}`);
    console.log(`  ⏱️  Trial Transcripts (< 5 min):       ${stats.transcriptMetrics.trialTranscripts} (${stats.transcriptMetrics.trialPercentage})`);
    console.log(`  ⏰ Actual Transcripts (≥ 5 min):      ${stats.transcriptMetrics.actualTranscripts} (${stats.transcriptMetrics.actualPercentage})`);
    console.log(`  ℹ️  Without Duration Info:             ${stats.transcriptMetrics.transcriptsWithoutDuration}`);
    console.log('');
    
    // Display top transcript generating users
    if (stats.transcriptMetrics.users.length > 0) {
      console.log('  🌟 Top Transcript Generating Users:');
      stats.transcriptMetrics.users.slice(0, 5).forEach((user, index) => {
        console.log(`     ${index + 1}. ${user.userEmail} (${user.userName || 'N/A'}) - ${user.transcriptCount} transcripts`);
      });
      if (stats.transcriptMetrics.users.length > 5) {
        console.log(`     ... and ${stats.transcriptMetrics.users.length - 5} more users`);
      }
      console.log('');
    }
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Additional insights
    if (stats.loginMetrics.uniqueUsersTriedLogin > 0) {
      const conversionRate = (stats.loginMetrics.uniqueUsersSuccessfulLogin / stats.loginMetrics.uniqueUsersTriedLogin * 100).toFixed(2);
      console.log('💡 INSIGHTS:');
      console.log(`  • ${conversionRate}% of users who tried to login succeeded at least once`);
      
      if (stats.loginMetrics.uniqueUsersFailedOnly > 0) {
        const failureRate = (stats.loginMetrics.uniqueUsersFailedOnly / stats.loginMetrics.uniqueUsersTriedLogin * 100).toFixed(2);
        console.log(`  • ${failureRate}% of users never successfully logged in (potential issues)`);
      }
    }

    if (stats.transcriptMetrics.totalTranscripts > 0) {
      const avgTranscriptsPerUser = (stats.transcriptMetrics.totalTranscripts / stats.transcriptMetrics.uniqueUsersGeneratedTranscripts).toFixed(2);
      console.log(`  • Average transcripts per user: ${avgTranscriptsPerUser}`);
      
      if (stats.transcriptMetrics.actualTranscripts > stats.transcriptMetrics.trialTranscripts) {
        console.log(`  • Users are creating more actual interviews than trials (good engagement!)`);
      }
    }

    console.log('');
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the test
testAdvancedStatistics();

