const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 200,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['conference', 'workshop', 'seminar', 'concert', 'sports', 'exhibition', 'networking', 'other']
  },
  startDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Start date must be in the future'
    }
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  venue: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true,
    default: 'India'
  },
  zipCode: String,
  totalSeats: {
    type: Number,
    required: true,
    min: 1
  },
  availableSeats: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'draft'
  },
  imageUrl: String,
  tags: [{
    type: String
  }],
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seatConfiguration: {
    enabled: {
      type: Boolean,
      default: false
    },
    sections: [{
      name: String,
      rows: Number,
      seatsPerRow: Number,
      priceMultiplier: Number
    }]
  },
  venueFacilities: {
    restrooms: [{
      location: String,
      section: String,
      accessible: Boolean
    }],
    exits: [{
      location: String,
      section: String,
      emergency: Boolean
    }],
    foodCourts: [{
      location: String,
      section: String,
      name: String
    }],
    parking: {
      available: Boolean,
      capacity: Number,
      type: [String] // ['car', 'bike', 'valet']
    },
    accessibility: {
      wheelchairAccess: Boolean,
      elevators: Boolean,
      ramps: Boolean,
      assistedListening: Boolean
    }
  }
}, {
  timestamps: true
});

// Set available seats to total seats before saving new event
eventSchema.pre('validate', function(next) {
  if (this.isNew && !this.availableSeats) {
    this.availableSeats = this.totalSeats;
  }
  next();
});

// Index for search functionality
eventSchema.index({ title: 'text', description: 'text', category: 1, city: 1 });
eventSchema.index({ startDate: 1, status: 1 });
eventSchema.index({ city: 1, category: 1 });
eventSchema.index({ organizerId: 1, createdAt: -1 });
eventSchema.index({ status: 1, startDate: 1 });

module.exports = mongoose.model('Event', eventSchema);