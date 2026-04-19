const express = require('express');
const Refund = require('../models/Refund');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const Seat = require('../models/Seat');
const { auth, authorize } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/refunds/request:
 *   post:
 *     summary: Request a refund for a booking
 *     tags: [Refunds]
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
 *               - reason
 *             properties:
 *               bookingId:
 *                 type: string
 *               reason:
 *                 type: string
 *               reasonDetails:
 *                 type: string
 *     responses:
 *       201:
 *         description: Refund request created successfully
 */
router.post('/request', auth, async (req, res) => {
  try {
    const { bookingId, reason, reasonDetails } = req.body;

    // Find booking
    const booking = await Booking.findById(bookingId)
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user owns this booking
    if (booking.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if booking is eligible for refund
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    if (booking.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Cannot refund unpaid booking' });
    }

    // Check if refund already requested
    const existingRefund = await Refund.findOne({ 
      bookingId,
      status: { $in: ['pending', 'approved', 'processing'] }
    });

    if (existingRefund) {
      return res.status(400).json({ error: 'Refund already requested for this booking' });
    }

    // Calculate refund amount and cancellation fee
    const event = booking.eventId;
    const eventDate = new Date(event.startDate);
    const now = new Date();
    const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

    let cancellationFee = 0;
    let refundAmount = booking.finalAmount;

    // Cancellation policy
    if (hoursUntilEvent < 24) {
      cancellationFee = booking.finalAmount * 0.5; // 50% fee
    } else if (hoursUntilEvent < 48) {
      cancellationFee = booking.finalAmount * 0.25; // 25% fee
    } else if (hoursUntilEvent < 72) {
      cancellationFee = booking.finalAmount * 0.10; // 10% fee
    }
    // No fee if more than 72 hours

    refundAmount = booking.finalAmount - cancellationFee;

    // Create refund request
    const refund = new Refund({
      bookingId: booking._id,
      userId: req.user._id,
      eventId: booking.eventId._id,
      refundAmount,
      originalAmount: booking.finalAmount,
      refundType: 'full',
      refundReason: reason,
      reasonDetails,
      cancellationFee,
      status: 'pending'
    });

    await refund.save();

    res.status(201).json({
      message: 'Refund request submitted successfully',
      refund: {
        id: refund._id,
        refundAmount,
        cancellationFee,
        status: refund.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/my:
 *   get:
 *     summary: Get user's refund requests
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Refunds retrieved successfully
 */
router.get('/my', auth, async (req, res) => {
  try {
    const refunds = await Refund.find({ userId: req.user._id })
      .populate('bookingId', 'bookingReference seats')
      .populate('eventId', 'title startDate venue')
      .sort({ requestedAt: -1 });

    res.json({ refunds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/{id}:
 *   get:
 *     summary: Get refund details
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund details retrieved successfully
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const refund = await Refund.findById(req.params.id)
      .populate('bookingId')
      .populate('eventId')
      .populate('userId', 'firstName lastName email')
      .populate('processedBy', 'firstName lastName');

    if (!refund) {
      return res.status(404).json({ error: 'Refund not found' });
    }

    // Check access
    if (refund.userId._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin' && req.user.role !== 'organizer') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ refund });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds:
 *   get:
 *     summary: Get all refund requests (admin/organizer only)
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Refunds retrieved successfully
 */
router.get('/', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const { status, eventId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (eventId) query.eventId = eventId;

    const refunds = await Refund.find(query)
      .populate('bookingId', 'bookingReference seats')
      .populate('eventId', 'title startDate')
      .populate('userId', 'firstName lastName email')
      .sort({ requestedAt: -1 });

    res.json({ refunds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/{id}/approve:
 *   put:
 *     summary: Approve a refund request (admin only)
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund approved successfully
 */
router.put('/:id/approve', auth, authorize('admin'), async (req, res) => {
  try {
    const { adminNotes } = req.body;

    const refund = await Refund.findById(req.params.id)
      .populate('bookingId')
      .populate('userId', 'firstName lastName email');

    if (!refund) {
      return res.status(404).json({ error: 'Refund not found' });
    }

    if (refund.status !== 'pending') {
      return res.status(400).json({ error: 'Refund is not pending' });
    }

    // Update refund status
    refund.status = 'approved';
    refund.processedBy = req.user._id;
    refund.processedAt = new Date();
    refund.adminNotes = adminNotes;
    await refund.save();

    // Update booking status
    const booking = refund.bookingId;
    booking.status = 'refunded';
    booking.paymentStatus = 'refunded';
    await booking.save();

    // Release seats
    const releasedSeats = await Seat.find({ bookingId: booking._id });
    const seatIds = releasedSeats.map(s => s._id);
    
    await Seat.updateMany(
      { bookingId: booking._id },
      { 
        $set: { status: 'available' },
        $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
      }
    );

    // Update event available seats
    await Event.findByIdAndUpdate(
      booking.eventId,
      { $inc: { availableSeats: booking.seats } }
    );

    // Emit socket event to update seat map in real-time
    const io = req.app.get('io');
    if (io) {
      const eventData = {
        eventId: booking.eventId,
        seatIds,
        bookingId: booking._id,
        reason: 'refunded'
      };
      io.to(`event-${booking.eventId}`).emit('seats-unlocked', eventData);
      console.log(`[Socket] Emitted seats-unlocked for refunded booking:`, eventData);
    } else {
      console.warn('[Socket] Socket.io not available for seat unlock event');
    }

    // Send email notification
    try {
      await sendEmail(refund.userId.email, 'refundApproved', [
        refund.userId.firstName, 
        refund, 
        booking, 
        booking.eventId
      ]);
      logger.info(`Refund approval email sent for booking ${booking.bookingReference}`);
    } catch (emailError) {
      logger.error('Failed to send refund approval email:', emailError);
    }

    res.json({
      message: 'Refund approved successfully',
      refund
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/{id}/reject:
 *   put:
 *     summary: Reject a refund request (admin only)
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - adminNotes
 *             properties:
 *               adminNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund rejected successfully
 */
router.put('/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    const { adminNotes } = req.body;

    if (!adminNotes) {
      return res.status(400).json({ error: 'Admin notes are required for rejection' });
    }

    const refund = await Refund.findById(req.params.id);

    if (!refund) {
      return res.status(404).json({ error: 'Refund not found' });
    }

    if (refund.status !== 'pending') {
      return res.status(400).json({ error: 'Refund is not pending' });
    }

    // Update refund status
    refund.status = 'rejected';
    refund.processedBy = req.user._id;
    refund.processedAt = new Date();
    refund.adminNotes = adminNotes;
    await refund.save();

    res.json({
      message: 'Refund rejected',
      refund
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/{id}/process:
 *   put:
 *     summary: Mark refund as processing (admin only)
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund marked as processing
 */
router.put('/:id/process', auth, authorize('admin'), async (req, res) => {
  try {
    const { transactionId } = req.body;

    const refund = await Refund.findById(req.params.id);

    if (!refund) {
      return res.status(404).json({ error: 'Refund not found' });
    }

    if (refund.status !== 'approved') {
      return res.status(400).json({ error: 'Refund must be approved first' });
    }

    refund.status = 'processing';
    refund.transactionId = transactionId;
    await refund.save();

    res.json({
      message: 'Refund is being processed',
      refund
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refunds/{id}/complete:
 *   put:
 *     summary: Mark refund as completed (admin only)
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Refund completed successfully
 */
router.put('/:id/complete', auth, authorize('admin'), async (req, res) => {
  try {
    const { transactionId } = req.body;

    const refund = await Refund.findById(req.params.id)
      .populate('userId', 'firstName lastName email');

    if (!refund) {
      return res.status(404).json({ error: 'Refund not found' });
    }

    if (refund.status !== 'processing' && refund.status !== 'approved') {
      return res.status(400).json({ error: 'Invalid refund status' });
    }

    refund.status = 'completed';
    if (transactionId) refund.transactionId = transactionId;
    await refund.save();

    // Send completion email
    try {
      await sendEmail(refund.userId.email, 'refundCompleted', [
        refund.userId.firstName, 
        refund
      ]);
      logger.info(`Refund completion email sent to ${refund.userId.email}`);
    } catch (emailError) {
      logger.error('Failed to send refund completion email:', emailError);
    }

    res.json({
      message: 'Refund completed successfully',
      refund
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
