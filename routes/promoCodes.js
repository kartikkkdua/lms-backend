const express = require('express');
const PromoCode = require('../models/PromoCode');
const PromoCodeUsage = require('../models/PromoCodeUsage');
const Event = require('../models/Event');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/promo-codes:
 *   post:
 *     summary: Create a new promo code (admin/organizer only)
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Promo code created successfully
 */
router.post('/', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minPurchase,
      usageLimit,
      perUserLimit,
      validFrom,
      validUntil,
      applicableEvents,
      applicableCategories
    } = req.body;

    // Check if code already exists
    const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existingCode) {
      return res.status(400).json({ error: 'Promo code already exists' });
    }

    const promoCode = new PromoCode({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      maxDiscount,
      minPurchase: minPurchase || 0,
      usageLimit,
      perUserLimit: perUserLimit || 1,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      applicableEvents: applicableEvents || [],
      applicableCategories: applicableCategories || [],
      createdBy: req.user._id
    });

    await promoCode.save();

    res.status(201).json({
      message: 'Promo code created successfully',
      promoCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/promo-codes:
 *   get:
 *     summary: Get all promo codes (admin/organizer only)
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo codes retrieved successfully
 */
router.get('/', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const promoCodes = await PromoCode.find()
      .populate('createdBy', 'firstName lastName email')
      .populate('applicableEvents', 'title')
      .sort({ createdAt: -1 });

    res.json({ promoCodes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/promo-codes/validate:
 *   post:
 *     summary: Validate a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code validation result
 */
router.post('/validate', auth, async (req, res) => {
  try {
    const { code, eventId, amount } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Promo code is required' });
    }

    // Find promo code
    const promoCode = await PromoCode.findOne({ 
      code: code.toUpperCase(),
      isActive: true 
    });

    if (!promoCode) {
      return res.status(404).json({ 
        valid: false,
        error: 'Invalid promo code' 
      });
    }

    // Get event details if eventId provided
    let event = null;
    if (eventId) {
      event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
    }

    // Check if promo code is valid
    const validation = promoCode.isValid(eventId, event?.category);
    if (!validation.valid) {
      return res.status(400).json({
        valid: false,
        error: validation.message
      });
    }

    // Check minimum purchase
    if (amount && amount < promoCode.minPurchase) {
      return res.status(400).json({
        valid: false,
        error: `Minimum purchase of ₹${promoCode.minPurchase} required`
      });
    }

    // Check per-user usage limit
    const userUsageCount = await PromoCodeUsage.countDocuments({
      promoCodeId: promoCode._id,
      userId: req.user._id
    });

    if (userUsageCount >= promoCode.perUserLimit) {
      return res.status(400).json({
        valid: false,
        error: 'You have already used this promo code'
      });
    }

    // Calculate discount
    const discount = amount ? promoCode.calculateDiscount(amount) : 0;

    res.json({
      valid: true,
      promoCode: {
        code: promoCode.code,
        description: promoCode.description,
        discountType: promoCode.discountType,
        discountValue: promoCode.discountValue,
        maxDiscount: promoCode.maxDiscount
      },
      discount,
      finalAmount: amount ? amount - discount : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/promo-codes/{id}:
 *   put:
 *     summary: Update a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code updated successfully
 */
router.put('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id);

    if (!promoCode) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    // Only admin or creator can update
    if (req.user.role !== 'admin' && promoCode.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    Object.assign(promoCode, req.body);
    await promoCode.save();

    res.json({
      message: 'Promo code updated successfully',
      promoCode
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/promo-codes/{id}:
 *   delete:
 *     summary: Delete a promo code
 *     tags: [PromoCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Promo code deleted successfully
 */
router.delete('/:id', auth, authorize('admin', 'organizer'), async (req, res) => {
  try {
    const promoCode = await PromoCode.findById(req.params.id);

    if (!promoCode) {
      return res.status(404).json({ error: 'Promo code not found' });
    }

    // Only admin or creator can delete
    if (req.user.role !== 'admin' && promoCode.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await PromoCode.findByIdAndDelete(req.params.id);

    res.json({ message: 'Promo code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
