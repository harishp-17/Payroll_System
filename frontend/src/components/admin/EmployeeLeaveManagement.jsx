import React, { useEffect, useState, useCallback } from 'react';
import axiosClient from '../../api/axiosClient';

const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700'
};

export default function EmployeeLeaveManagement() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actioningId, setActioningId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'EMPLOYEE',
    basePay: '',
    hra: '',
    conveyanceAllowance: '',
    medicalAllowance: '',
    specialAllowance: ''
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [employeesResponse, leavesResponse] = await Promise.all([
        axiosClient.get('/employees'),
        axiosClient.get('/leaves')
      ]);
      setEmployees(employeesResponse.data.data);
      setLeaves(leavesResponse.data.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to load employee and leave data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDecision(leaveId, decision) {
    setActioningId(leaveId);
    try {
      await axiosClient.patch(`/leaves/${leaveId}/decision`, { decision });
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to update leave status');
    } finally {
      setActioningId(null);
    }
  }

  async function handleAddEmployee(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setFormSuccess('');

    try {
      const [firstName, ...rest] = formData.fullName.trim().split(/\s+/);
      const lastName = rest.join(' ') || 'Employee';

      const payload = {
        email: formData.email.trim(),
        firstName,
        lastName,
        role: formData.role,
        basePay: Number(formData.basePay),
        hra: Number(formData.hra || 0),
        conveyanceAllowance: Number(formData.conveyanceAllowance || 0),
        medicalAllowance: Number(formData.medicalAllowance || 0),
        specialAllowance: Number(formData.specialAllowance || 0),
        dateOfJoining: new Date().toISOString().slice(0, 10)
      };

      await axiosClient.post('/employees', payload);
      setFormSuccess('Employee created successfully.');
      setFormData({
        fullName: '',
        email: '',
        role: 'EMPLOYEE',
        basePay: '',
        hra: '',
        conveyanceAllowance: '',
        medicalAllowance: '',
        specialAllowance: ''
      });
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTerminate(employeeId) {
    if (!window.confirm('Terminate this employee and disable their login access?')) {
      return;
    }

    setActioningId(employeeId);
    try {
      await axiosClient.patch(`/employees/${employeeId}/terminate`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to terminate employee');
    } finally {
      setActioningId(null);
    }
  }

  function handleInputChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <div className="space-y-8">
      {errorMessage && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">
          {errorMessage}
        </div>
      )}

      <section className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Employee Directory</h2>
            <span className="text-sm text-gray-500">{employees.length} employees</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
          >
            Add Employee
          </button>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Code</th>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Designation</th>
                <th className="px-6 py-3 text-left">Department</th>
                <th className="px-6 py-3 text-left">Base Pay</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((emp) => (
                <tr key={emp.employee_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-700">{emp.employee_code}</td>
                  <td className="px-6 py-3">{emp.first_name} {emp.last_name}</td>
                  <td className="px-6 py-3 text-gray-600">{emp.designation}</td>
                  <td className="px-6 py-3 text-gray-600">{emp.department}</td>
                  <td className="px-6 py-3 text-gray-600">₹{Number(emp.base_pay).toLocaleString('en-IN')}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${emp.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <button
                      disabled={actioningId === emp.employee_id || !emp.is_active}
                      onClick={() => handleTerminate(emp.employee_id)}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md"
                    >
                      {emp.is_active ? 'Fire' : 'Terminated'}
                    </button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && !loading && (
                <tr><td colSpan={7} className="px-6 py-6 text-center text-gray-400">No employees found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showAddModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Add Employee</h3>
                <p className="text-sm text-gray-500">Create a user and employee profile with default credentials.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            {formSuccess && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                <input name="fullName" required value={formData.fullName} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="email" required value={formData.email} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select name="role" value={formData.role} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                  <option value="EMPLOYEE">Employee</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Base Salary</label>
                <input type="number" name="basePay" required value={formData.basePay} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">HRA</label>
                <input type="number" name="hra" value={formData.hra} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Conveyance Allowance</label>
                <input type="number" name="conveyanceAllowance" value={formData.conveyanceAllowance} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Medical Allowance</label>
                <input type="number" name="medicalAllowance" value={formData.medicalAllowance} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Special Allowance</label>
                <input type="number" name="specialAllowance" value={formData.specialAllowance} onChange={handleInputChange} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </div>
              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Leave Applications</h2>
          <span className="text-sm text-gray-500">{leaves.length} applications</span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Employee</th>
                <th className="px-6 py-3 text-left">Type</th>
                <th className="px-6 py-3 text-left">From</th>
                <th className="px-6 py-3 text-left">To</th>
                <th className="px-6 py-3 text-left">Days</th>
                <th className="px-6 py-3 text-left">Reason</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaves.map((leave) => (
                <tr key={leave.leave_id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-700">
                    {leave.first_name} {leave.last_name}
                    <div className="text-xs text-gray-400">{leave.employee_code}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{leave.leave_type}</td>
                  <td className="px-6 py-3 text-gray-600">{leave.start_date?.slice(0, 10)}</td>
                  <td className="px-6 py-3 text-gray-600">{leave.end_date?.slice(0, 10)}</td>
                  <td className="px-6 py-3 text-gray-600">{leave.total_days}</td>
                  <td className="px-6 py-3 text-gray-600 max-w-xs truncate">{leave.reason || '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[leave.status]}`}>
                      {leave.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {leave.status === 'PENDING' ? (
                      <div className="flex gap-2">
                        <button
                          disabled={actioningId === leave.leave_id}
                          onClick={() => handleDecision(leave.leave_id, 'APPROVED')}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md"
                        >
                          Accept
                        </button>
                        <button
                          disabled={actioningId === leave.leave_id}
                          onClick={() => handleDecision(leave.leave_id, 'REJECTED')}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Decided</span>
                    )}
                  </td>
                </tr>
              ))}
              {leaves.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-6 py-6 text-center text-gray-400">No leave applications found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
