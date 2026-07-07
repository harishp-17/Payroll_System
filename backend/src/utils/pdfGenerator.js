const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Generates a professional PDF payslip for a given employee and payroll record,
 * writes it to disk, and returns the absolute file path.
 *
 * @param {object} employee - employee row (first_name, last_name, employee_code, designation, department, bank details)
 * @param {object} payroll - payroll row (all salary components for the pay period)
 * @returns {Promise<string>} absoluteFilePath
 */
function generatePayslipPdf(employee, payroll, qrCodeDataUrl = null, verificationUrl = null, verificationHash = null) {
  return new Promise((resolve, reject) => {
    try {
      const storageDir = path.resolve(process.env.PAYSLIP_STORAGE_DIR || './storage/payslips');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const fileName = `Payslip_${employee.employee_code}_${payroll.pay_period_month}_${payroll.pay_period_year}.pdf`;
      const filePath = path.join(storageDir, fileName);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const monthLabel = `${MONTH_NAMES[payroll.pay_period_month - 1]} ${payroll.pay_period_year}`;

      // ---------- Header ----------
      doc
        .fontSize(20)
        .fillColor('#1e3a8a')
        .text('COMPANY PAYROLL DESK', { align: 'center' })
        .moveDown(0.2);

      doc
        .fontSize(12)
        .fillColor('#111827')
        .text(`Payslip for ${monthLabel}`, { align: 'center' })
        .moveDown(1);

      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.8);

      // ---------- Employee details ----------
      const leftColumnX = 50;
      const rightColumnX = 320;
      const detailsTop = doc.y;

      doc.fontSize(10).fillColor('#374151');
      doc.text(`Employee Name: ${employee.first_name} ${employee.last_name}`, leftColumnX, detailsTop);
      doc.text(`Employee Code: ${employee.employee_code}`, leftColumnX, detailsTop + 16);
      doc.text(`Designation: ${employee.designation}`, leftColumnX, detailsTop + 32);
      doc.text(`Department: ${employee.department}`, leftColumnX, detailsTop + 48);

      doc.text(`Bank Name: ${employee.bank_name || 'N/A'}`, rightColumnX, detailsTop);
      doc.text(`Account No: ${employee.bank_account_no || 'N/A'}`, rightColumnX, detailsTop + 16);
      doc.text(`PAN: ${employee.pan_number || 'N/A'}`, rightColumnX, detailsTop + 32);
      doc.text(`Working Days: ${payroll.working_days} | LOP Days: ${payroll.lop_days}`, rightColumnX, detailsTop + 48);

      doc.moveDown(4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.8);

      // ---------- Earnings & Deductions table ----------
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 260;
      const col3 = 320;
      const col4 = 530;

      doc.fontSize(11).fillColor('#1e3a8a');
      doc.text('EARNINGS', col1, tableTop);
      doc.text('AMOUNT', col2, tableTop, { width: 60, align: 'right' });
      doc.text('DEDUCTIONS', col3, tableTop);
      doc.text('AMOUNT', col4 - 60, tableTop, { width: 60, align: 'right' });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.3);

      const earnings = [
        ['Base Pay', payroll.base_pay],
        ['HRA', payroll.hra],
        ['Conveyance Allowance', payroll.conveyance_allowance],
        ['Medical Allowance', payroll.medical_allowance],
        ['Special Allowance', payroll.special_allowance],
        ['Overtime Pay', payroll.overtime_pay]
      ];

      const deductions = [
        ['Provident Fund (PF)', payroll.pf_deduction],
        ['Income Tax (TDS)', payroll.income_tax],
        ['Professional Tax', payroll.professional_tax],
        ['Loss of Pay (LOP)', payroll.lop_deduction]
      ];

      const rowCount = Math.max(earnings.length, deductions.length);
      let rowY = doc.y;
      doc.fontSize(10).fillColor('#111827');

      for (let i = 0; i < rowCount; i++) {
        const earningRow = earnings[i];
        const deductionRow = deductions[i];

        if (earningRow) {
          doc.text(earningRow[0], col1, rowY);
          doc.text(formatCurrency(earningRow[1]), col2, rowY, { width: 60, align: 'right' });
        }
        if (deductionRow) {
          doc.text(deductionRow[0], col3, rowY);
          doc.text(formatCurrency(deductionRow[1]), col4 - 60, rowY, { width: 60, align: 'right' });
        }
        rowY += 20;
      }

      doc.y = rowY + 10;
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d1d5db').stroke();
      doc.moveDown(0.8);

      // ---------- Totals ----------
      doc.fontSize(11).fillColor('#1e3a8a');
      doc.text('Gross Salary', col1, doc.y);
      doc.text(formatCurrency(payroll.gross_salary), col2, doc.y - 12, { width: 60, align: 'right' });
      doc.moveDown(0.6);

      doc.text('Total Deductions', col1, doc.y);
      doc.text(formatCurrency(payroll.total_deductions), col2, doc.y - 12, { width: 60, align: 'right' });
      doc.moveDown(1);

      doc
        .fontSize(14)
        .fillColor('#065f46')
        .text(`NET SALARY: ${formatCurrency(payroll.net_salary)}`, col1, doc.y, { align: 'left' });

      doc.moveDown(2);
      if (qrCodeDataUrl) {
        try {
          const qrImageBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
          const qrY = doc.y + 5;
          doc.image(qrImageBuffer, 440, qrY, { width: 70, height: 70 });
          doc.fontSize(8).fillColor('#6b7280').text('Verify payslip', 440, qrY + 78, { width: 70, align: 'center' });
        } catch (imageError) {
          console.error('Failed to embed QR code into payslip PDF:', imageError.message);
        }
      }

      doc.moveDown(0.6);
      doc
        .fontSize(8)
        .fillColor('#9ca3af')
        .text('This is a system-generated payslip and does not require a signature.', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

function formatCurrency(value) {
  const numericValue = Number(value) || 0;
  return numericValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { generatePayslipPdf };
