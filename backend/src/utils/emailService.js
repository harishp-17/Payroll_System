const nodemailer = require('nodemailer');
require('dotenv').config();

const COMPANY_NAME = process.env.COMPANY_NAME || 'Payroll Management System';

/**
 * Email Service - Send OTP via email
 * Uses SMTP configuration from environment variables
 */

// Initialize transporter immediately with env variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

console.log('Email service initialized with:', process.env.SMTP_USER, `(${process.env.SMTP_HOST}:${process.env.SMTP_PORT})`);

/**
 * Send OTP via email
 */
async function sendOTPEmail(email, otp) {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Payroll System - Two-Factor Authentication Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
            <h1 style="color: white; margin: 0;">${COMPANY_NAME}</h1>
          </div>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 0 0 5px 5px;">
            <p>Hello,</p>
            <p>You have requested a Two-Factor Authentication code for your admin account.</p>
            <div style="background: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; border: 2px solid #667eea;">
              <p style="color: #666; margin: 0 0 10px 0; font-size: 14px;">Your OTP Code:</p>
              <h2 style="color: #667eea; margin: 10px 0; letter-spacing: 3px; font-size: 32px;">${otp}</h2>
            </div>
            <p style="color: #999; font-size: 14px;">This code will expire in 5 minutes.</p>
            <p style="color: #999; font-size: 14px;">If you did not request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; margin: 0;">© 2026 ${COMPANY_NAME}. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}:`, result.messageId);
    return { success: true, message: 'OTP sent to email' };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, message: 'Failed to send OTP email', error: error.message };
  }
}

/**
 * Test email configuration
 */
async function testEmailConfig() {
  try {
    await transporter.verify();
    console.log('Email service is ready to send messages');
    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  testEmailConfig,
  transporter
};
