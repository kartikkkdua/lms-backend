const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number,
    default: null // Only for percentage discounts
  },
  minPurchase: {
    type: Number,
    default: 0
  },
  usageLimit: {
    type: Number,
    default: null // null means unlimited
  },
  usageCount: {
    type: Number,
    default: 0
  },
  perUserLimit: {
    type: Number,
    default: 1
  },
  validFrom: {
    type: Date,
    required: true
  },
  validUntil: {
    type: Date,
    required: true
  },
  applicableEvents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  applicableCategories: [{
    type: String,
    enum: ['conference', 'workshop', 'seminar', 'concert', 'sports', 'exhibition', 'networking', 'other']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Method to check if promo code is valid
promoCodeSchema.methods.isValid = function(eventId = null, category = null) {
  const now = new Date();
  
  // Check if active
  if (!this.isActive) return { valid: false, message: 'Promo code is inactive' };
  
  // Check date validity
  if (now < this.validFrom) return { valid: false, message: 'Promo code not yet valid' };
  if (now > this.validUntil) return { valid: false, message: 'Promo code has expired' };
  
  // Check usage limit
  if (this.usageLimit && this.usageCount >= this.usageLimit) {
    return { valid: false, message: 'Promo code usage limit reached' };
  }
  
  // Check event applicability
  if (this.applicableEvents.length > 0 && eventId) {
    const isApplicable = this.applicableEvents.some(id => id.toString() === eventId.toString());
    if (!isApplicable) return { valid: false, message: 'Promo code not applicable to this event' };
  }
  
  // Check category applicability
  if (this.applicableCategories.length > 0 && category) {
    if (!this.applicableCategories.includes(category)) {
      return { valid: false, message: 'Promo code not applicable to this event category' };
    }
  }
  
  return { valid: true };
};

// Method to calculate discount
promoCodeSchema.methods.calculateDiscount = function(amount) {
  if (this.discountType === 'percentage') {
    let discount = (amount * this.discountValue) / 100;
    if (this.maxDiscount) {
      discount = Math.min(discount, this.maxDiscount);
    }
    return Math.round(discount);
  } else {
    return Math.min(this.discountValue, amount);
  }
};

promoCodeSchema.index({ code: 1, isActive: 1 });
promoCodeSchema.index({ validFrom: 1, validUntil: 1 });

module.exports = mongoose.model('PromoCode', promoCodeSchema);
