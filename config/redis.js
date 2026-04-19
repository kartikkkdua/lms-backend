const logger = require('../utils/logger');

// Don't create Redis client if it's optional (not installed)
let redis = null;
let Redis = null;

if (process.env.REDIS_URL) {
  try {
    Redis = require('redis');
    const redisConfig = {
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis: Max reconnection attempts reached, disabling Redis');
            return false; // stop retrying, but don't crash
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
    logger.warn('Failed to load Redis module, continuing without Redis:', error.message);
  }
} else {
  logger.info('No REDIS_URL set, using in-memory storage');
}

// Event handlers (only if Redis client exists)
if (redis) {
  redis.on('error', (err) => {
    // Never crash on Redis errors - just log and continue
    logger.warn('Redis Client Error (non-fatal):', err.code || err.message);
    redisAvailable = false;
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
  if (!redis) {
    logger.info('Redis disabled, using in-memory storage');
    redisAvailable = false;
    return;
  }

  try {
    if (!redis.isOpen) {
      await redis.connect();
      logger.info('Redis connection established');
      redisAvailable = true;
    }
  } catch (error) {
    logger.warn('Redis not available, continuing with in-memory fallback:', error.code || error.message);
    redisAvailable = false;
    // Never throw - server starts fine without Redis
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
    logger.warn('Redis connection failed (non-fatal):', err.code || err.message);
    redisAvailable = false;
  });
}

module.exports = {
  redis,
  connectRedis,
  disconnectRedis,
  ...redisHelpers
};