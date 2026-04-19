const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

/**
 * Sanitization middleware to prevent injection attacks
 * - Prevents NoSQL injection by removing $ and . from user input
 * - Prevents XSS attacks by sanitizing HTML/script tags
 */

const sanitizeMiddleware = [
  // Prevent NoSQL injection
  mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      console.warn(`⚠️ Sanitized NoSQL injection attempt in ${key}`);
    }
  }),
  
  // Prevent XSS attacks
  xss()
];

module.exports = sanitizeMiddleware;
