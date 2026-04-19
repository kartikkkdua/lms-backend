const cors = require('cors');

/**
 * CORS configuration with whitelist
 * Only allows requests from approved origins
 */

const corsOptions = {
  origin: (origin, callback) => {
    // Get whitelist from environment or use defaults
    const whitelist = process.env.CORS_WHITELIST 
      ? process.env.CORS_WHITELIST.split(',').map(url => url.trim())
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:3000'
        ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};

module.exports = cors(corsOptions);
