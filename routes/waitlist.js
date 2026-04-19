const express = require('express');
const Waitlist = require('../models/Waitlist');
const Event = require('../models/Event');
const { auth } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * @swagger
 * /api/waitlist/events/{eventId}/join:
 *   post:
 *     summary: Join event waitlist
 *     tags: [Waitlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seatsRequested
 *               - maxPrice
 *             properties:
 *               seatsRequested:
 *                 type: integer
 *               maxPrice:
 *                 type: number
 *     responses:
 *       201:
 *         description: Successfully joined waitlist
 *       400:
 *         description: Invalid request
 */
router.post('/events/:eventId/join', auth, async (req, res) => {
  try {
    const { seatsRequested, maxPrice } = req.body;
    const eventId = req.params.eventId;

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if event has available seats
    if (event.availableSeats >= seatsRequested) {
      return res.status(400).json({ 
        error: 'Event has available seats. Please book directly.' 
      });
    }

    // Check if user is already on waitlist
    const existingWaitlist = await Waitlist.findOne({
      userId: req.user._id,
      eventId: eventId,
      status: 'waiting'
    });

    if (existingWaitlist) {
      return res.status(400).json({ 
        error: 'You are already on the waitlist for this event' 
      });
    }

    // Create waitlist entry
    const waitlistEntry = new Waitlist({
      userId: req.user._id,
      eventId: eventId,
      seatsRequested,
      maxPrice
    });

    await waitlistEntry.save();

    await waitlistEntry.populate([
      { path: 'userId', select: 'firstName lastName email' },
      { path: 'eventId', select: 'title startDate venue' }
    ]);

    res.status(201).json({
      message: 'Successfully joined waitlist',
      waitlist: waitlistEntry
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/waitlist/my:
 *   get:
 *     summary: Get user's waitlist entries
 *     tags: [Waitlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Waitlist entries retrieved successfully
 */
router.get('/my', auth, async (req, res) => {
  try {
    const waitlistEntries = await Waitlist.find({ userId: req.user._id })
      .populate('eventId', 'title startDate venue city price')
      .sort({ createdAt: -1 });

    res.json({ waitlist: waitlistEntries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/waitlist/{id}/leave:
 *   delete:
 *     summary: Leave waitlist
 *     tags: [Waitlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Waitlist entry ID
 *     responses:
 *       200:
 *         description: Successfully left waitlist
 */
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    const waitlistEntry = await Waitlist.findById(req.params.id);

    if (!waitlistEntry) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    if (waitlistEntry.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Waitlist.findByIdAndDelete(req.params.id);

    res.json({ message: 'Successfully left waitlist' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to process waitlist when seats become available
async function processWaitlist(eventId, availableSeats) {
  try {
    const waitlistEntries = await Waitlist.find({
      eventId: eventId,
      status: 'waiting'
    })
    .populate('userId', 'firstName lastName email')
    .populate('eventId', 'title startDate venue price')
    .sort({ priority: -1, createdAt: 1 }); // Higher priority first, then FIFO

    for (const entry of waitlistEntries) {
      if (availableSeats >= entry.seatsRequested && 
          entry.eventId.price <= entry.maxPrice) {
        
        // Notify user
        entry.status = 'notified';
        entry.notifiedAt = new Date();
        entry.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours to book
        await entry.save();

        // Send notification email
        await emailService.sendWaitlistNotification(
          entry.userId.email,
          entry,
          entry.eventId
        );

        availableSeats -= entry.seatsRequested;
      }

      if (availableSeats <= 0) break;
    }
  } catch (error) {
    console.error('Error processing waitlist:', error);
  }
}

module.exports = { router, processWaitlist };