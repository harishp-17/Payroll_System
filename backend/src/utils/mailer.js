const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Sends the generated payslip PDF as an email attachment to the employee.
 * @param {string} toEmail
 * @param {string} employeeName
 * @param {string} monthLabel
 * @param {string} pdfFilePath
 * @param {string} pdfFileName
 */
async function sendPayslipEmail(toEmail, employeeName, monthLabel, pdfFilePath, pdfFileName) {
  const companyName = process.env.COMPANY_NAME || process.env.SMTP_FROM_NAME || 'Payroll Desk';
  const fromName = process.env.SMTP_FROM_NAME || companyName;

  const mailOptions = {
    from: `"${fromName}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `Your Payslip for ${monthLabel}`,
    html: `
      <p>Dear ${employeeName},</p>
      <p>Please find attached your payslip for <strong>${monthLabel}</strong>.</p>
      <p>If you notice any discrepancy in your salary breakdown, please reach out to the HR/Payroll team
      within 5 working days.</p>
      <p>Regards,<br/>${companyName}</p>
    `,
    attachments: [
      {
        filename: pdfFileName,
        path: pdfFilePath,
        contentType: 'application/pdf'
      }
    ]
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { sendPayslipEmail, transporter };
