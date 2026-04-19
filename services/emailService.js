const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter using Resend SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: process.env.RESEND_API_KEY
    }
  });
};

// Email templates
const emailTemplates = {
  verification: (name, verificationUrl) => ({
    subject: 'Verify Your Email - Event Management',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Event Management!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Thank you for registering! Please verify your email address to activate your account.</p>
            <p>Click the button below to verify your email:</p>
            <a href="${verificationUrl}" class="button">Verify Email</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  passwordReset: (name, resetUrl) => ({
    subject: 'Reset Your Password - Event Management',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #dc2626;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p><strong>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  passwordResetConfirmation: (name) => ({
    subject: 'Password Reset Successful - Event Management',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Password Reset Successful</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your password has been successfully reset.</p>
            <p>You can now log in to your account using your new password.</p>
            <div class="alert">
              <strong>⚠️ Security Notice:</strong>
              <p style="margin: 10px 0 0 0;">If you did not make this change, please contact our support team immediately.</p>
            </div>
            <p><strong>What happened:</strong></p>
            <ul>
              <li>Your password was changed on ${new Date().toLocaleString()}</li>
              <li>All active sessions have been logged out for security</li>
              <li>You'll need to log in again with your new password</li>
            </ul>
            <p><strong>Security Tips:</strong></p>
            <ul>
              <li>Use a strong, unique password</li>
              <li>Don't share your password with anyone</li>
              <li>Enable two-factor authentication if available</li>
              <li>Change your password regularly</li>
            </ul>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
            <p>If you have any concerns, contact us at support@eventmanagement.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  welcomeEmail: (name) => ({
    subject: 'Welcome to Event Management! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 30px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .feature-box { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #2563eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Event Management!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Thank you for verifying your email! Your account is now fully activated.</p>
            <p>You can now enjoy all the features of our platform:</p>
            
            <div class="feature-box">
              <strong>🎫 Browse Events</strong>
              <p style="margin: 5px 0 0 0;">Discover amazing events happening near you</p>
            </div>
            
            <div class="feature-box">
              <strong>💺 Book Tickets</strong>
              <p style="margin: 5px 0 0 0;">Select your seats and book instantly</p>
            </div>
            
            <div class="feature-box">
              <strong>📱 Digital Tickets</strong>
              <p style="margin: 5px 0 0 0;">Get QR code tickets delivered to your email</p>
            </div>
            
            <div class="feature-box">
              <strong>🔔 Get Notified</strong>
              <p style="margin: 5px 0 0 0;">Receive updates about your bookings and events</p>
            </div>
            
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/events" class="button">Explore Events</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  bookingConfirmation: (name, booking, event) => ({
    subject: `Booking Confirmed - ${event.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Booking Confirmed!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your booking has been confirmed! Here are your booking details:</p>
            <div class="booking-details">
              <div class="detail-row">
                <strong>Booking Reference:</strong>
                <span>${booking.bookingReference}</span>
              </div>
              <div class="detail-row">
                <strong>Event:</strong>
                <span>${event.title}</span>
              </div>
              <div class="detail-row">
                <strong>Date:</strong>
                <span>${new Date(event.startDate).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <strong>Venue:</strong>
                <span>${event.venue}</span>
              </div>
              <div class="detail-row">
                <strong>Number of Tickets:</strong>
                <span>${booking.seats}</span>
              </div>
              <div class="detail-row">
                <strong>Total Amount:</strong>
                <span>₹${booking.finalAmount}</span>
              </div>
            </div>
            <p>Your tickets are attached to this email as a PDF. You can also download them from your account.</p>
            <p>Please bring your ticket (printed or on your phone) to the event.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  paymentSuccess: (name, booking, event) => ({
    subject: `Payment Successful - ${event.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .payment-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border: 2px solid #10b981; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Payment Successful!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your payment has been processed successfully!</p>
            <div class="payment-box">
              <h3 style="margin-top: 0; color: #10b981;">Payment Details</h3>
              <p><strong>Booking Reference:</strong> ${booking.bookingReference}</p>
              <p><strong>Event:</strong> ${event.title}</p>
              <p><strong>Amount Paid:</strong> ₹${booking.finalAmount}</p>
              <p><strong>Payment Date:</strong> ${new Date().toLocaleString()}</p>
              <p><strong>Status:</strong> <span style="color: #10b981;">✓ Confirmed</span></p>
            </div>
            <p>Your tickets have been generated and are attached to this email.</p>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings" class="button">View My Bookings</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  bookingCancellation: (name, booking, event) => ({
    subject: `Booking Cancelled - ${event.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ef4444; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .info-box { background: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booking Cancelled</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your booking has been cancelled as requested.</p>
            <p><strong>Cancelled Booking Details:</strong></p>
            <ul>
              <li>Booking Reference: ${booking.bookingReference}</li>
              <li>Event: ${event.title}</li>
              <li>Date: ${new Date(event.startDate).toLocaleDateString()}</li>
              <li>Tickets: ${booking.seats}</li>
            </ul>
            <div class="info-box">
              <strong>Refund Information:</strong>
              <p style="margin: 10px 0 0 0;">If you paid for this booking, your refund of ₹${booking.finalAmount} will be processed within 5-7 business days.</p>
            </div>
            <p>We're sorry to see you cancel. We hope to see you at another event soon!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  eventReminder: (name, booking, event) => ({
    subject: `Reminder: ${event.title} is Tomorrow! 🎉`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .reminder-box { background: #fef3c7; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
          .checklist { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Event Reminder!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <div class="reminder-box">
              <h3 style="margin-top: 0; color: #f59e0b;">Your event is tomorrow!</h3>
              <p style="font-size: 18px; margin: 10px 0;"><strong>${event.title}</strong></p>
              <p style="font-size: 16px;">📅 ${new Date(event.startDate).toLocaleDateString()} at ${new Date(event.startDate).toLocaleTimeString()}</p>
              <p style="font-size: 16px;">📍 ${event.venue}</p>
            </div>
            
            <div class="checklist">
              <h3>Pre-Event Checklist:</h3>
              <ul style="list-style: none; padding: 0;">
                <li>✓ Download your tickets (attached)</li>
                <li>✓ Arrive 30 minutes early</li>
                <li>✓ Bring a valid ID</li>
                <li>✓ Check venue parking/directions</li>
                <li>✓ Review event guidelines</li>
              </ul>
            </div>
            
            <p><strong>Booking Reference:</strong> ${booking.bookingReference}</p>
            <p><strong>Number of Tickets:</strong> ${booking.seats}</p>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}" class="button">View Tickets</a>
            </p>
            
            <p>We're excited to see you there! Have a great time! 🎊</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  refundApproved: (name, refund, booking, event) => ({
    subject: `Refund Approved - ${event.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .info-box { background: #d1fae5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Refund Approved</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Good news! Your refund request has been approved by our team.</p>
            
            <div class="info-box">
              <h3 style="margin-top: 0; color: #10b981;">Refund Details</h3>
              <div class="detail-row">
                <strong>Booking Reference:</strong>
                <span>${booking.bookingReference}</span>
              </div>
              <div class="detail-row">
                <strong>Event:</strong>
                <span>${event.title}</span>
              </div>
              <div class="detail-row">
                <strong>Original Amount:</strong>
                <span>₹${refund.originalAmount}</span>
              </div>
              <div class="detail-row">
                <strong>Cancellation Fee:</strong>
                <span>₹${refund.cancellationFee || 0}</span>
              </div>
              <div class="detail-row">
                <strong>Refund Amount:</strong>
                <span style="color: #10b981; font-size: 18px; font-weight: bold;">₹${refund.refundAmount}</span>
              </div>
            </div>
            
            <p><strong>What happens next?</strong></p>
            <ul>
              <li>Your refund will be processed within 5-7 business days</li>
              <li>The amount will be credited to your original payment method</li>
              <li>You'll receive a confirmation email once the refund is completed</li>
            </ul>
            
            ${refund.adminNotes ? `<p><strong>Admin Notes:</strong> ${refund.adminNotes}</p>` : ''}
            
            <p>If you have any questions, please don't hesitate to contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
            <p>Need help? Contact us at support@eventmanagement.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  refundCompleted: (name, refund) => ({
    subject: 'Refund Completed - Payment Processed',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .success-box { background: #d1fae5; padding: 30px; border-radius: 10px; margin: 20px 0; text-align: center; border: 2px solid #10b981; }
          .amount { font-size: 36px; font-weight: bold; color: #10b981; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Refund Completed</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Your refund has been successfully processed!</p>
            
            <div class="success-box">
              <div style="font-size: 48px; margin-bottom: 10px;">✓</div>
              <h3 style="margin: 10px 0; color: #10b981;">Refund Processed</h3>
              <div class="amount">₹${refund.refundAmount}</div>
              <p style="margin: 10px 0; color: #6b7280;">
                Transaction ID: ${refund.transactionId || 'N/A'}
              </p>
              <p style="margin: 10px 0; color: #6b7280;">
                Processed on: ${new Date().toLocaleDateString()}
              </p>
            </div>
            
            <p><strong>Important Information:</strong></p>
            <ul>
              <li>The refund has been credited to your original payment method</li>
              <li>It may take 3-5 business days to reflect in your account</li>
              <li>The exact timing depends on your bank or payment provider</li>
              <li>Please check your bank statement for the credit</li>
            </ul>
            
            <p>If you don't see the refund in your account after 7 business days, please contact your bank or our support team.</p>
            
            <p>Thank you for your patience, and we hope to see you at another event soon!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
            <p>Questions? Contact us at support@eventmanagement.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  refundApproved: (name, refund, booking, event) => ({
    subject: `Refund Approved - ${event.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .info-box { background: #d1fae5; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Refund Approved</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <p>Good news! Your refund request has been approved.</p>
            <div class="info-box">
              <h3 style="margin-top: 0; color: #10b981;">Refund Details</h3>
              <p><strong>Booking Reference:</strong> ${booking.bookingReference}</p>
              <p><strong>Event:</strong> ${event.title}</p>
              <p><strong>Original Amount:</strong> ₹${refund.originalAmount}</p>
              <p><strong>Cancellation Fee:</strong> ₹${refund.cancellationFee || 0}</p>
              <p><strong>Refund Amount:</strong> ₹${refund.refundAmount}</p>
            </div>
            <p><strong>What happens next?</strong></p>
            <ul>
              <li>Your refund will be processed within 5-7 business days</li>
              <li>The amount will be credited to your original payment method</li>
              <li>You'll receive a confirmation email once the refund is completed</li>
            </ul>
            <p>If you have any questions, please contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  refundCompleted: (name, refund) => ({
    subject: 'Refund Completed Successfully',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .success-box { background: #d1fae5; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Refund Completed</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <div class="success-box">
              <h3 style="margin-top: 0; color: #10b981;">Your refund has been processed!</h3>
              <p style="font-size: 24px; font-weight: bold; color: #10b981; margin: 20px 0;">₹${refund.refundAmount}</p>
              <p>has been credited to your account</p>
            </div>
            <p><strong>Transaction Details:</strong></p>
            <ul>
              <li>Refund Amount: ₹${refund.refundAmount}</li>
              <li>Transaction ID: ${refund.transactionId || 'N/A'}</li>
              <li>Processed Date: ${new Date().toLocaleDateString()}</li>
            </ul>
            <p>The refund should appear in your account within 2-3 business days depending on your bank.</p>
            <p>Thank you for your patience!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  eventReminder24h: (name, booking, event) => ({
    subject: `Reminder: ${event.title} is Tomorrow! 🎉`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f59e0b; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .reminder-box { background: #fef3c7; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Event Tomorrow!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <div class="reminder-box">
              <h3 style="margin-top: 0; color: #f59e0b;">Your event is tomorrow!</h3>
              <p style="font-size: 18px; margin: 10px 0;"><strong>${event.title}</strong></p>
              <p>📅 ${new Date(event.startDate).toLocaleDateString()} at ${new Date(event.startDate).toLocaleTimeString()}</p>
              <p>📍 ${event.venue}, ${event.city}</p>
              <p>🎫 ${booking.seats} ticket(s)</p>
            </div>
            
            <p><strong>What to bring:</strong></p>
            <ul>
              <li>Your ticket (digital or printed)</li>
              <li>Valid ID proof</li>
              <li>Booking reference: ${booking.bookingReference}</li>
            </ul>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}/ticket" class="button">View Ticket</a>
            </p>
            
            <p>We look forward to seeing you there!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  eventReminder1h: (name, booking, event) => ({
    subject: `Starting Soon: ${event.title} in 1 Hour! ⏰`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .urgent-box { background: #fee2e2; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc2626; }
          .button { display: inline-block; padding: 12px 30px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Starting in 1 Hour!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <div class="urgent-box">
              <h3 style="margin-top: 0; color: #dc2626;">Your event starts in 1 hour!</h3>
              <p style="font-size: 20px; margin: 10px 0;"><strong>${event.title}</strong></p>
              <p style="font-size: 18px;">⏰ ${new Date(event.startDate).toLocaleTimeString()}</p>
              <p>📍 ${event.venue}, ${event.city}</p>
            </div>
            
            <p><strong>Quick Checklist:</strong></p>
            <ul>
              <li>✓ Have your ticket ready</li>
              <li>✓ Bring valid ID</li>
              <li>✓ Arrive 15 minutes early</li>
              <li>✓ Booking Ref: ${booking.bookingReference}</li>
            </ul>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}/ticket" class="button">View Ticket</a>
            </p>
            
            <p style="text-align: center; font-size: 18px; color: #dc2626;"><strong>See you soon!</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  waitlistNotification: (name, event) => ({
    subject: `Seats Available - ${event.title} 🎫`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8b5cf6; color: white; padding: 20px; text-align: center; }
          .content { background: #f9fafb; padding: 30px; }
          .alert-box { background: #dbeafe; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2563eb; }
          .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎫 Great News!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name},</h2>
            <div class="alert-box">
              <h3 style="margin-top: 0; color: #2563eb;">Seats are now available!</h3>
              <p style="font-size: 16px;">The event you were waiting for has available seats:</p>
              <p style="font-size: 18px; margin: 10px 0;"><strong>${event.title}</strong></p>
              <p>📅 ${new Date(event.startDate).toLocaleDateString()}</p>
              <p>📍 ${event.venue}</p>
              <p>💺 ${event.availableSeats} seats available</p>
            </div>
            
            <p><strong>Don't miss out!</strong> Book your tickets now before they're gone again.</p>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/events/${event._id}" class="button">Book Now</a>
            </p>
            
            <p style="font-size: 12px; color: #666;">This is an automated notification because you joined the waitlist for this event.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Event Management. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Send email function
const sendEmail = async (to, template, data) => {
  try {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('Email not configured. Skipping email send.');
      logger.info(`Would have sent ${template} email to: ${to}`);
      return { success: false, error: 'Email not configured' };
    }

    const transporter = createTransporter();
    const emailContent = emailTemplates[template](...data);

    // Log email details for debugging
    logger.info(`Sending ${template} email to: ${to}`);

    const mailOptions = {
      from: `EventHub <onboarding@resend.dev>`,
      to,
      subject: emailContent.subject,
      html: emailContent.html
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Email sending failed: ${error.message}`);
    logger.error('Email details:', { to, template });
    logger.error('Tip: Make sure you are using Gmail App Password, not regular password');
    logger.error('Visit: https://myaccount.google.com/apppasswords');
    
    return { success: false, error: error.message };
  }
};

// Send email with attachment
const sendEmailWithAttachment = async (to, template, data, attachments = []) => {
  try {
    // Check if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('Email not configured. Skipping email send.');
      logger.info(`Would have sent ${template} email with attachment to: ${to}`);
      return { success: false, error: 'Email not configured' };
    }

    const transporter = createTransporter();
    const emailContent = emailTemplates[template](...data);

    logger.info(`Sending ${template} email with ${attachments.length} attachment(s) to: ${to}`);

    const mailOptions = {
      from: `EventHub <onboarding@resend.dev>`,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email with attachment sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Email with attachment failed: ${error.message}`);
    logger.error('Email details:', { to, template, attachmentCount: attachments.length });
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  sendEmailWithAttachment
};
