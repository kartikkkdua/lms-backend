const logger = require('../utils/logger');

// Request logging middleware - SIMPLIFIED VERSION
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log after response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.url} ${res.statusCode} ${duration}ms`;
    logger.info(logMessage);
  });
  
  next();
};

module.exports = requestLogger;
