const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const Seat = require('../models/Seat');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const PromoCodeUsage = require('../models/PromoCodeUsage');
const { auth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { generateTicketPDF } = require('../services/pdfService');
const { sendEmailWithAttachment, sendEmail } = require('../services/emailService');
const { downloadLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

/**
 * @swagger
 * /api/bookings/events/{eventId}/book:
 *   post:
 *     summary: Create a booking for an event
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seats
 *             properties:
 *               seats:
 *                 type: integer
 *               attendeeDetails:
 *                 type: object
 *               couponCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Booking created successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Event not found
 */
router.post('/events/:eventId/book', auth, validate(schemas.createBooking), async (req, res) => {
  try {
    const { seats, selectedSeatIds, attendeeDetails, couponCode } = req.body;
    const eventId = req.params.eventId;

    // Check if user's email is verified
    if (!req.user.isEmailVerified) {
      return res.status(403).json({ 
        error: 'Email verification required',
        message: 'Please verify your email address before booking tickets. Check your inbox for the verification link.'
      });
    }

    // Find event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if event is published and not past
    if (event.status !== 'published') {
      return res.status(400).json({ error: 'Event is not available for booking' });
    }

    if (new Date(event.startDate) < new Date()) {
      return res.status(400).json({ error: 'Cannot book past events' });
    }

    let totalAmount = 0;
    let bookedSeats = [];

    // Handle seat-based booking (with specific seat selection)
    if (selectedSeatIds && selectedSeatIds.length > 0) {
      // Verify seat count matches
      if (selectedSeatIds.length !== seats) {
        return res.status(400).json({ error: 'Number of selected seats does not match requested seats' });
      }

      // Fetch all selected seats
      const selectedSeats = await Seat.find({
        _id: { $in: selectedSeatIds },
        eventId: eventId
      });

      if (selectedSeats.length !== selectedSeatIds.length) {
        return res.status(400).json({ error: 'Some selected seats are invalid' });
      }

      // Check if all seats are available or locked by current user
      for (const seat of selectedSeats) {
        // Seat is available if:
        // 1. Status is 'available', OR
        // 2. Status is 'selected' and locked by current user
        const isAvailableForUser = 
          seat.status === 'available' || 
          (seat.status === 'selected' && seat.lockedBy && seat.lockedBy.toString() === req.user._id.toString());
        
        if (!isAvailableForUser) {
          return res.status(400).json({ 
            error: `Seat ${seat.section} ${seat.row}${seat.seatNumber} is no longer available` 
          });
        }
        totalAmount += seat.price;
      }

      bookedSeats = selectedSeats;
    } else {
      // Handle general booking (without specific seats)
      if (event.availableSeats < seats) {
        return res.status(400).json({ error: `Only ${event.availableSeats} seats available` });
      }
      totalAmount = event.price * seats;
    }

    // Apply promo code if provided
    let discountAmount = 0;
    let promoCodeId = null;
    
    if (couponCode) {
      const promoCode = await PromoCode.findOne({ 
        code: couponCode.toUpperCase(),
        isActive: true 
      });

      if (promoCode) {
        // Validate promo code
        const validation = promoCode.isValid(eventId, event.category);
        
        if (validation.valid) {
          // Check minimum purchase
          if (totalAmount >= promoCode.minPurchase) {
            // Check per-user usage limit
            const userUsageCount = await PromoCodeUsage.countDocuments({
              promoCodeId: promoCode._id,
              userId: req.user._id
            });

            if (userUsageCount < promoCode.perUserLimit) {
              // Calculate discount
              discountAmount = promoCode.calculateDiscount(totalAmount);
              promoCodeId = promoCode._id;
            }
          }
        }
      }
    }

    // Create booking with 10-minute lock
    const booking = new Booking({
      userId: req.user._id,
      eventId: eventId,
      seats,
      totalAmount,
      discountAmount,
      attendeeDetails: attendeeDetails || {},
      selectedSeatIds: selectedSeatIds || [],
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    await booking.save();

    // Record promo code usage if applied
    if (promoCodeId && discountAmount > 0) {
      const promoCodeUsage = new PromoCodeUsage({
        promoCodeId,
        userId: req.user._id,
        bookingId: booking._id,
        discountAmount,
        originalAmount: totalAmount
      });
      await promoCodeUsage.save();

      // Increment promo code usage count atomically with limit check
      const updatedPromoCode = await PromoCode.findOneAndUpdate(
        {
          _id: promoCodeId,
          $or: [
            { usageLimit: null }, // No limit
            { $expr: { $lt: ['$usageCount', '$usageLimit'] } } // Under limit
          ]
        },
        { $inc: { usageCount: 1 } },
        { new: true }
      );

      if (!updatedPromoCode) {
        // Promo code limit reached, but don't fail the booking
        console.warn(`Promo code ${promoCodeId} usage limit reached during booking`);
      }
    }

    // Lock the selected seats atomically with 10-minute timer
    if (bookedSeats.length > 0) {
      await Seat.updateMany(
        { _id: { $in: bookedSeats.map(s => s._id) } },
        { 
          status: 'locked', // Changed from 'booked' to 'locked' for pending payment
          bookingId: booking._id,
          lockedBy: req.user._id,
          lockedUntil: new Date(Date.now() + 10 * 60 * 1000)
        }
      );
      
      // Emit socket event for seat lock
      if (req.app.get('io')) {
        req.app.get('io').to(`event-${eventId}`).emit('seats-locked', {
          seatIds: bookedSeats.map(s => s._id),
          bookingId: booking._id,
          lockedUntil: booking.lockedUntil
        });
      }
    }

    // Update available seats atomically
    const updatedEvent = await Event.findOneAndUpdate(
      { 
        _id: eventId,
        availableSeats: { $gte: seats } // Ensure enough seats
      },
      { $inc: { availableSeats: -seats } },
      { new: true }
    );

    if (!updatedEvent) {
      // Rollback booking if event update fails
      await Booking.findByIdAndDelete(booking._id);
      if (bookedSeats.length > 0) {
        await Seat.updateMany(
          { _id: { $in: bookedSeats.map(s => s._id) } },
          { 
            status: 'available',
            $unset: { bookingId: '', lockedBy: '' }
          }
        );
      }
      return res.status(400).json({ error: 'Not enough seats available' });
    }

    await booking.populate([
      { path: 'userId', select: 'firstName lastName email' },
      { path: 'eventId', select: 'title startDate venue price' }
    ]);

    res.status(201).json({
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings:
 *   get:
 *     summary: Get user's bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 */
router.get('/', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('eventId', 'title startDate venue city')
      .sort({ createdAt: -1 });

    // Filter out bookings with deleted events
    const validBookings = bookings.filter(booking => booking.eventId);

    res.json({ bookings: validBookings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings/{id}:
 *   get:
 *     summary: Get booking by ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking retrieved successfully
 *       404:
 *         description: Booking not found
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'firstName lastName email')
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking or is admin
    if (booking.userId._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings/{id}/cancel:
 *   put:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       400:
 *         description: Cannot cancel booking
 *       404:
 *         description: Booking not found
 */
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    if (booking.paymentStatus === 'completed') {
      // Check if event is at least 24 hours away
      const eventDate = new Date(booking.eventId.startDate);
      const now = new Date();
      const timeDiff = eventDate.getTime() - now.getTime();
      const hoursDiff = timeDiff / (1000 * 3600);

      if (hoursDiff < 24) {
        return res.status(400).json({ error: 'Cannot cancel booking less than 24 hours before event' });
      }
    }

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // Release booked seats
    const releasedSeats = await Seat.find({ bookingId: booking._id });
    const seatIds = releasedSeats.map(s => s._id);
    
    await Seat.updateMany(
      { bookingId: booking._id },
      { 
        $set: { status: 'available' },
        $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
      }
    );

    // Restore available seats
    const event = await Event.findById(booking.eventId._id);
    event.availableSeats += booking.seats;
    await event.save();

    // Emit socket event to update seat map in real-time
    const io = req.app.get('io');
    if (io) {
      const eventData = {
        eventId: booking.eventId._id,
        seatIds,
        bookingId: booking._id,
        reason: 'cancelled'
      };
      io.to(`event-${booking.eventId._id}`).emit('seats-unlocked', eventData);
      console.log(`[Socket] Emitted seats-unlocked for cancelled booking:`, eventData);
    } else {
      console.warn('[Socket] Socket.io not available for seat unlock event');
    }

    // Send cancellation email
    try {
      const user = await User.findById(booking.userId);
      if (user) {
        await sendEmail(user.email, 'bookingCancellation', [user.firstName, booking, booking.eventId]);
      }
    } catch (emailError) {
      console.error('Failed to send cancellation email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings/{id}/ticket:
 *   get:
 *     summary: Get ticket for confirmed booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Ticket retrieved successfully
 *       400:
 *         description: Booking not confirmed
 *       404:
 *         description: Booking not found
 */
router.get('/:id/ticket', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking is confirmed
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Booking is not confirmed. Complete payment first.' });
    }

    // Find or create tickets
    let tickets = await Ticket.find({ bookingId: booking._id });
    
    if (tickets.length === 0) {
      // Create tickets for this booking
      const QRCode = require('qrcode');
      const ticketPromises = [];
      
      for (let i = 0; i < booking.seats; i++) {
        const ticketData = {
          ticketNumber: `TK${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          eventId: booking.eventId._id,
          bookingId: booking._id,
          attendeeName: `${req.user.firstName} ${req.user.lastName}`,
          seatNumber: `${i + 1}`,
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
          venue: booking.eventId.venue
        });

        const qrCode = await QRCode.toDataURL(qrCodeData);

        const ticket = new Ticket({
          ticketNumber: ticketData.ticketNumber,
          bookingId: booking._id,
          attendeeName: ticketData.attendeeName,
          attendeeEmail: req.user.email,
          seatNumber: ticketData.seatNumber,
          qrCode: qrCode
        });
        
        ticketPromises.push(ticket.save());
      }
      tickets = await Promise.all(ticketPromises);
    }

    res.json({ 
      booking,
      tickets 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings/{id}/download-ticket:
 *   get:
 *     summary: Download ticket PDF
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: PDF ticket downloaded
 *       400:
 *         description: Booking not confirmed
 *       404:
 *         description: Booking not found
 */
router.get('/:id/download-ticket', auth, downloadLimiter, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('eventId')
      .populate('userId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking is confirmed
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Booking is not confirmed. Complete payment first.' });
    }

    // Get tickets
    let tickets = await Ticket.find({ bookingId: booking._id });
    
    if (tickets.length === 0) {
      return res.status(400).json({ error: 'No tickets found for this booking' });
    }

    // Generate PDF
    const pdfBuffer = await generateTicketPDF(booking, booking.eventId, tickets, booking.userId);

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ticket-${booking.bookingReference}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/bookings/{id}/email-ticket:
 *   post:
 *     summary: Email ticket PDF
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Ticket emailed successfully
 *       400:
 *         description: Booking not confirmed
 *       404:
 *         description: Booking not found
 */
router.post('/:id/email-ticket', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('eventId')
      .populate('userId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking is confirmed
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Booking is not confirmed. Complete payment first.' });
    }

    // Get tickets
    let tickets = await Ticket.find({ bookingId: booking._id });
    
    if (tickets.length === 0) {
      return res.status(400).json({ error: 'No tickets found for this booking' });
    }

    // Generate PDF
    const pdfBuffer = await generateTicketPDF(booking, booking.eventId, tickets, booking.userId);

    // Send email with PDF attachment
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

    res.json({ message: 'Ticket sent to your email successfully' });
  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;