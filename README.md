# LeepiAI Backend

> Secure backend API for LeepiAI Interview Recorder with audio transcription, AI analysis, and user management

## 🎯 Overview

The LeepiAI Backend is a Node.js/Express REST API that provides secure backend services for the LeepiAI Interview Recorder desktop application. It handles audio transcription, AI-powered analysis, user authentication, and data management while keeping sensitive API keys and business logic separate from the client application.

### Key Features

- **🔐 JWT Authentication**: Secure user authentication with refresh tokens
- **🎵 Audio Processing**: OpenAI Whisper integration for high-quality transcription
- **🤖 AI Analysis**: Google Gemini integration for summaries, debriefs, and chat
- **💾 Data Management**: MongoDB for scalable data storage
- **🛡️ Security**: Rate limiting, CORS, input validation, and error handling
- **📊 Advanced Analytics**: User activity tracking, login metrics, transcript statistics
- **📈 Activity Logging**: Comprehensive audit trail for all user actions
- **📤 Export**: Multiple format support (TXT, JSON, Markdown)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND ARCHITECTURE                     │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Express   │───▶│    Auth     │───▶│   MongoDB   │     │
│  │    Server   │    │  Middleware │    │  Database   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Audio     │───▶│   OpenAI    │    │   Google    │     │
│  │  Processing │    │   Whisper   │    │   Gemini    │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **MongoDB** (local or Atlas)
- **OpenAI API Key** (for Whisper transcription)
- **Google Gemini API Key** (for AI analysis)

### Installation

1. **Clone and setup**
   ```bash
   cd LeepiAI_Backend
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Required Environment Variables**
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/leepi-backend
   
   # JWT Security
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
   
   # API Keys
   OPENAI_API_KEY=sk-your-openai-api-key-here
   GEMINI_API_KEY=your-google-gemini-api-key-here
   
   # Server
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:3000
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📋 API Documentation

### Authentication Endpoints

```
POST   /api/auth/register     # ⚠️ DISABLED - Registration is closed
POST   /api/auth/login        # User login
POST   /api/auth/refresh      # Refresh access token
POST   /api/auth/logout       # User logout
GET    /api/auth/me           # Get current user
POST   /api/auth/verify       # Verify token
```

> **Note**: Public registration is disabled. New users can only be created by administrators using the bulk user creation script. See [scripts/README.md](scripts/README.md) for details.

### Audio Processing Endpoints

```
POST   /api/audio/upload         # Upload & transcribe single audio
POST   /api/audio/upload-dual    # Upload & transcribe dual audio
POST   /api/audio/transcribe     # Transcribe without saving
GET    /api/audio/formats        # Get supported formats
POST   /api/audio/validate       # Validate audio file
```

### Transcript Management Endpoints

```
GET    /api/transcripts          # Get user transcripts
GET    /api/transcripts/search   # Search transcripts
GET    /api/transcripts/:id      # Get specific transcript
PUT    /api/transcripts/:id      # Update transcript
DELETE /api/transcripts/:id      # Delete transcript
POST   /api/transcripts/:id/export # Export transcript
POST   /api/transcripts/bulk-delete # Delete multiple
```

### AI Analysis Endpoints

```
POST   /api/ai/summary/:id              # Generate summary
POST   /api/ai/debrief/:id              # Generate debrief
POST   /api/ai/chat/:id                 # Chat about transcript
GET    /api/ai/chat/:id/history         # Get chat history
POST   /api/ai/extract-qa/:id           # Extract Q&A pairs
POST   /api/ai/follow-up-questions/:id  # Generate follow-ups
POST   /api/ai/analyze/:id              # Comprehensive analysis
GET    /api/ai/status                   # Check AI service status
```

### User Management Endpoints

```
GET    /api/users/profile        # Get user profile
PUT    /api/users/profile        # Update profile
GET    /api/users/stats          # Get user statistics
GET    /api/users/preferences    # Get preferences
PUT    /api/users/preferences    # Update preferences
POST   /api/users/change-password # Change password
DELETE /api/users/account        # Delete account
GET    /api/users/export         # Export user data
```

### Activity Logs & Statistics Endpoints (Admin Only)

```
GET    /api/activity-logs                    # Get activity logs with filters
GET    /api/activity-logs/statistics         # Get basic statistics
GET    /api/activity-logs/advanced-statistics # Get advanced user metrics
GET    /api/activity-logs/user/:userId       # Get user activity summary
GET    /api/activity-logs/action-types       # Get available action types
GET    /api/activity-logs/my-activity        # Get own activity (non-admin)
```

**Advanced Statistics Metrics:**
- 🔐 **Login Analytics**: Unique users, success rates, failure tracking
- 📝 **Transcript Analytics**: User engagement, trial vs actual usage
- 📊 **Date Range Filtering**: Flexible reporting periods
- 💡 **Insights**: Conversion rates, adoption metrics

See [ADVANCED_STATISTICS_GUIDE.md](ADVANCED_STATISTICS_GUIDE.md) and [FRONTEND_ACTIVITY_LOGS_API.md](FRONTEND_ACTIVITY_LOGS_API.md) for complete documentation.

## 👥 User Management

### Creating New Users

Public registration is **disabled** for security. New users must be created by administrators using the bulk user creation script.

**Bulk User Creation:**
```bash
# Create users from CSV file
node scripts/bulk-create-users.js path/to/users.csv
```

**CSV Format:**
```csv
Username,Name,Phone No,Email,Password
johndoe,John Doe,+1234567890,john@example.com,password123
janedoe,Jane Doe,+0987654321,jane@example.com,securepass456
```

For detailed documentation, see [scripts/README.md](scripts/README.md)

### User Login

Existing users can login normally via the `/api/auth/login` endpoint:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

## 🔧 Configuration

### Database Setup

**MongoDB Atlas (Recommended)**
1. Create cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Get connection string
3. Update `MONGODB_URI` in `.env`

**Local MongoDB**
```bash
# Install MongoDB
brew install mongodb-community  # macOS
# or follow MongoDB installation guide

# Start MongoDB
brew services start mongodb-community
```

### API Keys Setup

**OpenAI Whisper API**
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add to `.env` as `OPENAI_API_KEY`

**Google Gemini API**
1. Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add to `.env` as `GEMINI_API_KEY`

## 🛡️ Security Features

### Authentication & Authorization
- **JWT Tokens**: Access and refresh token system
- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Database-tracked sessions
- **Token Expiration**: Configurable expiration times

### API Security
- **Rate Limiting**: Configurable request limits
- **CORS Protection**: Cross-origin request control
- **Input Validation**: express-validator integration
- **Error Handling**: Secure error responses
- **Helmet.js**: Security headers

### Data Protection
- **Input Sanitization**: XSS protection
- **File Validation**: Audio file type checking
- **Size Limits**: Upload size restrictions
- **Cleanup**: Temporary file removal

## 🗄️ Database Schema

### Users Collection
```javascript
{
  id: String (UUID),
  userName: String (unique),
  email: String (unique),
  password: String (hashed),
  firstName: String,
  lastName: String,
  phoneNo: String (optional),
  role: String (user|admin),
  isActive: Boolean,
  preferences: {
    theme: String,
    language: String,
    notifications: Boolean
  },
  createdAt: Date,
  lastLoginAt: Date
}
```

### Transcripts Collection
```javascript
{
  id: String (UUID),
  userId: String,
  title: String,
  content: String,
  segments: [{
    start: Number,
    end: Number,
    text: String,
    source: String, // 'input' or 'output'
    speaker: String
  }],
  summary: String,
  debrief: Object,
  metadata: {
    duration: Number,
    segmentCount: Number,
    language: String,
    sources: [String]
  },
  createdAt: Date,
  updatedAt: Date
}
```

## 🔧 Development

### Project Structure
```
LeepiAI_Backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers (future)
│   ├── middleware/      # Express middleware
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   └── app.js           # Express application
├── uploads/             # Temporary file storage
├── logs/                # Application logs
├── .env                 # Environment variables
└── package.json
```

### Available Scripts
```bash
npm start         # Start production server
npm run dev       # Start development server with nodemon
npm test          # Run tests (when implemented)
npm run lint      # Run ESLint
npm run lint:fix  # Fix ESLint issues
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |
| `GEMINI_API_KEY` | Google Gemini API key | Yes | - |
| `PORT` | Server port | No | 3001 |
| `NODE_ENV` | Environment | No | development |
| `CORS_ORIGIN` | CORS origin | No | http://localhost:3000 |

## 🚀 Deployment

### Production Setup

1. **Environment**
   ```bash
   NODE_ENV=production
   PORT=3001
   ```

2. **Database**
   - Use MongoDB Atlas for production
   - Enable authentication
   - Set up replica sets

3. **Security**
   - Use strong JWT secrets
   - Enable HTTPS
   - Set up firewall rules
   - Regular security updates

### Docker Deployment

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## 📊 Monitoring & Logs

### Winston Logging
- **Console**: Development logging
- **File**: Production log files
- **Error**: Separate error logs
- **Request**: HTTP request logging

### Health Checks
- `GET /health` - System health status
- `GET /api/ai/status` - AI service status
- Database connection monitoring

## 🔍 Troubleshooting

### Common Issues

**Database Connection**
```bash
# Check MongoDB status
brew services list | grep mongodb
# Restart if needed
brew services restart mongodb-community
```

**API Key Issues**
```bash
# Test OpenAI API
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Test Gemini API
curl -H "Content-Type: application/json" \
  "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```

**File Upload Problems**
- Check upload directory permissions
- Verify file size limits
- Ensure supported audio formats

### Debug Mode
```bash
DEBUG=leepi:* npm run dev
```

## 🔮 Future Enhancements

- [ ] WebSocket support for real-time processing
- [ ] Batch audio processing
- [ ] Advanced analytics dashboard
- [ ] Multi-language transcription
- [ ] Team collaboration features
- [ ] Integration webhooks
- [ ] Performance monitoring
- [ ] Automated testing suite

## 📄 API Response Format

### Success Response
```javascript
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { /* response data */ }
}
```

### Error Response
```javascript
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details" // optional
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

- **Documentation**: This README and inline code comments
- **Issues**: Create GitHub issues for bugs or feature requests
- **Logs**: Check application logs in `/logs` directory

---

**Made with ❤️ for secure, scalable interview transcription** 