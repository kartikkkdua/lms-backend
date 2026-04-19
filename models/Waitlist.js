const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  seatsRequested: {
    type: Number,
    required: true,
    min: 1
  },
  priority: {
    type: Number,
    default: 0 // Higher number = higher priority
  },
  status: {
    type: String,
    enum: ['waiting', 'notified', 'expired', 'converted'],
    default: 'waiting'
  },
  notifiedAt: Date,
  expiresAt: Date,
  maxPrice: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate waitlist entries
waitlistSchema.index({ userId: 1, eventId: 1 }, { unique: true });

// Index for efficient queries
waitlistSchema.index({ eventId: 1, status: 1, priority: -1 });

module.exports = mongoose.model('Waitlist', waitlistSchema);