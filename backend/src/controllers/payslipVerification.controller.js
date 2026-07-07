const crypto = require('crypto');
const QRCode = require('qrcode');
const { query } = require('../config/db');
require('dotenv').config();

const COMPANY_NAME = process.env.COMPANY_NAME || 'Payroll Management System';
const APP_BASE_URL = process.env.APP_URL || process.env.BASE_URL || 'http://localhost:5000';

function generatePayslipHash(payslipId, employeeId, generatedAt) {
  return crypto.createHash('sha256').update(`${payslipId}:${employeeId}:${generatedAt}:${COMPANY_NAME}`).digest('hex');
}

async function createPayslipLedgerEntry(payslipRecord) {
  const hash = generatePayslipHash(payslipRecord.payslip_id, payslipRecord.employee_id, payslipRecord.generated_at);

  const result = await query(
    `INSERT INTO payslip_ledger (payslip_id, employee_id, generated_at, verification_hash, company_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (payslip_id) DO UPDATE SET
       employee_id = EXCLUDED.employee_id,
       generated_at = EXCLUDED.generated_at,
       verification_hash = EXCLUDED.verification_hash,
       company_name = EXCLUDED.company_name
     RETURNING *`,
    [payslipRecord.payslip_id, payslipRecord.employee_id, payslipRecord.generated_at, hash, COMPANY_NAME]
  );

  return result.rows[0];
}

async function generatePayslipVerificationQrCode(ledgerEntry) {
  const verificationHash = ledgerEntry?.verification_hash || ledgerEntry?.verificationHash;
  if (!verificationHash) {
    return { verificationHash: null, verificationUrl: null, qrCodeDataUrl: null };
  }

  const verificationUrl = `${APP_BASE_URL}/api/payslip/verify/${verificationHash}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

  return { verificationHash, verificationUrl, qrCodeDataUrl };
}

async function verifyPayslip(req, res) {
  try {
    const { hash } = req.params;

    if (!hash) {
      return res.status(400).json({ success: false, message: 'Verification hash is required' });
    }

    const result = await query(
      `SELECT l.*, e.first_name, e.last_name, e.employee_code
       FROM payslip_ledger l
       JOIN employees e ON e.employee_id = l.employee_id
       WHERE l.verification_hash = $1`,
      [hash]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Payslip could not be verified' });
    }

    const ledger = result.rows[0];

    return res.status(200).json({
      success: true,
      message: 'Payslip verified successfully',
      data: {
        payslipId: ledger.payslip_id,
        employeeCode: ledger.employee_code,
        employeeName: `${ledger.first_name} ${ledger.last_name}`,
        generatedAt: ledger.generated_at,
        companyName: ledger.company_name || COMPANY_NAME,
        verificationHash: ledger.verification_hash
      }
    });
  } catch (error) {
    console.error('Payslip verification error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify payslip' });
  }
}

module.exports = {
  createPayslipLedgerEntry,
  generatePayslipVerificationQrCode,
  verifyPayslip,
  generatePayslipHash
};
