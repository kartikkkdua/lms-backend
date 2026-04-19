const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Two-Factor Authentication Service
 */
class TwoFactorService {
  /**
   * Generate 2FA secret for user
   * @param {string} email - User email
   * @returns {Object} - Secret and QR code
   */
  async generateSecret(email) {
    try {
      const secret = speakeasy.generateSecret({
        name: `EventHub (${email})`,
        issuer: 'EventHub',
        length: 32
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        otpauthUrl: secret.otpauth_url
      };
    } catch (error) {
      logger.error('Error generating 2FA secret:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA token
   * @param {string} secret - User's 2FA secret
   * @param {string} token - 6-digit token from authenticator app
   * @returns {boolean} - True if valid
   */
  verifyToken(secret, token) {
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2 // Allow 2 time steps before/after for clock drift
      });
    } catch (error) {
      logger.error('Error verifying 2FA token:', error);
      return false;
    }
  }

  /**
   * Generate backup codes
   * @param {number} count - Number of backup codes to generate
   * @returns {Array} - Array of backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push({
        code: `${code.slice(0, 4)}-${code.slice(4, 8)}`,
        used: false
      });
    }
    return codes;
  }

  /**
   * Verify backup code
   * @param {Array} backupCodes - User's backup codes
   * @param {string} code - Backup code to verify
   * @returns {Object} - { valid: boolean, codeIndex: number }
   */
  verifyBackupCode(backupCodes, code) {
    const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();
    
    for (let i = 0; i < backupCodes.length; i++) {
      const storedCode = backupCodes[i].code.replace(/[-\s]/g, '').toUpperCase();
      
      if (storedCode === normalizedCode && !backupCodes[i].used) {
        return { valid: true, codeIndex: i };
      }
    }
    
    return { valid: false, codeIndex: -1 };
  }

  /**
   * Generate current TOTP token (for testing)
   * @param {string} secret - 2FA secret
   * @returns {string} - Current token
   */
  generateToken(secret) {
    return speakeasy.totp({
      secret,
      encoding: 'base32'
    });
  }
}

module.exports = new TwoFactorService();
