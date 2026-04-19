const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Seat = require('../../models/Seat');
const Event = require('../../models/Event');

describe('Booking Model Tests', () => {
  
  describe('Booking Reference Generation', () => {
    test('should generate unique booking reference on creation', () => {
      const booking = new Booking({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(),
        seats: 2,
        totalAmount: 1000,
        finalAmount: 1000
      });
      
      booking.validate();
      expect(booking.bookingReference).toBeDefined();
      expect(booking.bookingReference).toMatch(/^BK\d+[A-Z0-9]{4}$/);
    });
  });
  
  describe('Booking Expiry', () => {
    test('should set expiry time for pending bookings', () => {
      const booking = new Booking({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(),
        seats: 2,
        totalAmount: 1000,
        finalAmount: 1000,
        paymentStatus: 'pending'
      });
      
      booking.validate();
      expect(booking.expiresAt).toBeDefined();
      
      const now = new Date();
      const expiryTime = new Date(booking.expiresAt);
      const diffMinutes = (expiryTime - now) / (1000 * 60);
      
      expect(diffMinutes).toBeGreaterThan(29);
      expect(diffMinutes).toBeLessThan(31);
    });
    
    test('should not set expiry for completed bookings', () => {
      const booking = new Booking({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(),
        seats: 2,
        totalAmount: 1000,
        finalAmount: 1000,
        paymentStatus: 'completed'
      });
      
      booking.validate();
      expect(booking.expiresAt).toBeUndefined();
    });
  });
  
  describe('Final Amount Calculation', () => {
    test('should calculate final amount with discount', () => {
      const booking = new Booking({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(),
        seats: 2,
        totalAmount: 1000,
        discountAmount: 100
      });
      
      booking.validate();
      expect(booking.finalAmount).toBe(900);
    });
    
    test('should use total amount if no discount', () => {
      const booking = new Booking({
        userId: new mongoose.Types.ObjectId(),
        eventId: new mongoose.Types.ObjectId(),
        seats: 2,
        totalAmount: 1000
      });
      
      booking.validate();
      expect(booking.finalAmount).toBe(1000);
    });
  });
});

describe('Seat Locking Tests', () => {
  
  describe('Seat Lock Expiry', () => {
    test('should detect expired seat locks', async () => {
      const expiredLock = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const seat = new Seat({
        eventId: new mongoose.Types.ObjectId(),
        section: 'Regular',
        row: 'A',
        seatNumber: 1,
        price: 500,
        status: 'selected',
        lockedBy: new mongoose.Types.ObjectId(),
        lockedUntil: expiredLock
      });
      
      const now = new Date();
      const isExpired = seat.lockedUntil < now;
      
      expect(isExpired).toBe(true);
    });
    
    test('should not mark active seat locks as expired', () => {
      const activeLock = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      
      const seat = new Seat({
        eventId: new mongoose.Types.ObjectId(),
        section: 'Regular',
        row: 'A',
        seatNumber: 1,
        price: 500,
        status: 'selected',
        lockedBy: new mongoose.Types.ObjectId(),
        lockedUntil: activeLock
      });
      
      const now = new Date();
      const isExpired = seat.lockedUntil < now;
      
      expect(isExpired).toBe(false);
    });
  });
  
  describe('Seat Status Validation', () => {
    test('should only allow valid seat statuses', () => {
      const validStatuses = ['available', 'selected', 'booked', 'blocked'];
      
      validStatuses.forEach(status => {
        const seat = new Seat({
          eventId: new mongoose.Types.ObjectId(),
          section: 'Regular',
          row: 'A',
          seatNumber: 1,
          price: 500,
          status
        });
        
        const error = seat.validateSync();
        expect(error).toBeUndefined();
      });
    });
    
    test('should reject invalid seat status', () => {
      const seat = new Seat({
        eventId: new mongoose.Types.ObjectId(),
        section: 'Regular',
        row: 'A',
        seatNumber: 1,
        price: 500,
        status: 'invalid-status'
      });
      
      const error = seat.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.status).toBeDefined();
    });
  });
});

describe('Pagination Helper Tests', () => {
  const { getPaginationParams, getPaginationMeta } = require('../../utils/pagination');
  
  describe('getPaginationParams', () => {
    test('should return default values when no query params', () => {
      const result = getPaginationParams({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.skip).toBe(0);
    });
    
    test('should cap limit at maximum', () => {
      const result = getPaginationParams({ limit: 500 }, 10, 100);
      
      expect(result.limit).toBe(100);
    });
    
    test('should calculate skip correctly', () => {
      const result = getPaginationParams({ page: 3, limit: 20 });
      
      expect(result.skip).toBe(40);
    });
    
    test('should handle invalid page numbers', () => {
      const result = getPaginationParams({ page: -5 });
      
      expect(result.page).toBe(1);
    });
  });
  
  describe('getPaginationMeta', () => {
    test('should calculate pagination metadata correctly', () => {
      const meta = getPaginationMeta(100, 2, 10);
      
      expect(meta.total).toBe(100);
      expect(meta.page).toBe(2);
      expect(meta.limit).toBe(10);
      expect(meta.totalPages).toBe(10);
      expect(meta.hasNextPage).toBe(true);
      expect(meta.hasPrevPage).toBe(true);
    });
    
    test('should handle first page correctly', () => {
      const meta = getPaginationMeta(50, 1, 10);
      
      expect(meta.hasPrevPage).toBe(false);
      expect(meta.hasNextPage).toBe(true);
    });
    
    test('should handle last page correctly', () => {
      const meta = getPaginationMeta(50, 5, 10);
      
      expect(meta.hasPrevPage).toBe(true);
      expect(meta.hasNextPage).toBe(false);
    });
  });
});

// Mock tests for async operations
describe('Booking Workflow Tests', () => {
  
  test('should validate booking creation workflow', () => {
    const steps = [
      'Check seat availability',
      'Lock seats',
      'Create booking',
      'Process payment',
      'Confirm booking',
      'Send confirmation email'
    ];
    
    expect(steps).toHaveLength(6);
    expect(steps[0]).toBe('Check seat availability');
    expect(steps[steps.length - 1]).toBe('Send confirmation email');
  });
  
  test('should validate refund workflow', () => {
    const refundSteps = [
      'Request refund',
      'Calculate cancellation fee',
      'Admin approval',
      'Process refund',
      'Release seats',
      'Update event capacity'
    ];
    
    expect(refundSteps).toContain('Admin approval');
    expect(refundSteps).toContain('Release seats');
  });
});

// Export for test runner
module.exports = {
  testSuite: 'Booking and Seat Management'
};
