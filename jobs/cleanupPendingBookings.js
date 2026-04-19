const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const Event = require('../models/Event');
const logger = require('../utils/logger');

/**
 * Cleanup pending bookings that are older than 15 minutes
 * This handles cases where users abandon the payment process
 */
async function cleanupPendingBookings() {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Find pending bookings older than 15 minutes
    const pendingBookings = await Booking.find({
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: { $lt: fifteenMinutesAgo }
    });

    if (pendingBookings.length === 0) {
      logger.info('No pending bookings to cleanup');
      return;
    }

    logger.info(`Found ${pendingBookings.length} pending bookings to cleanup`);

    for (const booking of pendingBookings) {
      try {
        // Cancel the booking
        booking.status = 'cancelled';
        booking.paymentStatus = 'failed';
        await booking.save();

        // Release seats
        await Seat.updateMany(
          { bookingId: booking._id },
          { 
            $set: { status: 'available' },
            $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
          }
        );

        // Restore available seats count
        const event = await Event.findById(booking.eventId);
        if (event) {
          event.availableSeats += booking.seats;
          await event.save();
        }

        logger.info(`Cleaned up pending booking: ${booking.bookingReference}`);
      } catch (error) {
        logger.error(`Error cleaning up booking ${booking.bookingReference}:`, error);
      }
    }

    logger.info(`Cleanup completed: ${pendingBookings.length} bookings processed`);
  } catch (error) {
    logger.error('Error in cleanupPendingBookings job:', error);
  }
}

module.exports = cleanupPendingBookings;
