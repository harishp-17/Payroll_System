import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axiosClient from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext.jsx';

export default function EmployeeProfile() {
  const { user } = useAuth();
  const now = useMemo(() => new Date(), []);
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState({ records: [], summary: {} });
  const [profileRequests, setProfileRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [clockLoading, setClockLoading] = useState(false);
  const [clockMessage, setClockMessage] = useState('');
  const [formState, setFormState] = useState({
    requested_name: '',
    requested_bank_name: '',
    requested_account_number: '',
    requested_ifsc_code: '',
    requested_phone: ''
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestError, setRequestError] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.employeeId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const [profileResponse, attendanceResponse, profileRequestsResponse] = await Promise.all([
        axiosClient.get(`/employees/${user.employeeId}`),
        axiosClient.get(`/attendance/${user.employeeId}`, {
          params: { month: now.getMonth() + 1, year: now.getFullYear() }
        }),
        axiosClient.get('/employee/profile-requests')
      ]);
      setProfile(profileResponse.data.data);
      setAttendance(attendanceResponse.data.data);
      setProfileRequests(profileRequestsResponse.data.data || []);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to load profile and attendance data');
    } finally {
      setLoading(false);
    }
  }, [user, now]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleClockIn() {
    setClockLoading(true);
    setClockMessage('');
    try {
      await axiosClient.post('/attendance/clock-in');
      setClockMessage('Clocked in successfully');
      await loadData();
    } catch (err) {
      setClockMessage(err.response?.data?.message || 'Failed to clock in');
    } finally {
      setClockLoading(false);
    }
  }

  async function handleClockOut() {
    setClockLoading(true);
    setClockMessage('');
    try {
      await axiosClient.post('/attendance/clock-out');
      setClockMessage('Clocked out successfully');
      await loadData();
    } catch (err) {
      setClockMessage(err.response?.data?.message || 'Failed to clock out');
    } finally {
      setClockLoading(false);
    }
  }

  async function handleProfileRequestSubmit(event) {
    event.preventDefault();
    setSubmittingRequest(true);
    setRequestMessage('');
    setRequestError('');

    try {
      await axiosClient.post('/employee/profile-request', formState);
      setRequestMessage('Your profile update request has been submitted successfully.');
      setFormState({
        requested_name: '',
        requested_bank_name: '',
        requested_account_number: '',
        requested_ifsc_code: '',
        requested_phone: ''
      });
      await loadData();
    } catch (err) {
      setRequestError(err.response?.data?.message || 'Failed to submit profile update request');
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-10">Loading profile...</div>;
  }

  if (errorMessage) {
    return <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">{errorMessage}</div>;
  }

  const summary = attendance.summary || {};

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              {profile.first_name} {profile.last_name}
            </h2>
            <p className="text-sm text-gray-500">{profile.designation} • {profile.department}</p>
            <p className="text-xs text-gray-400 mt-1">Employee Code: {profile.employee_code}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleClockIn}
              disabled={clockLoading}
              className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg"
            >
              Clock In
            </button>
            <button
              onClick={handleClockOut}
              disabled={clockLoading}
              className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg"
            >
              Clock Out
            </button>
          </div>
        </div>

        {clockMessage && (
          <div className="mt-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
            {clockMessage}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div>
            <p className="text-gray-400">Phone</p>
            <p className="text-gray-700 font-medium">{profile.phone || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400">Date of Joining</p>
            <p className="text-gray-700 font-medium">{profile.date_of_joining?.slice(0, 10)}</p>
          </div>
          <div>
            <p className="text-gray-400">Bank</p>
            <p className="text-gray-700 font-medium">{profile.bank_name} • {profile.bank_account_no}</p>
          </div>
          <div>
            <p className="text-gray-400">PAN</p>
            <p className="text-gray-700 font-medium">{profile.pan_number}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-md font-semibold text-gray-800">Request Profile Update</h3>
            <p className="text-sm text-gray-500">Submit changes for your name, bank details, or phone number for admin review.</p>
          </div>
        </div>

        <form onSubmit={handleProfileRequestSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={formState.requested_name}
              onChange={(e) => setFormState((prev) => ({ ...prev, requested_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
            <input
              type="text"
              value={formState.requested_bank_name}
              onChange={(e) => setFormState((prev) => ({ ...prev, requested_bank_name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="e.g. Kula Yugam Bank"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
            <input
              type="text"
              value={formState.requested_account_number}
              onChange={(e) => setFormState((prev) => ({ ...prev, requested_account_number: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Bank account number"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
            <input
              type="text"
              value={formState.requested_ifsc_code}
              onChange={(e) => setFormState((prev) => ({ ...prev, requested_ifsc_code: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="IFSC code"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={formState.requested_phone}
              onChange={(e) => setFormState((prev) => ({ ...prev, requested_phone: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="New phone number"
            />
          </div>

          <div className="md:col-span-2">
            {requestMessage && (
              <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-4 py-2 border border-emerald-200">
                {requestMessage}
              </div>
            )}
            {requestError && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2 border border-red-200">
                {requestError}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submittingRequest}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {submittingRequest ? 'Submitting...' : 'Submit Profile Update Request'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-md font-semibold text-gray-800">Your Profile Update Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Requested At</th>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Bank</th>
                <th className="px-6 py-3 text-left">Phone</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Admin Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profileRequests.map((request) => (
                <tr key={request.request_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-600">{request.requested_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-6 py-3 text-gray-600">{request.requested_name || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{request.requested_bank_name || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{request.requested_phone || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      request.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : request.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}>
                      {request.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{request.review_note || '—'}</td>
                </tr>
              ))}
              {profileRequests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-gray-400">No profile update requests yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Present Days" value={summary.presentDays ?? 0} color="text-emerald-600" />
        <StatCard label="Absent Days" value={summary.absentDays ?? 0} color="text-red-600" />
        <StatCard label="Leave Days" value={summary.leaveDays ?? 0} color="text-amber-600" />
        <StatCard label="Overtime Hours" value={summary.totalOvertimeHours ?? 0} color="text-brand-600" />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-md font-semibold text-gray-800">This Month's Attendance</h3>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-left">Clock In</th>
                <th className="px-6 py-3 text-left">Clock Out</th>
                <th className="px-6 py-3 text-left">Total Hours</th>
                <th className="px-6 py-3 text-left">Overtime</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendance.records.map((record) => (
                <tr key={record.attendance_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-600">{record.work_date?.slice(0, 10)}</td>
                  <td className="px-6 py-3 text-gray-600">{record.clock_in || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{record.clock_out || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{record.total_hours}</td>
                  <td className="px-6 py-3 text-gray-600">{record.overtime_hours}</td>
                  <td className="px-6 py-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
              {attendance.records.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-6 text-center text-gray-400">No attendance records yet this month</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
