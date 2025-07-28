// Simple server for debugging Railway deployment
const express = require('express');
const cors = require('cors');

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'LeepiAI Backend is running',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      hasMongoUri: !!process.env.MONGODB_URI_PROD,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasGemini: !!process.env.GEMINI_API_KEY,
      hasJWT: !!process.env.JWT_SECRET
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: Date.now(),
    env: process.env.NODE_ENV
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Simple server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 MongoDB URI set: ${!!process.env.MONGODB_URI_PROD}`);
  console.log(`🔑 OpenAI Key set: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🤖 Gemini Key set: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`🔐 JWT Secret set: ${!!process.env.JWT_SECRET}`);
}); 