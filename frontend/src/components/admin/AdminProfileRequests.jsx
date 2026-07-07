import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosClient from '../../api/axiosClient';

export default function AdminProfileRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingId, setProcessingId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await axiosClient.get('/admin/profile-requests');
      setRequests(response?.data?.data || []);
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to load profile requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  async function handleDecision(requestId, status) {
    if (!requestId) {
      setErrorMessage('Unable to review this request because its ID is missing.');
      return;
    }

    setProcessingId(requestId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await axiosClient.put(`/admin/profile-requests/${requestId}`, {
        id: requestId,
        status,
        review_note: reviewNotes[requestId] || ''
      });
      setSuccessMessage(`Request ${status.toLowerCase()} successfully.`);
      await loadRequests();
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Failed to update request');
    } finally {
      setProcessingId(null);
    }
  }

  const statusClasses = useMemo(
    () => ({
      PENDING: 'bg-amber-100 text-amber-700',
      APPROVED: 'bg-emerald-100 text-emerald-700',
      REJECTED: 'bg-red-100 text-red-700'
    }),
    []
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-md font-semibold text-gray-800">Employee Profile Update Requests</h3>
          <p className="text-sm text-gray-500">Review employee requests for name, phone, and bank detail updates.</p>
        </div>
      </div>

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Employee ID</th>
              <th className="px-6 py-3 text-left">Current Name</th>
              <th className="px-6 py-3 text-left">Requested Name</th>
              <th className="px-6 py-3 text-left">Phone / Bank</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Review Note</th>
              <th className="px-6 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.map((request) => {
              const requestId = request.id ?? request.request_id;
              return (
              <tr key={requestId} className="hover:bg-gray-50 align-top">
                <td className="px-6 py-3 font-medium text-gray-700">{request.employee_id}</td>
                <td className="px-6 py-3 text-gray-700">{request.first_name && request.last_name ? `${request.first_name} ${request.last_name}` : '—'}</td>
                <td className="px-6 py-3 text-gray-700">{request.requested_name || '—'}</td>
                <td className="px-6 py-3 text-gray-700">
                  <div>{request.requested_phone || '—'}</div>
                  <div className="text-xs text-gray-500">{request.requested_bank_name || '—'}</div>
                </td>
                <td className="px-6 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses[request.status] || 'bg-gray-100 text-gray-600'}`}>
                    {request.status}
                  </span>
                </td>
                <td className="px-6 py-3">
                  <textarea
                    rows={2}
                    value={reviewNotes[requestId] || ''}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({ ...prev, [requestId]: e.target.value }))
                    }
                    placeholder="Optional note"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </td>
                <td className="px-6 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecision(requestId, 'APPROVED')}
                      disabled={processingId === requestId || request.status !== 'PENDING'}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-md"
                    >
                      {processingId === requestId ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(requestId, 'REJECTED')}
                      disabled={processingId === requestId || request.status !== 'PENDING'}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-md"
                    >
                      {processingId === requestId ? 'Processing...' : 'Reject'}
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
            {requests.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-6 py-6 text-center text-gray-400">No profile update requests found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
