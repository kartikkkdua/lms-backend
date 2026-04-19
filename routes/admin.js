const express = require('express');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin role
router.use(auth, authorize('admin'));

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 */
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      totalEvents,
      totalBookings,
      totalRevenue,
      recentBookings
    ] = await Promise.all([
      User.countDocuments(),
      Event.countDocuments(),
      Booking.countDocuments(),
      Payment.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Booking.find()
        .populate('userId', 'firstName lastName email')
        .populate('eventId', 'title startDate')
        .sort({ createdAt: -1 })
        .limit(10)
    ]);

    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    res.json({
      statistics: {
        totalUsers,
        totalEvents,
        totalBookings,
        totalRevenue: revenue
      },
      recentBookings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users with pagination
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by user role
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 per page
    const skip = (page - 1) * limit;
    
    let query = {};
    if (req.query.role) {
      query.role = req.query.role;
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/bookings:
 *   get:
 *     summary: Get all bookings with filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of bookings per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by booking status
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: string
 *         description: Filter by event ID
 *     responses:
 *       200:
 *         description: Bookings retrieved successfully
 */
router.get('/bookings', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 per page
    const skip = (page - 1) * limit;
    
    let query = {};
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.eventId) {
      query.eventId = req.query.eventId;
    }

    const bookings = await Booking.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('eventId', 'title startDate venue')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    res.json({
      bookings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/bookings/{id}/refund:
 *   post:
 *     summary: Process refund for a booking
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *       404:
 *         description: Booking not found
 */
router.post('/bookings/:id/refund', async (req, res) => {
  try {
    const { reason, amount } = req.body;
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId)
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'refunded') {
      return res.status(400).json({ error: 'Booking is already refunded' });
    }

    // Find payment
    const payment = await Payment.findOne({ bookingId: booking._id });
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Calculate refund amount
    const refundAmount = amount || booking.finalAmount;

    // Update payment
    payment.status = 'refunded';
    payment.refundAmount = refundAmount;
    payment.refundReason = reason;
    await payment.save();

    // Update booking
    booking.status = 'refunded';
    booking.paymentStatus = 'refunded';
    await booking.save();

    // Release seats from seat map
    const Seat = require('../models/Seat');
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
        reason: 'admin-refunded'
      };
      io.to(`event-${booking.eventId._id}`).emit('seats-unlocked', eventData);
      console.log(`[Socket] Emitted seats-unlocked for admin refund:`, eventData);
    } else {
      console.warn('[Socket] Socket.io not available for seat unlock event');
    }

    res.json({
      message: 'Refund processed successfully',
      booking,
      refundAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/reports/revenue:
 *   get:
 *     summary: Get revenue report
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Revenue report retrieved successfully
 */
router.get('/reports/revenue', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    let matchQuery = { status: 'completed' };
    
    if (start || end) {
      matchQuery.createdAt = {};
      if (start) matchQuery.createdAt.$gte = new Date(start);
      if (end) matchQuery.createdAt.$lte = new Date(end);
    }

    const revenueData = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalRevenue: { $sum: '$amount' },
          totalTransactions: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    const totalRevenue = await Payment.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      dailyRevenue: revenueData,
      totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/reports/events:
 *   get:
 *     summary: Get events analytics report
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Events report retrieved successfully
 */
router.get('/reports/events', async (req, res) => {
  try {
    const eventStats = await Event.aggregate([
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'eventId',
          as: 'bookings'
        }
      },
      {
        $project: {
          title: 1,
          category: 1,
          startDate: 1,
          totalSeats: 1,
          availableSeats: 1,
          price: 1,
          status: 1,
          totalBookings: { $size: '$bookings' },
          confirmedBookings: {
            $size: {
              $filter: {
                input: '$bookings',
                cond: { $eq: ['$$this.status', 'confirmed'] }
              }
            }
          },
          totalRevenue: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$bookings',
                    cond: { $eq: ['$$this.paymentStatus', 'completed'] }
                  }
                },
                in: '$$this.finalAmount'
              }
            }
          }
        }
      },
      { $sort: { startDate: -1 } }
    ]);

    res.json({ eventStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/users/{id}/role:
 *   put:
 *     summary: Update user role
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, organizer, admin]
 *     responses:
 *       200:
 *         description: User role updated successfully
 *       404:
 *         description: User not found
 */
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role, isBlocked } = req.body;
    const userId = req.params.id;

    const updateData = {};
    
    if (role !== undefined) {
      if (!['user', 'organizer', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updateData.role = role;
    }

    if (isBlocked !== undefined) {
      updateData.isBlocked = isBlocked;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/bookings/{id}/cancel:
 *   put:
 *     summary: Cancel a booking (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       404:
 *         description: Booking not found
 */
router.put('/bookings/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const bookingId = req.params.id;

    const booking = await Booking.findById(bookingId)
      .populate('eventId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    // Update booking status
    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by admin';
    await booking.save();

    // Release seats from seat map
    const Seat = require('../models/Seat');
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
        reason: 'admin-cancelled'
      };
      io.to(`event-${booking.eventId._id}`).emit('seats-unlocked', eventData);
      console.log(`[Socket] Emitted seats-unlocked for admin cancellation:`, eventData);
    } else {
      console.warn('[Socket] Socket.io not available for seat unlock event');
    }

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/users/:id:
 *   delete:
 *     summary: Delete a user
 *     tags: [Admin]
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
 *         description: User deleted successfully
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user's bookings
    await Booking.deleteMany({ userId });

    // Delete user's payments
    await Payment.deleteMany({ userId });

    // Delete user's events if organizer
    if (user.role === 'organizer') {
      await Event.deleteMany({ organizerId: userId });
    }

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      message: 'User and all associated data deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics Service
const analyticsService = require('../services/analyticsService');

/**
 * @swagger
 * /api/admin/analytics/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics
 *     responses:
 *       200:
 *         description: Dashboard analytics retrieved successfully
 */
router.get('/analytics/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const metrics = await analyticsService.getDashboardMetrics({ startDate, endDate });
    
    res.json({ analytics: metrics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/revenue:
 *   get:
 *     summary: Get revenue analytics with time series data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [hourly, daily, monthly]
 *         description: Time period for grouping
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: Revenue analytics retrieved successfully
 */
router.get('/analytics/revenue', async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;
    const revenueData = await analyticsService.getRevenueAnalytics(period, parseInt(days));
    
    res.json({ revenueAnalytics: revenueData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/events:
 *   get:
 *     summary: Get event performance analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: eventId
 *         schema:
 *           type: string
 *         description: Specific event ID (optional)
 *     responses:
 *       200:
 *         description: Event analytics retrieved successfully
 */
router.get('/analytics/events', async (req, res) => {
  try {
    const { eventId } = req.query;
    const eventStats = await analyticsService.getEventPerformance(eventId);
    
    res.json({ eventAnalytics: eventStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/users:
 *   get:
 *     summary: Get user behavior analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User analytics retrieved successfully
 */
router.get('/analytics/users', async (req, res) => {
  try {
    const userAnalytics = await analyticsService.getUserBehaviorAnalytics();
    
    res.json({ userAnalytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/geographic:
 *   get:
 *     summary: Get geographic analytics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Geographic analytics retrieved successfully
 */
router.get('/analytics/geographic', async (req, res) => {
  try {
    const geoAnalytics = await analyticsService.getGeographicAnalytics();
    
    res.json({ geographicAnalytics: geoAnalytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/analytics/predict/{eventId}:
 *   get:
 *     summary: Get predictive analytics for an event
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Predictive analytics retrieved successfully
 */
router.get('/analytics/predict/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const predictions = await analyticsService.getPredictiveAnalytics(eventId);
    
    res.json({ predictions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;