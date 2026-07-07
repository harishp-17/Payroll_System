import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axiosClient from '../../api/axiosClient';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollProcessingHub() {
  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axiosClient.get('/payroll/summary', { params: { month, year } });
      setSummary(response.data.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to load payroll summary');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function handleProcessAndEmail(employeeId) {
    setProcessingId(employeeId);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const response = await axiosClient.post(`/payroll/process-and-email/${employeeId}`, { month, year });
      setStatusMessage(response.data.message || 'Payslip processed and emailed successfully');
      await loadSummary();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to process and email payslip');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-800">Payroll Processing Hub</h2>

        <div className="flex items-center gap-3 ml-auto">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>{name}</option>
            ))}
          </select>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-4 py-3 border border-emerald-200">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">
          {errorMessage}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Working Days</th>
              <th className="px-4 py-3 text-left">LOP Days</th>
              <th className="px-4 py-3 text-left">OT Hours</th>
              <th className="px-4 py-3 text-left">Gross</th>
              <th className="px-4 py-3 text-left">Deductions</th>
              <th className="px-4 py-3 text-left">Net Salary</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.map((row) => (
              <tr key={row.employee_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-700">{row.first_name} {row.last_name}</div>
                  <div className="text-xs text-gray-400">{row.employee_code} • {row.department}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{row.working_days}</td>
                <td className="px-4 py-3 text-gray-600">{row.lop_days}</td>
                <td className="px-4 py-3 text-gray-600">{row.overtime_hours}</td>
                <td className="px-4 py-3 text-gray-700 font-medium">{formatCurrency(row.gross_salary)}</td>
                <td className="px-4 py-3 text-red-600">{formatCurrency(row.total_deductions)}</td>
                <td className="px-4 py-3 text-emerald-700 font-semibold">{formatCurrency(row.net_salary)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    row.status === 'EMAILED' ? 'bg-emerald-100 text-emerald-700' :
                    row.status === 'PROCESSED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={processingId === row.employee_id}
                    onClick={() => handleProcessAndEmail(row.employee_id)}
                    className="px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-md whitespace-nowrap"
                  >
                    {processingId === row.employee_id ? 'Processing...' : 'Process & Email Payslip'}
                  </button>
                </td>
              </tr>
            ))}
            {summary.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No payroll data available for this period</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
