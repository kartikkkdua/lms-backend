const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const { sendEmail } = require('./emailService');
const logger = require('../utils/logger');

class ReminderService {
  // Send 24-hour reminders
  async send24HourReminders() {
    try {
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 24);
      
      const dayAfterTomorrow = new Date();
      dayAfterTomorrow.setHours(dayAfterTomorrow.getHours() + 25);

      const bookings = await Booking.find({
        status: 'confirmed',
        paymentStatus: 'completed',
        'eventId.startDate': {
          $gte: tomorrow,
          $lt: dayAfterTomorrow
        }
      })
      .populate('userId', 'firstName lastName email')
      .populate('eventId', 'title startDate venue city');

      logger.info(`Found ${bookings.length} bookings for 24h reminders`);

      for (const booking of bookings) {
        try {
          // Create notification
          await Notification.create({
            userId: booking.userId._id,
            type: 'event_reminder_24h',
            title: 'Event Tomorrow!',
            message: `Your event "${booking.eventId.title}" is tomorrow at ${new Date(booking.eventId.startDate).toLocaleTimeString()}`,
            data: {
              bookingId: booking._id,
              eventId: booking.eventId._id
            }
          });

          // Send email
          await sendEmail(
            booking.userId.email,
            'eventReminder24h',
            [booking.userId.firstName, booking, booking.eventId]
          );

          logger.info(`24h reminder sent for booking ${booking._id}`);
        } catch (error) {
          logger.error(`Failed to send 24h reminder for booking ${booking._id}:`, error);
        }
      }

      return { sent: bookings.length };
    } catch (error) {
      logger.error('Failed to send 24h reminders:', error);
      throw error;
    }
  }

  // Send 1-hour reminders
  async send1HourReminders() {
    try {
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
      
      const twoHoursFromNow = new Date();
      twoHoursFromNow.setHours(twoHoursFromNow.getHours() + 2);

      const bookings = await Booking.find({
        status: 'confirmed',
        paymentStatus: 'completed',
        'eventId.startDate': {
          $gte: oneHourFromNow,
          $lt: twoHoursFromNow
        }
      })
      .populate('userId', 'firstName lastName email')
      .populate('eventId', 'title startDate venue city');

      logger.info(`Found ${bookings.length} bookings for 1h reminders`);

      for (const booking of bookings) {
        try {
          // Create notification
          await Notification.create({
            userId: booking.userId._id,
            type: 'event_reminder_1h',
            title: 'Event Starting Soon!',
            message: `Your event "${booking.eventId.title}" starts in 1 hour!`,
            data: {
              bookingId: booking._id,
              eventId: booking.eventId._id
            }
          });

          // Send email
          await sendEmail(
            booking.userId.email,
            'eventReminder1h',
            [booking.userId.firstName, booking, booking.eventId]
          );

          logger.info(`1h reminder sent for booking ${booking._id}`);
        } catch (error) {
          logger.error(`Failed to send 1h reminder for booking ${booking._id}:`, error);
        }
      }

      return { sent: bookings.length };
    } catch (error) {
      logger.error('Failed to send 1h reminders:', error);
      throw error;
    }
  }

  // Send booking confirmation
  async sendBookingConfirmation(booking, user, event) {
    try {
      await Notification.create({
        userId: user._id,
        type: 'booking_confirmation',
        title: 'Booking Confirmed!',
        message: `Your booking for "${event.title}" has been confirmed`,
        data: {
          bookingId: booking._id,
          eventId: event._id
        }
      });

      await sendEmail(
        user.email,
        'bookingConfirmation',
        [user.firstName, booking, event]
      );

      logger.info(`Booking confirmation sent for booking ${booking._id}`);
    } catch (error) {
      logger.error(`Failed to send booking confirmation for ${booking._id}:`, error);
    }
  }

  // Send refund status updates
  async sendRefundUpdate(refund, user, status) {
    try {
      const messages = {
        requested: {
          title: 'Refund Request Received',
          message: 'Your refund request has been received and is being processed'
        },
        approved: {
          title: 'Refund Approved',
          message: 'Your refund has been approved and will be processed shortly'
        },
        rejected: {
          title: 'Refund Rejected',
          message: 'Your refund request has been rejected'
        },
        completed: {
          title: 'Refund Completed',
          message: `Your refund of ₹${refund.refundAmount} has been processed`
        }
      };

      const notification = messages[status];

      await Notification.create({
        userId: user._id,
        type: `refund_${status}`,
        title: notification.title,
        message: notification.message,
        data: {
          refundId: refund._id,
          bookingId: refund.bookingId
        }
      });

      await sendEmail(
        user.email,
        `refund${status.charAt(0).toUpperCase() + status.slice(1)}`,
        [user.firstName, refund]
      );

      logger.info(`Refund ${status} notification sent for refund ${refund._id}`);
    } catch (error) {
      logger.error(`Failed to send refund ${status} notification:`, error);
    }
  }
}

module.exports = new ReminderService();
