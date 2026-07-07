/**
 * Predefined ANNUAL income tax slabs.
 * These are intentionally simple, configurable slabs for a payroll demo
 * and can be replaced with the applicable statutory slabs for any jurisdiction.
 */
const ANNUAL_TAX_SLABS = [
  { upTo: 300000, rate: 0.00 },
  { upTo: 600000, rate: 0.05 },
  { upTo: 900000, rate: 0.10 },
  { upTo: 1200000, rate: 0.15 },
  { upTo: 1500000, rate: 0.20 },
  { upTo: Infinity, rate: 0.30 }
];

const PROFESSIONAL_TAX_MONTHLY = 200;

/**
 * Calculates the annual income tax payable using slab-based progressive taxation,
 * then returns the equivalent monthly tax to be deducted.
 * @param {number} annualGrossSalary
 * @returns {number} monthlyIncomeTax
 */
function calculateMonthlyIncomeTax(annualGrossSalary) {
  let remainingIncome = annualGrossSalary;
  let previousLimit = 0;
  let totalAnnualTax = 0;

  for (const slab of ANNUAL_TAX_SLABS) {
    if (remainingIncome <= 0) break;

    const slabWidth = slab.upTo - previousLimit;
    const taxableInSlab = Math.min(remainingIncome, slabWidth);

    if (taxableInSlab > 0) {
      totalAnnualTax += taxableInSlab * slab.rate;
      remainingIncome -= taxableInSlab;
    }
    previousLimit = slab.upTo;
  }

  const monthlyTax = totalAnnualTax / 12;
  return roundToTwoDecimals(monthlyTax);
}

/**
 * Computes Loss of Pay deduction for unapproved/unpaid leave days
 * taken beyond the employee's approved leave balance.
 * @param {number} monthlyGrossSalary
 * @param {number} totalWorkingDaysInMonth
 * @param {number} lopDays - number of days to be deducted as Loss of Pay
 * @returns {number} lopDeduction
 */
function calculateLopDeduction(monthlyGrossSalary, totalWorkingDaysInMonth, lopDays) {
  if (totalWorkingDaysInMonth <= 0) return 0;
  const perDaySalary = monthlyGrossSalary / totalWorkingDaysInMonth;
  return roundToTwoDecimals(perDaySalary * lopDays);
}

/**
 * Computes overtime pay based on the employee's configured hourly overtime rate.
 * @param {number} overtimeHours
 * @param {number} overtimeRatePerHour
 * @returns {number} overtimePay
 */
function calculateOvertimePay(overtimeHours, overtimeRatePerHour) {
  return roundToTwoDecimals(overtimeHours * overtimeRatePerHour);
}

/**
 * Computes the Provident Fund deduction as a percentage of base pay.
 * @param {number} basePay
 * @param {number} pfPercentage
 * @returns {number} pfDeduction
 */
function calculatePfDeduction(basePay, pfPercentage) {
  return roundToTwoDecimals((basePay * pfPercentage) / 100);
}

function roundToTwoDecimals(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = {
  ANNUAL_TAX_SLABS,
  PROFESSIONAL_TAX_MONTHLY,
  calculateMonthlyIncomeTax,
  calculateLopDeduction,
  calculateOvertimePay,
  calculatePfDeduction,
  roundToTwoDecimals
};
