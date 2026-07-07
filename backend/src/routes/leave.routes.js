const express = require('express');
const nodemailer = require('nodemailer');
const { query } = require('../config/db');
const { authenticate, authorize, authorizeSelfOrAdmin } = require('../middleware/auth');

require('dotenv').config();

const router = express.Router();

// Initialize email transporter with environment variables
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Helper function to send leave decision email
 */
async function sendLeaveDecisionEmail(employeeEmail, employeeName, leave, decision, rejectionReason = null) {
  const companyName = process.env.COMPANY_NAME || 'Payroll Management System';
  const startDate = new Date(leave.start_date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const endDate = new Date(leave.end_date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const isApproved = decision === 'APPROVED';
  const subject = isApproved 
    ? `Leave Request Approved - ${companyName}`
    : `Update on your Leave Request - ${companyName}`;

  const statusText = isApproved ? 'APPROVED' : 'REJECTED';
  const statusColor = isApproved ? '#28a745' : '#dc3545';
  
  let rejectionSection = '';
  if (!isApproved && rejectionReason) {
    rejectionSection = `
      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 3px;">
        <p style="color: #856404; margin: 0;"><strong>Reason for Rejection:</strong></p>
        <p style="color: #856404; margin: 10px 0 0 0;">${rejectionReason}</p>
      </div>
    `;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${companyName}</h1>
      </div>
      <div style="background: #f5f5f5; padding: 30px; border-radius: 0 0 5px 5px;">
        <p style="margin-top: 0; font-size: 16px;">Hello ${employeeName},</p>
        
        <p style="font-size: 15px; line-height: 1.6;">
          Your leave request from <strong>${startDate}</strong> to <strong>${endDate}</strong> has been <strong style="color: ${statusColor};">${statusText}</strong> by the Admin.
        </p>

        <div style="background: white; border: 1px solid #ddd; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0;"><strong>Leave Type:</strong></td>
              <td style="padding: 8px 0; text-align: right;">${leave.leave_type}</td>
            </tr>
            <tr style="border-top: 1px solid #eee;">
              <td style="padding: 8px 0;"><strong>Duration:</strong></td>
              <td style="padding: 8px 0; text-align: right;">${leave.total_days} day(s)</td>
            </tr>
            <tr style="border-top: 1px solid #eee;">
              <td style="padding: 8px 0;"><strong>Status:</strong></td>
              <td style="padding: 8px 0; text-align: right;"><span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></td>
            </tr>
          </table>
        </div>

        ${rejectionSection}

        <p style="font-size: 14px; color: #666; line-height: 1.6;">
          If you have any questions or need further clarification, please reach out to the HR/Payroll team.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #999; margin: 0;">© 2026 ${companyName}. All rights reserved.</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"${companyName}" <${process.env.SMTP_USER}>`,
    to: employeeEmail,
    subject: subject,
    html: htmlBody
  };

  return emailTransporter.sendMail(mailOptions);
}

/**
 * GET /api/leaves
 * Admin-only: list all leave applications across employees (for the Leave Management board).
 */
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, e.first_name, e.last_name, e.employee_code, e.department
       FROM leaves l
       JOIN employees e ON e.employee_id = l.employee_id
       ORDER BY l.applied_at DESC`
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('List leaves error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave applications' });
  }
});

/**
 * GET /api/leaves/employee/:employeeId
 * Returns leave history and balances for a specific employee.
 */
router.get('/employee/:employeeId', authenticate, authorizeSelfOrAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const year = Number(req.query.year) || new Date().getFullYear();

    const leavesResult = await query(
      `SELECT * FROM leaves WHERE employee_id = $1 ORDER BY applied_at DESC`,
      [employeeId]
    );

    const balancesResult = await query(
      `SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2`,
      [employeeId, year]
    );

    return res.status(200).json({
      success: true,
      data: { leaves: leavesResult.rows, balances: balancesResult.rows }
    });
  } catch (err) {
    console.error('Get employee leaves error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch leave data' });
  }
});

/**
 * POST /api/leaves/apply
 * Employee submits a new leave application.
 */
router.post('/apply', authenticate, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    const { leaveType, startDate, endDate, reason } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account' });
    }
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'leaveType, startDate and endDate are required' });
    }

    const totalDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
    if (totalDays <= 0) {
      return res.status(400).json({ success: false, message: 'endDate must be on or after startDate' });
    }

    const result = await query(
      `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, total_days, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [employeeId, leaveType, startDate, endDate, totalDays, reason || null]
    );

    return res.status(201).json({ success: true, message: 'Leave application submitted', data: result.rows[0] });
  } catch (err) {
    console.error('Apply leave error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit leave application' });
  }
});

/**
 * PATCH /api/leaves/:leaveId/decision
 * Admin-only: approve or reject a pending leave application.
 * Approving an EARNED/CASUAL/SICK leave increments the used balance for that leave type.
 * Sends email notification to employee about the decision.
 */
router.patch('/:leaveId/decision', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { decision, rejectionReason } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be 'APPROVED' or 'REJECTED'" });
    }

    const leaveResult = await query(`SELECT * FROM leaves WHERE leave_id = $1`, [leaveId]);
    if (leaveResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Leave application not found' });
    }

    const leave = leaveResult.rows[0];
    if (leave.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'This leave application has already been decided' });
    }

    const updateResult = await query(
      `UPDATE leaves SET status = $1, approved_by = $2, decided_at = NOW()
       WHERE leave_id = $3 RETURNING *`,
      [decision, req.user.userId, leaveId]
    );

    if (decision === 'APPROVED' && leave.leave_type !== 'UNPAID') {
      const year = new Date(leave.start_date).getFullYear();
      await query(
        `UPDATE leave_balances SET used = used + $1
         WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
        [leave.total_days, leave.employee_id, leave.leave_type, year]
      );

      await query(
        `UPDATE attendance SET status = 'ON_LEAVE'
         WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3`,
        [leave.employee_id, leave.start_date, leave.end_date]
      );
    }

    // Send email notification asynchronously (don't block response)
    (async () => {
      try {
        // Fetch employee email and name
        const employeeResult = await query(
          `SELECT e.first_name, e.last_name, u.email
           FROM employees e
           JOIN users u ON e.user_id = u.user_id
           WHERE e.employee_id = $1`,
          [leave.employee_id]
        );

        if (employeeResult.rowCount > 0) {
          const employee = employeeResult.rows[0];
          const employeeName = `${employee.first_name} ${employee.last_name}`;
          const employeeEmail = employee.email;

          // Send the decision email
          await sendLeaveDecisionEmail(
            employeeEmail,
            employeeName,
            leave,
            decision,
            rejectionReason || null
          );

          console.log(`Leave decision email sent to ${employeeEmail} for leave ID ${leaveId}`);
        }
      } catch (emailError) {
        // Log the error but don't fail the API response
        console.error(`Failed to send leave decision email for leave ID ${leaveId}:`, emailError.message);
      }
    })();

    return res.status(200).json({ success: true, message: `Leave ${decision.toLowerCase()}`, data: updateResult.rows[0] });
  } catch (err) {
    console.error('Leave decision error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process leave decision' });
  }
});

module.exports = router;
