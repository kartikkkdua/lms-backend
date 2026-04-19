const SystemLog = require('../models/SystemLog');
const logger = require('../utils/logger');

class LogService {
  async createLog({ level, category, message, details, userId, req, error }) {
    try {
      const logData = {
        level,
        category,
        message,
        details,
        userId
      };

      if (req) {
        logData.ipAddress = req.ip || req.connection.remoteAddress;
        logData.userAgent = req.get('user-agent');
        logData.endpoint = req.originalUrl;
        logData.method = req.method;
      }

      if (error) {
        logData.error = {
          message: error.message,
          stack: error.stack
        };
      }

      await SystemLog.create(logData);
    } catch (err) {
      logger.error('Failed to create system log:', err);
    }
  }

  async getLogs({ page = 1, limit = 50, level, category, startDate, endDate, search }) {
    try {
      const query = {};

      if (level) query.level = level;
      if (category) query.category = category;
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      if (search) {
        query.$or = [
          { message: new RegExp(search, 'i') },
          { 'details.action': new RegExp(search, 'i') }
        ];
      }

      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        SystemLog.find(query)
          .populate('userId', 'firstName lastName email role')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        SystemLog.countDocuments(query)
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get logs:', error);
      throw error;
    }
  }

  async getLogStats() {
    try {
      const [
        totalLogs,
        errorCount,
        warningCount,
        criticalCount,
        recentErrors
      ] = await Promise.all([
        SystemLog.countDocuments(),
        SystemLog.countDocuments({ level: 'error' }),
        SystemLog.countDocuments({ level: 'warning' }),
        SystemLog.countDocuments({ level: 'critical' }),
        SystemLog.find({ level: { $in: ['error', 'critical'] } })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      ]);

      return {
        totalLogs,
        errorCount,
        warningCount,
        criticalCount,
        recentErrors
      };
    } catch (error) {
      logger.error('Failed to get log stats:', error);
      throw error;
    }
  }

  // Helper methods for common log types
  logAuth(message, details, userId, req) {
    return this.createLog({
      level: 'info',
      category: 'auth',
      message,
      details,
      userId,
      req
    });
  }

  logBooking(message, details, userId, req) {
    return this.createLog({
      level: 'info',
      category: 'booking',
      message,
      details,
      userId,
      req
    });
  }

  logPayment(message, details, userId, req) {
    return this.createLog({
      level: 'info',
      category: 'payment',
      message,
      details,
      userId,
      req
    });
  }

  logError(message, error, userId, req) {
    return this.createLog({
      level: 'error',
      category: 'system',
      message,
      error,
      userId,
      req
    });
  }

  logSecurity(message, details, userId, req) {
    return this.createLog({
      level: 'warning',
      category: 'security',
      message,
      details,
      userId,
      req
    });
  }
}

module.exports = new LogService();
