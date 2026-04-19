const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Razorpay Payment Service
 * Handles Razorpay payment gateway integration
 */

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

class RazorpayService {
  /**
   * Create Razorpay order
   * @param {Object} orderData - Order details
   * @returns {Object} - Razorpay order
   */
  async createOrder(orderData) {
    try {
      const { amount, currency = 'INR', receipt, notes = {} } = orderData;

      const options = {
        amount: Math.round(amount * 100), // Amount in paise (multiply by 100)
        currency,
        receipt,
        notes,
        payment_capture: 1 // Auto capture payment
      };

      logger.info(`Creating Razorpay order: ${receipt}`);
      const order = await razorpay.orders.create(options);
      logger.info(`Razorpay order created: ${order.id}`);

      return {
        success: true,
        order
      };
    } catch (error) {
      logger.error('Error creating Razorpay order:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - Payment verification data
   * @returns {Boolean} - True if signature is valid
   */
  verifyPaymentSignature(paymentData) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

      // Create signature
      const text = razorpay_order_id + '|' + razorpay_payment_id;
      const generated_signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
        .update(text)
        .digest('hex');

      // Compare signatures
      const isValid = generated_signature === razorpay_signature;

      if (isValid) {
        logger.info(`Payment signature verified: ${razorpay_payment_id}`);
      } else {
        logger.warn(`Invalid payment signature: ${razorpay_payment_id}`);
      }

      return isValid;
    } catch (error) {
      logger.error('Error verifying payment signature:', error);
      return false;
    }
  }

  /**
   * Fetch payment details from Razorpay
   * @param {String} paymentId - Razorpay payment ID
   * @returns {Object} - Payment details
   */
  async fetchPayment(paymentId) {
    try {
      logger.info(`Fetching payment details: ${paymentId}`);
      const payment = await razorpay.payments.fetch(paymentId);
      return {
        success: true,
        payment
      };
    } catch (error) {
      logger.error('Error fetching payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Capture payment (if not auto-captured)
   * @param {String} paymentId - Razorpay payment ID
   * @param {Number} amount - Amount to capture in paise
   * @returns {Object} - Capture result
   */
  async capturePayment(paymentId, amount) {
    try {
      logger.info(`Capturing payment: ${paymentId}`);
      const payment = await razorpay.payments.capture(paymentId, amount, 'INR');
      return {
        success: true,
        payment
      };
    } catch (error) {
      logger.error('Error capturing payment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initiate refund
   * @param {String} paymentId - Razorpay payment ID
   * @param {Number} amount - Amount to refund (optional, full refund if not provided)
   * @returns {Object} - Refund result
   */
  async initiateRefund(paymentId, amount = null) {
    try {
      logger.info(`Initiating refund for payment: ${paymentId}`);
      
      const refundData = { payment_id: paymentId };
      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to paise
      }

      const refund = await razorpay.payments.refund(paymentId, refundData);
      
      logger.info(`Refund initiated: ${refund.id}`);
      return {
        success: true,
        refund
      };
    } catch (error) {
      logger.error('Error initiating refund:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch refund details
   * @param {String} refundId - Razorpay refund ID
   * @returns {Object} - Refund details
   */
  async fetchRefund(refundId) {
    try {
      logger.info(`Fetching refund details: ${refundId}`);
      const refund = await razorpay.refunds.fetch(refundId);
      return {
        success: true,
        refund
      };
    } catch (error) {
      logger.error('Error fetching refund:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Razorpay key ID for frontend
   * @returns {String} - Razorpay key ID
   */
  getKeyId() {
    return process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
  }
}

module.exports = new RazorpayService();
