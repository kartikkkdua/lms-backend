const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const User = require('../models/User');

class AnalyticsService {
  
  // Dashboard metrics
  async getDashboardMetrics(dateRange = {}) {
    const { startDate, endDate } = dateRange;
    let dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    const [
      totalUsers,
      totalEvents,
      totalBookings,
      totalRevenue,
      activeEvents,
      upcomingEvents,
      recentSignups,
      popularCategories
    ] = await Promise.all([
      User.countDocuments(dateFilter),
      Event.countDocuments(dateFilter),
      Booking.countDocuments(dateFilter),
      this.getTotalRevenue(dateFilter),
      Event.countDocuments({ status: 'published', startDate: { $gte: new Date() } }),
      Event.countDocuments({ startDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }),
      User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      this.getPopularCategories()
    ]);

    return {
      totalUsers,
      totalEvents,
      totalBookings,
      totalRevenue,
      activeEvents,
      upcomingEvents,
      recentSignups,
      popularCategories
    };
  }

  // Revenue analytics
  async getRevenueAnalytics(period = 'daily', days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let groupBy;
    switch (period) {
      case 'hourly':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        };
        break;
      case 'daily':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        break;
      case 'monthly':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        break;
      default:
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
    }

    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
          avgTransactionValue: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ]);

    return revenueData;
  }

  // Event performance analytics
  async getEventPerformance(eventId = null) {
    let matchStage = {};
    if (eventId) {
      matchStage.eventId = eventId;
    }

    const eventStats = await Booking.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event'
        }
      },
      { $unwind: '$event' },
      {
        $group: {
          _id: '$eventId',
          eventTitle: { $first: '$event.title' },
          eventCategory: { $first: '$event.category' },
          totalSeats: { $first: '$event.totalSeats' },
          totalBookings: { $sum: 1 },
          totalSeatsBooked: { $sum: '$seats' },
          totalRevenue: { $sum: '$finalAmount' },
          avgBookingValue: { $avg: '$finalAmount' },
          confirmedBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          cancelledBookings: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          occupancyRate: {
            $multiply: [
              { $divide: ['$totalSeatsBooked', '$totalSeats'] },
              100
            ]
          },
          cancellationRate: {
            $multiply: [
              { $divide: ['$cancelledBookings', '$totalBookings'] },
              100
            ]
          }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    return eventStats;
  }

  // User behavior analytics
  async getUserBehaviorAnalytics() {
    const [
      usersByRole,
      bookingsByUser,
      topSpenders,
      userGrowth
    ] = await Promise.all([
      this.getUsersByRole(),
      this.getBookingsByUser(),
      this.getTopSpenders(),
      this.getUserGrowth()
    ]);

    return {
      usersByRole,
      bookingsByUser,
      topSpenders,
      userGrowth
    };
  }

  // Geographic analytics
  async getGeographicAnalytics() {
    const eventsByCity = await Event.aggregate([
      {
        $group: {
          _id: '$city',
          eventCount: { $sum: 1 },
          totalSeats: { $sum: '$totalSeats' },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { eventCount: -1 } },
      { $limit: 10 }
    ]);

    const bookingsByCity = await Booking.aggregate([
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event'
        }
      },
      { $unwind: '$event' },
      {
        $group: {
          _id: '$event.city',
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: '$finalAmount' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);

    return {
      eventsByCity,
      bookingsByCity
    };
  }

  // Predictive analytics
  async getPredictiveAnalytics(eventId) {
    const event = await Event.findById(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Get historical data for similar events
    const similarEvents = await Event.find({
      category: event.category,
      city: event.city,
      status: 'completed',
      _id: { $ne: eventId }
    }).limit(10);

    if (similarEvents.length === 0) {
      return {
        predictedAttendance: event.totalSeats * 0.7, // Default 70% prediction
        confidence: 'low',
        recommendations: ['Not enough historical data for accurate prediction']
      };
    }

    // Calculate average occupancy rate for similar events
    const occupancyRates = await Promise.all(
      similarEvents.map(async (similarEvent) => {
        const bookings = await Booking.find({ 
          eventId: similarEvent._id,
          status: 'confirmed'
        });
        const totalBooked = bookings.reduce((sum, booking) => sum + booking.seats, 0);
        return totalBooked / similarEvent.totalSeats;
      })
    );

    const avgOccupancy = occupancyRates.reduce((sum, rate) => sum + rate, 0) / occupancyRates.length;
    const predictedAttendance = Math.round(event.totalSeats * avgOccupancy);

    // Generate recommendations
    const recommendations = [];
    if (avgOccupancy < 0.5) {
      recommendations.push('Consider reducing ticket prices or increasing marketing efforts');
    }
    if (avgOccupancy > 0.9) {
      recommendations.push('High demand expected - consider increasing capacity or pricing');
    }

    return {
      predictedAttendance,
      occupancyRate: Math.round(avgOccupancy * 100),
      confidence: occupancyRates.length > 5 ? 'high' : 'medium',
      recommendations,
      basedOnEvents: similarEvents.length
    };
  }

  // Helper methods
  async getTotalRevenue(dateFilter = {}) {
    const result = await Payment.aggregate([
      { 
        $match: { 
          status: 'completed',
          ...dateFilter
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  async getPopularCategories() {
    return await Event.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalRevenue: { $sum: { $multiply: ['$price', '$totalSeats'] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
  }

  async getUsersByRole() {
    return await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
  }

  async getBookingsByUser() {
    return await Booking.aggregate([
      {
        $group: {
          _id: '$userId',
          bookingCount: { $sum: 1 },
          totalSpent: { $sum: '$finalAmount' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          email: '$user.email',
          bookingCount: 1,
          totalSpent: 1
        }
      },
      { $sort: { bookingCount: -1 } },
      { $limit: 10 }
    ]);
  }

  async getTopSpenders() {
    return await Booking.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$finalAmount' },
          bookingCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          userName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          email: '$user.email',
          totalSpent: 1,
          bookingCount: 1
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);
  }

  async getUserGrowth(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          newUsers: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
  }
}

module.exports = new AnalyticsService();