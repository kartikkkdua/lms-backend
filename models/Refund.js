const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
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
  refundAmount: {
    type: Number,
    required: true,
    min: 0
  },
  originalAmount: {
    type: Number,
    required: true
  },
  refundType: {
    type: String,
    enum: ['full', 'partial'],
    required: true
  },
  refundReason: {
    type: String,
    enum: ['user_request', 'event_cancelled', 'event_postponed', 'duplicate_booking', 'other'],
    required: true
  },
  reasonDetails: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: Date,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin who processed
  },
  refundMethod: {
    type: String,
    enum: ['original_payment', 'bank_transfer', 'wallet', 'other'],
    default: 'original_payment'
  },
  transactionId: String,
  adminNotes: String,
  cancellationFee: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for queries
refundSchema.index({ bookingId: 1 });
refundSchema.index({ userId: 1 });
refundSchema.index({ status: 1 });
refundSchema.index({ requestedAt: -1 });

module.exports = mongoose.model('Refund', refundSchema);
