const QRCode = require('qrcode');

async function testQRGeneration() {
  try {
    const testData = {
      ticketNumber: 'TK123456789',
      eventId: '507f1f77bcf86cd799439011',
      bookingId: '507f1f77bcf86cd799439012',
      attendeeName: 'John Doe',
      eventTitle: 'Test Event',
      eventDate: new Date().toISOString(),
      venue: 'Test Venue'
    };

    const qrCodeData = JSON.stringify(testData);
    const qrCode = await QRCode.toDataURL(qrCodeData);
    
    console.log('QR Code generated successfully!');
    console.log('QR Code length:', qrCode.length);
    console.log('QR Code starts with:', qrCode.substring(0, 50));
    
    return qrCode;
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

testQRGeneration();