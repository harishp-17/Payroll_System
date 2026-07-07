import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import EmployeeLeaveManagement from './EmployeeLeaveManagement.jsx';
import PayrollProcessingHub from './PayrollProcessingHub.jsx';
import AdminProfileRequests from './AdminProfileRequests.jsx';

const TABS = [
  { id: 'leaves', label: 'Employee & Leave Management' },
  { id: 'profile-requests', label: 'Profile Update Requests' },
  { id: 'payroll', label: 'Payroll Processing Hub' }
];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('leaves');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Admin Control Center</h1>
            <p className="text-xs text-gray-500">Payroll Management System</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium bg-gray-800 hover:bg-gray-900 text-white rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-6 flex gap-6 border-t border-gray-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'leaves' && <EmployeeLeaveManagement />}
        {activeTab === 'profile-requests' && <AdminProfileRequests />}
        {activeTab === 'payroll' && <PayrollProcessingHub />}
      </main>
    </div>
  );
}
