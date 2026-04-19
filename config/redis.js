const logger = require('../utils/logger');

// Don't create Redis client if it's optional (not installed)
let redis = null;
let Redis = null;

if (process.env.REDIS_OPTIONAL !== 'true') {
  // Redis is required, load and create client
  try {
    Redis = require('redis');
    const redisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.error('Redis: Max reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 1000, 3000);
          logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
        connectTimeout: 5000,
      }
    };
    
    redis = Redis.createClient(redisConfig);
  } catch (error) {
    logger.error('Failed to load Redis module:', error.message);
  }
} else {
  // Redis is optional, don't load or create client
  logger.info('Redis is optional, using in-memory storage');
}

// Event handlers (only if Redis client exists)
if (redis) {
  redis.on('error', (err) => {
    if (process.env.REDIS_OPTIONAL === 'true') {
      // Suppress errors if Redis is optional
      logger.debug('Redis error (optional):', err.code);
    } else {
      logger.error('Redis Client Error:', err);
    }
  });

  redis.on('connect', () => {
    logger.info(' Connected to Redis');
  });

  redis.on('ready', () => {
    logger.info('Redis is ready');
  });

  redis.on('reconnecting', () => {
    logger.warn(' Redis reconnecting...');
  });

  redis.on('end', () => {
    logger.warn(' Redis connection closed');
  });
}

let redisAvailable = false;

// Connect to Redis
const connectRedis = async () => {
  // Skip if Redis client doesn't exist
  if (!redis) {
    logger.info(' Redis disabled, using in-memory storage');
    redisAvailable = false;
    return;
  }

  // Skip Redis connection if optional
  if (process.env.REDIS_OPTIONAL === 'true') {
    try {
      if (!redis.isOpen) {
        await redis.connect();
        logger.info(' Redis connection established');
        redisAvailable = true;
      }
    } catch (error) {
      logger.info('ℹ️ Redis not available, using in-memory fallback');
      redisAvailable = false;
      // Don't throw error, continue without Redis
    }
  } else {
    // Redis is required
    try {
      if (!redis.isOpen) {
        await redis.connect();
        logger.info(' Redis connection established');
        redisAvailable = true;
      }
    } catch (error) {
      logger.error('Failed to connect to Redis:', error.message);
      throw error;
    }
  }
};

// Graceful shutdown
const disconnectRedis = async () => {
  try {
    if (redis && redisAvailable && redis.isOpen) {
      await redis.quit();
      logger.info('Redis connection closed gracefully');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

// Helper functions with fallback
const redisHelpers = {
  // Check if Redis is available
  isAvailable: () => redisAvailable && redis.isOpen,

  // Set with expiration
  setEx: async (key, value, expirationInSeconds) => {
    try {
      if (!redis || !redisAvailable || !redis.isOpen) return false;
      await redis.setEx(key, expirationInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.debug('Redis setEx error:', error.message);
      return false;
    }
  },

  // Get and parse JSON
  get: async (key) => {
    try {
      if (!redis || !redisAvailable || !redis.isOpen) return null;
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.debug('Redis get error:', error.message);
      return null;
    }
  },

  // Delete key
  del: async (key) => {
    try {
      if (!redis || !redisAvailable || !redis.isOpen) return false;
      await redis.del(key);
      return true;
    } catch (error) {
      logger.debug('Redis del error:', error.message);
      return false;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      if (!redis || !redisAvailable || !redis.isOpen) return false;
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.debug('Redis exists error:', error.message);
      return false;
    }
  },

  // Get TTL (time to live)
  ttl: async (key) => {
    try {
      if (!redis || !redisAvailable || !redis.isOpen) return -1;
      return await redis.ttl(key);
    } catch (error) {
      logger.debug('Redis ttl error:', error.message);
      return -1;
    }
  }
};

// Initialize connection only if Redis client exists
if (redis) {
  connectRedis().catch(err => {
    logger.error('Redis connection failed:', err);
  });
}

module.exports = {
  redis,
  connectRedis,
  disconnectRedis,
  ...redisHelpers
};