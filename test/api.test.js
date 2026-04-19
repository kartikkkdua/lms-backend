const request = require('supertest');
const app = require('../server');

describe('API Endpoints', () => {
  // Health check test
  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      expect(res.body.status).toBe('OK');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  // Auth endpoints test
  describe('POST /api/auth/signup', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        role: 'user'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(res.body.message).toBe('User created successfully');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe(userData.email);
    });

    it('should return error for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(res.body).toHaveProperty('error');
    });
  });

  // Events endpoints test
  describe('GET /api/events', () => {
    it('should return events list', async () => {
      const res = await request(app)
        .get('/api/events')
        .expect(200);

      expect(res.body).toHaveProperty('events');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.events)).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/events?page=1&limit=5')
        .expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  // Error handling test
  describe('GET /api/nonexistent', () => {
    it('should return 404 for non-existent routes', async () => {
      const res = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(res.body.error).toBe('Route not found');
    });
  });
});

// Test data cleanup (if needed)
afterAll(async () => {
  // Clean up test data
  // This would typically clean up the test database
  console.log('Tests completed');
});