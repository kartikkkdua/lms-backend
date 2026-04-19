const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  qrCode: String,
  pdfPath: String,
  status: {
    type: String,
    enum: ['active', 'checked_in', 'cancelled'],
    default: 'active'
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: Date,
  attendeeName: {
    type: String,
    required: true
  },
  attendeeEmail: {
    type: String,
    required: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  seatNumber: String,
  seatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seat'
  },
  section: String, // VIP, Premium, Regular, Balcony
  row: String,
  seatPosition: String // e.g., "VIP A12"
}, {
  timestamps: true
});

// Generate unique ticket number before saving
ticketSchema.pre('validate', function(next) {
  if (this.isNew && !this.ticketNumber) {
    this.ticketNumber = `TK${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
  next();
});

// Index for efficient queries
ticketSchema.index({ bookingId: 1 });
ticketSchema.index({ isUsed: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);