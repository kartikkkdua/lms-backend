const express = require('express');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Ticket = require('../models/Ticket');
const { auth } = require('../middleware/auth');
const googleCalendarService = require('../services/googleCalendarService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/calendar/connect:
 *   get:
 *     summary: Get Google Calendar OAuth URL
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OAuth URL generated
 */
router.get('/connect', auth, async (req, res) => {
  try {
    const authUrl = googleCalendarService.getAuthUrl(req.user._id.toString());
    
    res.json({
      authUrl,
      message: 'Redirect user to this URL to connect Google Calendar'
    });
  } catch (error) {
    logger.error('Error generating auth URL:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/calendar/callback:
 *   get:
 *     summary: Google Calendar OAuth callback
 *     tags: [Calendar]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to frontend
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;

    if (!code || !userId) {
      return res.redirect(`${process.env.FRONTEND_URL}/profile?calendar=error&message=Missing parameters`);
    }

    // Exchange code for tokens
    const tokenResult = await googleCalendarService.getTokens(code);

    if (!tokenResult.success) {
      return res.redirect(`${process.env.FRONTEND_URL}/profile?calendar=error&message=${encodeURIComponent(tokenResult.error)}`);
    }

    // Save tokens to user
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/profile?calendar=error&message=User not found`);
    }

    user.googleCalendar = {
      connected: true,
      accessToken: tokenResult.tokens.access_token,
      refreshToken: tokenResult.tokens.refresh_token,
      tokenExpiry: new Date(tokenResult.tokens.expiry_date),
      email: user.email
    };

    await user.save();

    logger.info(`Google Calendar connected for user: ${user.email}`);

    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/profile?calendar=success`);
  } catch (error) {
    logger.error('Calendar callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/profile?calendar=error&message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * @swagger
 * /api/calendar/disconnect:
 *   post:
 *     summary: Disconnect Google Calendar
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calendar disconnected
 */
router.post('/disconnect', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.googleCalendar = {
      connected: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      email: null
    };

    await user.save();

    logger.info(`Google Calendar disconnected for user: ${user.email}`);

    res.json({ message: 'Google Calendar disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/calendar/status:
 *   get:
 *     summary: Get Google Calendar connection status
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      connected: user.googleCalendar?.connected || false,
      email: user.googleCalendar?.email || null
    });
  } catch (error) {
    logger.error('Error getting calendar status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/calendar/add-booking:
 *   post:
 *     summary: Manually add booking to Google Calendar
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Event added to calendar
 */
router.post('/add-booking', auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    // Get user with calendar tokens
    const user = await User.findById(req.user._id);

    if (!user.googleCalendar?.connected) {
      return res.status(400).json({ error: 'Google Calendar not connected' });
    }

    // Get booking details
    const booking = await Booking.findById(bookingId)
      .populate('eventId')
      .populate('userId');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check ownership
    if (booking.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if already added
    if (booking.googleCalendarEventId) {
      return res.status(400).json({ 
        error: 'Booking already added to calendar',
        eventId: booking.googleCalendarEventId
      });
    }

    // Get tickets
    const tickets = await Ticket.find({ bookingId: booking._id });

    // Refresh token if needed
    let tokens = {
      access_token: user.googleCalendar.accessToken,
      refresh_token: user.googleCalendar.refreshToken
    };

    if (new Date() >= new Date(user.googleCalendar.tokenExpiry)) {
      const refreshResult = await googleCalendarService.refreshAccessToken(user.googleCalendar.refreshToken);
      
      if (refreshResult.success) {
        tokens = refreshResult.tokens;
        user.googleCalendar.accessToken = tokens.access_token;
        user.googleCalendar.tokenExpiry = new Date(tokens.expiry_date);
        await user.save();
      } else {
        return res.status(401).json({ error: 'Failed to refresh token. Please reconnect Google Calendar.' });
      }
    }

    // Create calendar event
    const result = await googleCalendarService.createCalendarEvent(
      booking,
      booking.eventId,
      tickets,
      tokens,
      user.email
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Save calendar event ID to booking
    booking.googleCalendarEventId = result.eventId;
    await booking.save();

    logger.info(`Booking ${booking.bookingReference} added to Google Calendar`);

    res.json({
      message: 'Event added to Google Calendar successfully',
      eventId: result.eventId,
      eventLink: result.eventLink
    });
  } catch (error) {
    logger.error('Error adding booking to calendar:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
