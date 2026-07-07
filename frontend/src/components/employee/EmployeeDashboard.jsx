import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import EmployeeProfile from './EmployeeProfile.jsx';
import PayslipArchive from './PayslipArchive.jsx';
import axiosClient from '../../api/axiosClient';

const TABS = [
  { id: 'profile', label: 'Profile & Attendance' },
  { id: 'leave', label: 'Apply for Leave' },
  { id: 'payslips', label: 'Payslip Archive' }
];

export default function EmployeeDashboard() {
  const [activeTab, setActiveTab] = useState('profile');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Employee Self-Service Portal</h1>
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

        <nav className="max-w-6xl mx-auto px-6 flex gap-6 border-t border-gray-100">
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

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'profile' && <EmployeeProfile />}
        {activeTab === 'leave' && <LeaveApplicationForm />}
        {activeTab === 'payslips' && <PayslipArchive />}
      </main>
    </div>
  );
}

function LeaveApplicationForm() {
  const [leaveType, setLeaveType] = useState('CASUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    setErrorMessage('');
    try {
      await axiosClient.post('/leaves/apply', { leaveType, startDate, endDate, reason });
      setMessage('Leave application submitted successfully. Awaiting admin approval.');
      setStartDate('');
      setEndDate('');
      setReason('');
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to submit leave application');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-xl">
      <h3 className="text-md font-semibold text-gray-800 mb-4">Apply for Leave</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="CASUAL">Casual Leave</option>
            <option value="SICK">Sick Leave</option>
            <option value="EARNED">Earned Leave</option>
            <option value="UNPAID">Unpaid Leave</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Briefly describe the reason for your leave"
          />
        </div>

        {message && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-4 py-2 border border-emerald-200">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2 border border-red-200">
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {submitting ? 'Submitting...' : 'Submit Leave Application'}
        </button>
      </form>
    </section>
  );
}
