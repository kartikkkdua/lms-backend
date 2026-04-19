const express = require('express');
const Event = require('../models/Event');
const { auth, authorize } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { uploadEventImage, handleUploadError } = require('../middleware/upload');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get all events with search and pagination
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of events per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Event category
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Event city
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Build query - only show published events on public page
    let query = { status: 'published' };

    if (req.query.search) {
      query.$text = { $search: req.query.search };
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.city) {
      query.city = new RegExp(req.query.city, 'i');
    }

    if (req.query.startDate) {
      query.startDate = { $gte: new Date(req.query.startDate) };
    }
    
    // Allow organizers/admins to see all their events including drafts
    if (req.query.includeAll === 'true' && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Show all events for this organizer (including drafts)
        delete query.status;
        query.organizerId = decoded.id;
      } catch (error) {
        // If token is invalid, just show published events
        logger.warn('Invalid token for includeAll request');
      }
    }

    const events = await Event.find(query)
      .populate('organizerId', 'firstName lastName email')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Event.countDocuments(query);

    res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   get:
 *     summary: Get event by ID
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event retrieved successfully
 *       404:
 *         description: Event not found
 */
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizerId', 'firstName lastName email phone');

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Create a new event (organizer only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - category
 *               - startDate
 *               - endDate
 *               - venue
 *               - address
 *               - city
 *               - state
 *               - totalSeats
 *               - price
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               venue:
 *                 type: string
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               totalSeats:
 *                 type: integer
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Event created successfully
 *       403:
 *         description: Access denied
 */
router.post('/', auth, authorize('organizer', 'admin'), validate(schemas.createEvent), async (req, res) => {
  try {
    // Log the received status
    logger.info(`Creating event with status: ${req.body.status || 'not provided'}`);
    
    const eventData = {
      ...req.body,
      organizerId: req.user._id,
      availableSeats: req.body.totalSeats, // Ensure availableSeats is set
      // Explicitly set status if provided, otherwise let model default handle it
      status: req.body.status || 'draft'
    };

    const event = new Event(eventData);
    await event.save();

    await event.populate('organizerId', 'firstName lastName email');

    logger.info(`Event created with status: ${event.status}`);

    res.status(201).json({
      message: 'Event created successfully',
      event
    });
  } catch (error) {
    logger.error('Error creating event:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}/image:
 *   post:
 *     summary: Upload event image
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: Invalid file or file too large
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.post('/:id/image', auth, authorize('organizer', 'admin'), uploadEventImage.single('image'), handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const event = await Event.findById(req.params.id);

    if (!event) {
      // Delete uploaded file if event not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    if (event.organizerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      // Delete uploaded file if access denied
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied. You can only update your own events.' });
    }

    // Delete old image if exists
    if (event.imageUrl) {
      const oldImagePath = path.join(__dirname, '..', event.imageUrl);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        logger.info(`Deleted old event image: ${oldImagePath}`);
      }
    }

    // Update event with new image URL
    const imageUrl = `/uploads/events/${req.file.filename}`;
    event.imageUrl = imageUrl;
    await event.save();

    logger.info(`Event image uploaded: ${imageUrl} for event ${event._id}`);

    res.json({
      message: 'Image uploaded successfully',
      imageUrl,
      event
    });
  } catch (error) {
    // Delete uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    logger.error('Error uploading event image:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}/image:
 *   delete:
 *     summary: Delete event image
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Image deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.delete('/:id/image', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    if (event.organizerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. You can only update your own events.' });
    }

    if (!event.imageUrl) {
      return res.status(400).json({ error: 'Event has no image to delete' });
    }

    // Delete image file
    const imagePath = path.join(__dirname, '..', event.imageUrl);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      logger.info(`Deleted event image: ${imagePath}`);
    }

    // Remove image URL from event
    event.imageUrl = undefined;
    await event.save();

    res.json({
      message: 'Image deleted successfully',
      event
    });
  } catch (error) {
    logger.error('Error deleting event image:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   put:
 *     summary: Update event (organizer only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.put('/:id', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    const isOrganizer = event.organizerId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOrganizer && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. You can only update your own events.' });
    }

    // Admin can only edit limited fields (status, featured, etc.)
    // Organizer can edit all fields
    let updateData = req.body;
    
    if (isAdmin && !isOrganizer) {
      // Admin restricted fields - can only modify administrative properties
      const adminAllowedFields = ['status', 'featured', 'priority', 'adminNotes'];
      updateData = {};
      
      adminAllowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ 
          error: 'Admin can only update: status, featured, priority, adminNotes',
          allowedFields: adminAllowedFields
        });
      }
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('organizerId', 'firstName lastName email');

    res.json({
      message: 'Event updated successfully',
      event: updatedEvent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}/publish:
 *   patch:
 *     summary: Publish a draft event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event published successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.patch('/:id/publish', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    if (event.organizerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. You can only publish your own events.' });
    }

    // Check if event is already published
    if (event.status === 'published') {
      return res.status(400).json({ error: 'Event is already published' });
    }

    // Update status to published
    event.status = 'published';
    await event.save();

    await event.populate('organizerId', 'firstName lastName email');

    res.json({
      message: 'Event published successfully',
      event
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}/unpublish:
 *   patch:
 *     summary: Unpublish an event (set back to draft)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event unpublished successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.patch('/:id/unpublish', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    if (event.organizerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. You can only unpublish your own events.' });
    }

    // Check if event is already draft
    if (event.status === 'draft') {
      return res.status(400).json({ error: 'Event is already a draft' });
    }

    // Update status to draft
    event.status = 'draft';
    await event.save();

    await event.populate('organizerId', 'firstName lastName email');

    res.json({
      message: 'Event unpublished successfully',
      event
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/{id}:
 *   delete:
 *     summary: Delete event (organizer only)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Event not found
 */
router.delete('/:id', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the organizer or admin
    if (event.organizerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. You can only delete your own events.' });
    }

    await Event.findByIdAndDelete(req.params.id);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/events/my/events:
 *   get:
 *     summary: Get organizer's events
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 */
router.get('/my/events', auth, authorize('organizer', 'admin'), async (req, res) => {
  try {
    const events = await Event.find({ organizerId: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;