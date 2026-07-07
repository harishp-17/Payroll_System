const express = require('express');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { authenticate, authorize, authorizeSelfOrAdmin } = require('../middleware/auth');
const {
  calculateMonthlyIncomeTax,
  calculateLopDeduction,
  calculateOvertimePay,
  calculatePfDeduction,
  roundToTwoDecimals,
  PROFESSIONAL_TAX_MONTHLY
} = require('../utils/taxCalculator');
const { generatePayslipPdf } = require('../utils/pdfGenerator');
const { sendPayslipEmail } = require('../utils/mailer');
const { createPayslipLedgerEntry, generatePayslipVerificationQrCode } = require('../controllers/payslipVerification.controller');

const router = express.Router();

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Internal helper: computes the full salary breakdown for one employee for one pay period.
 * Fetches base pay & allowances from the employees table, attendance for overtime,
 * and unapproved/unpaid leave days for LOP -- exactly as required by the spec.
 */
async function computePayrollBreakdown(employeeId, month, year) {
  const employeeResult = await query(`SELECT * FROM employees WHERE employee_id = $1`, [employeeId]);
  if (employeeResult.rowCount === 0) {
    throw { statusCode: 404, message: 'Employee not found' };
  }
  const employee = employeeResult.rows[0];

  // Total standard working days in the month (excluding weekends, simplified as calendar days minus Sundays)
  const daysInMonth = new Date(year, month, 0).getDate();
  let standardWorkingDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() !== 0) standardWorkingDays += 1; // exclude Sundays
  }

  // Attendance-based totals: overtime hours and days marked ABSENT (unapproved / not covered by leave)
  const attendanceResult = await query(
    `SELECT
        COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
        COUNT(*) FILTER (WHERE status = 'ABSENT') AS absent_days,
        COUNT(*) FILTER (WHERE status = 'PRESENT') AS present_days
     FROM attendance
     WHERE employee_id = $1
       AND EXTRACT(MONTH FROM work_date) = $2
       AND EXTRACT(YEAR FROM work_date) = $3`,
    [employeeId, month, year]
  );
  const attendanceSummary = attendanceResult.rows[0];

  // Unpaid/rejected/pending leave days in the period count towards Loss of Pay
  const unpaidLeaveResult = await query(
    `SELECT COALESCE(SUM(total_days), 0) AS unpaid_days
     FROM leaves
     WHERE employee_id = $1
       AND (leave_type = 'UNPAID' OR status IN ('REJECTED'))
       AND EXTRACT(MONTH FROM start_date) = $2
       AND EXTRACT(YEAR FROM start_date) = $3`,
    [employeeId, month, year]
  );
  const unpaidLeaveDays = Number(unpaidLeaveResult.rows[0].unpaid_days) || 0;

  const absentDays = Number(attendanceSummary.absent_days) || 0;
  const lopDays = roundToTwoDecimals(absentDays + unpaidLeaveDays);
  const overtimeHours = Number(attendanceSummary.total_overtime_hours) || 0;

  // ---- Earnings ----
  const basePay = Number(employee.base_pay);
  const hra = Number(employee.hra);
  const conveyanceAllowance = Number(employee.conveyance_allowance);
  const medicalAllowance = Number(employee.medical_allowance);
  const specialAllowance = Number(employee.special_allowance);
  const overtimePay = calculateOvertimePay(overtimeHours, Number(employee.overtime_rate_per_hour));

  const grossSalary = roundToTwoDecimals(
    basePay + hra + conveyanceAllowance + medicalAllowance + specialAllowance + overtimePay
  );

  // ---- Deductions ----
  const lopDeduction = calculateLopDeduction(grossSalary, standardWorkingDays, lopDays);
  const pfDeduction = calculatePfDeduction(basePay, Number(employee.pf_percentage));
  const annualGrossForTax = grossSalary * 12;
  const incomeTax = calculateMonthlyIncomeTax(annualGrossForTax);
  const professionalTax = PROFESSIONAL_TAX_MONTHLY;

  const totalDeductions = roundToTwoDecimals(lopDeduction + pfDeduction + incomeTax + professionalTax);
  const netSalary = roundToTwoDecimals(grossSalary - totalDeductions);

  return {
    employee,
    breakdown: {
      pay_period_month: month,
      pay_period_year: year,
      working_days: standardWorkingDays,
      lop_days: lopDays,
      overtime_hours: overtimeHours,
      base_pay: basePay,
      hra,
      conveyance_allowance: conveyanceAllowance,
      medical_allowance: medicalAllowance,
      special_allowance: specialAllowance,
      overtime_pay: overtimePay,
      gross_salary: grossSalary,
      lop_deduction: lopDeduction,
      pf_deduction: pfDeduction,
      income_tax: incomeTax,
      professional_tax: professionalTax,
      total_deductions: totalDeductions,
      net_salary: netSalary
    }
  };
}

/**
 * POST /api/payroll/calculate/:employeeId
 * Body: { month: 6, year: 2026 }
 * Dynamically calculates and PERSISTS (upserts) the payroll breakdown for one employee.
 * This is the core payroll calculation endpoint required by the spec.
 */
router.post('/calculate/:employeeId', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const month = Number(req.body.month) || new Date().getMonth() + 1;
    const year = Number(req.body.year) || new Date().getFullYear();

    const { breakdown } = await computePayrollBreakdown(employeeId, month, year);

    const upsertResult = await query(
      `INSERT INTO payroll (
          employee_id, pay_period_month, pay_period_year, working_days, lop_days, overtime_hours,
          base_pay, hra, conveyance_allowance, medical_allowance, special_allowance, overtime_pay,
          gross_salary, lop_deduction, pf_deduction, income_tax, professional_tax, total_deductions,
          net_salary, status, processed_at
       ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PROCESSED',NOW()
       )
       ON CONFLICT (employee_id, pay_period_month, pay_period_year)
       DO UPDATE SET
          working_days = EXCLUDED.working_days,
          lop_days = EXCLUDED.lop_days,
          overtime_hours = EXCLUDED.overtime_hours,
          base_pay = EXCLUDED.base_pay,
          hra = EXCLUDED.hra,
          conveyance_allowance = EXCLUDED.conveyance_allowance,
          medical_allowance = EXCLUDED.medical_allowance,
          special_allowance = EXCLUDED.special_allowance,
          overtime_pay = EXCLUDED.overtime_pay,
          gross_salary = EXCLUDED.gross_salary,
          lop_deduction = EXCLUDED.lop_deduction,
          pf_deduction = EXCLUDED.pf_deduction,
          income_tax = EXCLUDED.income_tax,
          professional_tax = EXCLUDED.professional_tax,
          total_deductions = EXCLUDED.total_deductions,
          net_salary = EXCLUDED.net_salary,
          status = 'PROCESSED',
          processed_at = NOW()
       RETURNING *`,
      [
        employeeId, month, year, breakdown.working_days, breakdown.lop_days, breakdown.overtime_hours,
        breakdown.base_pay, breakdown.hra, breakdown.conveyance_allowance, breakdown.medical_allowance,
        breakdown.special_allowance, breakdown.overtime_pay, breakdown.gross_salary, breakdown.lop_deduction,
        breakdown.pf_deduction, breakdown.income_tax, breakdown.professional_tax, breakdown.total_deductions,
        breakdown.net_salary
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Payroll calculated successfully',
      data: upsertResult.rows[0]
    });
  } catch (err) {
    console.error('Payroll calculation error:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message || 'Failed to calculate payroll' });
  }
});

/**
 * GET /api/payroll/summary?month=6&year=2026
 * Admin-only: returns the payroll summary for ALL employees for the Payroll Processing Hub table.
 * Employees who have not yet been calculated for this period get a live preview computed on the fly.
 */
router.get('/summary', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();

    const employeesResult = await query(`SELECT employee_id FROM employees WHERE is_active = TRUE ORDER BY employee_id`);
    const summaries = [];

    for (const row of employeesResult.rows) {
      const existingPayroll = await query(
        `SELECT p.*, e.first_name, e.last_name, e.employee_code, e.department
         FROM payroll p JOIN employees e ON e.employee_id = p.employee_id
         WHERE p.employee_id = $1 AND p.pay_period_month = $2 AND p.pay_period_year = $3`,
        [row.employee_id, month, year]
      );

      if (existingPayroll.rowCount > 0) {
        summaries.push(existingPayroll.rows[0]);
      } else {
        const { employee, breakdown } = await computePayrollBreakdown(row.employee_id, month, year);
        summaries.push({
          employee_id: employee.employee_id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          employee_code: employee.employee_code,
          department: employee.department,
          status: 'DRAFT',
          ...breakdown
        });
      }
    }

    return res.status(200).json({ success: true, data: summaries });
  } catch (err) {
    console.error('Payroll summary error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch payroll summary' });
  }
});

/**
 * POST /api/payroll/process-and-email/:employeeId
 * Body: { month: 6, year: 2026 }
 * Admin triggers final payroll approval: recalculates, generates a PDF payslip
 * via pdfkit, stores it, and emails it to the employee via nodemailer.
 */
router.post('/process-and-email/:employeeId', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const month = Number(req.body.month) || new Date().getMonth() + 1;
    const year = Number(req.body.year) || new Date().getFullYear();

    const { employee, breakdown } = await computePayrollBreakdown(employeeId, month, year);

    const payrollUpsert = await query(
      `INSERT INTO payroll (
          employee_id, pay_period_month, pay_period_year, working_days, lop_days, overtime_hours,
          base_pay, hra, conveyance_allowance, medical_allowance, special_allowance, overtime_pay,
          gross_salary, lop_deduction, pf_deduction, income_tax, professional_tax, total_deductions,
          net_salary, status, processed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PROCESSED',NOW())
       ON CONFLICT (employee_id, pay_period_month, pay_period_year)
       DO UPDATE SET
          working_days = EXCLUDED.working_days, lop_days = EXCLUDED.lop_days,
          overtime_hours = EXCLUDED.overtime_hours, base_pay = EXCLUDED.base_pay, hra = EXCLUDED.hra,
          conveyance_allowance = EXCLUDED.conveyance_allowance, medical_allowance = EXCLUDED.medical_allowance,
          special_allowance = EXCLUDED.special_allowance, overtime_pay = EXCLUDED.overtime_pay,
          gross_salary = EXCLUDED.gross_salary, lop_deduction = EXCLUDED.lop_deduction,
          pf_deduction = EXCLUDED.pf_deduction, income_tax = EXCLUDED.income_tax,
          professional_tax = EXCLUDED.professional_tax, total_deductions = EXCLUDED.total_deductions,
          net_salary = EXCLUDED.net_salary, status = 'PROCESSED', processed_at = NOW()
       RETURNING *`,
      [
        employeeId, month, year, breakdown.working_days, breakdown.lop_days, breakdown.overtime_hours,
        breakdown.base_pay, breakdown.hra, breakdown.conveyance_allowance, breakdown.medical_allowance,
        breakdown.special_allowance, breakdown.overtime_pay, breakdown.gross_salary, breakdown.lop_deduction,
        breakdown.pf_deduction, breakdown.income_tax, breakdown.professional_tax, breakdown.total_deductions,
        breakdown.net_salary
      ]
    );

    const payrollRecord = payrollUpsert.rows[0];

    const pdfFileName = `Payslip_${employee.employee_code}_${payrollRecord.pay_period_month}_${payrollRecord.pay_period_year}.pdf`;
    const pdfFilePath = path.join(path.resolve(process.env.PAYSLIP_STORAGE_DIR || './storage/payslips'), pdfFileName);

    await query(
      `INSERT INTO payslips (payroll_id, file_name, file_path)
       VALUES ($1, $2, $3)
       ON CONFLICT (payroll_id) DO UPDATE SET file_name = EXCLUDED.file_name, file_path = EXCLUDED.file_path, generated_at = NOW()`,
      [payrollRecord.payroll_id, pdfFileName, pdfFilePath]
    );

    const payslipResult = await query(`SELECT * FROM payslips WHERE payroll_id = $1`, [payrollRecord.payroll_id]);
    const ledgerEntry = await createPayslipLedgerEntry(payslipResult.rows[0]);
    const verificationData = await generatePayslipVerificationQrCode(ledgerEntry);

    const finalPdfFilePath = await generatePayslipPdf(
      employee,
      payrollRecord,
      verificationData.qrCodeDataUrl,
      verificationData.verificationUrl,
      verificationData.verificationHash
    );
    const finalPdfFileName = path.basename(finalPdfFilePath);

    await query(
      `UPDATE payslips SET file_name = $1, file_path = $2 WHERE payroll_id = $3`,
      [finalPdfFileName, finalPdfFilePath, payrollRecord.payroll_id]
    );

    const userEmailResult = await query(
      `SELECT u.email FROM users u WHERE u.user_id = (SELECT user_id FROM employees WHERE employee_id = $1)`,
      [employeeId]
    );

    if (userEmailResult.rowCount > 0 && userEmailResult.rows[0].email) {
      const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
      await sendPayslipEmail(
        userEmailResult.rows[0].email,
        `${employee.first_name} ${employee.last_name}`,
        monthLabel,
        finalPdfFilePath,
        finalPdfFileName
      );

      await query(
        `UPDATE payslips SET emailed = TRUE, emailed_at = NOW() WHERE payroll_id = $1`,
        [payrollRecord.payroll_id]
      );
      await query(`UPDATE payroll SET status = 'EMAILED' WHERE payroll_id = $1`, [payrollRecord.payroll_id]);
    }

    return res.status(200).json({
      success: true,
      message: 'Payroll processed, payslip generated and emailed successfully',
      data: {
        payroll: payrollRecord,
        payslipFile: finalPdfFileName,
        qrCodeDataUrl: verificationData.qrCodeDataUrl,
        verificationUrl: verificationData.verificationUrl,
        verificationHash: verificationData.verificationHash
      }
    });
  } catch (err) {
    console.error('Process and email payroll error:', err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message || 'Failed to process payroll' });
  }
});

/**
 * GET /api/payroll/history/:employeeId
 * Returns all past processed payroll records for an employee (Digital Payslip Archive).
 */
router.get('/history/:employeeId', authenticate, authorizeSelfOrAdmin, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await query(
      `SELECT p.*, ps.file_name, ps.emailed, ps.emailed_at
       FROM payroll p
       LEFT JOIN payslips ps ON ps.payroll_id = p.payroll_id
       WHERE p.employee_id = $1
       ORDER BY p.pay_period_year DESC, p.pay_period_month DESC`,
      [employeeId]
    );
    return res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Payroll history error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch payroll history' });
  }
});

/**
 * GET /api/payroll/payslip/:payrollId/download
 * Streams the generated PDF payslip file to the requesting (authorized) user.
 */
router.get('/payslip/:payrollId/download', authenticate, async (req, res) => {
  try {
    const { payrollId } = req.params;

    const payslipResult = await query(
      `SELECT ps.file_path, ps.file_name, p.employee_id
       FROM payslips ps JOIN payroll p ON p.payroll_id = ps.payroll_id
       WHERE ps.payroll_id = $1`,
      [payrollId]
    );

    if (payslipResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Payslip not found. Process payroll first.' });
    }

    const payslip = payslipResult.rows[0];

    if (req.user.role !== 'ADMIN' && req.user.employeeId !== payslip.employee_id) {
      return res.status(403).json({ success: false, message: 'You cannot access this payslip' });
    }

    if (!fs.existsSync(payslip.file_path)) {
      return res.status(404).json({ success: false, message: 'Payslip file missing on server' });
    }

    return res.download(payslip.file_path, payslip.file_name);
  } catch (err) {
    console.error('Payslip download error:', err);
    return res.status(500).json({ success: false, message: 'Failed to download payslip' });
  }
});

module.exports = router;
