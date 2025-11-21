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

### 3. Get User Activity Summary (Admin Only)

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

### 4. Get Available Action Types (Admin Only)

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

### 5. Get My Activity (Any Authenticated User)

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

### Example 3: User Activity Modal

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
```

---

## 🎯 Quick Start Checklist

1. ✅ Ensure you have admin authentication working
2. ✅ Test `/api/activity-logs/action-types` to get action types list
3. ✅ Build filters UI with action type dropdown and date range pickers
4. ✅ Implement main activity logs table with `/api/activity-logs`
5. ✅ Add pagination controls
6. ✅ Create statistics dashboard with `/api/activity-logs/statistics`
7. ✅ Add user activity modal with `/api/activity-logs/user/:userId`
8. ✅ Style success/failure indicators

---

## 📞 Support

For any questions or issues with the API, please contact the backend team or check the main documentation in `ACTIVITY_LOGGING_GUIDE.md`.

