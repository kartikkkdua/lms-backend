const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  seats: {
    type: Number,
    required: true,
    min: 1
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  paymentId: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  bookingReference: {
    type: String,
    unique: true
  },
  attendeeDetails: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  couponCode: String,
  discountAmount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  expiresAt: {
    type: Date
  },
  lockedUntil: {
    type: Date,
    index: true
  },
  selectedSeatIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seat'
  }],
  googleCalendarEventId: String // Store Google Calendar event ID
}, {
  timestamps: true
});

// Generate booking reference and set expiry before saving
bookingSchema.pre('validate', function(next) {
  if (this.isNew) {
    this.bookingReference = `BK${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    if (!this.finalAmount) {
      this.finalAmount = this.totalAmount - (this.discountAmount || 0);
    }
    // Set 10-minute lock for pending bookings
    if (this.paymentStatus === 'pending') {
      this.lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      this.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    }
  }
  next();
});

// Index for efficient queries
bookingSchema.index({ userId: 1, eventId: 1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ eventId: 1, status: 1 });
bookingSchema.index({ paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);