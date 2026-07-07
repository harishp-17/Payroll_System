import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import AdminDashboard from './components/admin/AdminDashboard.jsx';
import EmployeeDashboard from './components/employee/EmployeeDashboard.jsx';
import PayslipVerificationPage from './components/employee/PayslipVerificationPage.jsx';

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const normalizedRole = String(user?.role || '').trim().toUpperCase();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.some((role) => String(role).trim().toUpperCase() === normalizedRole)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const { user } = useAuth();
  const normalizedRole = String(user?.role || '').trim().toUpperCase();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <EmployeeDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/employee/verify/:verificationHash"
        element={
          <ProtectedRoute allowedRoles={['EMPLOYEE']}>
            <PayslipVerificationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          user ? (
            <Navigate to={normalizedRole.includes('ADMIN') ? '/admin' : '/employee'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
