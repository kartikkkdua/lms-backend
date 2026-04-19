/**
 * Email Configuration Test Script
 * Run this to verify your email credentials are working
 * 
 * Usage: node test-email.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('🧪 Testing Email Configuration...\n');

// Check if credentials are set
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('❌ EMAIL_USER or EMAIL_PASS not set in .env file');
  process.exit(1);
}

console.log('📧 Email User:', process.env.EMAIL_USER);
console.log('🔑 Password Length:', process.env.EMAIL_PASS.length, 'characters');
console.log('');

// Create transporter
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Test connection
console.log('🔌 Testing SMTP connection...');
transporter.verify((error, success) => {
  if (error) {
    console.error('\n❌ Connection Failed!');
    console.error('Error:', error.message);
    console.error('\n📝 Common Issues:');
    console.error('1. Not using App Password (must use 16-character app password)');
    console.error('2. 2-Step Verification not enabled on Gmail');
    console.error('3. App Password was revoked or expired');
    console.error('4. Wrong email or password in .env file');
    console.error('\n🔧 How to Fix:');
    console.error('1. Go to: https://myaccount.google.com/security');
    console.error('2. Enable 2-Step Verification');
    console.error('3. Go to: https://myaccount.google.com/apppasswords');
    console.error('4. Create new App Password for "Mail"');
    console.error('5. Update EMAIL_PASS in .env with the 16-character password');
    console.error('6. Restart your server and try again\n');
    process.exit(1);
  } else {
    console.log('✅ Connection Successful!\n');
    
    // Send test email
    console.log('📨 Sending test email...');
    const mailOptions = {
      from: `"Event Management Test" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: '✅ Email Configuration Test - Success!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">✅ Email Configuration Successful!</h2>
          <p>Your email service is now properly configured and working.</p>
          <p><strong>Configuration Details:</strong></p>
          <ul>
            <li>Email: ${process.env.EMAIL_USER}</li>
            <li>SMTP Host: smtp.gmail.com</li>
            <li>Port: 587</li>
            <li>Test Time: ${new Date().toLocaleString()}</li>
          </ul>
          <p>You can now use the following features:</p>
          <ul>
            <li>✉️ Email verification on signup</li>
            <li>🔒 Password reset functionality</li>
            <li>🎫 PDF ticket delivery</li>
          </ul>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated test email from your Event Management System.
          </p>
        </div>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('❌ Failed to send test email:', error.message);
        process.exit(1);
      } else {
        console.log('✅ Test email sent successfully!');
        console.log('📬 Message ID:', info.messageId);
        console.log('📧 Check your inbox:', process.env.EMAIL_USER);
        console.log('\n🎉 Email service is fully configured and working!\n');
        process.exit(0);
      }
    });
  }
});
