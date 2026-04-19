# Event Management System - Backend

RESTful API backend for the Event Management & Ticketing platform built with Node.js, Express, MongoDB, and Socket.IO.

## Tech Stack

- **Runtime**: Node.js v16+
- **Framework**: Express.js
- **Database**: MongoDB 4.4+ with Mongoose ODM
- **Cache**: Redis 6.0+
- **Real-time**: Socket.IO v4
- **Authentication**: JWT with 2FA (TOTP)
- **Payment**: Razorpay
- **Email**: Nodemailer
- **Testing**: Jest, Supertest
- **Load Testing**: Artillery
- **Logging**: Winston
- **Documentation**: Swagger/OpenAPI

## Features

### Core Functionality
- User authentication with JWT and 2FA
- Role-based access control (User, Organizer, Admin)
- Event creation and management
- Interactive seat booking with real-time updates
- Payment processing with Razorpay
- Ticket generation with QR codes
- Refund management with dynamic policies
- Promo code system
- QR code check-in
- Google Calendar integration

### Real-time Features
- WebSocket-based seat availability updates
- Live booking notifications
- Real-time dashboard updates
- Instant notification delivery

### Advanced Features
- Automated email reminders (24h, 1h before events)
- System logs with audit trail
- Analytics and reporting
- Waitlist management
- AI chatbot support
- Load testing dashboard

## Project Structure

```
backend/
├── config/              # Configuration files
│   ├── database.js      # MongoDB connection
│   └── redis.js         # Redis connection
├── middleware/          # Express middleware
│   ├── auth.js          # JWT authentication
│   ├── rateLimiter.js   # Rate limiting
│   ├── errorHandler.js  # Error handling
│   ├── validation.js    # Request validation
│   └── ...
├── models/              # Mongoose models
│   ├── User.js
│   ├── Event.js
│   ├── Booking.js
│   ├── Payment.js
│   ├── Refund.js
│   └── ...
├── routes/              # API routes
│   ├── auth.js          # Authentication endpoints
│   ├── events.js        # Event management
│   ├── bookings.js      # Booking operations
│   ├── payments.js      # Payment processing
│   ├── refunds.js       # Refund management
│   └── ...
├── services/            # Business logic
│   ├── emailService.js
│   ├── pdfService.js
│   ├── razorpayService.js
│   ├── notificationService.js
│   └── ...
├── jobs/                # Cron jobs
│   ├── reminderJobs.js  # Event reminders
│   └── cleanupJobs.js   # Data cleanup
├── scripts/             # Utility scripts
│   ├── seedData.js      # Seed database
│   ├── setupRealAdmin.js # Create admin user
│   └── ...
├── test/                # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── load-tests/      # Artillery load tests
├── utils/               # Helper functions
│   ├── logger.js
│   ├── pagination.js
│   └── ...
├── uploads/             # File uploads
│   ├── events/          # Event images
│   └── avatars/         # User avatars
├── logs/                # Application logs
├── .env                 # Environment variables
├── server.js            # Entry point
└── package.json
```

## Installation

### Prerequisites
- Node.js v16 or higher
- MongoDB 4.4 or higher
- Redis 6.0 or higher
- Razorpay account (for payments)
- SMTP server or email service

### Setup Steps

1. **Clone the repository**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Create environment file**
```bash
cp .env.example .env
```

4. **Configure environment variables**
Edit `.env` file with your configuration:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/event-management
MONGODB_TEST_URI=mongodb://localhost:27017/event-management-test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Email (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=Event Management <noreply@eventmanagement.com>

# Google OAuth (for Calendar integration)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/calendar/callback

# Frontend URL
FRONTEND_URL=http://localhost:5173

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session
SESSION_SECRET=your-session-secret-key
```

5. **Create required directories**
```bash
mkdir -p logs uploads/avatars uploads/events
```

6. **Create database indexes**
```bash
npm run create-indexes
```

7. **Seed database (optional)**
```bash
npm run seed:data
```

8. **Create admin user**
```bash
npm run setup:admin
```

## Running the Application

### Development Mode
```bash
npm run dev
```
Server runs on `http://localhost:5000` with auto-reload

### Production Mode
```bash
npm start
```

### Run Tests
```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Load Testing
```bash
# Basic load test
npm run load:basic

# Authentication load test
npm run load:auth

# Booking flow load test
npm run load:booking

# Stress test
npm run load:stress

# Generate HTML report
npm run load:report
```

## API Documentation

### Access Swagger UI
Once the server is running, visit:
```
http://localhost:5000/api-docs
```

### API Base URL
```
http://localhost:5000/api
```

### Authentication
Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Key Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-email` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout user

#### Events
- `GET /api/events` - Get all published events
- `GET /api/events/:id` - Get event details
- `POST /api/events` - Create event (Organizer)
- `PUT /api/events/:id` - Update event (Organizer)
- `DELETE /api/events/:id` - Delete event (Organizer/Admin)
- `GET /api/events/search` - Search events

#### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get user bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/:id/tickets` - Download tickets

#### Payments
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `POST /api/payments/webhook` - Razorpay webhook

#### Seats
- `GET /api/seats/:eventId` - Get seat map
- `POST /api/seats/lock` - Lock seats
- `POST /api/seats/unlock` - Unlock seats

#### Refunds
- `POST /api/refunds` - Request refund
- `GET /api/refunds` - Get refund requests
- `PUT /api/refunds/:id/approve` - Approve refund (Admin)
- `PUT /api/refunds/:id/reject` - Reject refund (Admin)

#### Admin
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/events` - Get all events
- `GET /api/admin/bookings` - Get all bookings
- `GET /api/admin/analytics` - Platform analytics

#### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `DELETE /api/notifications/:id` - Delete notification

#### Check-in
- `POST /api/checkin/scan` - Scan QR code
- `GET /api/checkin/:eventId/stats` - Check-in statistics

## Database Models

### User
- Authentication credentials
- Profile information
- Role (User, Organizer, Admin)
- Email verification status
- 2FA settings
- Google Calendar tokens

### Event
- Event details (title, description, category)
- Schedule (date, time)
- Location (venue, city, state, country)
- Pricing and seating
- Status (draft, published, cancelled, completed)
- Organizer reference

### Booking
- User and event references
- Selected seats
- Total amount
- Booking status (pending, confirmed, cancelled, refunded)
- Payment information
- Booking reference

### Payment
- Razorpay order and payment IDs
- Amount and currency
- Payment status
- Transaction details

### Seat
- Event reference
- Section (VIP, Premium, Regular, Balcony)
- Row and number
- Status (available, locked, booked, blocked)
- Lock expiry timestamp

### Refund
- Booking reference
- Refund amount
- Cancellation fee
- Reason
- Status (pending, approved, rejected, completed)
- Admin notes

### Notification
- User reference
- Type (booking, payment, reminder, refund)
- Title and message
- Read status
- Timestamp

## WebSocket Events

### Client → Server
- `join-event` - Subscribe to event updates
- `leave-event` - Unsubscribe from event
- `lock-seats` - Lock seats for booking
- `unlock-seats` - Release locked seats

### Server → Client
- `seats-updated` - Seat availability changed
- `seats-locked` - Seats locked by user
- `seats-unlocked` - Seats released
- `booking-confirmed` - Booking completed
- `notification` - New notification

## Cron Jobs

### Event Reminders
- **24-hour reminder**: Runs daily at 9:00 AM
- **1-hour reminder**: Runs every hour

### Cleanup Jobs
- **Expired bookings**: Runs every 5 minutes
- **Old logs**: Runs daily at midnight (keeps 90 days)

## Security Features

- JWT authentication with short-lived tokens
- Password hashing with bcrypt (10 salt rounds)
- 2FA for admin accounts (TOTP)
- Rate limiting (100 requests per 15 minutes)
- Input sanitization (XSS, NoSQL injection)
- CORS configuration
- Helmet.js security headers
- Request timeout (30 seconds)
- Payment signature verification

## Error Handling

All errors follow a consistent format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (dev only)"
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

## Logging

Logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

Log levels: `error`, `warn`, `info`, `http`, `debug`

## Performance Optimization

- Database indexes on frequently queried fields
- Redis caching for session management
- Connection pooling for MongoDB
- Pagination for large datasets
- Lazy loading for related documents
- Query optimization with lean()
- File upload size limits

## Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use strong secrets for JWT and session
3. Configure production database
4. Set up Redis for caching
5. Configure email service
6. Set up Razorpay production keys

### Recommended Hosting
- **Server**: AWS EC2, DigitalOcean, Heroku
- **Database**: MongoDB Atlas
- **Cache**: Redis Cloud, AWS ElastiCache
- **File Storage**: AWS S3, Cloudinary

### Docker Support

**Quick Start with Docker Compose** (Recommended):
```bash
# Start all services (backend, MongoDB, Redis)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Manual Docker Build**:
```bash
# Build image
docker build -t event-backend .

# Run container
docker run -p 5000:5000 --env-file .env event-backend
```

For detailed Docker setup, troubleshooting, and production deployment, see **[Docker Setup Guide](../README/DOCKER_SETUP_GUIDE.md)**

## Troubleshooting

### MongoDB Connection Issues
- Verify MongoDB is running: `mongosh`
- Check connection string in `.env`
- Ensure network access (MongoDB Atlas whitelist)

### Redis Connection Issues
- Verify Redis is running: `redis-cli ping`
- Check Redis host and port in `.env`

### Email Not Sending
- Verify SMTP credentials
- For Gmail, use App Password (not regular password)
- Check firewall/network settings

### Payment Failures
- Verify Razorpay keys (test vs production)
- Check webhook URL configuration
- Review Razorpay dashboard logs

### WebSocket Not Working
- Check CORS configuration
- Verify frontend Socket.IO client version matches server
- Check firewall/proxy settings

## Scripts Reference

```bash
# Development
npm run dev              # Start with nodemon

# Production
npm start                # Start server

# Testing
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage    # With coverage report

# Load Testing
npm run load:basic       # Basic load test
npm run load:auth        # Auth endpoints
npm run load:booking     # Booking flow
npm run load:stress      # Stress test

# Database
npm run seed             # Seed database
npm run seed:data        # Seed with sample data
npm run clean:db         # Clean database
npm run create-indexes   # Create DB indexes
npm run migrate          # Run migrations

# Admin
npm run setup:admin      # Create admin user
npm run list:users       # List all users

# Setup
npm run setup            # Complete setup
```

## Contributing

1. Follow existing code structure
2. Write tests for new features
3. Update API documentation
4. Follow ESLint rules
5. Use meaningful commit messages

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 5000 |
| `NODE_ENV` | Environment | No | development |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `REDIS_HOST` | Redis host | Yes | localhost |
| `REDIS_PORT` | Redis port | No | 6379 |
| `JWT_SECRET` | JWT secret key | Yes | - |
| `RAZORPAY_KEY_ID` | Razorpay key | Yes | - |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Yes | - |
| `EMAIL_HOST` | SMTP host | Yes | - |
| `EMAIL_PORT` | SMTP port | Yes | - |
| `EMAIL_USER` | SMTP username | Yes | - |
| `EMAIL_PASSWORD` | SMTP password | Yes | - |
| `FRONTEND_URL` | Frontend URL | Yes | - |

## License

ISC

## Support

For issues and questions:
- Check existing documentation
- Review API documentation at `/api-docs`
- Check logs in `logs/` directory
- Review test files for usage examples
# lms-backend
