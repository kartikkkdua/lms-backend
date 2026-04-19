// Simple test to check if CAPTCHA endpoint works
const axios = require('axios');

console.log('Testing CAPTCHA endpoint...\n');

async function testCaptcha() {
  try {
    console.log('Sending request to: http://localhost:3000/api/auth/captcha');
    const response = await axios.get('http://localhost:3000/api/auth/captcha', {
      timeout: 5000
    });
    
    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    console.log('\nCAPTCHA is working! 🎉');
    
  } catch (error) {
    console.log('❌ FAILED!');
    
    if (error.code === 'ECONNABORTED') {
      console.log('Error: Request timed out');
      console.log('The server is not responding within 5 seconds');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('Error: Connection refused');
      console.log('Is the backend server running on port 3000?');
    } else if (error.response) {
      console.log('Error: Server responded with error');
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else if (error.request) {
      console.log('Error: No response from server');
      console.log('The request was made but no response was received');
    } else {
      console.log('Error:', error.message);
    }
    
    console.log('\nTroubleshooting:');
    console.log('1. Make sure backend server is running: cd backend && nodemon server.js');
    console.log('2. Check if port 3000 is available');
    console.log('3. Check backend logs for errors');
  }
}

testCaptcha();
