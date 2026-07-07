const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { storeOTP, verifyOTP } = require('../utils/otpManager');
const { sendOTPEmail } = require('../utils/emailService');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticates a user. For admin users, requires 2FA (OTP via email).
 * For regular employees, returns JWT immediately.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const userResult = await query(
      `SELECT u.user_id, u.email, u.password_hash, u.is_active, r.role_name, e.employee_id
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN employees e ON e.user_id = u.user_id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Check if user is ADMIN - if so, require 2FA
    if (user.role_name === 'ADMIN') {
      // Generate and send OTP
      const otp = storeOTP(email, 5); // 5 minutes expiry
      
      try {
        await sendOTPEmail(email, otp);
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send OTP email. Please try again.' 
        });
      }

      // Return mfaRequired flag instead of JWT
      return res.status(200).json({
        success: true,
        mfaRequired: true,
        email: email,
        message: 'OTP sent to your email. Please verify to proceed.'
      });
    }

    // For non-admin (EMPLOYEE) users, proceed with normal login
    const tokenPayload = {
      userId: user.user_id,
      email: user.email,
      role: user.role_name,
      employeeId: user.employee_id || null
    };

    const jwtSecret = process.env.JWT_SECRET || 'payroll-dev-secret';
    const token = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    return res.status(200).json({
      success: true,
      mfaRequired: false,
      message: 'Login successful',
      data: { token, user: tokenPayload }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verifies the OTP sent to admin email and returns JWT token
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    // Verify OTP
    const verification = verifyOTP(email, otp);
    if (!verification.valid) {
      return res.status(401).json({ success: false, message: verification.message });
    }

    // Fetch user from database to get updated info
    const userResult = await query(
      `SELECT u.user_id, u.email, u.password_hash, u.is_active, r.role_name, e.employee_id
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN employees e ON e.user_id = u.user_id
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    const user = userResult.rows[0];

    // Generate JWT token
    const tokenPayload = {
      userId: user.user_id,
      email: user.email,
      role: user.role_name,
      employeeId: user.employee_id || null
    };

    const jwtSecret = process.env.JWT_SECRET || 'payroll-dev-secret';
    const token = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    return res.status(200).json({
      success: true,
      message: '2FA verification successful. Login completed.',
      data: { token, user: tokenPayload }
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during OTP verification' });
  }
});

/**
 * POST /api/auth/resend-otp
 * Resends OTP to admin email
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Verify user exists and is admin
    const userResult = await query(
      `SELECT u.user_id, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email]
    );

    if (userResult.rowCount === 0 || userResult.rows[0].role_name !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'OTP resend not available for this account' });
    }

    // Generate and send new OTP
    const otp = storeOTP(email, 5);
    
    try {
      await sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error('Failed to resend OTP email:', emailError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send OTP email. Please try again.' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'New OTP sent to your email'
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's identity claims.
 */
router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({ success: true, data: req.user });
});

/**
 * POST /api/auth/register-employee
 * Admin-only endpoint to create a new user + employee login credentials.
 */
router.post('/register-employee', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { email, password, employeeId } = req.body;

    if (!email || !password || !employeeId) {
      return res.status(400).json({ success: false, message: 'email, password and employeeId are required' });
    }

    const employeeCheck = await query('SELECT employee_id FROM employees WHERE employee_id = $1', [employeeId]);
    if (employeeCheck.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee record not found' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const employeeRoleResult = await query(`SELECT role_id FROM roles WHERE role_name = 'EMPLOYEE'`);
    const roleId = employeeRoleResult.rows[0].role_id;

    const insertResult = await query(
      `INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3) RETURNING user_id`,
      [email, passwordHash, roleId]
    );

    await query(`UPDATE employees SET user_id = $1 WHERE employee_id = $2`, [insertResult.rows[0].user_id, employeeId]);

    return res.status(201).json({ success: true, message: 'Employee login credentials created' });
  } catch (err) {
    console.error('Register employee error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error while registering employee' });
  }
});

module.exports = router;
