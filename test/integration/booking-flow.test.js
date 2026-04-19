const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../server');
const User = require('../../models/User');
const Event = require('../../models/Event');
const Booking = require('../../models/Booking');
const Seat = require('../../models/Seat');
const Payment = require('../../models/Payment');

describe('Complete Booking Flow Integration Tests', () => {
  let server;
  let userToken;
  let organizerToken;
  let userId;
  let organizerId;
  let eventId;
  let seatIds = [];

  // Setup before all tests
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/event_management_test');
    }

    // Clear test data
    await User.deleteMany({});
    await Event.deleteMany({});
    await Booking.deleteMany({});
    await Seat.deleteMany({});
    await Payment.deleteMany({});
  });

  // Cleanup after all tests
  afterAll(async () => {
    await mongoose.connection.close();
    if (server) {
      server.close();
    }
  });

  describe('1. User Registration and Authentication', () => {
    test('should register a new user', async () => {
      const userData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'testuser@example.com',
        password: 'Test@123',
        phone: '1234567890',
        role: 'user'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(userData.email);
      
      userToken = res.body.token;
      userId = res.body.user._id;
    });

    test('should register an organizer', async () => {
      const organizerData = {
        firstName: 'Event',
        lastName: 'Organizer',
        email: 'organizer@example.com',
        password: 'Organizer@123',
        phone: '9876543210',
        role: 'organizer'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(organizerData)
        .expect(201);

      expect(res.body).toHaveProperty('token');
      organizerToken = res.body.token;
      organizerId = res.body.user._id;
    });

    test('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'Test@123'
        })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('testuser@example.com');
    });

    test('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'WrongPassword'
        })
        .expect(401);

      expect(res.body).toHaveProperty('error');
    });
  });

  describe('2. Event Creation', () => {
    test('should create an event as organizer', async () => {
      const eventData = {
        title: 'Integration Test Concert',
        description: 'A test concert for integration testing',
        category: 'music',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // +3 hours
        venue: 'Test Arena',
        city: 'Test City',
        state: 'Test State',
        country: 'Test Country',
        totalSeats: 10,
        availableSeats: 10,
        ticketPrice: 500,
        organizerId: organizerId
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData)
        .expect(201);

      expect(res.body.event).toHaveProperty('_id');
      expect(res.body.event.title).toBe(eventData.title);
      expect(res.body.event.availableSeats).toBe(10);
      
      eventId = res.body.event._id;
    });

    test('should not allow user to create event', async () => {
      const eventData = {
        title: 'Unauthorized Event',
        category: 'music',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        venue: 'Test Venue'
      };

      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${userToken}`)
        .send(eventData)
        .expect(403);
    });

    test('should retrieve event details', async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}`)
        .expect(200);

      expect(res.body.event._id).toBe(eventId);
      expect(res.body.event.title).toBe('Integration Test Concert');
    });
  });

  describe('3. Seat Management', () => {
    test('should create seats for the event', async () => {
      // Create 10 seats
      const seats = [];
      for (let i = 1; i <= 10; i++) {
        seats.push({
          eventId: eventId,
          section: 'Regular',
          row: 'A',
          seatNumber: i,
          price: 500,
          status: 'available'
        });
      }

      const createdSeats = await Seat.insertMany(seats);
      seatIds = createdSeats.map(seat => seat._id.toString());
      
      expect(createdSeats).toHaveLength(10);
    });

    test('should get available seats for event', async () => {
      const res = await request(app)
        .get(`/api/seats/event/${eventId}`)
        .expect(200);

      expect(res.body.seats).toHaveLength(10);
      expect(res.body.seats.every(seat => seat.status === 'available')).toBe(true);
    });

    test('should lock seats temporarily', async () => {
      const seatsToLock = seatIds.slice(0, 2);

      const res = await request(app)
        .post('/api/seats/lock')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          eventId: eventId,
          seatIds: seatsToLock
        })
        .expect(200);

      expect(res.body.message).toContain('locked');
      
      // Verify seats are locked
      const seats = await Seat.find({ _id: { $in: seatsToLock } });
      expect(seats.every(seat => seat.status === 'selected')).toBe(true);
    });
  });

  describe('4. Booking Creation', () => {
    let bookingId;

    test('should create a booking with locked seats', async () => {
      const bookingData = {
        eventId: eventId,
        seats: 2,
        seatIds: seatIds.slice(0, 2),
        totalAmount: 1000,
        finalAmount: 1000
      };

      const res = await request(app)
        .post(`/api/bookings/events/${eventId}/book`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(bookingData)
        .expect(201);

      expect(res.body.booking).toHaveProperty('_id');
      expect(res.body.booking).toHaveProperty('bookingReference');
      expect(res.body.booking.seats).toBe(2);
      expect(res.body.booking.status).toBe('pending');
      
      bookingId = res.body.booking._id;
    });

    test('should not allow booking already locked seats', async () => {
      const bookingData = {
        eventId: eventId,
        seats: 2,
        seatIds: seatIds.slice(0, 2), // Same seats
        totalAmount: 1000,
        finalAmount: 1000
      };

      await request(app)
        .post(`/api/bookings/events/${eventId}/book`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(bookingData)
        .expect(400);
    });

    test('should retrieve user bookings', async () => {
      const res = await request(app)
        .get('/api/bookings/my')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.bookings).toHaveLength(1);
      expect(res.body.bookings[0].eventId._id).toBe(eventId);
    });

    test('should get booking details', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.booking._id).toBe(bookingId);
      expect(res.body.booking.status).toBe('pending');
    });
  });

  describe('5. Payment Processing', () => {
    let bookingId;
    let paymentId;

    beforeAll(async () => {
      // Get the booking we created
      const booking = await Booking.findOne({ userId: userId });
      bookingId = booking._id.toString();
    });

    test('should create a payment for booking', async () => {
      const res = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookingId: bookingId,
          amount: 1000,
          paymentMethod: 'card'
        })
        .expect(201);

      expect(res.body.payment).toHaveProperty('_id');
      expect(res.body.payment.amount).toBe(1000);
      expect(res.body.payment.status).toBe('pending');
      
      paymentId = res.body.payment._id;
    });

    test('should verify and complete payment', async () => {
      // Simulate payment gateway response
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          paymentId: paymentId,
          gatewayPaymentId: 'test_payment_123',
          status: 'success'
        })
        .expect(200);

      expect(res.body.message).toContain('success');
      
      // Verify booking is confirmed
      const booking = await Booking.findById(bookingId);
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('completed');
      
      // Verify seats are booked
      const seats = await Seat.find({ bookingId: bookingId });
      expect(seats.every(seat => seat.status === 'booked')).toBe(true);
    });

    test('should decrease available seats after booking', async () => {
      const event = await Event.findById(eventId);
      expect(event.availableSeats).toBe(8); // 10 - 2 booked
    });
  });

  describe('6. Booking Cancellation and Refund', () => {
    let bookingId;
    let refundId;

    beforeAll(async () => {
      // Create another booking for cancellation test
      const seatsToBook = seatIds.slice(2, 4);
      
      // Lock seats
      await Seat.updateMany(
        { _id: { $in: seatsToBook } },
        { 
          status: 'selected',
          lockedBy: userId,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000)
        }
      );

      // Create booking
      const booking = new Booking({
        userId: userId,
        eventId: eventId,
        seats: 2,
        totalAmount: 1000,
        finalAmount: 1000,
        status: 'confirmed',
        paymentStatus: 'completed'
      });
      await booking.save();
      bookingId = booking._id.toString();

      // Update seats
      await Seat.updateMany(
        { _id: { $in: seatsToBook } },
        { status: 'booked', bookingId: bookingId }
      );

      // Update event
      await Event.findByIdAndUpdate(eventId, { $inc: { availableSeats: -2 } });
    });

    test('should request a refund', async () => {
      const res = await request(app)
        .post('/api/refunds/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookingId: bookingId,
          reason: 'changed_plans',
          reasonDetails: 'Integration test refund'
        })
        .expect(201);

      expect(res.body.refund).toHaveProperty('id');
      expect(res.body.refund.status).toBe('pending');
      
      refundId = res.body.refund.id;
    });

    test('should retrieve user refunds', async () => {
      const res = await request(app)
        .get('/api/refunds/my')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body.refunds.length).toBeGreaterThan(0);
      expect(res.body.refunds[0].status).toBe('pending');
    });

    test('should not allow duplicate refund requests', async () => {
      await request(app)
        .post('/api/refunds/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          bookingId: bookingId,
          reason: 'changed_plans'
        })
        .expect(400);
    });
  });

  describe('7. Event Search and Filtering', () => {
    test('should search events by category', async () => {
      const res = await request(app)
        .get('/api/events?category=music')
        .expect(200);

      expect(res.body.events.length).toBeGreaterThan(0);
      expect(res.body.events.every(e => e.category === 'music')).toBe(true);
    });

    test('should filter events by city', async () => {
      const res = await request(app)
        .get('/api/events?city=Test City')
        .expect(200);

      expect(res.body.events.length).toBeGreaterThan(0);
      expect(res.body.events[0].city).toBe('Test City');
    });

    test('should support pagination', async () => {
      const res = await request(app)
        .get('/api/events?page=1&limit=5')
        .expect(200);

      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
    });

    test('should cap pagination limit at 100', async () => {
      const res = await request(app)
        .get('/api/events?limit=500')
        .expect(200);

      // Should be capped at 100
      expect(res.body.pagination.limit).toBeLessThanOrEqual(100);
    });
  });

  describe('8. Seat Lock Expiry', () => {
    test('should release expired seat locks', async () => {
      // Create a seat with expired lock
      const expiredSeat = await Seat.create({
        eventId: eventId,
        section: 'Regular',
        row: 'B',
        seatNumber: 1,
        price: 500,
        status: 'selected',
        lockedBy: userId,
        lockedUntil: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
      });

      // Call the release method
      const released = await Seat.releaseExpiredLocks();
      
      expect(released).toBeGreaterThan(0);
      
      // Verify seat is now available
      const seat = await Seat.findById(expiredSeat._id);
      expect(seat.status).toBe('available');
      expect(seat.lockedBy).toBeUndefined();
    });
  });

  describe('9. Error Handling', () => {
    test('should handle invalid event ID', async () => {
      await request(app)
        .get('/api/events/invalid-id')
        .expect(500);
    });

    test('should handle unauthorized access', async () => {
      await request(app)
        .get('/api/bookings/my')
        .expect(401);
    });

    test('should handle missing required fields', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'incomplete@example.com'
          // Missing required fields
        })
        .expect(400);
    });

    test('should handle duplicate email registration', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({
          firstName: 'Duplicate',
          lastName: 'User',
          email: 'testuser@example.com', // Already exists
          password: 'Test@123',
          phone: '1111111111'
        })
        .expect(400);
    });
  });

  describe('10. Health and Monitoring', () => {
    test('should return health status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('OK');
      expect(res.body).toHaveProperty('database');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory');
    });

    test('should include response time header', async () => {
      const res = await request(app)
        .get('/api/events')
        .expect(200);

      expect(res.headers).toHaveProperty('x-response-time');
      expect(res.headers['x-response-time']).toMatch(/\d+ms/);
    });
  });
});
