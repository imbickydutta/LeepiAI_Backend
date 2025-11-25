# 📊 Advanced Statistics - Quick Reference

## Endpoint

```
GET /api/activity-logs/advanced-statistics
```

## Authorization
- **Required:** Admin role
- **Header:** `Authorization: Bearer YOUR_JWT_TOKEN`

## Query Parameters

| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| `startDate` | ISO 8601 | No | `2025-01-01T00:00:00Z` |
| `endDate` | ISO 8601 | No | `2025-12-31T23:59:59Z` |

## Response Structure

```json
{
  "success": true,
  "data": {
    "dateRange": {
      "startDate": "ISO date or null",
      "endDate": "ISO date or null"
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
    "startDate": "ISO date or null",
    "endDate": "ISO date or null"
  }
}
```

## Quick Examples

### curl
```bash
# Last 30 days (default)
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/activity-logs/advanced-statistics

# Specific date range
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/activity-logs/advanced-statistics?startDate=2025-01-01T00:00:00Z&endDate=2025-01-31T23:59:59Z"
```

### JavaScript/TypeScript
```javascript
const getStats = async (startDate, endDate) => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  
  const response = await fetch(
    `/api/activity-logs/advanced-statistics?${params}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  return await response.json();
};
```

### Test Script
```bash
# Last 30 days
node scripts/test-advanced-stats.js

# Specific range
node scripts/test-advanced-stats.js 2025-01-01 2025-12-31
```

## Common Patterns

### Last 7 Days
```javascript
const last7Days = {
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString()
};
```

### Current Month
```javascript
const now = new Date();
const currentMonth = {
  startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
  endDate: now.toISOString()
};
```

### Last Month
```javascript
const now = new Date();
const lastMonth = {
  startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
  endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
};
```

## Metrics Explained

### Login Metrics
- **uniqueUsersTriedLogin** - How many users attempted to log in
- **uniqueUsersSuccessfulLogin** - How many successfully logged in at least once
- **uniqueUsersFailedOnly** - How many never succeeded (red flag!)
- **successRate** - Overall login success percentage

### Transcript Metrics
- **uniqueUsersGeneratedTranscripts** - How many users created transcripts
- **trialTranscripts** - Transcripts < 5 minutes (300,000ms)
- **actualTranscripts** - Transcripts ≥ 5 minutes (300,000ms)

## Key Formulas

```javascript
// User Conversion Rate
const conversionRate = 
  (uniqueUsersSuccessfulLogin / uniqueUsersTriedLogin) * 100;

// Feature Adoption Rate
const adoptionRate = 
  (uniqueUsersGeneratedTranscripts / uniqueUsersSuccessfulLogin) * 100;

// Average Transcripts Per User
const avgTranscripts = 
  totalTranscripts / uniqueUsersGeneratedTranscripts;

// Trial vs Paid Ratio
const trialRatio = 
  trialTranscripts / (trialTranscripts + actualTranscripts);
```

## Health Thresholds

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Login Success Rate | > 95% | 90-95% | < 90% |
| User Conversion | > 90% | 80-90% | < 80% |
| Feature Adoption | > 60% | 40-60% | < 40% |
| Actual Transcript % | > 70% | 50-70% | < 50% |

## Error Handling

```javascript
try {
  const stats = await getStats(startDate, endDate);
  
  if (!stats.success) {
    console.error('Failed to fetch stats:', stats.error);
    return;
  }
  
  // Use stats.data
} catch (error) {
  console.error('Network error:', error);
}
```

## Documentation Links

- **Full Guide:** `ADVANCED_STATISTICS_GUIDE.md`
- **Frontend Examples:** `FRONTEND_ACTIVITY_LOGS_API.md` (Section 3)
- **Implementation Summary:** `STATISTICS_IMPLEMENTATION_SUMMARY.md`
- **Test Script:** `scripts/test-advanced-stats.js`

## Support

**Issue?** Run the test script first:
```bash
node scripts/test-advanced-stats.js
```

**Need help?** Check these files:
- Backend: `/src/models/ActivityLog.js` (line 227)
- Service: `/src/services/ActivityLogService.js` (line 288)
- Route: `/src/routes/activityLogs.js` (line 132)

---

**Quick Access:** Bookmark this page for instant reference!

