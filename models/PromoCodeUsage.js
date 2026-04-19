const mongoose = require('mongoose');

const promoCodeUsageSchema = new mongoose.Schema({
  promoCodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PromoCode',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  discountAmount: {
    type: Number,
    required: true
  },
  originalAmount: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

promoCodeUsageSchema.index({ promoCodeId: 1, userId: 1 });
promoCodeUsageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('PromoCodeUsage', promoCodeUsageSchema);
