const crypto = require('crypto');
const { setEx, get, del } = require('../config/redis');

// Fallback in-memory store if Redis is not available
const captchaStore = new Map();

// Cleanup expired captchas every 5 minutes (for in-memory fallback)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of captchaStore.entries()) {
    if (now > value.expiresAt) {
      captchaStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a simple math CAPTCHA
 * Returns: { id, question, answer }
 */
async function generateMathCaptcha() {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const operations = ['+', '-', '*'];
  const operation = operations[Math.floor(Math.random() * operations.length)];
  
  let answer;
  let question;
  
  switch (operation) {
    case '+':
      answer = num1 + num2;
      question = `${num1} + ${num2}`;
      break;
    case '-':
      answer = num1 - num2;
      question = `${num1} - ${num2}`;
      break;
    case '*':
      answer = num1 * num2;
      question = `${num1} × ${num2}`;
      break;
  }
  
  const id = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  
  // Store in Redis or memory
  await storeCaptcha(id, answer.toString(), expiresAt);
  
  return {
    id,
    question: `What is ${question}?`,
    expiresAt
  };
}

/**
 * Store CAPTCHA in Redis or fallback to memory
 */
async function storeCaptcha(id, answer, expiresAt) {
  const captchaData = { answer, expiresAt };
  const ttl = Math.floor((expiresAt - Date.now()) / 1000); // Convert to seconds
  
  // Try Redis first
  const stored = await setEx(`captcha:${id}`, captchaData, ttl);
  
  // Fallback to in-memory if Redis fails
  if (!stored) {
    captchaStore.set(id, captchaData);
  }
}

/**
 * Retrieve CAPTCHA from Redis or memory
 */
async function getCaptcha(id) {
  // Try Redis first
  const redisCaptcha = await get(`captcha:${id}`);
  if (redisCaptcha) {
    return redisCaptcha;
  }
  
  // Fallback to in-memory
  return captchaStore.get(id);
}

/**
 * Delete CAPTCHA from Redis and memory
 */
async function deleteCaptcha(id) {
  await del(`captcha:${id}`);
  captchaStore.delete(id);
}

/**
 * Verify CAPTCHA answer
 * @param {string} captchaId - The CAPTCHA ID
 * @param {string} answer - User's answer
 * @returns {boolean} - True if valid
 */
async function verifyCaptcha(captchaId, answer) {
  const captcha = await getCaptcha(captchaId);
  
  if (!captcha) {
    return false; // CAPTCHA not found or expired
  }
  
  if (Date.now() > captcha.expiresAt) {
    await deleteCaptcha(captchaId);
    return false; // Expired
  }
  
  const isValid = captcha.answer === answer.toString().trim();
  
  // Delete after verification (one-time use)
  await deleteCaptcha(captchaId);
  
  return isValid;
}

/**
 * Middleware to require CAPTCHA verification
 * Can be disabled in development by setting DISABLE_CAPTCHA=true
 */
async function requireCaptcha(req, res, next) {
  // Skip CAPTCHA in development if disabled
  if (process.env.DISABLE_CAPTCHA === 'true' || process.env.NODE_ENV === 'test') {
    return next();
  }
  
  const { captchaId, captchaAnswer } = req.body;
  
  if (!captchaId || !captchaAnswer) {
    return res.status(400).json({ 
      error: 'CAPTCHA verification required',
      requiresCaptcha: true
    });
  }
  
  const isValid = await verifyCaptcha(captchaId, captchaAnswer);
  
  if (!isValid) {
    return res.status(400).json({ 
      error: 'Invalid or expired CAPTCHA. Please try again.',
      requiresCaptcha: true
    });
  }
  
  next();
}

module.exports = {
  generateMathCaptcha,
  verifyCaptcha,
  requireCaptcha
};
