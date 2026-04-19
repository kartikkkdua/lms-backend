# EventHub Testing Guide

Comprehensive testing documentation for the EventHub backend.

---

## 📋 Table of Contents

1. [Test Structure](#test-structure)
2. [Running Tests](#running-tests)
3. [Test Coverage](#test-coverage)
4. [Writing Tests](#writing-tests)
5. [Test Utilities](#test-utilities)
6. [Troubleshooting](#troubleshooting)

---

## 🏗️ Test Structure

```
test/
├── unit/                    # Unit tests
│   └── booking.test.js     # Booking & seat logic tests
├── integration/            # Integration tests
│   ├── booking-flow.test.js    # Complete booking workflow
│   └── admin-flow.test.js      # Admin & organizer workflows
├── setup.js                # Test setup and configuration
└── README.md              # This file
```

### Test Types

#### Unit Tests
- Test individual functions and methods
- Mock external dependencies
- Fast execution
- High coverage of edge cases

#### Integration Tests
- Test complete workflows
- Use real database (test DB)
- Test API endpoints end-to-end
- Verify system behavior

---

## 🚀 Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### With Coverage Report
```bash
npm run test:coverage
```

### Verbose Output
```bash
npm run test:verbose
```

### Specific Test File
```bash
npm test -- booking.test.js
```

### Specific Test Suite
```bash
npm test -- --testNamePattern="Booking Model"
```

---

## 📊 Test Coverage

### Current Coverage

| Category | Coverage |
|----------|----------|
| Unit Tests | 18+ tests |
| Integration Tests | 50+ tests |
| Total Tests | 68+ tests |

### Coverage Goals

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

### View Coverage Report

After running `npm run test:coverage`:

```bash
# Open HTML report
open coverage/index.html

# View in terminal
cat coverage/lcov-report/index.html
```

---

## ✍️ Writing Tests

### Unit Test Example

```javascript
describe('Feature Name', () => {
  describe('Specific Functionality', () => {
    test('should do something specific', () => {
      // Arrange
      const input = { value: 10 };
      
      // Act
      const result = myFunction(input);
      
      // Assert
      expect(result).toBe(20);
    });
  });
});
```

### Integration Test Example

```javascript
describe('API Endpoint Tests', () => {
  let authToken;
  
  beforeAll(async () => {
    // Setup
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'Test@123' });
    authToken = res.body.token;
  });
  
  test('should create resource', async () => {
    const res = await request(app)
      .post('/api/resource')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Test' })
      .expect(201);
    
    expect(res.body).toHaveProperty('id');
  });
  
  afterAll(async () => {
    // Cleanup
    await Resource.deleteMany({});
  });
});
```

### Best Practices

1. **Descriptive Test Names**
   ```javascript
   // ❌ Bad
   test('test booking', () => {});
   
   // ✅ Good
   test('should create booking with valid data', () => {});
   ```

2. **Arrange-Act-Assert Pattern**
   ```javascript
   test('should calculate discount', () => {
     // Arrange
     const price = 1000;
     const discount = 0.1;
     
     // Act
     const result = calculateDiscount(price, discount);
     
     // Assert
     expect(result).toBe(900);
   });
   ```

3. **Test One Thing**
   ```javascript
   // ❌ Bad - Testing multiple things
   test('should handle user operations', () => {
     expect(createUser()).toBeDefined();
     expect(updateUser()).toBeTruthy();
     expect(deleteUser()).toBeNull();
   });
   
   // ✅ Good - Separate tests
   test('should create user', () => {
     expect(createUser()).toBeDefined();
   });
   
   test('should update user', () => {
     expect(updateUser()).toBeTruthy();
   });
   ```

4. **Use beforeEach/afterEach for Setup/Cleanup**
   ```javascript
   describe('User Tests', () => {
     let user;
     
     beforeEach(async () => {
       user = await User.create({ name: 'Test' });
     });
     
     afterEach(async () => {
       await User.deleteMany({});
     });
     
     test('should find user', async () => {
       const found = await User.findById(user._id);
       expect(found).toBeDefined();
     });
   });
   ```

---

## 🛠️ Test Utilities

### Global Test Utilities

Available in all tests via `global.testUtils`:

```javascript
// Generate random email
const email = global.testUtils.randomEmail();

// Generate random phone
const phone = global.testUtils.randomPhone();

// Wait for async operations
await global.testUtils.wait(1000); // Wait 1 second

// Create test user data
const userData = global.testUtils.createUserData('organizer');

// Create test event data
const eventData = global.testUtils.createEventData(organizerId);
```

### Custom Matchers

```javascript
// Check if value is valid ObjectId
expect(value).toMatch(/^[0-9a-fA-F]{24}$/);

// Check if date is in future
expect(new Date(value)).toBeGreaterThan(new Date());

// Check if array contains object with property
expect(array).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: 'Test' })
  ])
);
```

### Mocking

```javascript
// Mock function
const mockFn = jest.fn().mockReturnValue('mocked');

// Mock module
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true })
}));

// Spy on method
const spy = jest.spyOn(User, 'findById');
expect(spy).toHaveBeenCalledWith(userId);
```

---

## 🧪 Test Scenarios Covered

### Unit Tests

#### Booking Model
- ✅ Booking reference generation
- ✅ Booking expiry logic (30 minutes)
- ✅ Final amount calculation with discounts
- ✅ Validation rules

#### Seat Model
- ✅ Seat lock expiry detection
- ✅ Seat status validation
- ✅ Lock/unlock operations

#### Pagination
- ✅ Parameter extraction and validation
- ✅ Limit capping (max 100)
- ✅ Metadata generation
- ✅ Edge cases (invalid inputs)

### Integration Tests

#### Booking Flow
1. ✅ User registration and authentication
2. ✅ Event creation by organizer
3. ✅ Seat availability check
4. ✅ Seat locking
5. ✅ Booking creation
6. ✅ Payment processing
7. ✅ Booking confirmation
8. ✅ Ticket generation
9. ✅ Email notifications
10. ✅ Refund workflow

#### Admin Flow
1. ✅ Admin dashboard access
2. ✅ User management
3. ✅ Event management
4. ✅ Promo code creation
5. ✅ Refund approval/rejection
6. ✅ Revenue analytics
7. ✅ Bulk operations

#### Error Handling
- ✅ Invalid input validation
- ✅ Unauthorized access
- ✅ Resource not found
- ✅ Duplicate entries
- ✅ Business logic violations

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Tests Timeout

**Problem**: Tests take too long and timeout

**Solution**:
```javascript
// Increase timeout for specific test
test('slow operation', async () => {
  // test code
}, 60000); // 60 seconds

// Or globally in jest.config.js
testTimeout: 30000
```

#### 2. Database Connection Issues

**Problem**: Cannot connect to test database

**Solution**:
```bash
# Ensure MongoDB is running
mongod

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/event_management_test
```

#### 3. Port Already in Use

**Problem**: Server port is already in use

**Solution**:
```bash
# Find process using port
netstat -ano | findstr :3000

# Kill process (Windows)
taskkill /PID <PID> /F

# Or use different port in tests
process.env.PORT = 3001;
```

#### 4. Tests Fail Randomly

**Problem**: Tests pass sometimes, fail other times

**Solution**:
```javascript
// Run tests sequentially
npm test -- --runInBand

// Clear database between tests
afterEach(async () => {
  await User.deleteMany({});
  await Event.deleteMany({});
});
```

#### 5. Mock Not Working

**Problem**: Mocked function still calls real implementation

**Solution**:
```javascript
// Mock before importing module
jest.mock('../services/emailService');
const { sendEmail } = require('../services/emailService');

// Or use jest.doMock for dynamic mocking
jest.doMock('../services/emailService', () => ({
  sendEmail: jest.fn()
}));
```

### Debug Tests

```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Enable verbose logging
LOG_LEVEL=debug npm test

# Run single test with console output
npm test -- --verbose booking.test.js
```

---

## 📈 Continuous Improvement

### Adding New Tests

1. **Identify untested code**
   ```bash
   npm run test:coverage
   # Check coverage report for gaps
   ```

2. **Write test**
   ```javascript
   test('should handle new feature', () => {
     // Test implementation
   });
   ```

3. **Run and verify**
   ```bash
   npm test -- new-feature.test.js
   ```

4. **Update coverage**
   ```bash
   npm run test:coverage
   ```

### Test Maintenance

- Review and update tests when features change
- Remove obsolete tests
- Refactor duplicate test code
- Keep tests simple and readable
- Document complex test scenarios

---

## 🎯 Testing Checklist

Before committing code:

- [ ] All tests pass
- [ ] New features have tests
- [ ] Coverage meets thresholds
- [ ] No console errors/warnings
- [ ] Tests run in reasonable time
- [ ] Integration tests cover happy path
- [ ] Edge cases are tested
- [ ] Error handling is tested

---

## 📚 Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)

---

## 🤝 Contributing

When adding tests:

1. Follow existing test structure
2. Use descriptive test names
3. Keep tests focused and simple
4. Add comments for complex logic
5. Update this README if needed

---

**Happy Testing! 🧪**
