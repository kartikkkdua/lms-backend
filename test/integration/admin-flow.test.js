const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../server');
const User = require('../../models/User');
const Event = require('../../models/Event');
const Booking = require('../../models/Booking');
const Refund = require('../../models/Refund');
const PromoCode = require('../../models/PromoCode');

describe('Admin and Organizer Flow Integration Tests', () => {
  let adminToken;
  let organizerToken;
  let userToken;
  let adminId;
  let organizerId;
  let userId;
  let eventId;
  let bookingId;
  let promoCodeId;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/event_management_test');
    }

    // Clear test data
    await User.deleteMany({});
    await Event.deleteMany({});
    await Booking.deleteMany({});
    await Refund.deleteMany({});
    await PromoCode.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('1. Admin User Creation', () => {
    test('should create admin user', async () => {
      const adminData = {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@eventhub.com',
        password: 'Admin@123',
        phone: '1234567890',
        role: 'admin'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(adminData)
        .expect(201);

      expect(res.body.user.role).toBe('admin');
      adminToken = res.body.token;
      adminId = res.body.user._id;
    });

    test('should create organizer user', async () => {
      const organizerData = {
        firstName: 'Event',
        lastName: 'Organizer',
        email: 'organizer@eventhub.com',
        password: 'Organizer@123',
        phone: '9876543210',
        role: 'organizer'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(organizerData)
        .expect(201);

      expect(res.body.user.role).toBe('organizer');
      organizerToken = res.body.token;
      organizerId = res.body.user._id;
    });

    test('should create regular user', async () => {
      const userData = {
        firstName: 'Regular',
        lastName: 'User',
        email: 'user@eventhub.com',
        password: 'User@123',
        phone: '5555555555',
        role: 'user'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(res.body.user.role).toBe('user');
      userToken = res.body.token;
      userId = res.body.user._id;
    });
  });

  describe('2. Admin Dashboard', () => {
    test('should get dashboard statistics', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('totalEvents');
      expect(res.body).toHaveProperty('totalBookings');
      expect(res.body).toHaveProperty('totalRevenue');
    });

    test('should not allow regular user to access dashboard', async () => {
      await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    test('should get all users list', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.users.length).toBeGreaterThanOrEqual(3);
      expect(res.body).toHaveProperty('pagination');
    });

    test('should filter users by role', async () => {
      const res = await request(app)
        .get('/api/admin/users?role=organizer')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.users.every(u => u.role === 'organizer')).toBe(true);
    });
  });

  describe('3. Organizer Event Management', () => {
    test('should create event as organizer', async () => {
      const eventData = {
        title: 'Tech Conference 2025',
        description: 'Annual technology conference',
        category: 'conference',
        startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
        venue: 'Convention Center',
        city: 'San Francisco',
        state: 'California',
        country: 'USA',
        totalSeats: 500,
        availableSeats: 500,
        ticketPrice: 2500,
        organizerId: organizerId
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      expect(res.body.event.title).toBe(eventData.title);
      expect(res.body.event.organizerId).toBe(organizerId);
      eventId = res.body.event._id;
    });

    test('should update own event', async () => {
      const updates = {
        title: 'Tech Conference 2025 - Updated',
        ticketPrice: 3000
      };

      const res = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(updates)
        .expect(200);

      expect(res.body.event.title).toBe(updates.title);
      expect(res.body.event.ticketPrice).toBe(updates.ticketPrice);
    });

    test('should not allow other organizer to update event', async () => {
      // Create another organizer
      const otherOrganizer = await User.create({
        firstName: 'Other',
        lastName: 'Organizer',
        email: 'other@eventhub.com',
        password: 'Other@123',
        phone: '1111111111',
        role: 'organizer'
      });

      const token = otherOrganizer.generateAuthToken();

      await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Hacked Event' })
        .expect(403);
    });

    test('should get organizer events', async () => {
      const res = await request(app)
        .get('/api/events/my')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(res.body.events.length).toBeGreaterThan(0);
      expect(res.body.events[0].organizerId._id).toBe(organizerId);
    });
  });

  describe('4. Promo Code Management', () => {
    test('should create promo code as admin', async () => {
      const promoData = {
        code: 'ADMIN50',
        discountType: 'percentage',
        discountValue: 50,
        maxUses: 100,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        applicableEvents: [eventId]
      };

      const res = await request(app)
        .post('/api/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(promoData)
        .expect(201);

      expect(res.body.promoCode.code).toBe('ADMIN50');
      expect(res.body.promoCode.discountValue).toBe(50);
      promoCodeId = res.body.promoCode._id;
    });

    test('should not allow regular user to create promo code', async () => {
      const promoData = {
        code: 'USER50',
        discountType: 'percentage',
        discountValue: 50
      };

      await request(app)
        .post('/api/promo-codes')
        .set('Authorization', `Bearer ${userToken}`)
        .send(promoData)
        .expect(403);
    });

    test('should validate promo code', async () => {
      const res = await request(app)
        .post('/api/promo-codes/validate/ADMIN50')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: eventId,
          totalAmount: 2500
        })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.discount).toBe(1250); // 50% of 2500
    });

    test('should reject invalid promo code', async () => {
      const res = await request(app)
        .post('/api/promo-codes/validate/INVALID')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: eventId,
          totalAmount: 2500
        })
        .expect(404);

      expect(res.body.valid).toBe(false);
    });

    test('should get all promo codes as admin', async () => {
      const res = await request(app)
        .get('/api/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.promoCodes.length).toBeGreaterThan(0);
    });

    test('should update promo code', async () => {
      const res = await request(app)
        .put(`/api/promo-codes/${promoCodeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          maxUses: 200
        })
        .expect(200);

      expect(res.body.promoCode.maxUses).toBe(200);
    });

    test('should deactivate promo code', async () => {
      const res = await request(app)
        .delete(`/api/promo-codes/${promoCodeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain('deactivated');
    });
  });

  describe('5. Booking Management', () => {
    beforeAll(async () => {
      // Create a test booking
      const booking = await Booking.create({
        userId: userId,
        eventId: eventId,
        seats: 2,
        totalAmount: 5000,
        finalAmount: 5000,
        status: 'confirmed',
        paymentStatus: 'completed'
      });
      bookingId = booking._id.toString();
    });

    test('should get all bookings as admin', async () => {
      const res = await request(app)
        .get('/api/admin/bookings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.bookings.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('pagination');
    });

    test('should filter bookings by status', async () => {
      const res = await request(app)
        .get('/api/admin/bookings?status=confirmed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.bookings.every(b => b.status === 'confirmed')).toBe(true);
    });

    test('should filter bookings by event', async () => {
      const res = await request(app)
        .get(`/api/admin/bookings?eventId=${eventId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.bookings.every(b => b.eventId._id === eventId)).toBe(true);
    });

    test('should get booking details as admin', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.booking._id).toBe(bookingId);
    });
  });

  describe('6. Refund Management', () => {
    let refundId;

    beforeAll(async () => {
      // Create a refund request
      const refund = await Refund.create({
        bookingId: bookingId,
        userId: userId,
        eventId: eventId,
        refundAmount: 5000,
        originalAmount: 5000,
        refundType: 'full',
        refundReason: 'changed_plans',
        status: 'pending'
      });
      refundId = refund._id.toString();
    });

    test('should get all refund requests as admin', async () => {
      const res = await request(app)
        .get('/api/refunds')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.refunds.length).toBeGreaterThan(0);
    });

    test('should filter refunds by status', async () => {
      const res = await request(app)
        .get('/api/refunds?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.refunds.every(r => r.status === 'pending')).toBe(true);
    });

    test('should approve refund as admin', async () => {
      const res = await request(app)
        .put(`/api/refunds/${refundId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adminNotes: 'Approved for testing'
        })
        .expect(200);

      expect(res.body.refund.status).toBe('approved');
      expect(res.body.refund.processedBy).toBe(adminId);
    });

    test('should not allow regular user to approve refund', async () => {
      await request(app)
        .put(`/api/refunds/${refundId}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          adminNotes: 'Unauthorized approval'
        })
        .expect(403);
    });

    test('should mark refund as processing', async () => {
      const res = await request(app)
        .put(`/api/refunds/${refundId}/process`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          transactionId: 'TXN123456'
        })
        .expect(200);

      expect(res.body.refund.status).toBe('processing');
      expect(res.body.refund.transactionId).toBe('TXN123456');
    });

    test('should complete refund', async () => {
      const res = await request(app)
        .put(`/api/refunds/${refundId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.refund.status).toBe('completed');
    });

    test('should create and reject refund', async () => {
      // Create another refund
      const newRefund = await Refund.create({
        bookingId: bookingId,
        userId: userId,
        eventId: eventId,
        refundAmount: 5000,
        originalAmount: 5000,
        refundType: 'full',
        refundReason: 'test',
        status: 'pending'
      });

      const res = await request(app)
        .put(`/api/refunds/${newRefund._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adminNotes: 'Does not meet refund policy'
        })
        .expect(200);

      expect(res.body.refund.status).toBe('rejected');
      expect(res.body.refund.adminNotes).toBe('Does not meet refund policy');
    });
  });

  describe('7. Revenue Analytics', () => {
    test('should get revenue statistics', async () => {
      const res = await request(app)
        .get('/api/admin/revenue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalRevenue');
      expect(res.body).toHaveProperty('revenueByMonth');
      expect(res.body).toHaveProperty('revenueByEvent');
    });

    test('should filter revenue by date range', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const res = await request(app)
        .get(`/api/admin/revenue?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalRevenue');
    });

    test('should not allow organizer to access revenue', async () => {
      await request(app)
        .get('/api/admin/revenue')
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(403);
    });
  });

  describe('8. User Management', () => {
    test('should update user role as admin', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'organizer'
        })
        .expect(200);

      expect(res.body.user.role).toBe('organizer');
    });

    test('should deactivate user as admin', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain('deactivated');
    });

    test('should reactivate user as admin', async () => {
      const res = await request(app)
        .put(`/api/admin/users/${userId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.message).toContain('activated');
    });

    test('should not allow organizer to manage users', async () => {
      await request(app)
        .put(`/api/admin/users/${userId}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .send({
          role: 'admin'
        })
        .expect(403);
    });
  });

  describe('9. Event Analytics', () => {
    test('should get event analytics as organizer', async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/analytics`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalBookings');
      expect(res.body).toHaveProperty('totalRevenue');
      expect(res.body).toHaveProperty('seatsBooked');
      expect(res.body).toHaveProperty('seatsAvailable');
    });

    test('should not allow other organizer to view analytics', async () => {
      const otherOrganizer = await User.create({
        firstName: 'Another',
        lastName: 'Organizer',
        email: 'another@eventhub.com',
        password: 'Another@123',
        phone: '2222222222',
        role: 'organizer'
      });

      const token = otherOrganizer.generateAuthToken();

      await request(app)
        .get(`/api/events/${eventId}/analytics`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    test('should allow admin to view any event analytics', async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/analytics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalBookings');
    });
  });

  describe('10. Bulk Operations', () => {
    test('should export bookings as CSV', async () => {
      const res = await request(app)
        .get('/api/admin/bookings/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
    });

    test('should send bulk email notifications', async () => {
      const res = await request(app)
        .post('/api/admin/notifications/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: eventId,
          subject: 'Event Update',
          message: 'Important event information'
        })
        .expect(200);

      expect(res.body.message).toContain('sent');
    });
  });
});
