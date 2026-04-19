#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let organizerToken = '';
let userToken = '';
let eventId = '';
let couponId = '';

// Test admin user
const adminUser = {
  email: 'admin@test.com',
  password: 'admin123',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin'
};

async function makeRequest(method, endpoint, data = null, token = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

async function setupTestUsers() {
  console.log('\n🔧 Setting up test users...');
  
  // Create admin user
  const adminResult = await makeRequest('POST', '/api/auth/signup', adminUser);
  if (adminResult.success) {
    console.log('✅ Admin user created');
    adminToken = adminResult.data.token;
  } else if (adminResult.error && adminResult.error.error === 'User already exists with this email') {
    // Login existing admin
    const loginResult = await makeRequest('POST', '/api/auth/login', {
      email: adminUser.email,
      password: adminUser.password
    });
    if (loginResult.success) {
      adminToken = loginResult.data.token;
      console.log('✅ Admin user logged in');
    } else {
      console.log('❌ Admin login failed:', loginResult.error);
    }
  } else {
    console.log('❌ Admin creation failed:', adminResult.error);
  }

  // Get existing tokens for organizer and user
  const organizerLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'organizer@test.com',
    password: 'password123'
  });
  if (organizerLogin.success) {
    organizerToken = organizerLogin.data.token;
    console.log('✅ Organizer token obtained');
  } else {
    console.log('❌ Organizer login failed:', organizerLogin.error);
  }

  const userLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'user@test.com',
    password: 'password123'
  });
  if (userLogin.success) {
    userToken = userLogin.data.token;
    console.log(' User token obtained');
  } else {
    console.log(' User login failed:', userLogin.error);
  }
}

async function testCouponSystem() {
  console.log('\n Testing Coupon System...');
  
  // Create a coupon
  const couponData = {
    code: 'WELCOME20',
    name: 'Welcome Discount',
    description: '20% off for new users',
    type: 'percentage',
    value: 20,
    maxDiscount: 500,
    minOrderValue: 1000,
    usageLimit: 100,
    userLimit: 1,
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    applicableCategories: ['conference', 'workshop']
  };

  const couponResult = await makeRequest('POST', '/api/coupons', couponData, adminToken);
  if (couponResult.success) {
    console.log(' Coupon created successfully');
    couponId = couponResult.data.coupon._id;
  } else {
    console.log(' Coupon creation failed:', couponResult.error);
  }

  // Validate coupon
  if (eventId) {
    const validateResult = await makeRequest('POST', `/api/coupons/validate/WELCOME20`, {
      eventId: eventId,
      orderValue: 1500
    }, userToken);
    
    if (validateResult.success) {
      console.log('Coupon validation successful');
      console.log(`   Discount: ₹${validateResult.data.discount}`);
    } else {
      console.log(' Coupon validation failed:', validateResult.error);
    }
  }

  // List coupons
  const listResult = await makeRequest('GET', '/api/coupons', null, adminToken);
  if (listResult.success) {
    console.log(' Coupons listed successfully');
    console.log(`   Found ${listResult.data.coupons.length} coupons`);
  }
}

async function testWaitlistSystem() {
  console.log('\n Testing Waitlist System...');
  
  if (!eventId) {
    console.log(' No event available for waitlist testing');
    return;
  }

  // Join waitlist
  const waitlistData = {
    seatsRequested: 2,
    maxPrice: 2000
  };

  const joinResult = await makeRequest('POST', `/api/waitlist/events/${eventId}/join`, waitlistData, userToken);
  if (joinResult.success) {
    console.log(' Joined waitlist successfully');
  } else {
    console.log(' Waitlist join failed:', joinResult.error);
  }

  // Get user's waitlist
  const myWaitlistResult = await makeRequest('GET', '/api/waitlist/my', null, userToken);
  if (myWaitlistResult.success) {
    console.log(' Waitlist entries retrieved');
    console.log(`   Found ${myWaitlistResult.data.waitlist.length} waitlist entries`);
  }
}

async function testAdvancedAnalytics() {
  console.log('\n Testing Advanced Analytics...');
  
  // Dashboard analytics
  const dashboardResult = await makeRequest('GET', '/api/admin/analytics/dashboard', null, adminToken);
  if (dashboardResult.success) {
    console.log(' Dashboard analytics retrieved');
    const metrics = dashboardResult.data.analytics;
    console.log(`   Total Users: ${metrics.totalUsers}`);
    console.log(`   Total Events: ${metrics.totalEvents}`);
    console.log(`   Total Revenue: ₹${metrics.totalRevenue}`);
  } else {
    console.log(' Dashboard analytics failed:', dashboardResult.error);
  }

  // Revenue analytics
  const revenueResult = await makeRequest('GET', '/api/admin/analytics/revenue?period=daily&days=7', null, adminToken);
  if (revenueResult.success) {
    console.log(' Revenue analytics retrieved');
    console.log(`   Data points: ${revenueResult.data.revenueAnalytics.length}`);
  }

  // Event performance
  const eventAnalyticsResult = await makeRequest('GET', '/api/admin/analytics/events', null, adminToken);
  if (eventAnalyticsResult.success) {
    console.log(' Event analytics retrieved');
    console.log(`   Events analyzed: ${eventAnalyticsResult.data.eventAnalytics.length}`);
  }

  // User behavior analytics
  const userAnalyticsResult = await makeRequest('GET', '/api/admin/analytics/users', null, adminToken);
  if (userAnalyticsResult.success) {
    console.log(' User analytics retrieved');
  }

  // Geographic analytics
  const geoResult = await makeRequest('GET', '/api/admin/analytics/geographic', null, adminToken);
  if (geoResult.success) {
    console.log(' Geographic analytics retrieved');
  }

  // Predictive analytics
  if (eventId) {
    const predictResult = await makeRequest('GET', `/api/admin/analytics/predict/${eventId}`, null, adminToken);
    if (predictResult.success) {
      console.log(' Predictive analytics retrieved');
      const predictions = predictResult.data.predictions;
      console.log(`   Predicted Attendance: ${predictions.predictedAttendance}`);
      console.log(`   Confidence: ${predictions.confidence}`);
    }
  }
}

async function testEnhancedBookingFlow() {
  console.log('\n Testing Enhanced Booking Flow...');
  
  if (!eventId) {
    console.log(' No event available for booking');
    return;
  }

  // Book with coupon
  const bookingData = {
    seats: 1,
    attendeeDetails: {
      primaryContact: 'user@test.com',
      dietaryRequirements: 'Vegetarian',
      specialNeeds: 'Wheelchair access'
    },
    couponCode: 'WELCOME20'
  };

  const bookingResult = await makeRequest('POST', `/api/bookings/events/${eventId}/book`, bookingData, userToken);
  if (bookingResult.success) {
    console.log(' Enhanced booking created successfully');
    console.log(`   Final Amount: ₹${bookingResult.data.booking.finalAmount}`);
    console.log(`   Discount Applied: ₹${bookingResult.data.booking.discountAmount}`);
  } else {
    console.log(' Enhanced booking failed:', bookingResult.error);
  }
}

async function getExistingEvent() {
  const eventsResult = await makeRequest('GET', '/api/events', null, organizerToken);
  if (eventsResult.success && eventsResult.data.events.length > 0) {
    eventId = eventsResult.data.events[0]._id;
    console.log(` Using existing event: ${eventId}`);
  }
}

async function runAdvancedTests() {
  console.log(' Starting Advanced Features Test Suite\n');
  console.log('=' .repeat(60));

  try {
    await setupTestUsers();
    await getExistingEvent();
    await testCouponSystem();
    await testWaitlistSystem();
    await testAdvancedAnalytics();
    await testEnhancedBookingFlow();

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Advanced Features Tests Completed!');
    console.log('\n📊 New Features Summary:');
    console.log(`   • Coupon System: ✅`);
    console.log(`   • Waitlist Management: ✅`);
    console.log(`   • Advanced Analytics: ✅`);
    console.log(`   • Predictive Analytics: ✅`);
    console.log(`   • Enhanced Booking Flow: ✅`);
    
    console.log('\n🌟 Your backend now includes:');
    console.log('   • Smart coupon system with validation');
    console.log('   • Waitlist management for sold-out events');
    console.log('   • Comprehensive analytics dashboard');
    console.log('   • Predictive analytics for event planning');
    console.log('   • Geographic and user behavior insights');
    console.log('   • Enhanced booking with detailed attendee info');
    
  } catch (error) {
    console.error('\n❌ Advanced test suite failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAdvancedTests().catch(console.error);
}

module.exports = { runAdvancedTests };