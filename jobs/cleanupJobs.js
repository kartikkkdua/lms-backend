const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const Event = require('../models/Event');
const Session = require('../models/Session');
const logger = require('../utils/logger');

/**
 * Background cleanup jobs
 * These run periodically to maintain data integrity
 */

/**
 * Cancel expired unpaid bookings (10-minute lock)
 * Runs every minute
 */
const cancelExpiredBookings = async () => {
  try {
    const now = new Date();
    const expiredBookings = await Booking.find({
      paymentStatus: 'pending',
      status: 'pending',
      lockedUntil: { $lt: now } // Lock expired
    });

    if (expiredBookings.length === 0) return;

    logger.info(`🧹 Found ${expiredBookings.length} expired bookings to cancel`);

    for (const booking of expiredBookings) {
      // Cancel booking
      booking.status = 'cancelled';
      booking.paymentStatus = 'failed';
      await booking.save();

      // Release locked seats
      await Seat.updateMany(
        { bookingId: booking._id },
        { 
          status: 'available',
          $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
        }
      );

      // Restore event available seats
      await Event.findByIdAndUpdate(
        booking.eventId,
        { $inc: { availableSeats: booking.seats } }
      );

      logger.info(` Cancelled expired booking: ${booking.bookingReference} (lock expired)`);
    }
  } catch (error) {
    logger.error(' Error cancelling expired bookings:', error);
  }
};

/**
 * Release expired seat locks
 * Runs every 30 seconds
 */
const releaseExpiredSeatLocks = async () => {
  try {
    const now = new Date();
    
    // Release 'selected' seats (temporary selection during browsing)
    const selectedResult = await Seat.updateMany(
      { 
        status: 'selected', 
        lockedUntil: { $lt: now } 
      },
      { 
        status: 'available',
        $unset: { lockedBy: '', lockedUntil: '' }
      }
    );
    
    // Release 'locked' seats (payment pending but lock expired)
    const lockedResult = await Seat.updateMany(
      { 
        status: 'locked', 
        lockedUntil: { $lt: now } 
      },
      { 
        status: 'available',
        $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
      }
    );
    
    const totalReleased = selectedResult.modifiedCount + lockedResult.modifiedCount;
    if (totalReleased > 0) {
      logger.info(` Released ${totalReleased} expired seat locks (${selectedResult.modifiedCount} selected, ${lockedResult.modifiedCount} locked)`);
    }
  } catch (error) {
    logger.error(' Error releasing seat locks:', error);
  }
};

/**
 * Clean up expired sessions
 * Runs every hour
 */
const cleanupExpiredSessions = async () => {
  try {
    const result = await Session.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    if (result.deletedCount > 0) {
      logger.info(` Cleaned up ${result.deletedCount} expired sessions`);
    }
  } catch (error) {
    logger.error(' Error cleaning up sessions:', error);
  }
};

/**
 * Mark past events as completed
 * Runs every hour
 */
const markPastEventsCompleted = async () => {
  try {
    const result = await Event.updateMany(
      {
        status: 'published',
        endDate: { $lt: new Date() }
      },
      { status: 'completed' }
    );
    
    if (result.modifiedCount > 0) {
      logger.info(` Marked ${result.modifiedCount} past events as completed`);
    }
  } catch (error) {
    logger.error(' Error marking past events:', error);
  }
};

/**
 * Start all cleanup jobs
 */
const startCleanupJobs = () => {
  logger.info(' Starting cleanup jobs...');

  // Release expired seat locks every 30 seconds
  setInterval(releaseExpiredSeatLocks, 30 * 1000);
  
  // Cancel expired bookings every minute
  setInterval(cancelExpiredBookings, 60 * 1000);
  
  // Cleanup expired sessions every hour
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
  
  // Mark past events as completed every hour
  setInterval(markPastEventsCompleted, 60 * 60 * 1000);

  // Run immediately on startup
  releaseExpiredSeatLocks();
  cancelExpiredBookings();
  cleanupExpiredSessions();
  markPastEventsCompleted();

  // Start log cleanup job
  const { startLogCleanup } = require('./logCleanup');
  startLogCleanup();

  logger.info(' Cleanup jobs started successfully');
};

module.exports = {
  startCleanupJobs,
  cancelExpiredBookings,
  releaseExpiredSeatLocks,
  cleanupExpiredSessions,
  markPastEventsCompleted
};
