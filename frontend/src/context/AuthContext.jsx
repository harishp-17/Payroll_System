import React, { createContext, useContext, useState, useCallback } from 'react';
import axiosClient from '../api/axiosClient';

const AuthContext = createContext(null);

function normalizeRole(role) {
  if (!role) return 'USER';
  const normalized = String(role).trim().toUpperCase();
  if (normalized.includes('ADMIN')) return 'ADMIN';
  if (normalized.includes('EMPLOYEE')) return 'EMPLOYEE';
  return normalized;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('payroll_auth_user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosClient.post('/auth/login', { email, password });
      const responseData = response?.data;

      // Check if 2FA is required (for admin users)
      if (responseData?.mfaRequired) {
        // Return the full response to indicate 2FA is needed
        return {
          mfaRequired: true,
          email: responseData?.email,
          message: responseData?.message
        };
      }

      // Normal login flow for non-admin users
      const authData = responseData?.data;

      if (!authData?.token || !authData?.user) {
        throw new Error('Invalid authentication response from server.');
      }

      const { token, user: userData } = authData;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };
      localStorage.setItem('payroll_auth_token', token);
      localStorage.setItem('payroll_auth_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return { data: { user: normalizedUser } };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (email, otp) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosClient.post('/auth/verify-otp', { email, otp });
      const authData = response?.data?.data;

      if (!authData?.token || !authData?.user) {
        throw new Error('Invalid OTP verification response from server.');
      }

      const { token, user: userData } = authData;
      const normalizedUser = { ...userData, role: normalizeRole(userData?.role) };
      localStorage.setItem('payroll_auth_token', token);
      localStorage.setItem('payroll_auth_user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      return normalizedUser;
    } catch (err) {
      const message = err.response?.data?.message || 'OTP verification failed. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const resendOtp = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axiosClient.post('/auth/resend-otp', { email });
      
      if (!response?.data?.success) {
        throw new Error('Failed to resend OTP');
      }

      return response?.data;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to resend OTP. Please try again.';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('payroll_auth_token');
    localStorage.removeItem('payroll_auth_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, verifyOtp, resendOtp, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
