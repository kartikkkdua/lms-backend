const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const logger = require('../utils/logger');

// Generate ticket PDF with optimized layout
const generateTicketPDF = async (booking, event, tickets, user) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 40,
        bufferPages: true
      });
      const chunks = [];

      // Collect PDF data
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        logger.info(`PDF generated successfully (${pdfBuffer.length} bytes)`);
        resolve(pdfBuffer);
      });
      doc.on('error', (err) => {
        logger.error('PDF generation error:', err);
        reject(err);
      });

      // Colors
      const primaryColor = '#2563eb';
      const secondaryColor = '#10b981';
      const textColor = '#1f2937';
      const lightGray = '#f3f4f6';

      // Generate all tickets
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        
        if (i > 0) {
          doc.addPage();
        }

        // Header with gradient effect
        doc.rect(0, 0, doc.page.width, 120)
           .fill(primaryColor);

        doc.fontSize(28)
           .fillColor('#ffffff')
           .text('EVENT TICKET', 40, 30, { align: 'center' })
           .fontSize(18)
           .text(event.title, 40, 70, { align: 'center', width: doc.page.width - 80 });

        // Reset position after header
        doc.y = 140;

        // Booking Reference Box
        doc.roundedRect(40, doc.y, doc.page.width - 80, 50, 5)
           .fillAndStroke(lightGray, '#d1d5db');
        
        doc.fontSize(10)
           .fillColor('#6b7280')
           .text('BOOKING REFERENCE', 60, doc.y + 12)
           .fontSize(16)
           .fillColor(textColor)
           .font('Helvetica-Bold')
           .text(booking.bookingReference, 60, doc.y + 28)
           .font('Helvetica');

        doc.y += 70;

        // Ticket Information Section
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('Ticket Information', 40, doc.y)
           .font('Helvetica');
        
        doc.y += 25;

        // Ticket details in a box
        const ticketBoxY = doc.y;
        doc.roundedRect(40, ticketBoxY, 250, 165, 5)
           .stroke('#d1d5db');

        doc.fontSize(11)
           .fillColor(textColor);

        const leftX = 55;
        let currentY = ticketBoxY + 15;

        doc.font('Helvetica-Bold')
           .text('Ticket Number:', leftX, currentY)
           .font('Helvetica')
           .text(ticket.ticketNumber, leftX + 100, currentY);
        
        currentY += 25;
        doc.font('Helvetica-Bold')
           .text('Attendee:', leftX, currentY)
           .font('Helvetica')
           .text(ticket.attendeeName, leftX + 100, currentY, { width: 130 });
        
        currentY += 25;
        doc.font('Helvetica-Bold')
           .text('Section:', leftX, currentY)
           .font('Helvetica')
           .fillColor(secondaryColor)
           .text(ticket.section || 'General', leftX + 100, currentY)
           .fillColor(textColor);
        
        currentY += 25;
        doc.font('Helvetica-Bold')
           .text('Seat:', leftX, currentY)
           .font('Helvetica')
           .text(ticket.seatPosition || ticket.seatNumber || 'N/A', leftX + 100, currentY);
        
        currentY += 25;
        doc.font('Helvetica-Bold')
           .text('Ticket:', leftX, currentY)
           .font('Helvetica')
           .text(`${i + 1} of ${tickets.length}`, leftX + 100, currentY);

        // QR Code Section
        try {
          const qrData = JSON.stringify({
            ticketNumber: ticket.ticketNumber,
            bookingId: booking._id.toString(),
            eventId: event._id.toString(),
            attendeeName: ticket.attendeeName,
            section: ticket.section || 'General',
            seatPosition: ticket.seatPosition || ticket.seatNumber,
            seatNumber: ticket.seatNumber,
            eventTitle: event.title,
            eventDate: event.startDate,
            venue: event.venue
          });

          const qrCodeDataURL = await QRCode.toDataURL(qrData, {
            width: 400,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'H'
          });

          const base64Data = qrCodeDataURL.split(',')[1];
          const qrBuffer = Buffer.from(base64Data, 'base64');
          
          // QR code box
          const qrX = 320;
          const qrY = ticketBoxY;
          doc.roundedRect(qrX, qrY, 220, 220, 5)
             .stroke('#d1d5db');
          
          // Add QR code
          doc.image(qrBuffer, qrX + 10, qrY + 10, { width: 200, height: 200 });
          
          doc.fontSize(9)
             .fillColor('#6b7280')
             .text('Scan at venue entrance', qrX, qrY + 215, { width: 220, align: 'center' });
          
          logger.debug(`QR code generated for ticket ${ticket.ticketNumber}`);
        } catch (qrError) {
          logger.error('QR code error:', qrError);
          doc.fontSize(10)
             .fillColor('#dc2626')
             .text('QR code unavailable', 320, ticketBoxY + 100);
        }

        doc.y = ticketBoxY + 250;

        // Event Details Section
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('Event Details', 40, doc.y)
           .font('Helvetica');
        
        doc.y += 25;

        const eventBoxY = doc.y;
        doc.roundedRect(40, eventBoxY, doc.page.width - 80, 120, 5)
           .fillAndStroke(lightGray, '#d1d5db');

        doc.fontSize(11)
           .fillColor(textColor);

        let eventY = eventBoxY + 15;
        const col1X = 55;
        const col2X = 320;

        // Left column
        doc.font('Helvetica-Bold')
           .text('Date:', col1X, eventY)
           .font('Helvetica')
           .text(new Date(event.startDate).toLocaleDateString('en-US', { 
             weekday: 'long', 
             year: 'numeric', 
             month: 'long', 
             day: 'numeric' 
           }), col1X + 50, eventY, { width: 200 });
        
        eventY += 25;
        doc.font('Helvetica-Bold')
           .text('Time:', col1X, eventY)
           .font('Helvetica')
           .text(new Date(event.startDate).toLocaleTimeString('en-US', { 
             hour: '2-digit', 
             minute: '2-digit',
             hour12: true
           }), col1X + 50, eventY);
        
        eventY += 25;
        doc.font('Helvetica-Bold')
           .text('Venue:', col1X, eventY)
           .font('Helvetica')
           .text(event.venue, col1X + 50, eventY, { width: 200 });

        // Right column
        eventY = eventBoxY + 15;
        doc.font('Helvetica-Bold')
           .text('Location:', col2X, eventY)
           .font('Helvetica')
           .text(`${event.city}, ${event.state}`, col2X + 60, eventY, { width: 180 });
        
        eventY += 25;
        doc.font('Helvetica-Bold')
           .text('Category:', col2X, eventY)
           .font('Helvetica')
           .text(event.category.charAt(0).toUpperCase() + event.category.slice(1), col2X + 60, eventY);
        
        eventY += 25;
        doc.font('Helvetica-Bold')
           .text('Amount:', col2X, eventY)
           .font('Helvetica')
           .text(`₹${booking.finalAmount}`, col2X + 60, eventY);

        doc.y = eventBoxY + 140;

        // Important Information
        doc.fontSize(14)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('Important Information', 40, doc.y)
           .font('Helvetica');
        
        doc.y += 20;

        doc.fontSize(10)
           .fillColor(textColor)
           .list([
             'Please arrive at least 30 minutes before the event starts',
             'Carry a valid government-issued ID along with this ticket',
             'This ticket is non-transferable and valid for one person only',
             'Entry is subject to security checks at the venue',
             'No refunds will be provided after 24 hours before the event',
             'Keep this ticket safe - lost tickets cannot be replaced'
           ], 55, doc.y, {
             bulletRadius: 2,
             textIndent: 15,
             lineGap: 8
           });

        doc.y += 120;

        // Contact Information
        doc.fontSize(12)
           .fillColor(primaryColor)
           .font('Helvetica-Bold')
           .text('Need Help?', 40, doc.y)
           .font('Helvetica');
        
        doc.y += 20;
        doc.fontSize(10)
           .fillColor(textColor)
           .text('Email: support@eventmanagement.com', 40, doc.y)
           .text('Phone: +91 1800-123-4567', 40, doc.y + 15)
           .text('Website: www.eventmanagement.com', 40, doc.y + 30);

        // Footer
        doc.y = doc.page.height - 80;
        doc.moveTo(40, doc.y)
           .lineTo(doc.page.width - 40, doc.y)
           .stroke('#d1d5db');

        doc.fontSize(8)
           .fillColor('#9ca3af')
           .text(`Generated on ${new Date().toLocaleString()}`, 40, doc.y + 10)
           .text(`Booking ID: ${booking._id}`, 40, doc.y + 22)
           .text('This is a computer-generated ticket and does not require a signature', 40, doc.y + 34, {
             align: 'center',
             width: doc.page.width - 80
           });

        // Watermark
        doc.fontSize(60)
           .fillColor('#f3f4f6')
           .opacity(0.1)
           .text('VALID TICKET', 0, doc.page.height / 2 - 30, {
             align: 'center',
             width: doc.page.width
           })
           .opacity(1);
      }

      doc.end();
    } catch (error) {
      logger.error('PDF generation failed:', error);
      reject(error);
    }
  });
};

// Generate invoice PDF
const generateInvoicePDF = async (booking, event, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      const primaryColor = '#2563eb';
      const textColor = '#1f2937';

      // Header
      doc.fontSize(28)
         .fillColor(primaryColor)
         .font('Helvetica-Bold')
         .text('INVOICE', { align: 'center' })
         .font('Helvetica')
         .moveDown();

      // Invoice details
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`Invoice Date: ${new Date().toLocaleDateString()}`, 50, 120)
         .text(`Invoice Number: INV-${booking.bookingReference}`, 50, 135)
         .text(`Booking Reference: ${booking.bookingReference}`, 50, 150);

      // Bill to section
      doc.fontSize(12)
         .fillColor(textColor)
         .font('Helvetica-Bold')
         .text('Bill To:', 50, 190)
         .font('Helvetica')
         .fontSize(10)
         .text(`${user.firstName} ${user.lastName}`, 50, 210)
         .text(user.email, 50, 225)
         .text(user.phone || 'N/A', 50, 240);

      // Event details
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Event Details:', 50, 280)
         .font('Helvetica')
         .fontSize(10)
         .text(event.title, 50, 300)
         .text(`Date: ${new Date(event.startDate).toLocaleDateString()}`, 50, 315)
         .text(`Venue: ${event.venue}, ${event.city}`, 50, 330);

      // Table
      const tableTop = 380;
      const col1 = 50;
      const col2 = 300;
      const col3 = 400;
      const col4 = 480;

      // Table header
      doc.rect(col1, tableTop, doc.page.width - 100, 30)
         .fill('#f3f4f6');
      
      doc.fontSize(10)
         .fillColor(textColor)
         .font('Helvetica-Bold')
         .text('Description', col1 + 10, tableTop + 10)
         .text('Qty', col2, tableTop + 10)
         .text('Price', col3, tableTop + 10)
         .text('Amount', col4, tableTop + 10);

      // Table content
      doc.font('Helvetica')
         .fillColor(textColor)
         .text('Event Tickets', col1 + 10, tableTop + 45)
         .text(booking.seats.toString(), col2, tableTop + 45)
         .text(`₹${(booking.totalAmount / booking.seats).toFixed(2)}`, col3, tableTop + 45)
         .text(`₹${booking.totalAmount.toFixed(2)}`, col4, tableTop + 45);

      // Line
      doc.moveTo(col1, tableTop + 70)
         .lineTo(doc.page.width - 50, tableTop + 70)
         .stroke('#d1d5db');

      // Totals
      const totalsY = tableTop + 90;
      doc.fontSize(10)
         .text('Subtotal:', col3, totalsY)
         .text(`₹${booking.totalAmount.toFixed(2)}`, col4, totalsY);

      if (booking.discountAmount > 0) {
        doc.fillColor('#10b981')
           .text('Discount:', col3, totalsY + 20)
           .text(`-₹${booking.discountAmount.toFixed(2)}`, col4, totalsY + 20);
      }

      // Total line
      doc.moveTo(col3, totalsY + 45)
         .lineTo(doc.page.width - 50, totalsY + 45)
         .stroke('#d1d5db');

      doc.fontSize(12)
         .fillColor(textColor)
         .font('Helvetica-Bold')
         .text('Total Amount:', col3, totalsY + 55)
         .text(`₹${booking.finalAmount.toFixed(2)}`, col4, totalsY + 55)
         .font('Helvetica');

      // Payment status
      doc.fontSize(10)
         .fillColor(secondaryColor)
         .text('Payment Status: PAID', col3, totalsY + 80);

      // Footer
      doc.fontSize(9)
         .fillColor('#9ca3af')
         .text('Thank you for your booking!', 50, doc.page.height - 100, { align: 'center', width: doc.page.width - 100 })
         .text('For support, contact: support@eventmanagement.com', 50, doc.page.height - 85, { align: 'center', width: doc.page.width - 100 })
         .text(`Generated on ${new Date().toLocaleString()}`, 50, doc.page.height - 70, { align: 'center', width: doc.page.width - 100 });

      doc.end();
    } catch (error) {
      logger.error('Invoice PDF generation failed:', error);
      reject(error);
    }
  });
};

module.exports = {
  generateTicketPDF,
  generateInvoicePDF
};
