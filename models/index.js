const User = require('./User');
const Event = require('./Event');
const Booking = require('./Booking');
const Payment = require('./Payment');
const Ticket = require('./Ticket');
const Waitlist = require('./Waitlist');
const Coupon = require('./Coupon');
const Seat = require('./Seat');

// MongoDB doesn't need explicit associations like Sequelize
// Relationships are handled through ObjectId references and populate()

module.exports = {
  User,
  Event,
  Booking,
  Payment,
  Ticket,
  Waitlist,
  Coupon,
  Seat
};