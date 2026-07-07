/**
 * OTP Manager - In-memory storage for OTP codes with expiry
 * Production note: Consider using Redis for distributed systems
 */

const otpStore = new Map();

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP with expiry (default 5 minutes)
 */
function storeOTP(email, expiryMinutes = 5) {
  const otp = generateOTP();
  const expiryTime = Date.now() + (expiryMinutes * 60 * 1000);

  otpStore.set(email, {
    otp,
    expiryTime,
    attempts: 0
  });

  console.log(`OTP generated for ${email}: ${otp} (Expires at ${new Date(expiryTime)})`);
  return otp;
}

/**
 * Verify OTP
 */
function verifyOTP(email, providedOTP) {
  const otpData = otpStore.get(email);

  if (!otpData) {
    return { valid: false, message: 'No OTP found for this email' };
  }

  // Check if expired
  if (Date.now() > otpData.expiryTime) {
    otpStore.delete(email);
    return { valid: false, message: 'OTP has expired. Please request a new one.' };
  }

  // Check max attempts (3 attempts allowed)
  if (otpData.attempts >= 3) {
    otpStore.delete(email);
    return { valid: false, message: 'Maximum OTP attempts exceeded. Please request a new OTP.' };
  }

  // Verify OTP
  if (otpData.otp === providedOTP) {
    otpStore.delete(email); // Clear OTP after successful verification
    return { valid: true, message: 'OTP verified successfully' };
  }

  // Increment attempts
  otpData.attempts += 1;
  return { valid: false, message: `Invalid OTP. ${3 - otpData.attempts} attempts remaining.` };
}

/**
 * Clear OTP (for cleanup)
 */
function clearOTP(email) {
  otpStore.delete(email);
}

/**
 * Check if OTP exists for email
 */
function hasOTP(email) {
  const otpData = otpStore.get(email);
  if (!otpData) return false;
  if (Date.now() > otpData.expiryTime) {
    otpStore.delete(email);
    return false;
  }
  return true;
}

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  clearOTP,
  hasOTP
};
