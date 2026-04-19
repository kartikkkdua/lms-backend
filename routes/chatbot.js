const express = require('express');
const chatbotService = require('../services/chatbotService');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/chatbot/message:
 *   post:
 *     summary: Send message to chatbot
 *     tags: [Chatbot]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chatbot response
 */
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get user ID if authenticated
    const userId = req.user?._id;

    const response = await chatbotService.processMessage(message, userId);

    res.json({
      message: response.text,
      suggestions: response.suggestions || [],
      data: response.events || response.bookings || null,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      error: 'Sorry, I encountered an error. Please try again.',
      suggestions: ['Help', 'Contact support']
    });
  }
});

/**
 * @swagger
 * /api/chatbot/suggestions:
 *   get:
 *     summary: Get quick action suggestions
 *     tags: [Chatbot]
 *     responses:
 *       200:
 *         description: Quick action suggestions
 */
router.get('/suggestions', (req, res) => {
  const suggestions = [
    { text: 'Show upcoming events', icon: '🎭' },
    { text: 'My bookings', icon: '🎫' },
    { text: 'How to book?', icon: '❓' },
    { text: 'Payment methods', icon: '💳' },
    { text: 'Cancel booking', icon: '❌' },
    { text: 'Contact support', icon: '📞' }
  ];

  res.json({ suggestions });
});

module.exports = router;
