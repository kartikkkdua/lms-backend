const express = require('express');
const Seat = require('../models/Seat');
const Event = require('../models/Event');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/seats/events/{eventId}:
 *   get:
 *     summary: Get all seats for an event
 *     tags: [Seats]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Seats retrieved successfully
 */
router.get('/events/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Validate eventId format
    if (!eventId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid event ID format' });
    }

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Try to get all seats for the event
    let seats = [];
    try {
      seats = await Seat.find({ eventId });
    } catch (findError) {
      logger.warn(`Error finding seats: ${findError.message}`);
      // If there's an error finding seats, they might be corrupted
      // Delete and regenerate
      await Seat.deleteMany({ eventId });
      seats = [];
    }

    // If no seats exist, generate them
    if (seats.length === 0) {
      logger.info(`Generating seats for event: ${event.title}`);
      const generatedSeats = await generateSeatsForEvent(eventId, event);
      logger.info(`Generated ${generatedSeats.length} seats`);
      return res.json({ seats: generatedSeats });
    }

    res.json({ seats });
  } catch (error) {
    logger.error('Error in seats endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/seats/lock:
 *   post:
 *     summary: Lock seats temporarily for booking
 *     tags: [Seats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seatIds
 *             properties:
 *               seatIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Seats locked successfully
 */
router.post('/lock', auth, async (req, res) => {
  try {
    const { seatIds, duration } = req.body;
    const userId = req.user._id;

    // Check if user's email is verified
    if (!req.user.isEmailVerified) {
      return res.status(403).json({ 
        error: 'Email verification required',
        message: 'Please verify your email address before selecting seats.'
      });
    }

    if (!seatIds || seatIds.length === 0) {
      return res.status(400).json({ error: 'No seats selected' });
    }

    // Validate duration (5, 10, or 15 minutes, default 10)
    const lockDuration = [5, 10, 15].includes(duration) ? duration : 10;

    // Get all requested seats
    const seats = await Seat.find({ _id: { $in: seatIds } });

    // Check if all seats are available
    const unavailableSeats = seats.filter(seat => !seat.isAvailable());
    if (unavailableSeats.length > 0) {
      return res.status(400).json({ 
        error: 'Some seats are no longer available',
        unavailableSeats: unavailableSeats.map(s => ({
          id: s._id,
          section: s.section,
          row: s.row,
          seatNumber: s.seatNumber
        }))
      });
    }

    // Lock all seats with specified duration
    const lockedSeats = await Promise.all(
      seats.map(seat => seat.lockSeat(userId, lockDuration))
    );

    // Emit socket event for real-time update
    if (req.app.get('io')) {
      req.app.get('io').to(`event-${seats[0].eventId}`).emit('seats-locked', {
        seatIds,
        userId,
        duration: lockDuration,
        lockedUntil: lockedSeats[0].lockedUntil
      });
    }

    res.json({ 
      message: `Seats locked successfully for ${lockDuration} minutes`,
      seats: lockedSeats,
      duration: lockDuration,
      expiresIn: lockDuration * 60, // in seconds
      lockedUntil: lockedSeats[0].lockedUntil
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/seats/unlock:
 *   post:
 *     summary: Unlock previously locked seats
 *     tags: [Seats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seatIds
 *             properties:
 *               seatIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Seats unlocked successfully
 */
router.post('/unlock', auth, async (req, res) => {
  try {
    const { seatIds } = req.body;
    const userId = req.user._id;

    const seats = await Seat.find({ 
      _id: { $in: seatIds },
      lockedBy: userId
    });

    // Unlock seats
    await Promise.all(seats.map(seat => seat.unlockSeat()));

    // Emit socket event
    if (req.app.get('io') && seats.length > 0) {
      req.app.get('io').to(`event-${seats[0].eventId}`).emit('seats-unlocked', {
        seatIds
      });
    }

    res.json({ message: 'Seats unlocked successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/seats/confirm:
 *   post:
 *     summary: Confirm seat booking (mark as booked)
 *     tags: [Seats]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seatIds
 *               - bookingId
 *             properties:
 *               seatIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               bookingId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Seats confirmed successfully
 */
router.post('/confirm', auth, async (req, res) => {
  try {
    const { seatIds, bookingId } = req.body;
    const userId = req.user._id;

    const seats = await Seat.find({ 
      _id: { $in: seatIds },
      lockedBy: userId
    });

    if (seats.length !== seatIds.length) {
      return res.status(400).json({ error: 'Some seats are not locked by you' });
    }

    // Mark seats as booked
    await Seat.updateMany(
      { _id: { $in: seatIds } },
      { 
        status: 'booked',
        bookingId: bookingId,
        lockedBy: null,
        lockedUntil: null
      }
    );

    // Emit socket event
    if (req.app.get('io') && seats.length > 0) {
      req.app.get('io').to(`event-${seats[0].eventId}`).emit('seats-booked', {
        seatIds
      });
    }

    res.json({ message: 'Seats confirmed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate seats for an event
async function generateSeatsForEvent(eventId, event) {
  try {
    const seats = [];
    
    // Use event's seat configuration if available, otherwise use default
    let sections = [
      { name: 'VIP', rows: 3, seatsPerRow: 10, priceMultiplier: 2 },
      { name: 'Premium', rows: 5, seatsPerRow: 12, priceMultiplier: 1.5 },
      { name: 'Regular', rows: 8, seatsPerRow: 15, priceMultiplier: 1 },
      { name: 'Balcony', rows: 4, seatsPerRow: 20, priceMultiplier: 0.7 }
    ];

    // If event has custom seat configuration, use it
    if (event.seatConfiguration?.enabled && event.seatConfiguration?.sections?.length > 0) {
      sections = event.seatConfiguration.sections;
      logger.info(`Using custom seat configuration for event: ${event.title}`);
    } else {
      logger.info(`Using default seat configuration`);
    }

    const basePrice = event.price || 100; // Default price if not set

    for (const section of sections) {
      // Use section name as-is from event configuration
      const finalSectionName = section.name;
      
      for (let row = 0; row < section.rows; row++) {
        const rowLetter = String.fromCharCode(65 + row); // A, B, C, etc.
        
        for (let seatNum = 1; seatNum <= section.seatsPerRow; seatNum++) {
          seats.push({
            eventId,
            section: finalSectionName,
            row: rowLetter,
            seatNumber: seatNum,
            price: Math.round(basePrice * section.priceMultiplier),
            status: 'available'
          });
        }
      }
    }

    logger.info(`Prepared ${seats.length} seats for insertion`);

    // Bulk insert seats
    const createdSeats = await Seat.insertMany(seats);
    logger.info(`Successfully inserted ${createdSeats.length} seats`);
    return createdSeats;
  } catch (error) {
    logger.error('Error generating seats:', error);
    throw error;
  }
}

module.exports = router;
