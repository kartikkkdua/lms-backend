const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { allowUnknown: true });
    if (error) {
      return res.status(400).json({
        error: error.details[0].message
      });
    }
    next();
  };
};

// Validation schemas
const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    }),
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    phone: Joi.string().min(10).max(15),
    role: Joi.string().valid('user', 'organizer', 'admin').default('user')
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  createEvent: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().required(),
    category: Joi.string().valid('conference', 'workshop', 'seminar', 'concert', 'sports', 'exhibition', 'networking', 'other').required(),
    startDate: Joi.date().greater('now').required(),
    endDate: Joi.date().greater(Joi.ref('startDate')).required(),
    venue: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().default('India'),
    zipCode: Joi.string(),
    totalSeats: Joi.number().min(1).required(),
    price: Joi.number().min(0).required(),
    currency: Joi.string().default('INR'),
    status: Joi.string().valid('draft', 'published', 'cancelled', 'completed'),
    imageUrl: Joi.string().uri(),
    tags: Joi.array().items(Joi.string())
  }),

  createBooking: Joi.object({
    seats: Joi.number().min(1).required(),
    selectedSeatIds: Joi.array().items(Joi.string()),
    attendeeDetails: Joi.object(),
    couponCode: Joi.string()
  })
};

module.exports = { validate, schemas };