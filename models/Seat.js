const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  section: {
    type: String,
    required: true,
    // No enum restriction - supports custom section names from event configuration
  },
  row: {
    type: String,
    required: true
  },
  seatNumber: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['available', 'selected', 'locked', 'booked', 'blocked'],
    default: 'available'
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lockedUntil: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for unique seat identification
seatSchema.index({ eventId: 1, section: 1, row: 1, seatNumber: 1 }, { unique: true });

// Index for efficient queries
seatSchema.index({ eventId: 1, status: 1 });
seatSchema.index({ lockedUntil: 1 });

// Method to check if seat is available
seatSchema.methods.isAvailable = function () {
  if (this.status === 'booked') return false;
  if (this.status === 'blocked') return false;
  
  // If selected but lock expired, it's available
  if (this.status === 'selected') {
    if (!this.lockedUntil || this.lockedUntil < new Date()) {
      return true; // Lock expired
    }
    return false; // Still locked
  }
  
  return true; // Available status
};

// Method to lock seat temporarily
seatSchema.methods.lockSeat = function (userId, minutes = 10) {
  this.status = 'selected';
  this.lockedBy = userId;
  this.lockedUntil = new Date(Date.now() + minutes * 60 * 1000);
  return this.save();
};

// Method to unlock seat
seatSchema.methods.unlockSeat = function () {
  this.status = 'available';
  this.lockedBy = null;
  this.lockedUntil = null;
  return this.save();
};

// Static method to release expired locks
seatSchema.statics.releaseExpiredLocks = async function () {
  const expiredSeats = await this.find({
    status: 'selected',
    lockedUntil: { $lt: new Date() }
  });

  for (const seat of expiredSeats) {
    await seat.unlockSeat();
  }

  return expiredSeats.length;
};

module.exports = mongoose.model('Seat', seatSchema);
