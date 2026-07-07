const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize, authorizeSelfOrAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/attendance/clock-in
 * Employee clocks in for the current day.
 */
router.post('/clock-in', authenticate, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentTime = new Date().toTimeString().slice(0, 8);

    const existing = await query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2`,
      [employeeId, today]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({ success: false, message: 'You have already clocked in today' });
    }

    const result = await query(
      `INSERT INTO attendance (employee_id, work_date, clock_in, status)
       VALUES ($1, $2, $3, 'PRESENT') RETURNING *`,
      [employeeId, today, currentTime]
    );

    return res.status(201).json({ success: true, message: 'Clocked in successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Clock-in error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clock in' });
  }
});

/**
 * POST /api/attendance/clock-out
 * Employee clocks out; total hours and overtime hours (beyond 8 hrs/day) are computed.
 */
router.post('/clock-out', authenticate, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    const today = new Date().toISOString().slice(0, 10);
    const currentTime = new Date().toTimeString().slice(0, 8);

    const existing = await query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND work_date = $2`,
      [employeeId, today]
    );

    if (existing.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'You have not clocked in today' });
    }

    const record = existing.rows[0];
    const clockInTime = new Date(`${today}T${record.clock_in}`);
    const clockOutTime = new Date(`${today}T${currentTime}`);
    const totalHours = Math.max(0, (clockOutTime - clockInTime) / (1000 * 60 * 60));
    const standardWorkDayHours = 8;
    const overtimeHours = Math.max(0, totalHours - standardWorkDayHours);

    const result = await query(
      `UPDATE attendance SET clock_out = $1, total_hours = $2, overtime_hours = $3
       WHERE employee_id = $4 AND work_date = $5 RETURNING *`,
      [currentTime, totalHours.toFixed(2), overtimeHours.toFixed(2), employeeId, today]
    );

    return res.status(200).json({ success: true, message: 'Clocked out successfully', data: result.rows[0] });
  } catch (err) {
    console.error('Clock-out error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clock out' });
  }
});

/**
 * GET /api/attendance/:employeeId?month=6&year=2026
 * Returns the attendance records and a summary for the given month/year.
 */
router.get('/:employeeId', authenticate, authorizeSelfOrAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();

    const recordsResult = await query(
      `SELECT * FROM attendance
       WHERE employee_id = $1
         AND EXTRACT(MONTH FROM work_date) = $2
         AND EXTRACT(YEAR FROM work_date) = $3
       ORDER BY work_date ASC`,
      [employeeId, month, year]
    );

    const records = recordsResult.rows;
    const summary = {
      presentDays: records.filter((r) => r.status === 'PRESENT').length,
      absentDays: records.filter((r) => r.status === 'ABSENT').length,
      leaveDays: records.filter((r) => r.status === 'ON_LEAVE').length,
      totalOvertimeHours: records.reduce((sum, r) => sum + Number(r.overtime_hours || 0), 0),
      totalHoursWorked: records.reduce((sum, r) => sum + Number(r.total_hours || 0), 0)
    };

    return res.status(200).json({ success: true, data: { records, summary } });
  } catch (err) {
    console.error('Get attendance error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
  }
});

module.exports = router;
