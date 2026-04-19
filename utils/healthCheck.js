const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Comprehensive health check utility
 * Checks database, redis, and other services
 */

const checkDatabase = async () => {
  try {
    await mongoose.connection.db.admin().ping();
    return {
      status: 'connected',
      responseTime: Date.now()
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'disconnected',
      error: error.message
    };
  }
};

const checkRedis = async () => {
  // TODO: Implement Redis health check when Redis is configured
  return {
    status: 'not_configured',
    message: 'Redis not configured'
  };
};

const getSystemInfo = () => {
  return {
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    },
    cpu: process.cpuUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'development'
  };
};

const performHealthCheck = async () => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: await checkDatabase(),
      redis: await checkRedis()
    },
    system: getSystemInfo()
  };

  // Determine overall status
  if (health.services.database.status !== 'connected') {
    health.status = 'DEGRADED';
  }

  return health;
};

module.exports = {
  performHealthCheck,
  checkDatabase,
  checkRedis,
  getSystemInfo
};
