const express = require('express');
const CheckIn = require('../models/CheckIn');
const Ticket = require('../models/Ticket');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/checkin/verify:
 *   post:
 *     summary: Verify ticket QR code
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ticketNumber
 *             properties:
 *               ticketNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket verified successfully
 */
router.post('/verify', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { ticketNumber } = req.body;

    if (!ticketNumber) {
      return res.status(400).json({ error: 'Ticket number is required' });
    }

    // Find ticket
    const ticket = await Ticket.findOne({ ticketNumber })
      .populate('bookingId')
      .populate({
        path: 'bookingId',
        populate: {
          path: 'eventId userId',
          select: 'title startDate venue firstName lastName email'
        }
      });

    if (!ticket) {
      return res.status(404).json({ 
        valid: false,
        error: 'Invalid ticket number' 
      });
    }

    const booking = ticket.bookingId;
    const event = booking.eventId;

    // Check if booking is confirmed
    if (booking.status !== 'confirmed' || booking.paymentStatus !== 'completed') {
      return res.status(400).json({
        valid: false,
        error: 'Ticket is not confirmed. Payment may be pending.'
      });
    }

    // Check if booking is cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        valid: false,
        error: 'This booking has been cancelled'
      });
    }

    // Check if already checked in
    const existingCheckIn = await CheckIn.findOne({ ticketId: ticket._id });
    if (existingCheckIn) {
      return res.status(400).json({
        valid: false,
        error: 'Ticket already checked in',
        checkInTime: existingCheckIn.checkInTime,
        alreadyCheckedIn: true
      });
    }

    // Check if event date is today or in the past
    const eventDate = new Date(event.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (eventDate < today) {
      return res.status(400).json({
        valid: false,
        error: 'Event has already ended'
      });
    }

    // Ticket is valid
    res.json({
      valid: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        attendeeName: ticket.attendeeName,
        seatNumber: ticket.seatNumber
      },
      booking: {
        bookingReference: booking.bookingReference,
        seats: booking.seats
      },
      event: {
        title: event.title,
        startDate: event.startDate,
        venue: event.venue
      },
      user: {
        name: `${booking.userId.firstName} ${booking.userId.lastName}`,
        email: booking.userId.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/checkin:
 *   post:
 *     summary: Check in a ticket
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ticketNumber
 *             properties:
 *               ticketNumber:
 *                 type: string
 *               method:
 *                 type: string
 *                 enum: [qr_scan, manual, self_checkin]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Check-in successful
 */
router.post('/', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { ticketNumber, method = 'qr_scan', notes } = req.body;

    // Find ticket
    const ticket = await Ticket.findOne({ ticketNumber })
      .populate('bookingId');

    if (!ticket) {
      return res.status(404).json({ error: 'Invalid ticket number' });
    }

    const booking = ticket.bookingId;

    // Check if already checked in
    const existingCheckIn = await CheckIn.findOne({ ticketId: ticket._id });
    if (existingCheckIn) {
      return res.status(400).json({ 
        error: 'Ticket already checked in',
        checkInTime: existingCheckIn.checkInTime
      });
    }

    // Create check-in record
    const checkIn = new CheckIn({
      ticketId: ticket._id,
      bookingId: booking._id,
      eventId: booking.eventId,
      userId: booking.userId,
      checkInMethod: method,
      checkedInBy: req.user._id,
      deviceInfo: {
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      notes
    });

    await checkIn.save();

    // Update ticket status
    ticket.status = 'checked_in';
    await ticket.save();

    res.json({
      message: 'Check-in successful',
      checkIn: {
        ticketNumber: ticket.ticketNumber,
        attendeeName: ticket.attendeeName,
        checkInTime: checkIn.checkInTime
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/checkin/event/{eventId}/stats:
 *   get:
 *     summary: Get check-in statistics for an event
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Check-in stats retrieved successfully
 */
router.get('/event/:eventId/stats', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { eventId } = req.params;

    // Get total bookings
    const totalBookings = await Booking.countDocuments({
      eventId,
      status: 'confirmed',
      paymentStatus: 'completed'
    });

    // Get total tickets
    const totalTickets = await Ticket.countDocuments({
      bookingId: { $in: await Booking.find({ eventId }).distinct('_id') }
    });

    // Get checked-in count
    const checkedInCount = await CheckIn.countDocuments({ eventId });

    // Get check-ins by hour
    const mongoose = require('mongoose');
    const checkInsByHour = await CheckIn.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: { $hour: '$checkInTime' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get check-ins by method
    const checkInsByMethod = await CheckIn.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
      {
        $group: {
          _id: '$checkInMethod',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get recent check-ins
    const recentCheckIns = await CheckIn.find({ eventId })
      .populate('ticketId', 'ticketNumber attendeeName')
      .sort({ checkInTime: -1 })
      .limit(10);

    res.json({
      stats: {
        totalBookings,
        totalTickets,
        checkedInCount,
        pendingCheckIn: totalTickets - checkedInCount,
        checkInPercentage: totalTickets > 0 ? ((checkedInCount / totalTickets) * 100).toFixed(2) : 0
      },
      checkInsByHour,
      checkInsByMethod,
      recentCheckIns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/checkin/event/{eventId}/list:
 *   get:
 *     summary: Get all check-ins for an event
 *     tags: [CheckIn]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Check-ins retrieved successfully
 */
router.get('/event/:eventId/list', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const { eventId } = req.params;

    const checkIns = await CheckIn.find({ eventId })
      .populate('ticketId', 'ticketNumber attendeeName seatNumber')
      .populate('userId', 'firstName lastName email')
      .populate('checkedInBy', 'firstName lastName')
      .sort({ checkInTime: -1 });

    res.json({ checkIns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
