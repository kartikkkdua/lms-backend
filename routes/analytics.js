const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');

// Get organizer analytics
router.get('/organizer', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const organizerId = req.user.userId;
    console.log('📊 Fetching analytics for organizer:', organizerId);

    // Get organizer's events
    const events = await Event.find({ organizer: organizerId })
      .select('title category startDate totalSeats availableSeats price status')
      .lean();

    console.log(`Found ${events.length} events for organizer`);
    const eventIds = events.map(e => e._id);

    // Get all bookings for organizer's events
    const bookings = await Booking.find({ 
      eventId: { $in: eventIds },
      status: { $in: ['confirmed', 'pending'] }
    })
      .populate('eventId', 'title category')
      .populate('userId', 'firstName lastName email')
      .lean();

    console.log(`Found ${bookings.length} bookings`);

    // Get payments
    const payments = await Payment.find({
      bookingId: { $in: bookings.map(b => b._id) },
      status: 'completed'
    }).lean();

    // Calculate metrics
    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const totalTicketsSold = confirmedBookings.reduce((sum, b) => sum + (b.seats || 0), 0);
    const totalAttendees = confirmedBookings.length;
    const averageTicketPrice = totalTicketsSold > 0 ? totalRevenue / totalTicketsSold : 0;

    // Event performance
    const eventPerformance = events.map(event => {
      const eventBookings = bookings.filter(b => 
        b.eventId && b.eventId._id.toString() === event._id.toString()
      );
      
      const eventPayments = payments.filter(p => 
        eventBookings.some(b => b._id.toString() === p.bookingId.toString())
      );
      
      const revenue = eventPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const ticketsSold = event.totalSeats - event.availableSeats;
      const occupancy = event.totalSeats > 0 ? (ticketsSold / event.totalSeats) * 100 : 0;
      
      return {
        ...event,
        revenue,
        ticketsSold,
        occupancy: Math.round(occupancy * 10) / 10,
        bookingsCount: eventBookings.length
      };
    });

    // Revenue by category
    const categoryRevenue = {};
    eventPerformance.forEach(event => {
      if (!categoryRevenue[event.category]) {
        categoryRevenue[event.category] = 0;
      }
      categoryRevenue[event.category] += event.revenue;
    });

    // Recent bookings
    const recentBookings = bookings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalTicketsSold,
          totalAttendees,
          averageTicketPrice: Math.round(averageTicketPrice),
          totalEvents: events.length,
          activeEvents: events.filter(e => e.status === 'published').length
        },
        eventPerformance: eventPerformance.sort((a, b) => b.revenue - a.revenue),
        categoryRevenue,
        recentBookings,
        events,
        bookings
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
});

// Get admin analytics (platform-wide)
router.get('/admin', auth, authorize('admin'), async (req, res) => {
  try {
    const totalEvents = await Event.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const revenueByCategory = await Event.aggregate([
      {
        $lookup: {
          from: 'bookings',
          localField: '_id',
          foreignField: 'eventId',
          as: 'bookings'
        }
      },
      {
        $unwind: { path: '$bookings', preserveNullAndEmptyArrays: true }
      },
      {
        $lookup: {
          from: 'payments',
          localField: 'bookings._id',
          foreignField: 'bookingId',
          as: 'payments'
        }
      },
      {
        $unwind: { path: '$payments', preserveNullAndEmptyArrays: true }
      },
      {
        $match: { 'payments.status': 'completed' }
      },
      {
        $group: {
          _id: '$category',
          revenue: { $sum: '$payments.amount' },
          events: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          category: '$_id',
          revenue: 1,
          eventCount: { $size: '$events' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalEvents,
        totalBookings,
        totalRevenue: totalRevenue[0]?.total || 0,
        revenueByCategory
      }
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin analytics',
      error: error.message
    });
  }
});

module.exports = router;
