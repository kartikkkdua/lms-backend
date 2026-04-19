const rateLimit = require('express-rate-limit');

// Store for user-based rate limiting
const userRateLimitStore = new Map();

// Cleanup old entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userRateLimitStore.entries()) {
    if (now - value.resetTime > 0) {
      userRateLimitStore.delete(key);
    }
  }
}, 15 * 60 * 1000);

// User-based rate limiter middleware
const userRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each user to 100 requests per windowMs
    message = 'Too many requests from this user, please try again later.',
    skipSuccessfulRequests = false
  } = options;

  return (req, res, next) => {
    // Skip if no user (will be handled by IP rate limiter)
    if (!req.user) {
      return next();
    }

    const userId = req.user._id.toString();
    const now = Date.now();
    
    let userLimit = userRateLimitStore.get(userId);
    
    if (!userLimit || now > userLimit.resetTime) {
      // Create new limit window
      userLimit = {
        count: 0,
        resetTime: now + windowMs
      };
      userRateLimitStore.set(userId, userLimit);
    }
    
    userLimit.count++;
    
    if (userLimit.count > max) {
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }
    
    // Add rate limit info to response headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - userLimit.count));
    res.setHeader('X-RateLimit-Reset', new Date(userLimit.resetTime).toISOString());
    
    next();
  };
};

// IP-based rate limiter (existing)
const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

// Combined rate limiter (IP + User)
const combinedRateLimiter = (options = {}) => {
  const userLimiter = userRateLimiter(options);
  
  return (req, res, next) => {
    // First apply IP rate limiting
    ipRateLimiter(req, res, (err) => {
      if (err) return next(err);
      
      // Then apply user rate limiting if authenticated
      if (req.user) {
        return userLimiter(req, res, next);
      }
      
      next();
    });
  };
};

module.exports = {
  ipRateLimiter,
  userRateLimiter,
  authRateLimiter,
  combinedRateLimiter
};
