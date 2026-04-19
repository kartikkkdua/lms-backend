const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

class TicketService {
  constructor() {
    this.uploadsDir = process.env.UPLOAD_PATH || './uploads';
    this.ticketsDir = path.join(this.uploadsDir, 'tickets');
    
    // Ensure directories exist
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    if (!fs.existsSync(this.ticketsDir)) {
      fs.mkdirSync(this.ticketsDir, { recursive: true });
    }
  }

  async generateQRCode(ticketData) {
    try {
      const qrData = JSON.stringify({
        ticketNumber: ticketData.ticketNumber,
        eventId: ticketData.eventId,
        bookingId: ticketData.bookingId,
        attendeeName: ticketData.attendeeName,
        timestamp: new Date().toISOString()
      });

      const qrCodeDataURL = await QRCode.toDataURL(qrData);
      return qrCodeDataURL;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  async generateTicketPDF(ticket, booking, event, user) {
    try {
      const fileName = `ticket_${ticket.ticketNumber}.pdf`;
      const filePath = path.join(this.ticketsDir, fileName);

      // Generate QR code
      const qrCode = await this.generateQRCode({
        ticketNumber: ticket.ticketNumber,
        eventId: event._id,
        bookingId: booking._id,
        attendeeName: ticket.attendeeName
      });

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(fs.createWriteStream(filePath));

      // Header
      doc.fontSize(24)
         .fillColor('#2c3e50')
         .text('EVENT TICKET', 50, 50, { align: 'center' });

      // Event title
      doc.fontSize(20)
         .fillColor('#e74c3c')
         .text(event.title, 50, 100, { align: 'center' });

      // Ticket details box
      doc.rect(50, 140, 500, 200)
         .stroke('#bdc3c7');

      // Event details
      doc.fontSize(12)
         .fillColor('#2c3e50')
         .text('Event Details:', 70, 160)
         .fontSize(10)
         .text(`Date: ${new Date(event.startDate).toLocaleDateString()}`, 70, 180)
         .text(`Time: ${new Date(event.startDate).toLocaleTimeString()}`, 70, 195)
         .text(`Venue: ${event.venue}`, 70, 210)
         .text(`Address: ${event.address}`, 70, 225)
         .text(`City: ${event.city}, ${event.state}`, 70, 240);

      // Ticket details
      doc.fontSize(12)
         .text('Ticket Details:', 300, 160)
         .fontSize(10)
         .text(`Ticket #: ${ticket.ticketNumber}`, 300, 180)
         .text(`Booking Ref: ${booking.bookingReference}`, 300, 195)
         .text(`Attendee: ${ticket.attendeeName}`, 300, 210)
         .text(`Seat: ${ticket.seatNumber || 'General'}`, 300, 225)
         .text(`Price: ₹${booking.finalAmount / booking.seats}`, 300, 240);

      // QR Code
      if (qrCode) {
        const qrBuffer = Buffer.from(qrCode.split(',')[1], 'base64');
        doc.image(qrBuffer, 450, 180, { width: 80, height: 80 });
      }

      // Instructions
      doc.fontSize(10)
         .fillColor('#7f8c8d')
         .text('Instructions:', 50, 370)
         .text('• Please arrive 30 minutes before the event starts', 50, 385)
         .text('• Carry a valid ID proof along with this ticket', 50, 400)
         .text('• Present the QR code at the venue for entry', 50, 430);

      // Footer
      doc.fontSize(8)
         .fillColor('#95a5a6')
         .text('Generated on: ' + new Date().toLocaleString(), 50, 500)
         .text('For support, contact: support@eventmanagement.com', 50, 515);

      doc.end();

      return {
        fileName,
        filePath: `/uploads/tickets/${fileName}`
      };
    } catch (error) {
      console.error('Error generating ticket PDF:', error);
      throw error;
    }
  }

  async validateTicket(ticketNumber, eventId) {
    try {
      // This would typically validate against the database
      // For now, we'll return a simple validation
      return {
        valid: true,
        message: 'Ticket is valid',
        ticketNumber,
        eventId
      };
    } catch (error) {
      console.error('Error validating ticket:', error);
      return {
        valid: false,
        message: 'Invalid ticket',
        ticketNumber,
        eventId
      };
    }
  }
}

module.exports = new TicketService();