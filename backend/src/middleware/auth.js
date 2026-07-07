const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
require('dotenv').config();

/**
 * Verifies the JWT sent in the Authorization header (Bearer token).
 * Attaches the decoded payload to req.user on success.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization token missing or malformed' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await query('SELECT is_active FROM users WHERE user_id = $1', [decoded.userId]);

    if (userResult.rowCount === 0 || userResult.rows[0].is_active === false) {
      return res.status(401).json({ success: false, message: 'Account is inactive or unauthorized' });
    }

    req.user = decoded; // { userId, email, role, employeeId }
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * Role-Based Access Control middleware factory.
 * Usage: authorize('ADMIN') or authorize('ADMIN', 'EMPLOYEE')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to perform this action' });
    }
    return next();
  };
}

/**
 * Ensures an employee can only access their own records unless they are an Admin.
 * Expects the route to have an :employeeId param.
 */
function authorizeSelfOrAdmin(req, res, next) {
  const requestedEmployeeId = Number(req.params.employeeId);
  if (req.user.role === 'ADMIN') {
    return next();
  }
  if (req.user.employeeId === requestedEmployeeId) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'You can only access your own records' });
}

module.exports = { authenticate, authorize, authorizeSelfOrAdmin };
