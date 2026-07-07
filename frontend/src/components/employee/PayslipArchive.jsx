import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext.jsx';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayslipArchive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!user?.employeeId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axiosClient.get(`/payroll/history/${user.employeeId}`);
      setHistory(response.data.data);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to load payslip history');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function handleVerify(record) {
    if (record?.verification_hash || record?.blockchain_hash) {
      const hash = record.verification_hash || record.blockchain_hash;
      navigate(`/employee/verify/${encodeURIComponent(hash)}`);
    }
  }

  async function handleDownload(payrollId, fileName) {
    setDownloadingId(payrollId);
    try {
      const response = await axiosClient.get(`/payroll/payslip/${payrollId}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName || `Payslip_${payrollId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to download payslip. It may not have been generated yet.');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-md font-semibold text-gray-800">Digital Payslip Archive</h3>
      </div>

      {errorMessage && (
        <div className="mx-6 mt-4 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 border border-red-200">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Pay Period</th>
              <th className="px-6 py-3 text-left">Gross Salary</th>
              <th className="px-6 py-3 text-left">Deductions</th>
              <th className="px-6 py-3 text-left">Net Salary</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map((record) => (
              <tr key={record.payroll_id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-700">
                  {MONTH_NAMES[record.pay_period_month - 1]} {record.pay_period_year}
                </td>
                <td className="px-6 py-3 text-gray-600">{formatCurrency(record.gross_salary)}</td>
                <td className="px-6 py-3 text-red-600">{formatCurrency(record.total_deductions)}</td>
                <td className="px-6 py-3 text-emerald-700 font-semibold">{formatCurrency(record.net_salary)}</td>
                <td className="px-6 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    record.status === 'EMAILED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {record.status}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleVerify(record)}
                      disabled={!record.verification_hash && !record.blockchain_hash}
                      className="px-3 py-1.5 text-xs font-semibold border border-brand-600 text-brand-600 hover:bg-brand-50 disabled:opacity-40 rounded-md"
                    >
                      Verify Payslip
                    </button>
                    <button
                      disabled={!record.file_name || downloadingId === record.payroll_id}
                      onClick={() => handleDownload(record.payroll_id, record.file_name)}
                      className="px-3 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded-md"
                    >
                      {downloadingId === record.payroll_id ? 'Downloading...' : 'Download PDF'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {history.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-6 py-6 text-center text-gray-400">No payslips have been generated yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
