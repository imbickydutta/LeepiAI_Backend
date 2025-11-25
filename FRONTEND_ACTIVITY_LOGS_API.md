# Activity Logs API - Frontend Integration Guide

## 🔐 Authentication

All endpoints require authentication via Bearer token in the header:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

**Admin Requirement**: All endpoints except `/my-activity` require the user to have `role: 'admin'`

---

## 📋 API Endpoints

### 1. Get Activity Logs (Admin Only)

**Endpoint:** `GET /api/activity-logs`

**Description:** Retrieve activity logs with filtering, sorting, and pagination.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `userId` | string | No | - | Filter by specific user ID |
| `actionType` | string | No | - | Filter by action type (see Action Types below) |
| `startDate` | string | No | - | Start date (ISO 8601: `2025-01-01T00:00:00Z`) |
| `endDate` | string | No | - | End date (ISO 8601: `2025-12-31T23:59:59Z`) |
| `success` | boolean | No | - | Filter by success status (`true` or `false`) |
| `page` | number | No | 1 | Page number (min: 1) |
| `limit` | number | No | 50 | Items per page (min: 1, max: 100) |
| `sortBy` | string | No | `createdAt` | Field to sort by |
| `sortOrder` | string | No | `desc` | Sort order (`asc` or `desc`) |

**Request Example:**

```javascript
// JavaScript/TypeScript
const fetchActivityLogs = async (filters) => {
  const params = new URLSearchParams();
  
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.actionType) params.append('actionType', filters.actionType);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.success !== undefined) params.append('success', filters.success);
  params.append('page', filters.page || 1);
  params.append('limit', filters.limit || 50);
  
  const response = await fetch(`/api/activity-logs?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage
const logs = await fetchActivityLogs({
  actionType: 'LOGIN',
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-12-31T23:59:59Z',
  page: 1,
  limit: 50
});
```

**Response Example:**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user123",
      "userEmail": "john.doe@example.com",
      "userName": "john_doe",
      "actionType": "LOGIN",
      "description": "User logged in successfully",
      "metadata": {
        "role": "user",
        "appVersion": "1.2.0"
      },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "success": true,
      "errorMessage": null,
      "duration": null,
      "resourceId": null,
      "resourceType": null,
      "timestamp": "2025-11-21T10:30:45.123Z",
      "createdAt": "2025-11-21T10:30:45.123Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "userId": "user456",
      "userEmail": "jane.smith@example.com",
      "userName": "jane_smith",
      "actionType": "TRANSCRIPT_GENERATED",
      "description": "Transcript generated successfully",
      "metadata": {
        "transcriptLength": 5420,
        "segmentCount": 45,
        "audioFile": "meeting-recording.wav"
      },
      "ipAddress": "192.168.1.101",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "success": true,
      "errorMessage": null,
      "duration": 3500,
      "resourceId": "transcript789",
      "resourceType": "transcript",
      "timestamp": "2025-11-21T10:35:20.456Z",
      "createdAt": "2025-11-21T10:35:20.456Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1520,
    "pages": 31
  },
  "filters": {
    "userId": null,
    "actionType": "LOGIN",
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z",
    "success": null
  }
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Admin access required"
}
```

---

### 2. Get Activity Statistics (Admin Only)

**Endpoint:** `GET /api/activity-logs/statistics`

**Description:** Get aggregated statistics about user activities.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | Filter by specific user ID |
| `startDate` | string | No | Start date (ISO 8601) |
| `endDate` | string | No | End date (ISO 8601) |

**Request Example:**

```javascript
const fetchStatistics = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.userId) params.append('userId', filters.userId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  
  const response = await fetch(`/api/activity-logs/statistics?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage
const stats = await fetchStatistics({
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-12-31T23:59:59Z'
});
```

**Response Example:**

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
      },
      {
        "actionType": "TRANSCRIPT_VIEWED",
        "count": 280,
        "successCount": 280,
        "failureCount": 0
      },
      {
        "actionType": "LOGOUT",
        "count": 200,
        "successCount": 200,
        "failureCount": 0
      },
      {
        "actionType": "TRANSCRIPT_DELETED",
        "count": 150,
        "successCount": 150,
        "failureCount": 0
      },
      {
        "actionType": "LOGIN_FAILED",
        "count": 120,
        "successCount": 0,
        "failureCount": 120
      }
    ]
  },
  "filters": {
    "userId": null,
    "startDate": "2025-01-01T00:00:00Z",
    "endDate": "2025-12-31T23:59:59Z"
  }
}
```

---

### 3. Get Advanced Statistics (Admin Only)

**Endpoint:** `GET /api/activity-logs/advanced-statistics`

**Description:** Get comprehensive user metrics and statistics with date range filtering. This provides detailed insights about:
- Login metrics (unique users, success/failure rates)
- Transcript generation metrics (users, trial vs actual transcripts)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | No | Start date (ISO 8601) |
| `endDate` | string | No | End date (ISO 8601) |

**Request Example:**

```javascript
const fetchAdvancedStatistics = async (filters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  
  const response = await fetch(`/api/activity-logs/advanced-statistics?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage - Get stats for the last 30 days
const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const endDate = new Date().toISOString();
const stats = await fetchAdvancedStatistics({ startDate, endDate });
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "dateRange": {
      "startDate": "2025-01-01T00:00:00.000Z",
      "endDate": "2025-11-25T23:59:59.999Z"
    },
    "loginMetrics": {
      "uniqueUsersTriedLogin": 245,
      "uniqueUsersSuccessfulLogin": 230,
      "uniqueUsersFailedOnly": 15,
      "totalLoginAttempts": 1820,
      "totalSuccessfulLogins": 1765,
      "totalFailedLogins": 55,
      "successRate": "97.02%",
      "users": {
        "allLoginUsers": [
          {
            "userId": "user-id-1",
            "userEmail": "john.doe@example.com",
            "userName": "john_doe",
            "loginAttempts": 15,
            "successfulLogins": 14,
            "failedLogins": 1
          },
          {
            "userId": "user-id-2",
            "userEmail": "jane.smith@example.com",
            "userName": "jane_smith",
            "loginAttempts": 8,
            "successfulLogins": 8,
            "failedLogins": 0
          }
        ],
        "successfulLoginUsers": [
          {
            "userId": "user-id-1",
            "userEmail": "john.doe@example.com",
            "userName": "john_doe",
            "successfulLogins": 14
          },
          {
            "userId": "user-id-2",
            "userEmail": "jane.smith@example.com",
            "userName": "jane_smith",
            "successfulLogins": 8
          }
        ],
        "failedOnlyUsers": [
          {
            "userId": "user-id-3",
            "userEmail": "failed.user@example.com",
            "userName": "failed_user",
            "failedAttempts": 3
          }
        ]
      }
    },
    "transcriptMetrics": {
      "uniqueUsersGeneratedTranscripts": 180,
      "totalTranscripts": 542,
      "trialTranscripts": 123,
      "actualTranscripts": 398,
      "transcriptsWithoutDuration": 21,
      "trialPercentage": "22.69%",
      "actualPercentage": "73.43%",
      "users": [
        {
          "userId": "user-id-1",
          "userEmail": "john.doe@example.com",
          "userName": "john_doe",
          "transcriptCount": 5
        },
        {
          "userId": "user-id-2",
          "userEmail": "jane.smith@example.com",
          "userName": "jane_smith",
          "transcriptCount": 3
        }
      ]
    }
  },
  "filters": {
    "startDate": "2025-01-01T00:00:00.000Z",
    "endDate": "2025-11-25T23:59:59.999Z"
  }
}
```

**Metrics Explained:**

**Login Metrics:**
- `uniqueUsersTriedLogin`: Number of unique users who attempted to log in (success or failure)
- `uniqueUsersSuccessfulLogin`: Number of unique users who successfully logged in at least once
- `uniqueUsersFailedOnly`: Number of unique users who tried to log in but never succeeded
- `totalLoginAttempts`: Total number of login attempts (all users combined)
- `totalSuccessfulLogins`: Total number of successful logins
- `totalFailedLogins`: Total number of failed login attempts
- `successRate`: Percentage of successful logins out of total attempts

**Transcript Metrics:**
- `uniqueUsersGeneratedTranscripts`: Number of unique users who successfully generated at least one transcript
- `totalTranscripts`: Total number of successfully generated transcripts
- `trialTranscripts`: Number of transcripts with duration < 5 minutes (300,000 ms)
- `actualTranscripts`: Number of transcripts with duration >= 5 minutes (300,000 ms)
- `transcriptsWithoutDuration`: Number of transcripts where duration information is not available
- `trialPercentage`: Percentage of trial transcripts
- `actualPercentage`: Percentage of actual transcripts
- `users`: Array of users who generated transcripts, including userId, email, userName, and transcript count (sorted by count, descending)

**User Arrays:**

The response includes detailed user information for tracking and analysis:

**Login Users:**
- `allLoginUsers`: All users who attempted login, with their attempt counts
- `successfulLoginUsers`: Users who successfully logged in at least once
- `failedOnlyUsers`: Users who never successfully logged in (potential issues)

**Transcript Users:**
- `users`: Users who generated transcripts, sorted by transcript count (most active first)

Each user object includes:
- `userId`: Unique user identifier
- `userEmail`: User's email address
- `userName`: User's username
- Additional metrics specific to the category (login attempts, transcript counts, etc.)

---

### 4. Get User Activity Summary (Admin Only)

**Endpoint:** `GET /api/activity-logs/user/:userId`

**Description:** Get activity summary for a specific user.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | No | 30 | Number of days to look back |

**Request Example:**

```javascript
const fetchUserActivity = async (userId, days = 30) => {
  const response = await fetch(`/api/activity-logs/user/${userId}?days=${days}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage
const userActivity = await fetchUserActivity('user123', 30);
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "period": "Last 30 days",
    "totalActivities": 45,
    "byActionType": {
      "LOGIN": 15,
      "LOGOUT": 12,
      "TRANSCRIPT_GENERATED": 8,
      "TRANSCRIPT_VIEWED": 7,
      "TRANSCRIPT_DELETED": 3
    },
    "recentActivities": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "userId": "user123",
        "userEmail": "john.doe@example.com",
        "userName": "john_doe",
        "actionType": "LOGIN",
        "description": "User logged in successfully",
        "timestamp": "2025-11-21T10:30:45.123Z"
      }
      // ... up to 10 most recent activities
    ]
  }
}
```

---

### 5. Get Available Action Types (Admin Only)

**Endpoint:** `GET /api/activity-logs/action-types`

**Description:** Get list of all available action types for filtering.

**Request Example:**

```javascript
const fetchActionTypes = async () => {
  const response = await fetch('/api/activity-logs/action-types', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage
const actionTypes = await fetchActionTypes();
```

**Response Example:**

```json
{
  "success": true,
  "data": [
    "LOGIN",
    "LOGOUT",
    "LOGIN_FAILED",
    "TRANSCRIPT_GENERATED",
    "TRANSCRIPT_VIEWED",
    "TRANSCRIPT_DELETED",
    "RECORDING_UPLOADED",
    "RECORDING_DELETED",
    "PROFILE_UPDATED",
    "PASSWORD_CHANGED",
    "SETTINGS_UPDATED",
    "OTHER"
  ]
}
```

---

### 6. Get My Activity (Any Authenticated User)

**Endpoint:** `GET /api/activity-logs/my-activity`

**Description:** Get current user's own activity logs. Does NOT require admin role.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `days` | number | No | 30 | Number of days to look back |

**Request Example:**

```javascript
const fetchMyActivity = async (days = 30) => {
  const response = await fetch(`/api/activity-logs/my-activity?days=${days}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
};

// Usage
const myActivity = await fetchMyActivity(7);
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "userId": "current-user-id",
    "period": "Last 7 days",
    "totalActivities": 23,
    "byActionType": {
      "LOGIN": 5,
      "LOGOUT": 4,
      "TRANSCRIPT_GENERATED": 10,
      "TRANSCRIPT_VIEWED": 4
    },
    "recentActivities": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "actionType": "LOGIN",
        "description": "User logged in successfully",
        "timestamp": "2025-11-21T10:30:45.123Z"
      }
      // ... up to 10 most recent activities
    ]
  }
}
```

---

## 📊 Action Types Reference

| Action Type | Description | Automatically Logged |
|-------------|-------------|---------------------|
| `LOGIN` | Successful user login | ✅ Yes |
| `LOGOUT` | User logout | ✅ Yes |
| `LOGIN_FAILED` | Failed login attempt | ✅ Yes |
| `TRANSCRIPT_GENERATED` | Transcript created from audio | ✅ Yes |
| `TRANSCRIPT_VIEWED` | User viewed a transcript | ✅ Yes |
| `TRANSCRIPT_DELETED` | User deleted a transcript | ✅ Yes |
| `RECORDING_UPLOADED` | Audio recording uploaded | Future |
| `RECORDING_DELETED` | Recording deleted | Future |
| `PROFILE_UPDATED` | User profile modified | Future |
| `PASSWORD_CHANGED` | Password changed | Future |
| `SETTINGS_UPDATED` | Settings modified | Future |
| `OTHER` | Miscellaneous actions | Manual |

---

## 🎨 React Component Examples

### Example 1: Activity Logs Table with Filters

```jsx
import React, { useState, useEffect } from 'react';

function ActivityLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  
  const [filters, setFilters] = useState({
    actionType: '',
    startDate: '',
    endDate: '',
    success: '',
    page: 1,
    limit: 50
  });

  const [actionTypes, setActionTypes] = useState([]);

  // Fetch action types on mount
  useEffect(() => {
    fetchActionTypes().then(data => {
      setActionTypes(data.data);
    });
  }, []);

  // Fetch logs when filters change
  useEffect(() => {
    setLoading(true);
    fetchActivityLogs(filters)
      .then(data => {
        setLogs(data.data);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  return (
    <div className="activity-logs-page">
      <h1>Activity Logs</h1>
      
      {/* Filters */}
      <div className="filters-container">
        <div className="filter-group">
          <label>Action Type:</label>
          <select 
            value={filters.actionType} 
            onChange={(e) => handleFilterChange('actionType', e.target.value)}
          >
            <option value="">All Actions</option>
            {actionTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Start Date:</label>
          <input 
            type="datetime-local" 
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>End Date:</label>
          <input 
            type="datetime-local" 
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select 
            value={filters.success} 
            onChange={(e) => handleFilterChange('success', e.target.value)}
          >
            <option value="">All</option>
            <option value="true">Success Only</option>
            <option value="false">Failed Only</option>
          </select>
        </div>

        <button onClick={() => setFilters({
          actionType: '',
          startDate: '',
          endDate: '',
          success: '',
          page: 1,
          limit: 50
        })}>
          Clear Filters
        </button>
      </div>

      {/* Results Table */}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <table className="activity-logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Description</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>
                    <div>{log.userName || log.userEmail}</div>
                    <small>{log.userEmail}</small>
                  </td>
                  <td>
                    <span className={`badge badge-${log.actionType.toLowerCase()}`}>
                      {log.actionType}
                    </span>
                  </td>
                  <td>{log.description}</td>
                  <td>
                    {log.success ? (
                      <span className="status-success">✅ Success</span>
                    ) : (
                      <span className="status-failed">❌ Failed</span>
                    )}
                    {log.errorMessage && (
                      <div className="error-message">{log.errorMessage}</div>
                    )}
                  </td>
                  <td>{log.ipAddress || 'N/A'}</td>
                  <td>{log.duration ? `${(log.duration / 1000).toFixed(2)}s` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination">
            <button 
              disabled={pagination.page === 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </button>
            
            <span>
              Page {pagination.page} of {pagination.pages} 
              ({pagination.total} total logs)
            </span>
            
            <button 
              disabled={pagination.page === pagination.pages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ActivityLogsPage;
```

### Example 2: Statistics Dashboard

```jsx
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

function ActivityStatistics() {
  const [stats, setStats] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString()
  });

  useEffect(() => {
    fetchStatistics(dateRange).then(data => {
      setStats(data.data);
    });
  }, [dateRange]);

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="statistics-dashboard">
      <h1>Activity Statistics</h1>
      
      <div className="date-range-selector">
        <input 
          type="date" 
          value={dateRange.startDate.split('T')[0]}
          onChange={(e) => setDateRange(prev => ({
            ...prev, 
            startDate: new Date(e.target.value).toISOString()
          }))}
        />
        <input 
          type="date" 
          value={dateRange.endDate.split('T')[0]}
          onChange={(e) => setDateRange(prev => ({
            ...prev, 
            endDate: new Date(e.target.value).toISOString()
          }))}
        />
      </div>

      <div className="stats-overview">
        <div className="stat-card">
          <h3>Total Activities</h3>
          <p className="stat-number">{stats.totalLogs}</p>
        </div>
      </div>

      <div className="chart-container">
        <h3>Activities by Type</h3>
        <BarChart width={800} height={400} data={stats.byActionType}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="actionType" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="count" fill="#8884d8" name="Total" />
          <Bar dataKey="successCount" fill="#82ca9d" name="Success" />
          <Bar dataKey="failureCount" fill="#ff7f7f" name="Failed" />
        </BarChart>
      </div>

      <div className="activity-breakdown">
        <h3>Detailed Breakdown</h3>
        <table>
          <thead>
            <tr>
              <th>Action Type</th>
              <th>Total</th>
              <th>Success</th>
              <th>Failed</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.byActionType.map(stat => (
              <tr key={stat.actionType}>
                <td>{stat.actionType}</td>
                <td>{stat.count}</td>
                <td>{stat.successCount}</td>
                <td>{stat.failureCount}</td>
                <td>
                  {((stat.successCount / stat.count) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ActivityStatistics;
```

### Example 3: Advanced Statistics Dashboard

```jsx
import React, { useState, useEffect } from 'react';

function AdvancedStatisticsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString()
  });

  useEffect(() => {
    setLoading(true);
    fetchAdvancedStatistics(dateRange)
      .then(data => {
        setStats(data.data);
      })
      .finally(() => setLoading(false));
  }, [dateRange]);

  const handleDateRangeChange = (range) => {
    const now = new Date();
    let startDate;
    
    switch(range) {
      case '7days':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }
    
    setDateRange({
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    });
  };

  if (loading) return <div className="loading-spinner">Loading statistics...</div>;
  if (!stats) return null;

  return (
    <div className="advanced-stats-dashboard">
      <div className="dashboard-header">
        <h1>📊 Advanced Analytics Dashboard</h1>
        
        <div className="date-range-buttons">
          <button onClick={() => handleDateRangeChange('7days')}>Last 7 Days</button>
          <button onClick={() => handleDateRangeChange('30days')}>Last 30 Days</button>
          <button onClick={() => handleDateRangeChange('90days')}>Last 90 Days</button>
          <button onClick={() => handleDateRangeChange('year')}>Last Year</button>
        </div>

        <div className="custom-date-range">
          <input 
            type="date" 
            value={dateRange.startDate.split('T')[0]}
            onChange={(e) => setDateRange(prev => ({
              ...prev,
              startDate: new Date(e.target.value).toISOString()
            }))}
          />
          <span>to</span>
          <input 
            type="date" 
            value={dateRange.endDate.split('T')[0]}
            onChange={(e) => setDateRange(prev => ({
              ...prev,
              endDate: new Date(e.target.value).toISOString()
            }))}
          />
        </div>
      </div>

      {/* Login Metrics Section */}
      <section className="metrics-section">
        <h2>🔐 Login Metrics</h2>
        
        <div className="metrics-grid">
          <div className="metric-card primary">
            <div className="metric-icon">👥</div>
            <div className="metric-content">
              <h3>Unique Users Tried Login</h3>
              <p className="metric-value">{stats.loginMetrics.uniqueUsersTriedLogin}</p>
              <p className="metric-label">Total users who attempted login</p>
            </div>
          </div>

          <div className="metric-card success">
            <div className="metric-icon">✅</div>
            <div className="metric-content">
              <h3>Successful Logins</h3>
              <p className="metric-value">{stats.loginMetrics.uniqueUsersSuccessfulLogin}</p>
              <p className="metric-label">Users who logged in successfully</p>
            </div>
          </div>

          <div className="metric-card danger">
            <div className="metric-icon">❌</div>
            <div className="metric-content">
              <h3>Failed Only</h3>
              <p className="metric-value">{stats.loginMetrics.uniqueUsersFailedOnly}</p>
              <p className="metric-label">Users who never succeeded</p>
            </div>
          </div>

          <div className="metric-card info">
            <div className="metric-icon">📈</div>
            <div className="metric-content">
              <h3>Success Rate</h3>
              <p className="metric-value">{stats.loginMetrics.successRate}</p>
              <p className="metric-label">Overall login success rate</p>
            </div>
          </div>
        </div>

        <div className="detailed-stats">
          <div className="stat-row">
            <span className="stat-label">Total Login Attempts:</span>
            <span className="stat-value">{stats.loginMetrics.totalLoginAttempts}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Successful Logins:</span>
            <span className="stat-value success">{stats.loginMetrics.totalSuccessfulLogins}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Failed Logins:</span>
            <span className="stat-value danger">{stats.loginMetrics.totalFailedLogins}</span>
          </div>
        </div>
      </section>

      {/* Transcript Metrics Section */}
      <section className="metrics-section">
        <h2>📝 Transcript Metrics</h2>
        
        <div className="metrics-grid">
          <div className="metric-card primary">
            <div className="metric-icon">👤</div>
            <div className="metric-content">
              <h3>Users Generated Transcripts</h3>
              <p className="metric-value">{stats.transcriptMetrics.uniqueUsersGeneratedTranscripts}</p>
              <p className="metric-label">Unique users who created transcripts</p>
            </div>
          </div>

          <div className="metric-card info">
            <div className="metric-icon">📄</div>
            <div className="metric-content">
              <h3>Total Transcripts</h3>
              <p className="metric-value">{stats.transcriptMetrics.totalTranscripts}</p>
              <p className="metric-label">All generated transcripts</p>
            </div>
          </div>

          <div className="metric-card warning">
            <div className="metric-icon">⏱️</div>
            <div className="metric-content">
              <h3>Trial Transcripts</h3>
              <p className="metric-value">{stats.transcriptMetrics.trialTranscripts}</p>
              <p className="metric-label">Duration {'<'} 5 minutes ({stats.transcriptMetrics.trialPercentage})</p>
            </div>
          </div>

          <div className="metric-card success">
            <div className="metric-icon">⏰</div>
            <div className="metric-content">
              <h3>Actual Transcripts</h3>
              <p className="metric-value">{stats.transcriptMetrics.actualTranscripts}</p>
              <p className="metric-label">Duration {'≥'} 5 minutes ({stats.transcriptMetrics.actualPercentage})</p>
            </div>
          </div>
        </div>

        {stats.transcriptMetrics.transcriptsWithoutDuration > 0 && (
          <div className="info-banner">
            <span>ℹ️</span>
            <p>
              {stats.transcriptMetrics.transcriptsWithoutDuration} transcript(s) don't have duration information
            </p>
          </div>
        )}

        {/* Transcript Distribution Chart */}
        <div className="chart-container">
          <h3>Transcript Distribution</h3>
          <div className="progress-bar-chart">
            <div className="progress-bar">
              <div 
                className="progress-segment trial"
                style={{ 
                  width: `${(stats.transcriptMetrics.trialTranscripts / stats.transcriptMetrics.totalTranscripts * 100)}%` 
                }}
                title={`Trial: ${stats.transcriptMetrics.trialTranscripts} (${stats.transcriptMetrics.trialPercentage})`}
              >
                <span>Trial: {stats.transcriptMetrics.trialPercentage}</span>
              </div>
              <div 
                className="progress-segment actual"
                style={{ 
                  width: `${(stats.transcriptMetrics.actualTranscripts / stats.transcriptMetrics.totalTranscripts * 100)}%` 
                }}
                title={`Actual: ${stats.transcriptMetrics.actualTranscripts} (${stats.transcriptMetrics.actualPercentage})`}
              >
                <span>Actual: {stats.transcriptMetrics.actualPercentage}</span>
              </div>
            </div>
            <div className="legend">
              <div className="legend-item">
                <span className="legend-color trial"></span>
                <span>Trial ({'<'} 5 min)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color actual"></span>
                <span>Actual ({'≥'} 5 min)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary Section */}
      <section className="summary-section">
        <h2>📊 Summary</h2>
        <div className="summary-grid">
          <div className="summary-card">
            <h4>User Engagement</h4>
            <p>
              {stats.loginMetrics.uniqueUsersSuccessfulLogin} users successfully logged in,
              representing a {stats.loginMetrics.successRate} success rate.
            </p>
          </div>
          <div className="summary-card">
            <h4>Transcript Activity</h4>
            <p>
              {stats.transcriptMetrics.uniqueUsersGeneratedTranscripts} users generated
              a total of {stats.transcriptMetrics.totalTranscripts} transcripts.
            </p>
          </div>
          <div className="summary-card">
            <h4>Usage Pattern</h4>
            <p>
              {stats.transcriptMetrics.actualPercentage} of transcripts are actual interviews
              ({'≥'} 5 minutes), showing strong user engagement.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdvancedStatisticsDashboard;
```

**CSS Example for Advanced Statistics:**

```css
.advanced-stats-dashboard {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  margin-bottom: 2rem;
}

.dashboard-header h1 {
  margin-bottom: 1rem;
}

.date-range-buttons {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.date-range-buttons button {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.date-range-buttons button:hover {
  background: #f0f0f0;
}

.custom-date-range {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.metrics-section {
  margin-bottom: 3rem;
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.metrics-section h2 {
  margin-bottom: 1.5rem;
  color: #333;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.metric-card {
  padding: 1.5rem;
  border-radius: 8px;
  background: white;
  border: 2px solid #e0e0e0;
  display: flex;
  gap: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.metric-card.primary {
  border-color: #3b82f6;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  color: white;
}

.metric-card.success {
  border-color: #10b981;
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  color: white;
}

.metric-card.danger {
  border-color: #ef4444;
  background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
  color: white;
}

.metric-card.warning {
  border-color: #f59e0b;
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  color: white;
}

.metric-card.info {
  border-color: #8b5cf6;
  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
  color: white;
}

.metric-icon {
  font-size: 2.5rem;
}

.metric-content h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  opacity: 0.9;
}

.metric-value {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.metric-label {
  font-size: 0.75rem;
  opacity: 0.8;
}

.detailed-stats {
  background: #f9fafb;
  border-radius: 6px;
  padding: 1rem;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;
}

.stat-row:last-child {
  border-bottom: none;
}

.stat-label {
  color: #6b7280;
}

.stat-value {
  font-weight: 600;
  color: #111827;
}

.stat-value.success {
  color: #10b981;
}

.stat-value.danger {
  color: #ef4444;
}

.info-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  margin: 1rem 0;
  color: #1e40af;
}

.progress-bar-chart {
  margin-top: 1rem;
}

.progress-bar {
  display: flex;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.progress-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  transition: all 0.3s;
}

.progress-segment:hover {
  filter: brightness(1.1);
}

.progress-segment.trial {
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
}

.progress-segment.actual {
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
}

.legend {
  display: flex;
  gap: 2rem;
  margin-top: 1rem;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.legend-color.trial {
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
}

.legend-color.actual {
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
}

.summary-section {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.summary-card {
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 6px;
  border-left: 4px solid #3b82f6;
}

.summary-card h4 {
  margin-bottom: 0.75rem;
  color: #111827;
}

.summary-card p {
  color: #6b7280;
  line-height: 1.6;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 1.25rem;
  color: #6b7280;
}
```

### Example 4: User Activity Modal

```jsx
import React, { useState, useEffect } from 'react';

function UserActivityModal({ userId, onClose }) {
  const [activity, setActivity] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (userId) {
      fetchUserActivity(userId, days).then(data => {
        setActivity(data.data);
      });
    }
  }, [userId, days]);

  if (!activity) return <div>Loading...</div>;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>User Activity Summary</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="period-selector">
            <label>Time Period:</label>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          <div className="activity-summary">
            <div className="summary-card">
              <h4>Total Activities</h4>
              <p>{activity.totalActivities}</p>
            </div>

            <div className="activity-types">
              <h4>By Action Type</h4>
              <ul>
                {Object.entries(activity.byActionType).map(([type, count]) => (
                  <li key={type}>
                    <span className="action-type">{type}</span>
                    <span className="count">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="recent-activities">
            <h4>Recent Activities</h4>
            <ul>
              {activity.recentActivities.map(act => (
                <li key={act.id}>
                  <span className="timestamp">
                    {new Date(act.timestamp).toLocaleString()}
                  </span>
                  <span className="action">{act.actionType}</span>
                  <p>{act.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserActivityModal;
```

---

## 🔒 Error Handling

All endpoints may return these error responses:

**401 Unauthorized:**
```json
{
  "success": false,
  "error": "Authentication required"
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "Admin access required"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Failed to fetch activity logs",
  "message": "Detailed error message"
}
```

---

## 📝 TypeScript Interfaces

```typescript
// Activity Log Type
interface ActivityLog {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  actionType: ActionType;
  description: string;
  metadata: Record<string, any>;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  errorMessage: string | null;
  duration: number | null;
  resourceId: string | null;
  resourceType: 'transcript' | 'recording' | 'user' | 'settings' | 'other' | null;
  timestamp: string;
  createdAt: string;
}

// Action Types
type ActionType = 
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'TRANSCRIPT_GENERATED'
  | 'TRANSCRIPT_VIEWED'
  | 'TRANSCRIPT_DELETED'
  | 'RECORDING_UPLOADED'
  | 'RECORDING_DELETED'
  | 'PROFILE_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'SETTINGS_UPDATED'
  | 'OTHER';

// API Response Types
interface ActivityLogsResponse {
  success: boolean;
  data: ActivityLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: {
    userId: string | null;
    actionType: string | null;
    startDate: string | null;
    endDate: string | null;
    success: boolean | null;
  };
}

interface StatisticsResponse {
  success: boolean;
  data: {
    totalLogs: number;
    byActionType: Array<{
      actionType: string;
      count: number;
      successCount: number;
      failureCount: number;
    }>;
  };
  filters: {
    userId: string | null;
    startDate: string | null;
    endDate: string | null;
  };
}

interface UserActivityResponse {
  success: boolean;
  data: {
    userId: string;
    period: string;
    totalActivities: number;
    byActionType: Record<string, number>;
    recentActivities: ActivityLog[];
  };
}

interface LoginUser {
  userId: string;
  userEmail: string;
  userName: string;
  loginAttempts: number;
  successfulLogins: number;
  failedLogins: number;
}

interface SuccessfulLoginUser {
  userId: string;
  userEmail: string;
  userName: string;
  successfulLogins: number;
}

interface FailedOnlyUser {
  userId: string;
  userEmail: string;
  userName: string;
  failedAttempts: number;
}

interface TranscriptUser {
  userId: string;
  userEmail: string;
  userName: string;
  transcriptCount: number;
}

interface AdvancedStatisticsResponse {
  success: boolean;
  data: {
    dateRange: {
      startDate: string | null;
      endDate: string | null;
    };
    loginMetrics: {
      uniqueUsersTriedLogin: number;
      uniqueUsersSuccessfulLogin: number;
      uniqueUsersFailedOnly: number;
      totalLoginAttempts: number;
      totalSuccessfulLogins: number;
      totalFailedLogins: number;
      successRate: string;
      users: {
        allLoginUsers: LoginUser[];
        successfulLoginUsers: SuccessfulLoginUser[];
        failedOnlyUsers: FailedOnlyUser[];
      };
    };
    transcriptMetrics: {
      uniqueUsersGeneratedTranscripts: number;
      totalTranscripts: number;
      trialTranscripts: number;
      actualTranscripts: number;
      transcriptsWithoutDuration: number;
      trialPercentage: string;
      actualPercentage: string;
      users: TranscriptUser[];
    };
  };
  filters: {
    startDate: string | null;
    endDate: string | null;
  };
}
```

---

## 🎯 Quick Start Checklist

1. ✅ Ensure you have admin authentication working
2. ✅ Test `/api/activity-logs/action-types` to get action types list
3. ✅ Build filters UI with action type dropdown and date range pickers
4. ✅ Implement main activity logs table with `/api/activity-logs`
5. ✅ Add pagination controls
6. ✅ Create statistics dashboard with `/api/activity-logs/statistics`
7. ✅ Create advanced statistics dashboard with `/api/activity-logs/advanced-statistics`
8. ✅ Add user activity modal with `/api/activity-logs/user/:userId`
9. ✅ Style success/failure indicators
10. ✅ Implement date range filters for analytics

---

## 📞 Support

For any questions or issues with the API, please contact the backend team or check the main documentation in `ACTIVITY_LOGGING_GUIDE.md`.

