# Activity Logging System - Complete Guide

## 📋 Overview

A comprehensive activity logging system has been implemented to track all user actions in the LeepiAI backend. This system allows administrators to monitor user activities, analyze usage patterns, and maintain audit trails.

## 🏗️ Architecture

### 1. **ActivityLog Model** (`src/models/ActivityLog.js`)
Stores all activity logs with the following fields:
- `userId`, `userEmail`, `userName` - User identification
- `actionType` - Type of action performed (enum)
- `description` - Human-readable description
- `metadata` - Additional contextual data (JSON)
- `ipAddress`, `userAgent` - Request information
- `success` - Whether the action succeeded
- `errorMessage` - Error details if action failed
- `duration` - Time taken (for operations like transcript generation)
- `resourceId`, `resourceType` - Related resource information
- `createdAt` - Automatic timestamp

**Supported Action Types:**
- `LOGIN` - Successful user login
- `LOGOUT` - User logout
- `LOGIN_FAILED` - Failed login attempt
- `TRANSCRIPT_GENERATED` - Transcript created
- `TRANSCRIPT_VIEWED` - Transcript accessed
- `TRANSCRIPT_DELETED` - Transcript removed
- `RECORDING_UPLOADED` - Audio recording uploaded
- `RECORDING_DELETED` - Recording removed
- `PROFILE_UPDATED` - User profile changes
- `PASSWORD_CHANGED` - Password modification
- `SETTINGS_UPDATED` - Settings changes
- `OTHER` - Miscellaneous actions

### 2. **ActivityLogService** (`src/services/ActivityLogService.js`)
Provides convenient methods for logging activities:
- `logLogin(user, req, success, errorMessage)` - Log login attempts
- `logLogout(user, req)` - Log logout
- `logTranscriptGeneration({...})` - Log transcript creation
- `logTranscriptView(user, transcriptId, req)` - Log transcript views
- `logTranscriptDeletion(user, transcriptId, req)` - Log deletions
- `logRecordingUpload({...})` - Log recording uploads
- `logProfileUpdate(user, updatedFields, req)` - Log profile changes
- `logPasswordChange(user, req)` - Log password changes
- `logSettingsUpdate(user, settingsType, req)` - Log settings changes
- `getLogs(filters)` - Retrieve logs with filters
- `getStatistics(filters)` - Get aggregated statistics
- `getUserActivitySummary(userId, days)` - Get user activity summary

### 3. **Admin API Routes** (`src/routes/activityLogs.js`)

All routes require authentication and admin role (except `/my-activity`).

#### **GET `/api/activity-logs`**
Retrieve activity logs with filters.

**Query Parameters:**
- `userId` (optional) - Filter by user ID
- `actionType` (optional) - Filter by action type
- `startDate` (optional) - Start date (ISO 8601 format)
- `endDate` (optional) - End date (ISO 8601 format)
- `success` (optional) - Filter by success status (true/false)
- `page` (default: 1) - Page number
- `limit` (default: 50, max: 100) - Items per page
- `sortBy` (default: createdAt) - Sort field
- `sortOrder` (default: desc) - Sort order (asc/desc)

**Example Request:**
```bash
GET /api/activity-logs?actionType=LOGIN&startDate=2025-01-01&endDate=2025-12-31&page=1&limit=50
```

**Example Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user123",
      "userEmail": "user@example.com",
      "userName": "john_doe",
      "actionType": "LOGIN",
      "description": "User logged in successfully",
      "metadata": {
        "role": "user",
        "appVersion": "1.0.0"
      },
      "ipAddress": "192.168.1.1",
      "success": true,
      "timestamp": "2025-11-21T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  },
  "filters": {
    "actionType": "LOGIN",
    "startDate": "2025-01-01",
    "endDate": "2025-12-31"
  }
}
```

#### **GET `/api/activity-logs/statistics`**
Get aggregated activity statistics.

**Query Parameters:**
- `userId` (optional) - Filter by user
- `startDate` (optional) - Start date
- `endDate` (optional) - End date

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalLogs": 1520,
    "byActionType": [
      {
        "actionType": "LOGIN",
        "count": 450,
        "successCount": 448,
        "failureCount": 2
      },
      {
        "actionType": "TRANSCRIPT_GENERATED",
        "count": 320,
        "successCount": 318,
        "failureCount": 2
      }
    ]
  }
}
```

#### **GET `/api/activity-logs/user/:userId`**
Get activity summary for a specific user.

**Query Parameters:**
- `days` (default: 30) - Number of days to look back

**Example Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "period": "Last 30 days",
    "totalActivities": 45,
    "byActionType": {
      "LOGIN": 15,
      "TRANSCRIPT_GENERATED": 20,
      "TRANSCRIPT_VIEWED": 10
    },
    "recentActivities": [...]
  }
}
```

#### **GET `/api/activity-logs/action-types`**
Get list of available action types.

#### **GET `/api/activity-logs/my-activity`**
Get current user's own activity (does not require admin role).

**Query Parameters:**
- `days` (default: 30) - Number of days to look back

## 🔄 Automatic Logging

The following actions are automatically logged:

### **1. User Authentication**
- **Login Success** - Logged in `src/routes/auth.js`
  - Includes: user info, IP, user agent, app version
- **Login Failure** - Logged in `src/routes/auth.js`
  - Includes: email, error message, IP
- **Logout** - Logged in `src/routes/auth.js`

### **2. Transcript Operations**
- **Transcript Generation** - Logged in `src/routes/audio.js`
  - Single audio upload
  - Dual audio upload
  - Segmented dual audio upload
  - Includes: duration, segment count, file info
- **Transcript View** - Logged in `src/routes/transcripts.js`
  - When user retrieves a specific transcript
- **Transcript Deletion** - Logged in `src/routes/transcripts.js`
  - When user deletes a transcript

## 📊 Frontend Integration Guide

### **1. Fetch Activity Logs (Admin)**

```javascript
// Fetch activity logs with filters
async function fetchActivityLogs(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.actionType) params.append('actionType', filters.actionType);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.success !== undefined) params.append('success', filters.success);
  if (filters.page) params.append('page', filters.page);
  if (filters.limit) params.append('limit', filters.limit);
  
  const response = await fetch(`/api/activity-logs?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}

// Example usage
const logs = await fetchActivityLogs({
  actionType: 'LOGIN',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  page: 1,
  limit: 50
});
```

### **2. Display Activity Logs Table**

```jsx
// React component example
function ActivityLogsTable() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    actionType: '',
    startDate: '',
    endDate: '',
    page: 1,
    limit: 50
  });
  
  useEffect(() => {
    fetchActivityLogs(filters).then(data => {
      setLogs(data.data);
    });
  }, [filters]);
  
  return (
    <div>
      <div className="filters">
        {/* Action Type Dropdown */}
        <select 
          value={filters.actionType} 
          onChange={(e) => setFilters({...filters, actionType: e.target.value})}
        >
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="TRANSCRIPT_GENERATED">Transcript Generated</option>
          <option value="TRANSCRIPT_VIEWED">Transcript Viewed</option>
          {/* Add more action types */}
        </select>
        
        {/* Date Range */}
        <input 
          type="date" 
          value={filters.startDate}
          onChange={(e) => setFilters({...filters, startDate: e.target.value})}
          placeholder="Start Date"
        />
        <input 
          type="date" 
          value={filters.endDate}
          onChange={(e) => setFilters({...filters, endDate: e.target.value})}
          placeholder="End Date"
        />
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Action</th>
            <th>Description</th>
            <th>Status</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td>{log.userName || log.userEmail}</td>
              <td>{log.actionType}</td>
              <td>{log.description}</td>
              <td>{log.success ? '✅ Success' : '❌ Failed'}</td>
              <td>{log.ipAddress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### **3. Fetch Statistics**

```javascript
// Fetch activity statistics
async function fetchStatistics(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  
  const response = await fetch(`/api/activity-logs/statistics?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return await response.json();
}

// Display statistics chart
const stats = await fetchStatistics({
  startDate: '2025-01-01',
  endDate: '2025-12-31'
});

// Use stats.data.byActionType for charts
```

## 🔒 Security & Permissions

- **Admin Only**: All activity log routes (except `/my-activity`) require admin role
- **User Privacy**: Regular users can only view their own activity via `/my-activity`
- **Data Sensitivity**: IP addresses and user agents are logged for security auditing
- **Error Handling**: Logging failures do not break main operations (fail silently)

## 📈 Database Indexes

The ActivityLog model includes optimized indexes for common queries:
- `userId + createdAt` - User activity timeline
- `actionType + createdAt` - Action type filtering
- `userId + actionType + createdAt` - Combined filtering
- `success + createdAt` - Success/failure filtering
- Individual indexes on: `id`, `userEmail`, `userName`, `resourceId`

## 🚀 Future Enhancements

Potential additions:
- Export activity logs to CSV/Excel
- Real-time activity monitoring dashboard
- Configurable activity retention policies
- Advanced analytics and reporting
- Activity-based alerts and notifications
- Integration with external SIEM systems

## 📝 Example Scenarios

### **Scenario 1: Track User Login Patterns**
```javascript
// Get login activity for last 7 days
const loginStats = await fetchActivityLogs({
  actionType: 'LOGIN',
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  endDate: new Date().toISOString()
});
```

### **Scenario 2: Monitor Failed Login Attempts**
```javascript
// Get failed login attempts
const failedLogins = await fetchActivityLogs({
  actionType: 'LOGIN_FAILED',
  success: false,
  limit: 100
});
```

### **Scenario 3: Analyze Transcript Generation**
```javascript
// Get transcript generation statistics
const transcriptStats = await fetchActivityLogs({
  actionType: 'TRANSCRIPT_GENERATED',
  startDate: '2025-01-01',
  endDate: '2025-12-31'
});
```

### **Scenario 4: User Activity Audit**
```javascript
// Get all activities for specific user
const userActivity = await fetch(`/api/activity-logs/user/${userId}?days=90`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## ✅ Testing

To test the activity logging system:

1. **Login/Logout**: Perform login/logout and check logs
2. **Transcript Generation**: Upload audio and verify logging
3. **Transcript View**: View a transcript and check logs
4. **Transcript Deletion**: Delete a transcript and verify logging
5. **Admin Access**: Test admin routes with admin and non-admin users
6. **Filters**: Test various filter combinations
7. **Date Ranges**: Test with different date ranges
8. **Pagination**: Test pagination with large datasets

## 🎯 API Summary

| Method | Endpoint | Admin Only | Description |
|--------|----------|------------|-------------|
| GET | `/api/activity-logs` | ✅ | Get activity logs with filters |
| GET | `/api/activity-logs/statistics` | ✅ | Get aggregated statistics |
| GET | `/api/activity-logs/user/:userId` | ✅ | Get user activity summary |
| GET | `/api/activity-logs/action-types` | ✅ | Get available action types |
| GET | `/api/activity-logs/my-activity` | ❌ | Get own activity (any user) |

---

**Note**: All timestamps are in ISO 8601 format (UTC). The system automatically extracts IP addresses and user agents from requests.

