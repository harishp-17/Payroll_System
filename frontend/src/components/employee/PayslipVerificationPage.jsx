import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

export default function PayslipVerificationPage() {
  const { verificationHash } = useParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function verify() {
      try {
        const response = await axiosClient.get(`/payslip/verify/${verificationHash}`);
        setResult(response.data.data);
      } catch (err) {
        setErrorMessage(err.response?.data?.message || 'Unable to verify this payslip');
      } finally {
        setLoading(false);
      }
    }

    if (verificationHash) {
      verify();
    } else {
      setErrorMessage('No verification hash was provided.');
      setLoading(false);
    }
  }, [verificationHash]);

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Payslip Verification</h2>
            <p className="text-sm text-gray-500">Confirm the authenticity of a payslip directly from the portal.</p>
          </div>
          <Link to="/employee" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Back to dashboard
          </Link>
        </div>

        {loading && <div className="text-sm text-gray-500">Verifying payslip...</div>}

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
              <p className="font-semibold">Payslip verified successfully</p>
              <p className="mt-1">This payslip is registered with the company verification system.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-gray-400">Employee</p>
                <p className="font-semibold text-gray-800">{result.employeeName}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-gray-400">Employee Code</p>
                <p className="font-semibold text-gray-800">{result.employeeCode}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-gray-400">Payslip ID</p>
                <p className="font-semibold text-gray-800">{result.payslipId}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-gray-400">Generated At</p>
                <p className="font-semibold text-gray-800">{new Date(result.generatedAt).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 md:col-span-2">
                <p className="text-gray-400">Company</p>
                <p className="font-semibold text-gray-800">{result.companyName}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 md:col-span-2">
                <p className="text-gray-400">Verification Hash</p>
                <p className="font-mono text-xs break-all text-gray-800">{result.verificationHash}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
