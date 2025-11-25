# Advanced Activity Statistics Guide

## 📊 Overview

The Advanced Statistics API provides comprehensive insights into user behavior, login patterns, and transcript generation metrics. This feature extends the basic activity logging system with detailed analytics that can be filtered by date range.

## 🎯 Key Metrics

### Login Metrics

1. **Unique Users Tried Login** - Total number of distinct users who attempted to log in (successful or failed)
2. **Unique Users Successful Login** - Number of distinct users who successfully logged in at least once
3. **Unique Users Failed Only** - Number of distinct users who tried to log in but never succeeded
4. **Total Login Attempts** - Total count of all login attempts
5. **Total Successful Logins** - Total count of successful logins
6. **Total Failed Logins** - Total count of failed login attempts
7. **Success Rate** - Percentage of successful logins

### Transcript Metrics

1. **Unique Users Generated Transcripts** - Number of distinct users who successfully generated at least one transcript
2. **Total Transcripts** - Total number of transcripts generated
3. **Trial Transcripts** - Transcripts with duration < 5 minutes (300,000 milliseconds)
4. **Actual Transcripts** - Transcripts with duration ≥ 5 minutes (300,000 milliseconds)
5. **Transcripts Without Duration** - Transcripts missing duration information
6. **Trial Percentage** - Percentage of trial transcripts
7. **Actual Percentage** - Percentage of actual transcripts

## 🚀 API Endpoint

### GET /api/activity-logs/advanced-statistics

**Authentication:** Required (Admin only)

**Query Parameters:**
- `startDate` (optional): Start date in ISO 8601 format (e.g., `2025-01-01T00:00:00Z`)
- `endDate` (optional): End date in ISO 8601 format (e.g., `2025-12-31T23:59:59Z`)

**Example Request:**

```bash
curl -X GET \
  'https://your-api.com/api/activity-logs/advanced-statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-12-31T23:59:59Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "dateRange": {
      "startDate": "2025-01-01T00:00:00.000Z",
      "endDate": "2025-12-31T23:59:59.999Z"
    },
    "loginMetrics": {
      "uniqueUsersTriedLogin": 245,
      "uniqueUsersSuccessfulLogin": 230,
      "uniqueUsersFailedOnly": 15,
      "totalLoginAttempts": 1820,
      "totalSuccessfulLogins": 1765,
      "totalFailedLogins": 55,
      "successRate": "97.02%"
    },
    "transcriptMetrics": {
      "uniqueUsersGeneratedTranscripts": 180,
      "totalTranscripts": 542,
      "trialTranscripts": 123,
      "actualTranscripts": 398,
      "transcriptsWithoutDuration": 21,
      "trialPercentage": "22.69%",
      "actualPercentage": "73.43%"
    }
  },
  "filters": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.999Z"
  }
}
```

## 🧪 Testing

### Manual Testing with curl

```bash
# Test with last 30 days (no date range)
curl -X GET \
  'http://localhost:3000/api/activity-logs/advanced-statistics' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# Test with specific date range
curl -X GET \
  'http://localhost:3000/api/activity-logs/advanced-statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Testing with Node.js Script

Run the provided test script:

```bash
# Test with last 30 days
node scripts/test-advanced-stats.js

# Test with specific date range
node scripts/test-advanced-stats.js 2025-01-01 2025-12-31
```

## 💡 Use Cases

### 1. Monthly Performance Report

Track monthly user engagement and system usage:

```javascript
const getMonthlyReport = async (year, month) => {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
  
  const response = await fetch(
    `/api/activity-logs/advanced-statistics?startDate=${startDate}&endDate=${endDate}`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  return await response.json();
};

// Get January 2025 report
const report = await getMonthlyReport(2025, 1);
```

### 2. User Acquisition Analysis

Track new user signup and engagement:

```javascript
const analyzeUserAcquisition = async (startDate, endDate) => {
  const stats = await fetchAdvancedStatistics({ startDate, endDate });
  
  const acquisitionRate = (
    stats.data.loginMetrics.uniqueUsersSuccessfulLogin /
    stats.data.loginMetrics.uniqueUsersTriedLogin
  ) * 100;
  
  const engagementRate = (
    stats.data.transcriptMetrics.uniqueUsersGeneratedTranscripts /
    stats.data.loginMetrics.uniqueUsersSuccessfulLogin
  ) * 100;
  
  return {
    acquisitionRate: `${acquisitionRate.toFixed(2)}%`,
    engagementRate: `${engagementRate.toFixed(2)}%`,
    avgTranscriptsPerUser: (
      stats.data.transcriptMetrics.totalTranscripts /
      stats.data.transcriptMetrics.uniqueUsersGeneratedTranscripts
    ).toFixed(2)
  };
};
```

### 3. Trial vs Paid User Analysis

Determine usage patterns between trial and actual interviews:

```javascript
const analyzeUsagePatterns = async (dateRange) => {
  const stats = await fetchAdvancedStatistics(dateRange);
  
  const trialCount = stats.data.transcriptMetrics.trialTranscripts;
  const actualCount = stats.data.transcriptMetrics.actualTranscripts;
  
  return {
    prefersTrial: trialCount > actualCount,
    engagementLevel: actualCount / (trialCount + actualCount),
    recommendation: actualCount > trialCount * 2 
      ? 'High engagement - users are creating full interviews'
      : 'Low engagement - users prefer quick trials'
  };
};
```

### 4. System Health Monitoring

Monitor authentication issues and system performance:

```javascript
const monitorSystemHealth = async () => {
  const last7Days = {
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString()
  };
  
  const stats = await fetchAdvancedStatistics(last7Days);
  
  // Alert if more than 5% of users can't log in
  const failureRate = (
    stats.data.loginMetrics.uniqueUsersFailedOnly /
    stats.data.loginMetrics.uniqueUsersTriedLogin
  ) * 100;
  
  if (failureRate > 5) {
    console.warn(`⚠️ High login failure rate: ${failureRate.toFixed(2)}%`);
    // Send alert to monitoring system
  }
  
  // Alert if login success rate is below 95%
  const successRate = parseFloat(stats.data.loginMetrics.successRate);
  if (successRate < 95) {
    console.warn(`⚠️ Login success rate below threshold: ${successRate}%`);
  }
  
  return {
    healthy: failureRate < 5 && successRate >= 95,
    metrics: stats.data
  };
};
```

## 🔧 Implementation Details

### Database Aggregation

The advanced statistics endpoint uses MongoDB aggregation pipelines for efficient data processing:

1. **Login Statistics Pipeline:**
   - Matches all LOGIN and LOGIN_FAILED action types
   - Groups by userId to count unique users
   - Separates successful and failed login attempts
   - Calculates success rates

2. **Transcript Statistics Pipeline:**
   - Matches all TRANSCRIPT_GENERATED action types
   - Groups by userId for unique user counts
   - Uses `$facet` to run parallel aggregations
   - Categorizes transcripts by duration (< 5 min vs ≥ 5 min)
   - Handles null/missing duration values

### Performance Considerations

- **Indexes:** The ActivityLog model has compound indexes on:
  - `{ userId: 1, actionType: 1, createdAt: -1 }`
  - `{ actionType: 1, createdAt: -1 }`
  - `{ success: 1, createdAt: -1 }`

- **Query Optimization:** 
  - Date range queries use indexed `createdAt` field
  - Aggregation uses `$match` early in pipeline for efficiency
  - `$facet` enables parallel processing of transcript metrics

- **Response Time:** 
  - Expected: < 500ms for datasets up to 100K logs
  - For larger datasets, consider implementing caching

## 🎨 Frontend Integration

See the [Frontend Activity Logs API Guide](./FRONTEND_ACTIVITY_LOGS_API.md) for complete React examples, including:

1. Advanced Statistics Dashboard component
2. Date range selector with presets
3. Metric cards with visual indicators
4. Progress bars for transcript distribution
5. CSS styling for a modern UI

## 📈 Dashboard Metrics Reference

### Key Performance Indicators (KPIs)

| Metric | Formula | Target | Action if Below Target |
|--------|---------|--------|------------------------|
| Login Success Rate | (Successful Logins / Total Attempts) × 100 | > 95% | Investigate auth issues |
| User Acquisition Rate | (Successful Users / Tried Users) × 100 | > 90% | Review onboarding flow |
| Engagement Rate | (Transcript Users / Logged In Users) × 100 | > 60% | Improve feature discovery |
| Actual Interview Rate | (Actual / Total Transcripts) × 100 | > 70% | Users finding value |

## 🛠️ Troubleshooting

### Issue: All metrics showing 0

**Cause:** No activity logs in the database for the selected date range

**Solution:**
1. Check if activity logging is enabled
2. Verify date range includes actual user activity
3. Ensure ActivityLog model is properly saving logs

### Issue: Transcripts without duration

**Cause:** Duration field not being set during transcript generation

**Solution:**
1. Check ActivityLogService.logTranscriptGeneration() implementation
2. Ensure duration is passed when logging transcript activities
3. Update existing logs if needed

### Issue: Performance degradation

**Cause:** Large dataset without proper indexing

**Solution:**
1. Run `node scripts/create-indexes.js` to ensure indexes are created
2. Consider implementing Redis caching for frequently accessed stats
3. Implement date range limits (e.g., max 1 year)

## 🔐 Security Considerations

1. **Authentication:** All endpoints require valid JWT token
2. **Authorization:** Only admin users can access statistics
3. **Rate Limiting:** Consider implementing rate limits for admin endpoints
4. **Data Privacy:** Ensure compliance with data protection regulations
5. **Audit Trail:** All statistics requests are logged for audit purposes

## 📝 Maintenance

### Regular Tasks

1. **Weekly:** Review system health metrics
2. **Monthly:** Generate performance reports
3. **Quarterly:** Analyze user engagement trends
4. **Annually:** Review and optimize database indexes

### Monitoring Alerts

Set up alerts for:
- Login success rate < 95%
- User failure rate > 5%
- Transcript generation errors > 2%
- Response time > 1 second

## 🚀 Future Enhancements

Potential additions to the statistics system:

1. **Real-time Statistics:** WebSocket-based live updates
2. **Export Functionality:** CSV/PDF report generation
3. **Custom Metrics:** User-defined metric calculations
4. **Comparative Analysis:** Week-over-week, month-over-month
5. **Predictive Analytics:** ML-based trend predictions
6. **Cohort Analysis:** Track user behavior by signup date
7. **A/B Testing Support:** Compare metrics across user segments

## 📞 Support

For questions or issues:
- Backend Team: Check the implementation in `/src/models/ActivityLog.js`
- Frontend Team: See examples in `FRONTEND_ACTIVITY_LOGS_API.md`
- Database Issues: Run test script `node scripts/test-advanced-stats.js`

---

Last Updated: November 25, 2025
Version: 1.0.0

