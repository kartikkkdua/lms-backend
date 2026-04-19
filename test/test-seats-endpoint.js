/**
 * Quick test for seats endpoint
 * Run: node test-seats-endpoint.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:3000';

async function testSeatsEndpoint() {
  console.log('🧪 Testing Seats Endpoint...\n');

  try {
    // Step 1: Get events
    console.log('1️⃣ Fetching events...');
    const eventsResponse = await axios.get(`${API_URL}/api/events`);
    const events = eventsResponse.data.events;
    
    if (!events || events.length === 0) {
      console.log('❌ No events found. Run: npm run seed:data');
      return;
    }
    
    console.log(`✅ Found ${events.length} events`);
    const testEvent = events[0];
    console.log(`   Testing with: ${testEvent.title}`);
    console.log(`   Event ID: ${testEvent._id}\n`);

    // Step 2: Get seats for event
    console.log('2️⃣ Fetching seats...');
    const seatsResponse = await axios.get(`${API_URL}/api/seats/events/${testEvent._id}`);
    const seats = seatsResponse.data.seats;
    
    if (!seats || seats.length === 0) {
      console.log('❌ No seats returned');
      return;
    }
    
    console.log(`✅ Found ${seats.length} seats`);
    
    // Step 3: Analyze seats
    console.log('\n3️⃣ Seat Analysis:');
    
    const sections = {};
    const statuses = {};
    
    seats.forEach(seat => {
      // Count by section
      sections[seat.section] = (sections[seat.section] || 0) + 1;
      
      // Count by status
      statuses[seat.status] = (statuses[seat.status] || 0) + 1;
    });
    
    console.log('\n   Sections:');
    Object.entries(sections).forEach(([section, count]) => {
      console.log(`   - ${section}: ${count} seats`);
    });
    
    console.log('\n   Status:');
    Object.entries(statuses).forEach(([status, count]) => {
      console.log(`   - ${status}: ${count} seats`);
    });
    
    // Step 4: Show sample seats
    console.log('\n4️⃣ Sample Seats:');
    seats.slice(0, 5).forEach(seat => {
      console.log(`   ${seat.section} - Row ${seat.row}, Seat ${seat.seatNumber} - ₹${seat.price} - ${seat.status}`);
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Seats endpoint is working correctly!');
    console.log('='.repeat(50));
    
    console.log('\n📝 Next Steps:');
    console.log('1. Open frontend: http://localhost:5173');
    console.log('2. Go to event details');
    console.log('3. Click "Book Tickets"');
    console.log('4. Seat map should display\n');
    
  } catch (error) {
    console.log('\n❌ Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Backend server is not running!');
      console.log('   Run: cd backend && npm run dev\n');
    } else if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', error.response.data);
    }
  }
}

// Run test
testSeatsEndpoint();
