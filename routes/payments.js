const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Seat = require('../models/Seat');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { sendEmailWithAttachment } = require('../services/emailService');
const { generateTicketPDF } = require('../services/pdfService');
const razorpayService = require('../services/razorpayService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/payments/initiate:
 *   post:
 *     summary: Initiate payment for a booking
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *               - paymentGateway
 *             properties:
 *               bookingId:
 *                 type: string
 *               paymentGateway:
 *                 type: string
 *                 enum: [stripe, razorpay, paypal]
 *     responses:
 *       200:
 *         description: Payment initiated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Booking not found
 */
router.post('/initiate', auth, async (req, res) => {
  try {
    const { bookingId, paymentGateway } = req.body;

    // Find booking
    const booking = await Booking.findById(bookingId).populate('eventId');
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking is already paid
    if (booking.paymentStatus === 'completed') {
      return res.status(400).json({ error: 'Booking is already paid' });
    }

    // Simulate payment gateway integration
    let paymentResponse;
    const amount = booking.finalAmount;

    switch (paymentGateway) {
      case 'stripe':
        // Simulate Stripe payment intent creation
        paymentResponse = {
          id: `pi_${Date.now()}${Math.random().toString(36).substr(2, 8)}`,
          client_secret: `pi_${Date.now()}_secret_${Math.random().toString(36).substr(2, 8)}`,
          amount: amount * 100, // Stripe uses cents
          currency: 'inr',
          status: 'requires_payment_method'
        };
        break;

      case 'razorpay':
        // Real Razorpay order creation
        const razorpayOrder = await razorpayService.createOrder({
          amount: amount,
          currency: 'INR',
          receipt: `receipt_${booking._id}`,
          notes: {
            bookingId: booking._id.toString(),
            eventId: booking.eventId._id.toString(),
            userId: req.user._id.toString()
          }
        });

        if (!razorpayOrder.success) {
          return res.status(500).json({ error: 'Failed to create Razorpay order' });
        }

        paymentResponse = razorpayOrder.order;
        break;

      case 'paypal':
        // Simulate PayPal order creation
        paymentResponse = {
          id: `PAY-${Date.now()}${Math.random().toString(36).substr(2, 8)}`,
          amount: amount,
          currency: 'USD',
          status: 'CREATED'
        };
        break;

      default:
        return res.status(400).json({ error: 'Invalid payment gateway' });
    }

    // Create payment record
    const payment = new Payment({
      bookingId: booking._id,
      paymentGateway,
      gatewayPaymentId: paymentResponse.id,
      amount: booking.finalAmount,
      currency: booking.eventId.currency || 'INR',
      status: 'pending',
      gatewayResponse: paymentResponse
    });

    await payment.save();

    // Update booking with payment ID
    booking.paymentId = payment._id;
    await booking.save();

    res.json({
      message: 'Payment initiated successfully',
      payment: {
        id: payment._id,
        gatewayPaymentId: paymentResponse.id,
        amount: payment.amount,
        currency: payment.currency,
        gateway: paymentGateway,
        gatewayResponse: paymentResponse
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Handle payment webhook (simulate payment confirmation)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gatewayPaymentId
 *               - status
 *               - gateway
 *             properties:
 *               gatewayPaymentId:
 *                 type: string
 *               status:
 *                 type: string
 *               gateway:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook data
 */
router.post('/webhook', async (req, res) => {
  try {
    const { gatewayPaymentId, status, gateway, ...webhookData } = req.body;

    // Find payment by gateway payment ID
    const payment = await Payment.findOne({ gatewayPaymentId });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Find associated booking
    const booking = await Booking.findById(payment.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update payment status based on webhook
    let paymentStatus = 'pending';
    let bookingStatus = booking.status;
    let bookingPaymentStatus = booking.paymentStatus;

    switch (status.toLowerCase()) {
      case 'succeeded':
      case 'completed':
      case 'captured':
        paymentStatus = 'completed';
        bookingStatus = 'confirmed';
        bookingPaymentStatus = 'completed';
        
        // Confirm seats as booked
        await Seat.updateMany(
          { bookingId: booking._id },
          { status: 'booked' }
        );
        
        // Send payment success email with tickets
        try {
          const event = await Event.findById(booking.eventId);
          const user = await User.findById(booking.userId);
          let tickets = await Ticket.find({ bookingId: booking._id });
          
          // Create tickets if they don't exist
          if (tickets.length === 0 && event && user) {
            const QRCode = require('qrcode');
            
            // Get seat details for this booking
            const bookedSeats = await Seat.find({ bookingId: booking._id }).sort({ section: 1, row: 1, seatNumber: 1 });
            const ticketPromises = [];
            
            for (let i = 0; i < bookedSeats.length; i++) {
              const seat = bookedSeats[i];
              const seatPosition = `${seat.section} ${seat.row}${seat.seatNumber}`;
              
              const ticketData = {
                ticketNumber: `TK${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
                eventId: event._id,
                bookingId: booking._id,
                attendeeName: `${user.firstName} ${user.lastName}`,
                seatNumber: `${seat.row}${seat.seatNumber}`,
                section: seat.section,
                row: seat.row,
                seatPosition: seatPosition,
                timestamp: new Date().toISOString()
              };

              // Generate QR code
              const qrCodeData = JSON.stringify({
                ticketNumber: ticketData.ticketNumber,
                eventId: ticketData.eventId,
                bookingId: ticketData.bookingId,
                attendeeName: ticketData.attendeeName,
                eventTitle: event.title,
                eventDate: event.startDate,
                venue: event.venue,
                section: seat.section,
                seatPosition: seatPosition
              });

              const qrCode = await QRCode.toDataURL(qrCodeData, {
                width: 300,
                margin: 2,
                color: {
                  dark: '#000000',
                  light: '#FFFFFF'
                }
              });

              const ticket = new Ticket({
                ticketNumber: ticketData.ticketNumber,
                bookingId: booking._id,
                attendeeName: ticketData.attendeeName,
                attendeeEmail: user.email,
                seatNumber: ticketData.seatNumber,
                seatId: seat._id,
                section: seat.section,
                row: seat.row,
                seatPosition: seatPosition,
                qrCode: qrCode
              });
              
              ticketPromises.push(ticket.save());
            }
            tickets = await Promise.all(ticketPromises);
            console.log(`✅ Created ${tickets.length} tickets with seat details for booking ${booking.bookingReference}`);
          }
          
          if (event && user && tickets.length > 0) {
            // Generate PDF
            const pdfBuffer = await generateTicketPDF(booking, event, tickets, user);
            
            // Send email with PDF attachment
            await sendEmailWithAttachment(
              user.email,
              'paymentSuccess',
              [user.firstName, booking, event],
              [{
                filename: `ticket-${booking.bookingReference}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
              }]
            );
            console.log(`✅ Payment success email sent to ${user.email}`);
          } else {
            console.log('⚠️ Missing data for email:', { 
              hasEvent: !!event, 
              hasUser: !!user, 
              ticketsCount: tickets.length 
            });
          }
        } catch (emailError) {
          console.error('❌ Failed to send payment success email:', emailError);
          // Don't fail the webhook if email fails
        }
        
        // Emit socket event
        if (req.app.get('io')) {
          const seats = await Seat.find({ bookingId: booking._id });
          if (seats.length > 0) {
            req.app.get('io').to(`event-${seats[0].eventId}`).emit('seats-booked', {
              seatIds: seats.map(s => s._id)
            });
          }
        }
        break;
      
      case 'failed':
      case 'cancelled':
        paymentStatus = 'failed';
        bookingStatus = 'cancelled';
        bookingPaymentStatus = 'failed';
        
        // Release seats back to available
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
        
        // Emit socket event
        if (req.app.get('io')) {
          const seats = await Seat.find({ bookingId: booking._id });
          if (seats.length > 0) {
            req.app.get('io').to(`event-${seats[0].eventId}`).emit('seats-unlocked', {
              seatIds: seats.map(s => s._id)
            });
          }
        }
        break;
      
      case 'refunded':
        paymentStatus = 'refunded';
        bookingStatus = 'refunded';
        bookingPaymentStatus = 'refunded';
        
        // Release seats
        await Seat.updateMany(
          { bookingId: booking._id },
          { 
            $set: { status: 'available' },
            $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
          }
        );
        
        // Restore available seats count
        const refundEvent = await Event.findById(booking.eventId);
        if (refundEvent) {
          refundEvent.availableSeats += booking.seats;
          await refundEvent.save();
        }
        break;
    }

    // Update payment
    payment.status = paymentStatus;
    payment.gatewayResponse = { ...payment.gatewayResponse, ...webhookData };
    await payment.save();

    // Update booking
    booking.status = bookingStatus;
    booking.paymentStatus = bookingPaymentStatus;
    await booking.save();

    console.log(`Payment ${gatewayPaymentId} status updated to ${paymentStatus}`);

    res.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/payments/razorpay/verify:
 *   post:
 *     summary: Verify Razorpay payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Invalid signature
 */
router.post('/razorpay/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    logger.info('Razorpay verification request:', {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      user: req.user._id
    });

    // Verify signature
    const isValid = razorpayService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });

    if (!isValid) {
      logger.error('Invalid Razorpay signature');
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    logger.info('Razorpay signature verified successfully');

    // Find payment by gateway order ID
    const payment = await Payment.findOne({ gatewayPaymentId: razorpay_order_id });
    if (!payment) {
      logger.error('Payment not found for order:', razorpay_order_id);
      return res.status(404).json({ error: 'Payment not found' });
    }

    logger.info('Payment found:', payment._id);

    // Update payment status
    payment.status = 'completed';
    payment.gatewayResponse = {
      ...payment.gatewayResponse,
      razorpay_payment_id,
      razorpay_signature,
      verified_at: new Date()
    };
    await payment.save();

    // Find and update booking
    const booking = await Booking.findById(payment.bookingId)
      .populate('eventId')
      .populate('userId', 'firstName lastName email googleCalendar');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    booking.status = 'confirmed';
    booking.paymentStatus = 'completed';
    booking.lockedUntil = null; // Remove lock
    await booking.save();

    // Update seats from 'locked' to 'booked'
    await Seat.updateMany(
      { bookingId: booking._id, status: 'locked' },
      { 
        status: 'booked',
        $unset: { lockedUntil: '' }
      }
    );

    // Emit socket event for successful booking
    if (req.app.get('io')) {
      req.app.get('io').to(`event-${booking.eventId._id}`).emit('seats-booked', {
        seatIds: booking.selectedSeatIds,
        bookingId: booking._id
      });
    }

    // Generate tickets with QR codes and seat details
    let tickets = await Ticket.find({ bookingId: booking._id });
    
    if (tickets.length === 0) {
      try {
        const QRCode = require('qrcode');
        
        // Get seat details for this booking
        const bookedSeats = await Seat.find({ bookingId: booking._id }).sort({ section: 1, row: 1, seatNumber: 1 });
        
        const ticketPromises = [];
        
        for (let i = 0; i < bookedSeats.length; i++) {
          const seat = bookedSeats[i];
          const seatPosition = `${seat.section} ${seat.row}${seat.seatNumber}`;
          
          const ticketData = {
            ticketNumber: `TK${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            eventId: booking.eventId._id,
            bookingId: booking._id,
            attendeeName: `${booking.userId.firstName} ${booking.userId.lastName}`,
            seatNumber: `${seat.row}${seat.seatNumber}`,
            section: seat.section,
            row: seat.row,
            seatPosition: seatPosition,
            timestamp: new Date().toISOString()
          };

          // Generate QR code
          const qrCodeData = JSON.stringify({
            ticketNumber: ticketData.ticketNumber,
            eventId: ticketData.eventId,
            bookingId: ticketData.bookingId,
            attendeeName: ticketData.attendeeName,
            eventTitle: booking.eventId.title,
            eventDate: booking.eventId.startDate,
            venue: booking.eventId.venue,
            section: seat.section,
            seatPosition: seatPosition
          });

          const qrCode = await QRCode.toDataURL(qrCodeData, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });

          const ticket = new Ticket({
            ticketNumber: ticketData.ticketNumber,
            bookingId: booking._id,
            attendeeName: ticketData.attendeeName,
            attendeeEmail: booking.userId.email,
            seatNumber: ticketData.seatNumber,
            seatId: seat._id,
            section: seat.section,
            row: seat.row,
            seatPosition: seatPosition,
            qrCode: qrCode
          });
          
          ticketPromises.push(ticket.save());
        }
        tickets = await Promise.all(ticketPromises);
        logger.info(`Created ${tickets.length} tickets with seat details for booking: ${booking.bookingReference}`);
      } catch (ticketError) {
        logger.error('Error creating tickets:', ticketError);
        // Continue even if ticket creation fails - can be regenerated later
      }
    }

    // Generate and send ticket PDF
    try {
      const pdfBuffer = await generateTicketPDF(booking, booking.eventId, tickets, booking.userId);
      
      await sendEmailWithAttachment(
        booking.userId.email,
        'bookingConfirmation',
        [booking.userId.firstName, booking, booking.eventId],
        [{
          filename: `ticket-${booking.bookingReference}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }]
      );

      logger.info(`Ticket email sent for booking: ${booking.bookingReference}`);
    } catch (emailError) {
      logger.error('Error sending ticket email:', emailError);
      // Don't fail the payment if email fails
    }

    // Send real-time notifications
    try {
      await notificationService.paymentSuccess(booking.userId._id, payment, booking);
      await notificationService.bookingConfirmed(booking.userId._id, booking);
    } catch (notifError) {
      logger.error('Error sending notifications:', notifError);
    }

    // Add to Google Calendar if connected
    try {
      logger.info(`📅 Checking Google Calendar connection for user: ${booking.userId.email}`);
      logger.info(`Calendar connected: ${booking.userId.googleCalendar?.connected}`);
      
      if (booking.userId.googleCalendar?.connected) {
        logger.info('✅ User has Google Calendar connected, proceeding to create event...');
        const googleCalendarService = require('../services/googleCalendarService');
        
        let tokens = {
          access_token: booking.userId.googleCalendar.accessToken,
          refresh_token: booking.userId.googleCalendar.refreshToken
        };

        // Refresh token if expired
        if (new Date() >= new Date(booking.userId.googleCalendar.tokenExpiry)) {
          logger.info('🔄 Token expired, refreshing...');
          const refreshResult = await googleCalendarService.refreshAccessToken(booking.userId.googleCalendar.refreshToken);
          if (refreshResult.success) {
            tokens = refreshResult.tokens;
            booking.userId.googleCalendar.accessToken = tokens.access_token;
            booking.userId.googleCalendar.tokenExpiry = new Date(tokens.expiry_date);
            await booking.userId.save();
            logger.info('✅ Token refreshed successfully');
          } else {
            logger.error('❌ Token refresh failed:', refreshResult.error);
          }
        }

        logger.info('📤 Calling createCalendarEvent...');
        const calendarResult = await googleCalendarService.createCalendarEvent(
          booking,
          booking.eventId,
          tickets,
          tokens,
          booking.userId.email
        );

        logger.info('📥 Calendar result:', calendarResult);

        if (calendarResult.success) {
          booking.googleCalendarEventId = calendarResult.eventId;
          await booking.save();
          logger.info(`✅ Booking ${booking.bookingReference} added to Google Calendar automatically`);
          logger.info(`🔗 Event link: ${calendarResult.eventLink}`);
        } else {
          logger.error(`❌ Failed to add to calendar: ${calendarResult.error}`);
        }
      } else {
        logger.info('ℹ️ User does not have Google Calendar connected, skipping...');
      }
    } catch (calendarError) {
      logger.error('❌ Error adding to Google Calendar:', calendarError);
      logger.error('Stack trace:', calendarError.stack);
      // Don't fail the payment if calendar fails
    }

    res.json({
      message: 'Payment verified successfully',
      booking: {
        id: booking._id,
        bookingReference: booking.bookingReference,
        status: booking.status,
        paymentStatus: booking.paymentStatus
      },
      payment: {
        id: payment._id,
        status: payment.status,
        razorpay_payment_id
      }
    });
  } catch (error) {
    logger.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/payments/razorpay/key:
 *   get:
 *     summary: Get Razorpay key ID for frontend
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Razorpay key ID
 */
router.get('/razorpay/key', (req, res) => {
  res.json({
    key: razorpayService.getKeyId()
  });
});

/**
 * @swagger
 * /api/payments/razorpay/failed:
 *   post:
 *     summary: Handle Razorpay payment failure
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               error:
 *                 type: object
 *     responses:
 *       200:
 *         description: Payment failure handled
 */
router.post('/razorpay/failed', auth, async (req, res) => {
  try {
    const { razorpay_order_id, error } = req.body;

    logger.info('Razorpay payment failed:', {
      order_id: razorpay_order_id,
      error: error,
      user: req.user._id
    });

    // Find payment by gateway order ID
    const payment = await Payment.findOne({ gatewayPaymentId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    payment.status = 'failed';
    payment.gatewayResponse = {
      ...payment.gatewayResponse,
      error: error,
      failed_at: new Date()
    };
    await payment.save();

    // Find and update booking
    const booking = await Booking.findById(payment.bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'failed';
    await booking.save();

    // Release locked/booked seats back to available
    const releasedSeats = await Seat.find({ bookingId: booking._id });
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

    // Emit socket event to unlock seats
    if (req.app.get('io') && releasedSeats.length > 0) {
      req.app.get('io').to(`event-${releasedSeats[0].eventId}`).emit('seats-unlocked', {
        seatIds: releasedSeats.map(s => s._id),
        bookingId: booking._id
      });
    }

    logger.info(`Payment failed, seats released for booking: ${booking.bookingReference}`);

    // Send failure notification
    try {
      await notificationService.paymentFailed(
        req.user._id,
        booking,
        error?.description || 'Payment was cancelled or failed'
      );
    } catch (notifError) {
      logger.error('Error sending failure notification:', notifError);
    }

    res.json({
      message: 'Payment failure handled',
      booking: {
        id: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus
      }
    });
  } catch (error) {
    logger.error('Error handling payment failure:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/payments/simulate-success:
 *   post:
 *     summary: Simulate successful payment (for testing)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - gatewayPaymentId
 *             properties:
 *               gatewayPaymentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment simulation successful
 */
router.post('/simulate-success', async (req, res) => {
  try {
    const { gatewayPaymentId } = req.body;

    // Simulate successful payment webhook
    const webhookData = {
      gatewayPaymentId,
      status: 'succeeded',
      gateway: 'stripe', // Default to stripe for simulation
      timestamp: new Date().toISOString(),
      simulation: true
    };

    // Call our own webhook endpoint
    const webhookResponse = await fetch(`${req.protocol}://${req.get('host')}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    if (!webhookResponse.ok) {
      throw new Error('Failed to process payment simulation');
    }

    res.json({ 
      message: 'Payment simulation successful',
      gatewayPaymentId 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment details
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details retrieved successfully
 *       404:
 *         description: Payment not found
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate({
        path: 'bookingId',
        populate: {
          path: 'eventId',
          select: 'title startDate venue'
        }
      });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check if user owns this payment
    if (payment.bookingId.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;