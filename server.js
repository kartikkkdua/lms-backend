const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const logger = require('./utils/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const timeout = require('./middleware/timeout');
const sanitizeMiddleware = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiters');
const { performHealthCheck } = require('./utils/healthCheck');
const { startCleanupJobs } = require('./jobs/cleanupJobs');
const { startReminderJobs } = require('./jobs/reminderJobs');

const { connectDB } = require('./config/database');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const { router: waitlistRoutes } = require('./routes/waitlist');
const couponRoutes = require('./routes/coupons');
const seatRoutes = require('./routes/seats');
const chatbotRoutes = require('./routes/chatbot');
const promoCodeRoutes = require('./routes/promoCodes');
const sessionRoutes = require('./routes/sessions');
const profileRoutes = require('./routes/profile');
const checkinRoutes = require('./routes/checkin');
const refundsRoutes = require('./routes/refunds');
const twoFactorRoutes = require('./routes/twoFactor');
const calendarRoutes = require('./routes/calendar');
const notificationRoutes = require('./routes/notifications');
const logsRoutes = require('./routes/logs');
const analyticsRoutes = require('./routes/analytics');
const notificationService = require('./services/notificationService');
const { errorHandler } = require('./middleware/errorHandler');
const Seat = require('./models/Seat');
const Booking = require('./models/Booking');
const Event = require('./models/Event');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isVercel = origin.endsWith('.vercel.app');
      const isRender = origin.endsWith('.onrender.com');
      const frontend = process.env.FRONTEND_URL;
      if (isLocalhost || isVercel || isRender || origin === frontend) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Make io accessible to routes
app.set('io', io);

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);

    const whitelist = process.env.CORS_WHITELIST
      ? process.env.CORS_WHITELIST.split(',').map(o => o.trim())
      : [];

    // Always allow localhost in development
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    // Always allow vercel.app deployments
    const isVercel = origin.endsWith('.vercel.app');
    // Always allow render.com deployments
    const isRender = origin.endsWith('.onrender.com');

    if (isLocalhost || isVercel || isRender || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// TEMPORARILY DISABLED - DEBUGGING
// if (process.env.NODE_ENV === 'production') {
//   app.use(morgan('combined', { stream: logger.stream }));
// } else {
//   app.use(morgan('dev'));
// }

// TEMPORARILY DISABLED - DEBUGGING
// app.use(requestId);
// app.use(timeout);
// app.use(sanitizeMiddleware);
// app.use(apiLimiter);

// Serve static files
app.use('/uploads', express.static('uploads'));

// TEMPORARILY DISABLED - DEBUGGING
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: process.env.NODE_ENV === 'production' ? 100 : 1000,
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
//   skip: (req) => {
//     return req.path === '/api/auth/captcha';
//   }
// });

// const authLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: process.env.NODE_ENV === 'production' ? 10 : 100,
//   message: 'Too many login attempts, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint with comprehensive status
app.get('/health', async (req, res) => {
  const health = await performHealthCheck();
  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/seats', seatRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/promo-codes', promoCodeRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/refunds', refundsRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Swagger documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event Management API',
      version: '1.0.0',
      description: 'Smart Event Management & Ticketing Backend API',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./routes/*.js'], // paths to files containing OpenAPI definitions
};

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize notification service with Socket.io
notificationService.initialize(io);

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Join user room for notifications
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    logger.debug(`Socket ${socket.id} joined user-${userId}`);
  });

  // Leave user room
  socket.on('leave-user', (userId) => {
    socket.leave(`user-${userId}`);
    logger.debug(`Socket ${socket.id} left user-${userId}`);
  });

  // Join event room for real-time seat updates
  socket.on('join-event', (eventId) => {
    socket.join(`event-${eventId}`);
    logger.debug(`Socket ${socket.id} joined event-${eventId}`);
  });

  // Leave event room
  socket.on('leave-event', (eventId) => {
    socket.leave(`event-${eventId}`);
    logger.debug(`Socket ${socket.id} left event-${eventId}`);
  });

  // Join admin room (for admins only)
  socket.on('join-admin', () => {
    socket.join('admin-room');
    logger.debug(`Socket ${socket.id} joined admin-room`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Release expired seat locks every 30 seconds
setInterval(async () => {
  try {
    const expiredSeats = await Seat.find({
      status: 'selected',
      lockedUntil: { $lt: new Date() }
    });

    if (expiredSeats.length > 0) {
      // Group by event for socket notifications
      const eventGroups = {};
      expiredSeats.forEach(seat => {
        const eventId = seat.eventId.toString();
        if (!eventGroups[eventId]) {
          eventGroups[eventId] = [];
        }
        eventGroups[eventId].push(seat._id);
      });

      // Release locks
      const released = await Seat.releaseExpiredLocks();
      logger.info(`Released ${released} expired seat locks`);

      // Emit socket events for each event
      Object.keys(eventGroups).forEach(eventId => {
        io.to(`event-${eventId}`).emit('seats-unlocked', {
          seatIds: eventGroups[eventId],
          reason: 'expired'
        });
      });
    }
  } catch (error) {
    logger.error('Error releasing expired locks:', error);
  }
}, 30000); // Run every 30 seconds

// Seat Lock Cleanup Job
const cleanupExpiredSeatLocks = async () => {
  try {
    const now = new Date();
    const result = await Seat.updateMany(
      { 
        status: 'selected', 
        lockedUntil: { $lt: now } 
      },
      { 
        status: 'available',
        $unset: { lockedBy: '', lockedUntil: '' }
      }
    );
    
    if (result.modifiedCount > 0) {
      logger.info(`Cleaned ${result.modifiedCount} expired seat locks`);
      
      // Emit socket event for real-time update
      io.emit('seats-unlocked', {
        count: result.modifiedCount,
        timestamp: now
      });
    }
  } catch (error) {
    logger.error('Error cleaning seat locks:', error);
  }
};

// Booking Expiry Cleanup Job
const cleanupExpiredBookings = async () => {
  try {
    const now = new Date();
    const expiredBookings = await Booking.find({
      paymentStatus: 'pending',
      expiresAt: { $lt: now },
      status: { $ne: 'cancelled' }
    });

    if (expiredBookings.length > 0) {
      for (const booking of expiredBookings) {
        // Cancel booking
        booking.status = 'cancelled';
        await booking.save();
        
        // Release seats
        await Seat.updateMany(
          { bookingId: booking._id },
          { 
            status: 'available',
            $unset: { bookingId: '', lockedBy: '', lockedUntil: '' }
          }
        );

        // Restore event available seats
        await Event.findByIdAndUpdate(
          booking.eventId,
          { $inc: { availableSeats: booking.seats } }
        );
      }
      
      logger.info(`Cancelled ${expiredBookings.length} expired unpaid bookings`);
    }
  } catch (error) {
    logger.error('Error cleaning expired bookings:', error);
  }
};

// Start server
const startServer = async () => {
  try {
    console.log('Starting server...');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);
    console.log('PORT:', process.env.PORT || 3000);

    await connectDB();
    logger.info(' Database connection established successfully');
    
    // Start all automated cleanup jobs
    startCleanupJobs();
    
    // Start reminder jobs
    startReminderJobs();
    
    server.listen(PORT, () => {
      logger.info(` Server started on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(` Health check: http://localhost:${PORT}/health`);
      logger.info(` API Documentation: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('STARTUP CRASH:', error.message);
    console.error('Stack:', error.stack);
    logger.error(' Unable to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, io };