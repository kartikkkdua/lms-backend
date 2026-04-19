const logger = require('../utils/logger');
const Notification = require('../models/Notification');

/**
 * Notification Service
 * Handles real-time notifications via Socket.io and database storage
 */

class NotificationService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize Socket.io instance
   * @param {Object} io - Socket.io instance
   */
  initialize(io) {
    this.io = io;
    logger.info(' Notification service initialized');
  }

  /**
   * Send notification to specific user
   * @param {String} userId - User ID
   * @param {Object} notification - Notification data
   */
  async sendToUser(userId, notification) {
    try {
      // Save to database
      const dbNotification = new Notification({
        userId,
        ...notification
      });
      await dbNotification.save();

      // Send via Socket.io if available
      if (this.io) {
        const notificationData = {
          id: dbNotification._id,
          timestamp: dbNotification.createdAt,
          read: false,
          ...notification
        };

        this.io.to(`user-${userId}`).emit('notification', notificationData);
        logger.info(`Notification sent to user ${userId}: ${notification.type}`);
      }

      return dbNotification;
    } catch (error) {
      logger.error('Error sending notification:', error);
      return null;
    }
  }

  /**
   * Send notification to multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {Object} notification - Notification data
   */
  sendToUsers(userIds, notification) {
    userIds.forEach(userId => {
      this.sendToUser(userId, notification);
    });
  }

  /**
   * Booking confirmation notification
   * @param {String} userId - User ID
   * @param {Object} booking - Booking details
   */
  bookingConfirmed(userId, booking) {
    this.sendToUser(userId, {
      type: 'booking_confirmed',
      title: '🎉 Booking Confirmed!',
      message: `Your booking ${booking.bookingReference} has been confirmed.`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        eventTitle: booking.eventId?.title,
        seats: booking.seats,
        amount: booking.finalAmount
      },
      action: {
        label: 'View Booking',
        url: `/bookings/${booking._id}`
      },
      priority: 'high'
    });
  }

  /**
   * Payment success notification
   * @param {String} userId - User ID
   * @param {Object} payment - Payment details
   * @param {Object} booking - Booking details
   */
  paymentSuccess(userId, payment, booking) {
    this.sendToUser(userId, {
      type: 'payment_success',
      title: '💳 Payment Successful',
      message: `Payment of ₹${payment.amount} completed successfully.`,
      data: {
        paymentId: payment._id,
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        amount: payment.amount
      },
      action: {
        label: 'Download Ticket',
        url: `/bookings/${booking._id}/ticket`
      },
      priority: 'high'
    });
  }

  /**
   * Payment failed notification
   * @param {String} userId - User ID
   * @param {Object} booking - Booking details
   * @param {String} reason - Failure reason
   */
  paymentFailed(userId, booking, reason) {
    this.sendToUser(userId, {
      type: 'payment_failed',
      title: '❌ Payment Failed',
      message: `Payment for booking ${booking.bookingReference} failed. ${reason}`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        reason
      },
      action: {
        label: 'Retry Payment',
        url: `/bookings/${booking._id}/payment`
      },
      priority: 'high'
    });
  }

  /**
   * Event reminder notification
   * @param {String} userId - User ID
   * @param {Object} booking - Booking details
   * @param {Object} event - Event details
   * @param {String} timeframe - e.g., "1 day", "2 hours", "15 minutes"
   */
  eventReminder(userId, booking, event, timeframe) {
    this.sendToUser(userId, {
      type: 'event_reminder',
      title: `⏰ Event in ${timeframe}`,
      message: `${event.title} starts in ${timeframe}. Don't forget your tickets!`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        eventId: event._id,
        eventTitle: event.title,
        startDate: event.startDate,
        venue: event.venue,
        timeframe
      },
      action: {
        label: 'View Ticket',
        url: `/bookings/${booking._id}/ticket`
      },
      priority: 'high'
    });
  }

  /**
   * Waitlist availability notification
   * @param {String} userId - User ID
   * @param {Object} event - Event details
   */
  waitlistAvailable(userId, event) {
    this.sendToUser(userId, {
      type: 'waitlist_available',
      title: '🎫 Tickets Available!',
      message: `Tickets are now available for ${event.title}. Book now!`,
      data: {
        eventId: event._id,
        eventTitle: event.title,
        availableSeats: event.availableSeats,
        price: event.price
      },
      action: {
        label: 'Book Now',
        url: `/events/${event._id}`
      },
      priority: 'high'
    });
  }

  /**
   * Refund initiated notification
   * @param {String} userId - User ID
   * @param {Object} refund - Refund details
   */
  refundInitiated(userId, refund) {
    this.sendToUser(userId, {
      type: 'refund_initiated',
      title: '💰 Refund Initiated',
      message: `Your refund request for ₹${refund.amount} has been initiated.`,
      data: {
        refundId: refund._id,
        bookingReference: refund.bookingId?.bookingReference,
        amount: refund.amount,
        status: refund.status
      },
      action: {
        label: 'View Details',
        url: `/refunds/${refund._id}`
      },
      priority: 'medium'
    });
  }

  /**
   * Refund approved notification
   * @param {String} userId - User ID
   * @param {Object} refund - Refund details
   */
  refundApproved(userId, refund) {
    this.sendToUser(userId, {
      type: 'refund_approved',
      title: '✅ Refund Approved',
      message: `Your refund of ₹${refund.amount} has been approved and will be processed soon.`,
      data: {
        refundId: refund._id,
        bookingReference: refund.bookingId?.bookingReference,
        amount: refund.amount,
        status: refund.status
      },
      action: {
        label: 'View Details',
        url: `/refunds/${refund._id}`
      },
      priority: 'high'
    });
  }

  /**
   * Refund completed notification
   * @param {String} userId - User ID
   * @param {Object} refund - Refund details
   */
  refundCompleted(userId, refund) {
    this.sendToUser(userId, {
      type: 'refund_completed',
      title: '💸 Refund Completed',
      message: `₹${refund.amount} has been refunded to your account.`,
      data: {
        refundId: refund._id,
        bookingReference: refund.bookingId?.bookingReference,
        amount: refund.amount,
        transactionId: refund.transactionId
      },
      action: {
        label: 'View Details',
        url: `/refunds/${refund._id}`
      },
      priority: 'high'
    });
  }

  /**
   * Booking cancelled notification
   * @param {String} userId - User ID
   * @param {Object} booking - Booking details
   */
  bookingCancelled(userId, booking) {
    this.sendToUser(userId, {
      type: 'booking_cancelled',
      title: '🚫 Booking Cancelled',
      message: `Your booking ${booking.bookingReference} has been cancelled.`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        eventTitle: booking.eventId?.title
      },
      action: {
        label: 'View Details',
        url: `/bookings/${booking._id}`
      },
      priority: 'medium'
    });
  }

  /**
   * Event updated notification (for organizers)
   * @param {String} userId - User ID
   * @param {Object} event - Event details
   * @param {String} updateType - Type of update
   */
  eventUpdated(userId, event, updateType) {
    this.sendToUser(userId, {
      type: 'event_updated',
      title: '📝 Event Updated',
      message: `${event.title} has been ${updateType}.`,
      data: {
        eventId: event._id,
        eventTitle: event.title,
        updateType
      },
      action: {
        label: 'View Event',
        url: `/events/${event._id}`
      },
      priority: 'low'
    });
  }

  /**
   * New booking notification (for organizers)
   * @param {String} organizerId - Organizer user ID
   * @param {Object} booking - Booking details
   * @param {Object} event - Event details
   */
  newBooking(organizerId, booking, event) {
    this.sendToUser(organizerId, {
      type: 'new_booking',
      title: '🎫 New Booking',
      message: `New booking for ${event.title}: ${booking.seats} seat(s)`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        eventId: event._id,
        eventTitle: event.title,
        seats: booking.seats,
        amount: booking.finalAmount
      },
      action: {
        label: 'View Booking',
        url: `/organizer/bookings/${booking._id}`
      },
      priority: 'medium'
    });
  }

  /**
   * Booking lock expiring notification
   * @param {String} userId - User ID
   * @param {Object} booking - Booking details
   * @param {Number} minutesLeft - Minutes remaining
   */
  bookingLockExpiring(userId, booking, minutesLeft) {
    this.sendToUser(userId, {
      type: 'booking_lock_expiring',
      title: '⏰ Complete Your Booking',
      message: `Your booking expires in ${minutesLeft} minute(s). Complete payment now!`,
      data: {
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        minutesLeft,
        expiresAt: booking.lockedUntil
      },
      action: {
        label: 'Complete Payment',
        url: `/bookings/${booking._id}/payment`
      },
      priority: 'urgent'
    });
  }

  /**
   * System notification (for admins)
   * @param {String} message - Notification message
   * @param {String} priority - Priority level
   */
  systemNotification(message, priority = 'medium') {
    if (!this.io) return;

    this.io.to('admin-room').emit('notification', {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'system',
      title: '🔔 System Notification',
      message,
      timestamp: new Date().toISOString(),
      priority,
      read: false
    });
  }
}

module.exports = new NotificationService();
