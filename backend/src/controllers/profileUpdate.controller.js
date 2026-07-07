const nodemailer = require('nodemailer');
const { query, getClient } = require('../config/db');
require('dotenv').config();

const COMPANY_NAME = process.env.COMPANY_NAME || 'Payroll Management System';

const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

async function sendProfileUpdateNotification(employeeEmail, employeeName, status, reviewNote = null) {
  const subject = `[${COMPANY_NAME}] Profile Update Status Notification`;
  const statusText = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  const statusColor = status === 'APPROVED' ? '#28a745' : '#dc3545';
  const noteSection = reviewNote
    ? `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px 16px;margin:16px 0;border-radius:4px;">${reviewNote}</div>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="background:${statusColor};padding:20px;color:#fff;">
        <h2 style="margin:0">${COMPANY_NAME}</h2>
      </div>
      <div style="padding:24px;background:#fff;">
        <p>Hello ${employeeName},</p>
        <p>Your profile update request has been <strong>${statusText}</strong>.</p>
        ${noteSection}
        <p>If you have any questions, please contact HR/Payroll.</p>
        <p>Regards,<br/>${COMPANY_NAME}</p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: `"${COMPANY_NAME}" <${process.env.SMTP_USER}>`,
    to: employeeEmail,
    subject,
    html
  };

  return emailTransporter.sendMail(mailOptions);
}

async function createProfileUpdateRequest(req, res) {
  try {
    const employeeId = req.user?.employeeId;
    const {
      requested_name,
      requested_bank_name,
      requested_account_number,
      requested_ifsc_code,
      requested_phone
    } = req.body;

    const normalizedRequestedName = (requested_name || '').toString().trim();
    const normalizedBankName = (requested_bank_name || '').toString().trim();
    const normalizedAccountNumber = (requested_account_number || '').toString().trim();
    const normalizedIfscCode = (requested_ifsc_code || '').toString().trim();
    const normalizedPhone = (requested_phone || '').toString().trim();

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account' });
    }

    if (!normalizedRequestedName && !normalizedBankName && !normalizedAccountNumber && !normalizedIfscCode && !normalizedPhone) {
      return res.status(400).json({ success: false, message: 'At least one profile field is required' });
    }

    const result = await query(
      `INSERT INTO profile_update_requests (
          employee_id, requested_name, requested_bank_name, requested_account_number, requested_ifsc_code, requested_phone, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [employeeId, normalizedRequestedName || null, normalizedBankName || null, normalizedAccountNumber || null, normalizedIfscCode || null, normalizedPhone || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Profile update request submitted successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create profile update request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit profile update request' });
  }
}

async function listEmployeeProfileRequests(req, res) {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'No employee profile linked to this account' });
    }

    const result = await query(
      `SELECT * FROM profile_update_requests
       WHERE employee_id = $1
       ORDER BY requested_at DESC`,
      [employeeId]
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List employee profile requests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch your profile update requests' });
  }
}

async function listPendingProfileRequests(req, res) {
  try {
    const result = await query(
      `SELECT r.*, e.first_name, e.last_name, e.employee_code, e.department,
              e.bank_name AS current_bank_name, e.bank_account_no AS current_account_number,
              e.ifsc_code AS current_ifsc_code, e.phone AS current_phone
       FROM profile_update_requests r
       JOIN employees e ON e.employee_id = r.employee_id
       WHERE r.status = 'PENDING'
       ORDER BY r.requested_at DESC`
    );

    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List profile update requests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch profile update requests' });
  }
}

async function reviewProfileUpdateRequest(req, res) {
  try {
    const rawRequestId = req.params?.id ?? req.body?.id ?? req.body?.requestId ?? req.query?.id;
    const { status, review_note } = req.body || {};

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'APPROVED' or 'REJECTED'" });
    }

    const parsedRequestId = parseInt(rawRequestId, 10);
    if (Number.isNaN(parsedRequestId) || parsedRequestId <= 0) {
      return res.status(400).json({ success: false, message: 'Profile update request ID is required and must be a positive integer' });
    }

    const reviewedBy = Number(req.user?.userId ?? req.user?.id ?? 0);
    if (!Number.isInteger(reviewedBy) || reviewedBy <= 0) {
      return res.status(401).json({ success: false, message: 'Authenticated admin user is required' });
    }

    const reviewStatus = status;
    const reviewNote = typeof review_note === 'string' ? review_note : null;

    const requestResult = await query(`SELECT * FROM profile_update_requests WHERE id = $1`, [parsedRequestId]);
    if (requestResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Profile update request not found' });
    }

    const request = requestResult.rows[0];
    if (request.status !== 'PENDING') {
      return res.status(409).json({ success: false, message: 'This request has already been processed' });
    }

    const parsedRequestedName = request.requested_name ? request.requested_name.trim() : '';
    const nameParts = parsedRequestedName ? parsedRequestedName.split(/\s+/).filter(Boolean) : [];
    const approvedFirstName = parsedRequestedName && nameParts.length > 0 ? nameParts[0] : null;
    const approvedLastName = parsedRequestedName && nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    if (reviewStatus === 'APPROVED') {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const updatedRequest = await client.query(
          `UPDATE profile_update_requests
           SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3
           WHERE id = $4 RETURNING *`,
          [reviewStatus, reviewedBy, reviewNote, parsedRequestId]
        );

        await client.query(
          `UPDATE employees
           SET bank_name = CASE WHEN $1::text IS NULL OR $1::text = '' THEN bank_name ELSE $1::varchar(100) END,
               bank_account_no = CASE WHEN $2::text IS NULL OR $2::text = '' THEN bank_account_no ELSE $2::varchar(40) END,
               ifsc_code = CASE WHEN $3::text IS NULL OR $3::text = '' THEN ifsc_code ELSE $3::varchar(20) END,
               phone = CASE WHEN $4::text IS NULL OR $4::text = '' THEN phone ELSE $4::varchar(20) END,
               first_name = CASE WHEN $6::text IS NULL OR $6::text = '' THEN first_name ELSE $6::varchar(100) END,
               last_name = CASE WHEN $7::text IS NULL OR $7::text = '' THEN last_name ELSE $7::varchar(100) END,
               updated_at = NOW()
           WHERE employee_id = $5::integer`,
          [
            request.requested_bank_name ?? null,
            request.requested_account_number ?? null,
            request.requested_ifsc_code ?? null,
            request.requested_phone ?? null,
            request.employee_id,
            approvedFirstName,
            approvedLastName
          ]
        );

        await client.query('COMMIT');

        const employeeInfo = await query(
          `SELECT e.first_name, e.last_name, u.email
           FROM employees e
           JOIN users u ON u.user_id = e.user_id
           WHERE e.employee_id = $1`,
          [request.employee_id]
        );

        if (employeeInfo.rowCount > 0) {
          try {
            await sendProfileUpdateNotification(
              employeeInfo.rows[0].email,
              `${employeeInfo.rows[0].first_name} ${employeeInfo.rows[0].last_name}`,
              reviewStatus,
              reviewNote
            );
          } catch (emailError) {
            console.error('Profile update notification email failed:', emailError.message);
          }
        }

        return res.status(200).json({ success: true, message: 'Profile update request approved', data: updatedRequest.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const updatedRequest = await query(
      `UPDATE profile_update_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3
       WHERE id = $4 RETURNING *`,
      [reviewStatus, reviewedBy, reviewNote, parsedRequestId]
    );

    const employeeInfo = await query(
      `SELECT e.first_name, e.last_name, u.email
       FROM employees e
       JOIN users u ON u.user_id = e.user_id
       WHERE e.employee_id = $1`,
      [request.employee_id]
    );

    if (employeeInfo.rowCount > 0) {
      try {
        await sendProfileUpdateNotification(
          employeeInfo.rows[0].email,
          `${employeeInfo.rows[0].first_name} ${employeeInfo.rows[0].last_name}`,
          reviewStatus,
          reviewNote
        );
      } catch (emailError) {
        console.error('Profile update notification email failed:', emailError.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Profile update request rejected', data: updatedRequest.rows[0] });
  } catch (error) {
    console.error('Review profile update request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to review profile update request' });
  }
}

module.exports = {
  createProfileUpdateRequest,
  listEmployeeProfileRequests,
  listPendingProfileRequests,
  reviewProfileUpdateRequest
};
