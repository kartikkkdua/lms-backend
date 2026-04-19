const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to add unique request ID to each request
 * Useful for tracing requests across logs
 */
const requestId = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

module.exports = requestId;
