const mongoose = require('mongoose');

const checkInSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  checkInTime: {
    type: Date,
    default: Date.now
  },
  checkInMethod: {
    type: String,
    enum: ['qr_scan', 'manual', 'self_checkin'],
    default: 'qr_scan'
  },
  checkedInBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Organizer/Admin who checked in
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  deviceInfo: {
    userAgent: String,
    ip: String
  },
  notes: String
}, {
  timestamps: true
});

// Index for quick lookups
checkInSchema.index({ ticketId: 1 });
checkInSchema.index({ bookingId: 1 });
checkInSchema.index({ eventId: 1 });
checkInSchema.index({ checkInTime: 1 });

module.exports = mongoose.model('CheckIn', checkInSchema);
