const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const logService = require('../services/logService');

const router = express.Router();

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Get system logs (admin only)
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit, level, category, startDate, endDate, search } = req.query;

    const result = await logService.getLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      level,
      category,
      startDate,
      endDate,
      search
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/logs/stats:
 *   get:
 *     summary: Get log statistics (admin only)
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const stats = await logService.getLogStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
