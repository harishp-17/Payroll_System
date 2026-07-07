# Two-Factor Authentication - Technical Implementation Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Login.jsx (Component)                                       │
│  ├── handleLoginSubmit() → AuthContext.login()              │
│  ├── Detects mfaRequired flag                               │
│  ├── Shows OTP form if needed                               │
│  └── handleOtpSubmit() → AuthContext.verifyOtp()            │
│                                                               │
│  AuthContext.jsx (State Management)                         │
│  ├── login(email, password)                                 │
│  │   └── Returns {mfaRequired, email} for admin            │
│  ├── verifyOtp(email, otp)                                  │
│  │   └── Returns user data with JWT token                  │
│  └── resendOtp(email)                                       │
│      └── Requests fresh OTP from backend                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP (Axios)
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Node.js + Express)               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  auth.routes.js                                              │
│  ├── POST /api/auth/login                                   │
│  │   ├── Query user from database                           │
│  │   ├── Validate password with bcrypt                      │
│  │   ├── If admin:                                          │
│  │   │   ├── Call storeOTP() → generates 6-digit code      │
│  │   │   ├── Call sendOTPEmail() → via nodemailer          │
│  │   │   └── Return {mfaRequired: true, email}             │
│  │   └── Else (employee):                                   │
│  │       └── Return JWT + user data (normal flow)          │
│  │                                                           │
│  ├── POST /api/auth/verify-otp                              │
│  │   ├── Call verifyOTP() → validates code & expiry        │
│  │   ├── If valid:                                          │
│  │   │   ├── Query user again from database                │
│  │   │   ├── Generate JWT with user claims                 │
│  │   │   └── Return token + user data                      │
│  │   └── Else: Return 401 error                            │
│  │                                                           │
│  └── POST /api/auth/resend-otp                              │
│      ├── Validate user is admin                            │
│      ├── Generate new OTP (invalidates old)                │
│      ├── Send fresh email                                  │
│      └── Return success message                            │
│                                                               │
│  otpManager.js (Utility)                                     │
│  ├── generateOTP() → creates 6-digit string               │
│  ├── storeOTP(email, minutes) → saves to Map              │
│  ├── verifyOTP(email, code) → validates code & expiry     │
│  ├── clearOTP(email) → removes from storage               │
│  └── hasOTP(email) → checks if exists & not expired       │
│                                                               │
│  emailService.js (Utility)                                   │
│  ├── initializeEmailService() → creates nodemailer         │
│  ├── sendOTPEmail(email, otp) → sends HTML email          │
│  └── testEmailConfig() → verifies SMTP connection         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            ↕ 
        ┌─────────────────────────────────────────┐
        │    External Service: Gmail SMTP         │
        │    (via nodemailer, port 587, TLS)      │
        └─────────────────────────────────────────┘
```

## Data Flow Diagrams

### Successful Admin 2FA Login

```
User Input                    Frontend                       Backend
  │                             │                              │
  ├─ Email + Password ──────────→ Login.jsx                    │
  │                             │ handleLoginSubmit()          │
  │                             └──────→ POST /auth/login ────→ auth.routes.js
  │                                                  │
  │                                                  ├─ Query users table
  │                                                  ├─ Validate password
  │                                                  ├─ Detect ADMIN role
  │                                                  ├─ storeOTP()
  │                                                  ├─ sendOTPEmail()
  │                         ┌──────────────────────┘
  │                         │ {mfaRequired: true}
  │                         │
  │ ← ← ← ← ← ← ← ← ← ← ← ←│ setMfaRequired(true)
  │                         │
  │ Show OTP Form ← ← ← ← ←│
  │                         │
  ├─ Enter 6-digit OTP ────→ Login.jsx
  │                         │ handleOtpSubmit()
  │                         └──────→ POST /auth/verify-otp ──→ auth.routes.js
  │                                                  │
  │                                                  ├─ verifyOTP()
  │                                                  ├─ JWT sign()
  │                                                  ├─ Store token in DB log (optional)
  │                         ┌──────────────────────┘
  │                         │ {token, user}
  │                         │
  │ ← ← ← ← ← ← ← ← ← ← ← ←│ localStorage.setItem()
  │                         │ navigate('/admin')
  │                         │
  └─ Admin Dashboard ← ← ← ←│
```

### Employee Direct Login (No 2FA)

```
User Input                    Frontend                       Backend
  │                             │                              │
  ├─ Email + Password ──────────→ Login.jsx                    │
  │                             │ handleLoginSubmit()          │
  │                             └──────→ POST /auth/login ────→ auth.routes.js
  │                                                  │
  │                                                  ├─ Query users table
  │                                                  ├─ Validate password
  │                                                  ├─ Detect EMPLOYEE role
  │                                                  ├─ JWT sign()
  │                         ┌──────────────────────┘
  │                         │ {token, user, mfaRequired: false}
  │                         │
  │ ← ← ← ← ← ← ← ← ← ← ← ←│ localStorage.setItem()
  │                         │ navigate('/employee')
  │                         │
  └─ Employee Dashboard ← ← ←│
```

## Code Implementation Details

### otpManager.js - OTP Storage

```javascript
// In-memory Map structure:
// {
//   "admin@company.com": {
//     otp: "440548",
//     expiryTime: 1720297800000,  // timestamp
//     attempts: 0                  // failed attempts
//   },
//   "admin2@company.com": { ... }
// }

// Key Methods:
generateOTP()
  → Returns Math.floor(100000 + Math.random() * 900000).toString()
  → Result: "123456" (6 digits)

storeOTP(email, expiryMinutes = 5)
  → otp = generateOTP()
  → expiryTime = Date.now() + (expiryMinutes * 60 * 1000)
  → otpStore.set(email, {otp, expiryTime, attempts: 0})
  → Returns: otp code

verifyOTP(email, providedOTP)
  → Checks if otpStore.has(email)
  → Checks if not expired: Date.now() <= otpData.expiryTime
  → Checks if not max attempts: otpData.attempts < 3
  → Compares: otpData.otp === providedOTP
  → On success: otpStore.delete(email), return {valid: true}
  → On failure: increment attempts, return {valid: false, message}
```

### emailService.js - SMTP Integration

```javascript
// Configuration (via .env):
// transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.SMTP_USER,      // Gmail address
//     pass: process.env.SMTP_PASSWORD   // App Password (16 chars)
//   }
// })

// Email Template:
// Subject: "Payroll System - Two-Factor Authentication Code"
// Body: HTML with OTP in large, spaced format
// Includes: company branding, expiry info, security note

sendOTPEmail(email, otp)
  → Creates mailOptions with HTML template
  → transporter.sendMail(mailOptions)
  → Returns: {success: true/false, message, error}

testEmailConfig()
  → transporter.verify()
  → Validates SMTP credentials before use
```

### auth.routes.js - API Endpoints

```javascript
// POST /api/auth/login
route.post('/login', async (req, res) => {
  // 1. Extract email & password from body
  // 2. Query users table with JOIN roles
  // 3. Validate password: bcrypt.compare(password, hash)
  // 4. Check is_active flag
  // 5. If role === 'ADMIN':
  //    ├─ storeOTP(email, 5)
  //    ├─ sendOTPEmail(email, otp)
  //    └─ Return {mfaRequired: true, email, message}
  // 6. Else (EMPLOYEE):
  //    ├─ Generate JWT with payload:
  //    │  {userId, email, role, employeeId, iat, exp}
  //    └─ Return {mfaRequired: false, data: {token, user}}
})

// POST /api/auth/verify-otp
route.post('/verify-otp', async (req, res) => {
  // 1. Extract email & otp from body
  // 2. Call verifyOTP(email, otp)
  // 3. If invalid: Return 401 with error message
  // 4. If valid:
  //    ├─ Query users table again (refresh data)
  //    ├─ Generate JWT (same payload as above)
  //    └─ Return {success: true, data: {token, user}}
  // 5. Catch errors: Return 500
})

// POST /api/auth/resend-otp
route.post('/resend-otp', async (req, res) => {
  // 1. Extract email from body
  // 2. Query users table to verify exists & is_active & is ADMIN
  // 3. If not found or not admin: Return 403
  // 4. If valid:
  //    ├─ storeOTP(email, 5)  // New OTP, old invalidated
  //    ├─ sendOTPEmail(email, otp)
  //    └─ Return {success: true, message}
})
```

### Login.jsx - Frontend Form

```javascript
// Component State:
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [otp, setOtp] = useState('')
const [formError, setFormError] = useState('')
const [mfaRequired, setMfaRequired] = useState(false)

// handleLoginSubmit() flow:
// 1. Call login(email, password) from AuthContext
// 2. Response: {mfaRequired: true|false, ...}
// 3. If mfaRequired === true:
//    ├─ setMfaRequired(true)
//    ├─ setOtp('')  // Clear field
//    └─ Show OTP form
// 4. Else:
//    ├─ Get userData.role
//    ├─ Normalize role to uppercase
//    └─ Navigate based on role (/admin or /employee)

// handleOtpSubmit() flow:
// 1. Validate OTP: length === 6
// 2. Call verifyOtp(email, otp) from AuthContext
// 3. If success:
//    ├─ Token stored in localStorage
//    └─ navigate('/admin')
// 4. If error:
//    └─ Show error message, allow retry

// Conditional Rendering:
// {!mfaRequired ? (
//   <LoginForm />
// ) : (
//   <OTPVerificationForm />
// )}
```

### AuthContext.jsx - State Management

```javascript
// login(email, password) method:
export const login = useCallback(async (email, password) => {
  const response = await axiosClient.post('/auth/login', {email, password})
  
  if (response?.data?.mfaRequired) {
    // Return full response to indicate 2FA needed
    return {
      mfaRequired: true,
      email: response?.data?.email,
      message: response?.data?.message
    }
  }
  
  // Normal flow: extract token & user
  const authData = response?.data?.data
  const {token, user: userData} = authData
  const normalizedUser = {...userData, role: normalizeRole(userData?.role)}
  
  // Store in localStorage
  localStorage.setItem('payroll_auth_token', token)
  localStorage.setItem('payroll_auth_user', JSON.stringify(normalizedUser))
  
  // Update React state
  setUser(normalizedUser)
  
  return {data: {user: normalizedUser}}
}, [])

// verifyOtp(email, otp) method:
export const verifyOtp = useCallback(async (email, otp) => {
  const response = await axiosClient.post('/auth/verify-otp', {email, otp})
  
  const authData = response?.data?.data
  const {token, user: userData} = authData
  const normalizedUser = {...userData, role: normalizeRole(userData?.role)}
  
  // Store in localStorage
  localStorage.setItem('payroll_auth_token', token)
  localStorage.setItem('payroll_auth_user', JSON.stringify(normalizedUser))
  
  // Update React state
  setUser(normalizedUser)
  
  return normalizedUser
}, [])

// resendOtp(email) method:
export const resendOtp = useCallback(async (email) => {
  const response = await axiosClient.post('/auth/resend-otp', {email})
  return response?.data
}, [])
```

## Security Analysis

### Threats Mitigated
✅ **Unauthorized Admin Access** - OTP required
✅ **Credential Theft** - Even with password, OTP needed
✅ **Brute Force Attempts** - 3-strike lockout per OTP
✅ **Replay Attacks** - One-time OTP, time-limited
✅ **Email Interception** - OTP valid for only 5 minutes

### Remaining Threats
⚠️ **Weak Passwords** - Recommend password policy enforcement
⚠️ **Session Hijacking** - Add JWT refresh token rotation
⚠️ **Email Account Compromise** - OTP email becomes single point of failure
⚠️ **Server-Side Attacks** - In-memory OTP lost on server restart
⚠️ **Man-in-the-Middle** - Use HTTPS in production

### Recommendations
1. Use HTTPS in production (TLS 1.2+)
2. Implement rate limiting on login attempts
3. Add audit logging for failed OTP attempts
4. Use database for OTP persistence
5. Implement IP allowlisting for admins
6. Add backup email or SMS for recovery
7. Regular security audits and penetration testing

## Performance Considerations

### Optimization Points
- **OTP Generation**: O(1) - constant time, simple math
- **OTP Verification**: O(1) - Map lookup by email
- **Email Sending**: Async operation, non-blocking
- **Memory Usage**: ~100-200 bytes per active OTP
- **Database Queries**: Minimal, uses existing indexes

### Scalability Concerns
- **In-Memory Storage**: Limited to single server
- **Email Queue**: No retry mechanism if SMTP fails
- **Rate Limiting**: Not implemented (add for production)
- **Audit Logging**: Not implemented (add for compliance)

### Recommended Improvements
1. Move OTP to Redis for distributed systems
2. Implement email queue with retry logic
3. Add monitoring/alerting for SMTP failures
4. Cache user role lookup to reduce DB queries
5. Implement concurrent OTP request throttling

## Testing Checklist

### Unit Tests (Not Yet Implemented)
- [ ] generateOTP() produces 6-digit numbers
- [ ] storeOTP() correctly sets expiry time
- [ ] verifyOTP() rejects expired codes
- [ ] verifyOTP() rejects invalid codes
- [ ] verifyOTP() limits attempts
- [ ] normalizeRole() handles various inputs

### Integration Tests (Manual - COMPLETED ✅)
- [x] Admin login triggers 2FA
- [x] Employee login skips 2FA
- [x] Valid OTP grants access
- [x] Invalid OTP rejected
- [x] Expired OTP rejected
- [x] Resend OTP works
- [x] Multiple OTPs can coexist

### E2E Tests (Manual - COMPLETED ✅)
- [x] Full admin login flow
- [x] Full employee login flow
- [x] OTP error handling
- [x] Role-based navigation

## Deployment Checklist

### Development
- [x] Test all code paths
- [x] Verify error handling
- [x] Check console for warnings
- [x] Document API changes

### Staging
- [ ] Test with real Gmail account
- [ ] Monitor SMTP connection stability
- [ ] Verify email delivery rate
- [ ] Test OTP across different devices
- [ ] Load test with concurrent users

### Production
- [ ] Use environment-specific SMTP config
- [ ] Implement audit logging
- [ ] Set up alerting for SMTP failures
- [ ] Monitor authentication metrics
- [ ] Plan for OTP persistence (Redis/DB)
- [ ] Document disaster recovery procedures

---

**Document Version:** 1.0
**Last Updated:** July 6, 2026
**Status:** ✅ Implementation Complete
