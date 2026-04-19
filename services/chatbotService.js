const Event = require('../models/Event');
const Booking = require('../models/Booking');
const User = require('../models/User');

class ChatbotService {
  constructor() {
    this.intents = {
      greeting: ['hello', 'hi', 'hey', 'good morning', 'good evening'],
      help: ['help', 'support', 'assist', 'guide'],
      events: ['events', 'show events', 'what events', 'upcoming events', 'find events'],
      booking: ['book', 'booking', 'reserve', 'ticket', 'buy ticket'],
      myBookings: ['my bookings', 'my tickets', 'my orders', 'booking history'],
      cancel: ['cancel', 'refund', 'cancel booking'],
      payment: ['payment', 'pay', 'payment methods', 'how to pay'],
      location: ['location', 'venue', 'where', 'address'],
      price: ['price', 'cost', 'how much', 'ticket price'],
      categories: ['categories', 'types', 'what kind'],
      contact: ['contact', 'email', 'phone', 'reach'],
      thanks: ['thank', 'thanks', 'appreciate']
    };
  }

  async processMessage(message, userId = null) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Detect intent
    const intent = this.detectIntent(lowerMessage);
    
    // Generate response based on intent
    const response = await this.generateResponse(intent, lowerMessage, userId);
    
    return response;
  }

  detectIntent(message) {
    for (const [intent, keywords] of Object.entries(this.intents)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        return intent;
      }
    }
    return 'unknown';
  }

  async generateResponse(intent, message, userId) {
    switch (intent) {
      case 'greeting':
        return {
          text: "Hello! 👋 Welcome to EventHub. I'm here to help you find and book amazing events. How can I assist you today?",
          suggestions: ['Show upcoming events', 'My bookings', 'Help']
        };

      case 'help':
        return {
          text: "I can help you with:\n\n" +
                "🎫 Finding and booking events\n" +
                "📋 Checking your bookings\n" +
                "💳 Payment information\n" +
                "❌ Canceling bookings\n" +
                "📍 Event locations and details\n\n" +
                "What would you like to know?",
          suggestions: ['Find events', 'My bookings', 'Payment info']
        };

      case 'events':
        return await this.getUpcomingEvents();

      case 'booking':
        return {
          text: "To book an event:\n\n" +
                "1️⃣ Browse events on our Events page\n" +
                "2️⃣ Select an event you like\n" +
                "3️⃣ Choose your seats (if applicable)\n" +
                "4️⃣ Enter attendee details\n" +
                "5️⃣ Complete payment\n" +
                "6️⃣ Get your tickets via email!\n\n" +
                "Would you like to see upcoming events?",
          suggestions: ['Show events', 'Payment methods', 'Help']
        };

      case 'myBookings':
        if (!userId) {
          return {
            text: "Please log in to view your bookings. You can access your booking history from your dashboard after logging in.",
            suggestions: ['Login', 'Register', 'Help']
          };
        }
        return await this.getUserBookings(userId);

      case 'cancel':
        return {
          text: "To cancel a booking:\n\n" +
                "📌 Go to 'My Bookings' page\n" +
                "📌 Find the booking you want to cancel\n" +
                "📌 Click 'Cancel Booking'\n\n" +
                "⚠️ Note: Bookings can only be cancelled 24 hours before the event. Refunds are processed within 5-7 business days.",
          suggestions: ['My bookings', 'Refund policy', 'Help']
        };

      case 'payment':
        return {
          text: "We accept the following payment methods:\n\n" +
                "💳 Credit/Debit Cards (Visa, Mastercard, Amex)\n" +
                "🏦 Net Banking\n" +
                "📱 UPI (Google Pay, PhonePe, Paytm)\n" +
                "💰 Digital Wallets\n\n" +
                "All payments are secure and encrypted. You'll receive instant confirmation after successful payment.",
          suggestions: ['Book event', 'Payment issues', 'Help']
        };

      case 'location':
        return {
          text: "Each event has its own venue. You can find the exact location on the event details page, including:\n\n" +
                "📍 Venue name\n" +
                "🗺️ Full address\n" +
                "🚗 Directions\n\n" +
                "Would you like to search for events in a specific city?",
          suggestions: ['Find events', 'Popular cities', 'Help']
        };

      case 'price':
        return {
          text: "Event prices vary based on:\n\n" +
                "🎭 Event type and category\n" +
                "💺 Seat section (VIP, Premium, Regular)\n" +
                "📅 Date and time\n" +
                "🎟️ Early bird discounts\n\n" +
                "You can filter events by price range on our Events page. Would you like to see events?",
          suggestions: ['Show events', 'Discount codes', 'Help']
        };

      case 'categories':
        return {
          text: "We have events in these categories:\n\n" +
                "🎤 Concerts & Music\n" +
                "🎭 Theater & Arts\n" +
                "🏃 Sports\n" +
                "💼 Conferences\n" +
                "🎓 Workshops & Seminars\n" +
                "🎨 Exhibitions\n" +
                "🤝 Networking Events\n\n" +
                "Which category interests you?",
          suggestions: ['Show all events', 'Concerts', 'Workshops']
        };

      case 'contact':
        return {
          text: "Need to reach us?\n\n" +
                "📧 Email: support@eventhub.com\n" +
                "📞 Phone: +91-1800-123-4567\n" +
                "💬 Live Chat: Available 24/7\n" +
                "🕐 Support Hours: 9 AM - 9 PM IST\n\n" +
                "We typically respond within 2 hours!",
          suggestions: ['Help', 'Report issue', 'Feedback']
        };

      case 'thanks':
        return {
          text: "You're welcome! 😊 Is there anything else I can help you with?",
          suggestions: ['Find events', 'My bookings', 'Help']
        };

      default:
        return await this.handleUnknownIntent(message);
    }
  }

  async getUpcomingEvents() {
    try {
      const events = await Event.find({
        status: 'published',
        startDate: { $gte: new Date() }
      })
      .sort({ startDate: 1 })
      .limit(5)
      .select('title category city startDate price availableSeats');

      if (events.length === 0) {
        return {
          text: "No upcoming events found at the moment. Please check back later!",
          suggestions: ['Help', 'Contact us']
        };
      }

      let text = "Here are some upcoming events:\n\n";
      events.forEach((event, index) => {
        text += `${index + 1}. ${event.title}\n`;
        text += `   📍 ${event.city} | 📅 ${new Date(event.startDate).toLocaleDateString()}\n`;
        text += `   💰 ₹${event.price} | 🎫 ${event.availableSeats} seats left\n\n`;
      });

      return {
        text,
        suggestions: ['View all events', 'Book now', 'Help'],
        events: events.map(e => ({ id: e._id, title: e.title }))
      };
    } catch (error) {
      return {
        text: "Sorry, I couldn't fetch events right now. Please try again later.",
        suggestions: ['Help', 'Contact support']
      };
    }
  }

  async getUserBookings(userId) {
    try {
      const bookings = await Booking.find({ userId })
        .populate('eventId', 'title startDate venue')
        .sort({ createdAt: -1 })
        .limit(5);

      if (bookings.length === 0) {
        return {
          text: "You don't have any bookings yet. Would you like to explore upcoming events?",
          suggestions: ['Find events', 'Help']
        };
      }

      let text = "Your recent bookings:\n\n";
      bookings.forEach((booking, index) => {
        text += `${index + 1}. ${booking.eventId.title}\n`;
        text += `   📅 ${new Date(booking.eventId.startDate).toLocaleDateString()}\n`;
        text += `   🎫 ${booking.seats} tickets | Status: ${booking.status}\n\n`;
      });

      return {
        text,
        suggestions: ['View all bookings', 'Cancel booking', 'Help']
      };
    } catch (error) {
      return {
        text: "Sorry, I couldn't fetch your bookings. Please try again later.",
        suggestions: ['Help', 'Contact support']
      };
    }
  }

  async handleUnknownIntent(message) {
    // Try to extract event-related keywords
    if (message.includes('concert') || message.includes('music')) {
      return {
        text: "Looking for concerts? Let me show you upcoming music events!",
        suggestions: ['Show concerts', 'All events', 'Help']
      };
    }

    if (message.includes('workshop') || message.includes('seminar')) {
      return {
        text: "Interested in workshops? We have many educational events!",
        suggestions: ['Show workshops', 'All events', 'Help']
      };
    }

    // Default response
    return {
      text: "I'm not sure I understood that. I can help you with:\n\n" +
            "• Finding and booking events\n" +
            "• Checking your bookings\n" +
            "• Payment and cancellation info\n" +
            "• Event details and locations\n\n" +
            "What would you like to know?",
      suggestions: ['Show events', 'My bookings', 'Help']
    };
  }
}

module.exports = new ChatbotService();
