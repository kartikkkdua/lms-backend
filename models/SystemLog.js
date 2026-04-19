const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['auth', 'booking', 'payment', 'event', 'user', 'system', 'security', 'email'],
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ipAddress: String,
  userAgent: String,
  endpoint: String,
  method: String,
  statusCode: Number,
  responseTime: Number,
  error: {
    message: String,
    stack: String
  }
}, {
  timestamps: true
});

// Index for efficient querying
systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ level: 1, createdAt: -1 });
systemLogSchema.index({ category: 1, createdAt: -1 });

// Auto-delete logs older than 90 days
systemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

module.exports = mongoose.model('SystemLog', systemLogSchema);
