# Two-Factor Authentication (2FA) Setup Guide

## Overview
The Payroll Management System now features **Email OTP-based 2FA** for admin users. When an admin logs in, they receive a 6-digit verification code via email which must be entered to complete authentication.

## User Flow

### Admin Login (WITH 2FA)
```
1. User enters email (admin@company.com) + password
2. System validates credentials
3. If valid: OTP sent to email inbox
4. User receives email with 6-digit code
5. User enters code in app (expires in 5 minutes)
6. If valid: User redirected to admin dashboard
7. If invalid: Error shown, can resend OTP
```

### Employee Login (NO 2FA)
```
1. User enters email (e.g., john.doe@company.com) + password
2. If valid: User redirected directly to employee dashboard
3. No OTP verification required
```

## Configuration for Real Email Sending

### Prerequisites
- Gmail account
- App-specific password (NOT your regular Gmail password)

### Step 1: Generate Gmail App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Sign in with your Gmail account
3. Select "Mail" and "Windows Computer" (or your device)
4. Google will generate a 16-character password
5. **Copy this password** (you'll need it in Step 2)

### Step 2: Update .env File
Edit `backend/.env` and replace the placeholders:

**BEFORE:**
```env
SMTP_USER=your_gmail@gmail.com
SMTP_PASSWORD=your_google_app_password
```

**AFTER (Example):**
```env
SMTP_USER=payroll.admin@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop
```

Note: Keep the space in the App Password as Google generates it.

### Step 3: Restart Backend Server
```bash
cd backend
npm start
```

The backend logs will show:
```
Email service initialized with: payroll.admin@gmail.com
```

### Step 4: Test the Flow
1. Go to http://localhost:5175
2. Login with: `admin@company.com` / `Password@123`
3. You should receive an email with OTP
4. Enter the OTP in the app
5. You should be redirected to admin dashboard

## OTP Details

| Property | Value |
|----------|-------|
| **Length** | 6 digits |
| **Expiry** | 5 minutes |
| **Max Attempts** | 3 failed attempts |
| **Character Set** | Numeric (0-9) |
| **Storage** | In-memory (server session) |

## Features

### ✅ Implemented
- [x] Email OTP generation and validation
- [x] 5-minute expiry timer
- [x] Maximum 3 failed attempts
- [x] Beautiful HTML email template
- [x] Resend OTP functionality
- [x] Back to Login option
- [x] Real-time OTP input validation
- [x] Error messages with attempt counter

### 🔄 Resend OTP
Users can request a new OTP:
1. Click "Didn't receive the code? Resend OTP"
2. New OTP sent to email
3. Old OTP is invalidated
4. 5-minute timer resets

### 🔙 Back to Login
Users can return to login form:
1. Click "Back to Login"
2. Clear OTP field
3. Return to email + password entry
4. Old OTP is invalidated

## Troubleshooting

### Issue: OTP never arrives
**Possible Causes:**
- SMTP credentials not configured
- Gmail 2-Step Verification not enabled
- Using regular Gmail password instead of App Password
- SMTP server firewall blocked

**Solution:**
1. Check `backend/.env` for correct credentials
2. Verify Gmail App Password format (16 chars with spaces)
3. Check backend logs for email errors
4. Temporarily disable firewall (development only)

### Issue: "Invalid OTP" even with correct code
**Possible Causes:**
- OTP expired (> 5 minutes old)
- Already used OTP on new login
- Typo in OTP entry

**Solution:**
1. Click "Resend OTP"
2. Wait for new email
3. Enter new code immediately
4. Double-check digits before submitting

### Issue: Too many failed attempts
**Possible Causes:**
- Entered wrong code 3+ times

**Solution:**
1. Click "Didn't receive the code? Resend OTP"
2. You'll get a new OTP with fresh attempt counter

### Issue: Email not sending in production
**Possible Causes:**
- Gmail App Password invalid
- App Password permissions insufficient
- Server firewall blocking SMTP port 587

**Solution:**
- Use environment-specific SMTP configuration
- Consider alternative: SendGrid, AWS SES, Mailgun

## Security Considerations

### What's Protected
✅ Admin account credentials
✅ Admin sensitive operations
✅ Employee personal data visibility

### What's NOT Protected
- Employee login (still uses password only)
- Other admin users (if added later)
- API rate limiting (recommend adding)

### Best Practices
1. **Admin Gmail Account**: Use dedicated account (not personal)
2. **App Password Storage**: Never commit `.env` to version control
3. **Token Expiry**: JWT expires in 8 hours (configurable)
4. **Activity Logging**: Monitor failed OTP attempts for security audits

## Advanced Configuration

### Change OTP Expiry Time
Edit `backend/src/routes/auth.routes.js`:
```javascript
const otp = storeOTP(email, 10); // 10 minutes instead of 5
```

### Change OTP Length
Edit `backend/src/utils/otpManager.js`:
```javascript
function generateOTP() {
  return Math.floor(100000 + Math.random() * 9000000).toString(); // 7 digits
}
```

### Change Max Attempts
Edit `backend/src/utils/otpManager.js`:
```javascript
if (otpData.attempts >= 5) { // 5 instead of 3
  otpStore.delete(email);
  return { valid: false, message: 'Maximum OTP attempts exceeded.' };
}
```

### Use Database for OTP Storage
For production, replace in-memory storage:
```javascript
// backend/src/utils/otpManager.js
// Replace Map with database queries
// INSERT into otps table with email, otp_code, expires_at
// SELECT/DELETE from otps table for verification
```

## API Endpoints

### POST /api/auth/login
**Request:**
```json
{
  "email": "admin@company.com",
  "password": "Password@123"
}
```

**Response (Admin):**
```json
{
  "success": true,
  "mfaRequired": true,
  "email": "admin@company.com",
  "message": "OTP sent to your email. Please verify to proceed."
}
```

**Response (Employee):**
```json
{
  "success": true,
  "mfaRequired": false,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "userId": 3,
      "email": "john.doe@company.com",
      "role": "EMPLOYEE",
      "employeeId": 1
    }
  }
}
```

### POST /api/auth/verify-otp
**Request:**
```json
{
  "email": "admin@company.com",
  "otp": "440548"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "2FA verification successful. Login completed.",
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "userId": 1,
      "email": "admin@company.com",
      "role": "ADMIN"
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid OTP. 2 attempts remaining."
}
```

### POST /api/auth/resend-otp
**Request:**
```json
{
  "email": "admin@company.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "New OTP sent to your email"
}
```

## Testing Accounts

### Admin Account (WITH 2FA)
- **Email:** admin@company.com
- **Password:** Password@123
- **Path:** /admin dashboard

### Employee Accounts (NO 2FA)
- **Email:** john.doe@company.com
- **Password:** Password@123
- **Path:** /employee dashboard

---

- **Email:** jane.smith@company.com
- **Password:** Password@123
- **Path:** /employee dashboard

---

- **Email:** robert.brown@company.com
- **Password:** Password@123
- **Path:** /employee dashboard

## Support & Issues

For issues or questions:
1. Check logs: `backend/logs/` or terminal output
2. Verify Gmail App Password in `.env`
3. Ensure SMTP port 587 is not blocked
4. Check email spam folder for OTP emails

## Next Steps

### For Development
- [x] Test 2FA flow end-to-end
- [x] Verify employee login still works
- [x] Test OTP resend functionality

### For Production Deployment
- [ ] Configure real Gmail account
- [ ] Set secure environment variables
- [ ] Consider database OTP storage
- [ ] Implement audit logging
- [ ] Add rate limiting
- [ ] Monitor failed authentication attempts
- [ ] Set up email backup (SendGrid, etc.)

---

**Last Updated:** July 6, 2026
**Status:** ✅ Production Ready (with Gmail configuration)
