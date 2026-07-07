const express = require('express');
const bcrypt = require('bcrypt');
const { query, getClient } = require('../config/db');
const { authenticate, authorize, authorizeSelfOrAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/employees
 * Admin-only: list all employees with a summary view.
 */
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const result = await query(
      `SELECT employee_id, employee_code, first_name, last_name, designation, department,
              date_of_joining, base_pay, is_active
       FROM employees
       ORDER BY employee_id ASC`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List employees error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
});

/**
 * GET /api/employees/:employeeId
 * Admin can view any employee; an employee can only view their own profile.
 */
router.get('/:employeeId', authenticate, authorizeSelfOrAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await query(`SELECT * FROM employees WHERE employee_id = $1`, [employeeId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Get employee error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch employee' });
  }
});

/**
 * POST /api/employees
 * Admin-only: create a new employee record (personal, banking, salary structure).
 */
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  const client = await getClient();

  try {
    const {
      email, firstName, lastName, phone, designation, department,
      dateOfJoining, dateOfBirth, address, bankName, bankAccountNo, ifscCode, panNumber,
      basePay, hra, conveyanceAllowance, medicalAllowance, specialAllowance,
      pfPercentage, overtimeRatePerHour, role
    } = req.body;

    if (!email || !firstName || !lastName || !dateOfJoining || basePay === undefined) {
      return res.status(400).json({
        success: false,
        message: 'email, firstName, lastName, dateOfJoining and basePay are required'
      });
    }

    await client.query('BEGIN');

    const existingUser = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const normalizedRole = String(role || 'EMPLOYEE').trim().toUpperCase();
    const roleName = normalizedRole.includes('ADMIN') ? 'ADMIN' : 'EMPLOYEE';
    const roleResult = await client.query('SELECT role_id FROM roles WHERE role_name = $1', [roleName]);

    if (roleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Invalid role provided' });
    }

    const passwordHash = await bcrypt.hash('Password@123', 10);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW()) RETURNING user_id`,
      [email, passwordHash, roleResult.rows[0].role_id]
    );

    const employeeCode = `EMP${Date.now().toString().slice(-6)}`;
    const employeeResult = await client.query(
      `INSERT INTO employees (
        user_id, employee_code, first_name, last_name, phone, designation, department,
        date_of_joining, date_of_birth, address, bank_name, bank_account_no, ifsc_code, pan_number,
        base_pay, hra, conveyance_allowance, medical_allowance, special_allowance,
        pf_percentage, overtime_rate_per_hour, is_active, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,TRUE,NOW(),NOW())
      RETURNING *`,
      [
        userResult.rows[0].user_id, employeeCode, firstName, lastName, phone, designation, department,
        dateOfJoining, dateOfBirth, address, bankName, bankAccountNo, ifscCode, panNumber,
        basePay, hra || 0, conveyanceAllowance || 0, medicalAllowance || 0, specialAllowance || 0,
        pfPercentage || 12.00, overtimeRatePerHour || 0
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({ success: true, message: 'Employee created', data: employeeResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create employee error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create employee' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/employees/:employeeId/terminate
 * Admin-only: soft delete an employee by deactivating their user and employee record.
 */
router.patch('/:employeeId/terminate', authenticate, authorize('ADMIN'), async (req, res) => {
  const client = await getClient();

  try {
    const { employeeId } = req.params;
    await client.query('BEGIN');

    const employeeResult = await client.query('SELECT user_id FROM employees WHERE employee_id = $1', [employeeId]);
    if (employeeResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const userId = employeeResult.rows[0].user_id;
    await client.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);
    await client.query('UPDATE employees SET is_active = FALSE, updated_at = NOW() WHERE employee_id = $1', [employeeId]);

    await client.query('COMMIT');

    return res.status(200).json({ success: true, message: 'Employee terminated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Terminate employee error:', err);
    return res.status(500).json({ success: false, message: 'Failed to terminate employee' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/employees/:employeeId
 * Admin-only: update employee personal, banking or salary structure details.
 */
router.put('/:employeeId', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'designation', 'department', 'address',
      'bank_name', 'bank_account_no', 'ifsc_code', 'pan_number',
      'base_pay', 'hra', 'conveyance_allowance', 'medical_allowance', 'special_allowance',
      'pf_percentage', 'overtime_rate_per_hour', 'is_active'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex += 1;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided for update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(employeeId);

    const updateQuery = `UPDATE employees SET ${updates.join(', ')} WHERE employee_id = $${paramIndex} RETURNING *`;
    const result = await query(updateQuery, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    return res.status(200).json({ success: true, message: 'Employee updated', data: result.rows[0] });
  } catch (err) {
    console.error('Update employee error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
});

module.exports = router;
