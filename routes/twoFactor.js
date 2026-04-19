const express = require('express');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const twoFactorService = require('../services/twoFactorService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/2fa/setup:
 *   post:
 *     summary: Setup 2FA (Admin only)
 *     tags: [2FA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initiated
 *       403:
 *         description: Access denied
 */
router.post('/setup', auth, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first to set up again.' });
    }

    // Generate secret and QR code
    const { secret, qrCode, otpauthUrl } = await twoFactorService.generateSecret(user.email);

    // Store secret temporarily (not enabled yet)
    user.twoFactorSecret = secret;
    await user.save();

    logger.info(`2FA setup initiated for user: ${user.email}`);

    res.json({
      message: '2FA setup initiated. Scan the QR code with your authenticator app.',
      qrCode,
      secret, // Show secret for manual entry
      otpauthUrl
    });
  } catch (error) {
    logger.error('Error setting up 2FA:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/2fa/enable:
 *   post:
 *     summary: Enable 2FA after verification (Admin only)
 *     tags: [2FA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: 6-digit code from authenticator app
 *     responses:
 *       200:
 *         description: 2FA enabled successfully
 *       400:
 *         description: Invalid token
 */
router.post('/enable', auth, authorize('admin'), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({ error: 'Please setup 2FA first' });
    }

    // Verify token
    const isValid = twoFactorService.verifyToken(user.twoFactorSecret, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid token. Please try again.' });
    }

    // Generate backup codes
    const backupCodes = twoFactorService.generateBackupCodes(10);

    // Enable 2FA
    user.twoFactorEnabled = true;
    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    logger.info(`2FA enabled for user: ${user.email}`);

    res.json({
      message: '2FA enabled successfully',
      backupCodes: backupCodes.map(bc => bc.code),
      warning: 'Save these backup codes in a safe place. You will not be able to see them again.'
    });
  } catch (error) {
    logger.error('Error enabling 2FA:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/2fa/verify:
 *   post:
 *     summary: Verify 2FA token during login
 *     tags: [2FA]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *             properties:
 *               email:
 *                 type: string
 *               token:
 *                 type: string
 *               useBackupCode:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Token verified
 *       400:
 *         description: Invalid token
 */
router.post('/verify', async (req, res) => {
  try {
    const { email, token, useBackupCode } = req.body;

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled for this user' });
    }

    let isValid = false;

    if (useBackupCode) {
      // Verify backup code
      const { valid, codeIndex } = twoFactorService.verifyBackupCode(user.twoFactorBackupCodes, token);
      
      if (valid) {
        // Mark backup code as used
        user.twoFactorBackupCodes[codeIndex].used = true;
        await user.save();
        isValid = true;
        logger.info(`Backup code used for user: ${user.email}`);
      }
    } else {
      // Verify TOTP token
      isValid = twoFactorService.verifyToken(user.twoFactorSecret, token);
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid token or backup code' });
    }

    res.json({
      message: '2FA verification successful',
      verified: true
    });
  } catch (error) {
    logger.error('Error verifying 2FA:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/2fa/disable:
 *   post:
 *     summary: Disable 2FA (Admin only)
 *     tags: [2FA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       400:
 *         description: Invalid token
 */
router.post('/disable', auth, authorize('admin'), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify token before disabling
    const isValid = twoFactorService.verifyToken(user.twoFactorSecret, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Disable 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = [];
    await user.save();

    logger.info(`2FA disabled for user: ${user.email}`);

    res.json({
      message: '2FA disabled successfully'
    });
  } catch (error) {
    logger.error('Error disabling 2FA:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/2fa/status:
 *   get:
 *     summary: Get 2FA status
 *     tags: [2FA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const unusedBackupCodes = user.twoFactorBackupCodes?.filter(bc => !bc.used).length || 0;

    res.json({
      twoFactorEnabled: user.twoFactorEnabled || false,
      backupCodesRemaining: unusedBackupCodes
    });
  } catch (error) {
    logger.error('Error getting 2FA status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/2fa/regenerate-backup-codes:
 *   post:
 *     summary: Regenerate backup codes (Admin only)
 *     tags: [2FA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Backup codes regenerated
 */
router.post('/regenerate-backup-codes', auth, authorize('admin'), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify token before regenerating
    const isValid = twoFactorService.verifyToken(user.twoFactorSecret, token);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Generate new backup codes
    const backupCodes = twoFactorService.generateBackupCodes(10);
    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    logger.info(`Backup codes regenerated for user: ${user.email}`);

    res.json({
      message: 'Backup codes regenerated successfully',
      backupCodes: backupCodes.map(bc => bc.code),
      warning: 'Save these backup codes in a safe place. Old backup codes are now invalid.'
    });
  } catch (error) {
    logger.error('Error regenerating backup codes:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
