import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [formError, setFormError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const { login, verifyOtp, loading, resendOtp } = useAuth();
  const navigate = useNavigate();

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setFormError('');
    try {
      const response = await login(email, password);
      
      // Check if 2FA is required
      if (response?.mfaRequired) {
        setMfaRequired(true);
        setOtp('');
        return;
      }

      // Normal login flow (non-admin employees)
      const userData = response?.data?.user || response;
      const role = String(userData?.role || '').trim().toUpperCase();
      if (role.includes('ADMIN')) {
        navigate('/admin');
      } else if (role.includes('EMPLOYEE')) {
        navigate('/employee');
      } else {
        navigate('/employee');
      }
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleOtpSubmit(event) {
    event.preventDefault();
    setFormError('');
    
    if (!otp || otp.trim().length !== 6) {
      setFormError('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      const userData = await verifyOtp(email, otp);
      
      // Navigate to admin dashboard after successful 2FA
      navigate('/admin');
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleResendOtp() {
    setFormError('');
    try {
      await resendOtp(email);
      setFormError('');
      // Show a success message
      setTimeout(() => {
        alert('New OTP sent to your email!');
      }, 100);
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-600 to-brand-700 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Payroll Management System</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mfaRequired ? 'Enter verification code' : 'Sign in to access your dashboard'}
          </p>
        </div>

        {!mfaRequired ? (
          // LOGIN FORM
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {formError && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2 border border-red-200">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          // 2FA OTP VERIFICATION FORM
          <form onSubmit={handleOtpSubmit} className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                A 6-digit verification code has been sent to <strong>{email}</strong>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                type="text"
                required
                maxLength="6"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Only allow digits
                placeholder="000000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-center text-lg tracking-widest font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">Code expires in 5 minutes</p>
            </div>

            {formError && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2 border border-red-200">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              className="w-full text-brand-600 hover:text-brand-700 font-medium py-2 text-sm underline hover:no-underline"
            >
              Didn't receive the code? Resend OTP
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaRequired(false);
                setOtp('');
                setFormError('');
              }}
              className="w-full text-gray-600 hover:text-gray-700 font-medium py-2 text-sm"
            >
              Back to Login
            </button>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center mt-6">
          Demo Admin: admin@company.com &nbsp;|&nbsp; Demo Employee: john.doe@company.com
        </p>
      </div>
    </div>
  );
}
