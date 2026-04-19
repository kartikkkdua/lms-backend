const { requireCaptcha } = require('../utils/captcha');

/**
 * Conditional CAPTCHA middleware
 * Skips CAPTCHA verification if 2FA token is provided
 * (because user already passed CAPTCHA in the first login attempt)
 */
const conditionalCaptcha = (req, res, next) => {
  // If 2FA token is provided, skip CAPTCHA
  // User already verified CAPTCHA in the initial login attempt
  if (req.body.twoFactorToken) {
    return next();
  }
  
  // Otherwise, require CAPTCHA
  return requireCaptcha(req, res, next);
};

module.exports = conditionalCaptcha;
