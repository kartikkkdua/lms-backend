const { google } = require('googleapis');
const logger = require('../utils/logger');

/**
 * Google Calendar Service
 * Handles OAuth2 and calendar event creation
 */

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback'
    );
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {String} userId - User ID to store in state
   * @returns {String} - Authorization URL
   */
  getAuthUrl(userId) {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId, // Pass user ID to retrieve after callback
      prompt: 'consent' // Force consent screen to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param {String} code - Authorization code from Google
   * @returns {Object} - Tokens (access_token, refresh_token)
   */
  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return {
        success: true,
        tokens
      };
    } catch (error) {
      logger.error('Error getting tokens:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set credentials for OAuth2 client
   * @param {Object} tokens - Access and refresh tokens
   */
  setCredentials(tokens) {
    this.oauth2Client.setCredentials(tokens);
  }

  /**
   * Create calendar event for booking
   * @param {Object} booking - Booking details
   * @param {Object} event - Event details
   * @param {Array} tickets - Ticket details
   * @param {Object} tokens - User's Google tokens
   * @param {String} userEmail - User's email address
   * @returns {Object} - Calendar event result
   */
  async createCalendarEvent(booking, event, tickets, tokens, userEmail) {
    try {
      // Set credentials
      this.setCredentials(tokens);

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      // Format ticket details
      const ticketDetails = tickets.map(ticket => 
        `• Ticket ${ticket.ticketNumber} - ${ticket.section || 'General'} ${ticket.seatPosition || ticket.seatNumber || ''}`
      ).join('\n');

      // Create event description
      const description = `
🎫 EVENT BOOKING CONFIRMATION

Booking Reference: ${booking.bookingReference}
Number of Tickets: ${tickets.length}

📍 VENUE DETAILS
${event.venue}
${event.address || ''}
${event.city}, ${event.state} ${event.zipCode || ''}

🎟️ YOUR TICKETS
${ticketDetails}

💰 PAYMENT
Total Amount: ₹${booking.finalAmount}
${booking.discountAmount > 0 ? `Discount Applied: ₹${booking.discountAmount}` : ''}

📧 Your tickets have been sent to your email.
Please bring your ticket (digital or printed) to the venue.

---
Powered by EventHub
      `.trim();

      // Calculate event times
      const startTime = new Date(event.startDate);
      const endTime = new Date(event.endDate);

      // Create calendar event
      const calendarEvent = {
        summary: `🎫 ${event.title}`,
        location: `${event.venue}, ${event.city}`,
        description: description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        attendees: [
          {
            email: userEmail,
            responseStatus: 'accepted',
            organizer: false,
            self: true
          }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 24 * 60 }, // 1 day before
            { method: 'email', minutes: 2 * 60 },  // 2 hours before
            { method: 'popup', minutes: 2 * 60 },  // 2 hours before
            { method: 'popup', minutes: 15 }       // 15 minutes before
          ]
        },
        colorId: '9', // Blue color for events
        source: {
          title: 'EventHub Booking',
          url: `${process.env.FRONTEND_URL}/bookings/${booking._id}`
        },
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        guestsCanSeeOtherGuests: false
      };

      logger.info(`Creating calendar event for booking ${booking.bookingReference}`);
      logger.info(`Event details: ${event.title} on ${event.startDate}`);
      logger.info(`User email: ${userEmail}`);
      logger.info(`Attendees: ${JSON.stringify(calendarEvent.attendees)}`);

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: calendarEvent,
        sendNotifications: true // Send email notifications to attendees
      });

      logger.info(`✅ Calendar event created successfully!`);
      logger.info(`Event ID: ${response.data.id}`);
      logger.info(`Event Link: ${response.data.htmlLink}`);
      logger.info(`Booking: ${booking.bookingReference}`);

      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink
      };
    } catch (error) {
      logger.error('❌ Error creating calendar event:', error);
      logger.error('Error details:', {
        message: error.message,
        code: error.code,
        errors: error.errors
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update calendar event
   * @param {String} calendarEventId - Google Calendar event ID
   * @param {Object} updates - Updates to apply
   * @param {Object} tokens - User's Google tokens
   * @returns {Object} - Update result
   */
  async updateCalendarEvent(calendarEventId, updates, tokens) {
    try {
      this.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId: calendarEventId,
        resource: updates
      });

      logger.info(`Calendar event updated: ${calendarEventId}`);

      return {
        success: true,
        event: response.data
      };
    } catch (error) {
      logger.error('Error updating calendar event:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete calendar event
   * @param {String} calendarEventId - Google Calendar event ID
   * @param {Object} tokens - User's Google tokens
   * @returns {Object} - Delete result
   */
  async deleteCalendarEvent(calendarEventId, tokens) {
    try {
      this.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: calendarEventId,
        sendUpdates: 'all' // Notify attendees
      });

      logger.info(`Calendar event deleted: ${calendarEventId}`);

      return {
        success: true
      };
    } catch (error) {
      logger.error('Error deleting calendar event:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {String} refreshToken - Refresh token
   * @returns {Object} - New tokens
   */
  async refreshAccessToken(refreshToken) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      return {
        success: true,
        tokens: credentials
      };
    } catch (error) {
      logger.error('Error refreshing token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new GoogleCalendarService();
