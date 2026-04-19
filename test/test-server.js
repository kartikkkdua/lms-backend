// Minimal test server to check if basic Express works
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001; // Different port to not conflict

// Enable CORS
app.use(cors());

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({ message: 'Server is working!', timestamp: new Date() });
});

// CAPTCHA test endpoint
app.get('/api/auth/captcha', (req, res) => {
  console.log('CAPTCHA endpoint hit');
  const captcha = {
    id: 'test123',
    question: 'What is 2 + 2?',
    expiresAt: Date.now() + 300000
  };
  res.json(captcha);
});

app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
  console.log(`Test it: http://localhost:${PORT}/test`);
  console.log(`CAPTCHA: http://localhost:${PORT}/api/auth/captcha`);
});
