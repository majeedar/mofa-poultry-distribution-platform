import React, { useState, useEffect } from 'react';
import api from '../lib/api';

export default function FarmerApprovals() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter]     = useState('pending');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading]   = useState(true);
  const [reviewing, setReviewing] = useState(null);
  const [notes, setNotes]       = useState('');
  const [msg, setMsg]           = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: filter });
      if (roleFilter) params.set('role', roleFilter);
      const { data } = await api.get(`/registrations?${params}`);
      setRequests(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter, roleFilter]);

  const approve = async (id) => {
    try {
      const { data } = await api.put(`/registrations/${id}/approve`, { review_notes: notes });
      setMsg(`✓ Approved. User created with email: ${data.user.email} | Temp password: ${data.user.defaultPassword}`);
      setReviewing(null); setNotes('');
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const reject = async (id) => {
    if (!notes.trim()) { alert('Please add rejection reason in notes'); return; }
    try {
      await api.put(`/registrations/${id}/reject`, { review_notes: notes });
      setMsg('✓ Registration rejected');
      setReviewing(null); setNotes('');
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const roleColor = { farmer: 'green', aea: 'blue', distributor: 'yellow', sp_operator: 'purple', regional_officer: 'orange', district_officer: 'orange', national_officer: 'red' };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pending Approvals</h1>
      <p className="text-gray-500 text-sm mb-6">Review and approve/reject registration requests submitted by AEAs and National Coordinators.</p>

      {msg && (
        <div className={`mb-4 p-4 rounded-xl text-sm ${msg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg}
          <button onClick={() => setMsg('')} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {['pending','approved','rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${filter === s ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s}
          </button>
        ))}
        <select className="input max-w-48 ml-2" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {['farmer','aea','distributor','sp_operator','regional_officer','district_officer','national_officer'].map(r => (
            <option key={r} value={r}>{r.replace(/_/g,' ')}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">Loading...</div> : (
        <div className="space-y-3">
          {requests.map(r => {
            const data = typeof r.submitted_data === 'string' ? JSON.parse(r.submitted_data) : r.submitted_data;
            const isOpen = reviewing === r.id;
            return (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`badge-${roleColor[r.requested_role] || 'gray'}`}>{r.requested_role?.replace(/_/g,' ')}</span>
                      <span className={`badge-${r.status === 'pending' ? 'yellow' : r.status === 'approved' ? 'green' : 'red'}`}>{r.status}</span>
                      <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div><p className="text-gray-400">Ghana Card</p><p className="font-mono font-medium text-gray-800">{r.ghana_card_number}</p></div>
                      <div><p className="text-gray-400">Full Name</p><p className="text-gray-800">{data?.full_name || '—'}</p></div>
                      <div><p className="text-gray-400">Phone</p><p className="text-gray-800">{data?.phone_number || '—'}</p></div>
                      <div><p className="text-gray-400">Region</p><p className="text-gray-800">{data?.region || '—'}</p></div>
                      {data?.production_tier && <div><p className="text-gray-400">Tier</p><p className="text-gray-800">{data.production_tier}</p></div>}
                      {data?.farm_location && <div><p className="text-gray-400">Farm Location</p><p className="text-gray-800">{data.farm_location}</p></div>}
                      {r.submitted_by_name && <div><p className="text-gray-400">Submitted by</p><p className="text-gray-800">{r.submitted_by_name}</p></div>}
                    </div>
                    {r.review_notes && <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-2 py-1">Notes: {r.review_notes}</p>}
                  </div>

                  {r.status === 'pending' && (
                    <button onClick={() => { setReviewing(isOpen ? null : r.id); setNotes(''); }}
                      className={`ml-4 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${isOpen ? 'bg-gray-100 text-gray-600' : 'bg-brand-primary text-white hover:bg-brand-dark'}`}>
                      {isOpen ? 'Cancel' : 'Review'}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Review Notes (required for rejection)</label>
                    <textarea className="input resize-none h-20 mb-3" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes for this decision..." />
                    <div className="flex gap-3">
                      <button onClick={() => approve(r.id)} className="btn-primary">✓ Approve & Create User</button>
                      <button onClick={() => reject(r.id)}  className="btn-danger">✕ Reject</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {requests.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-3xl mb-2">{filter === 'pending' ? '✅' : '📋'}</p>
              <p className="text-gray-400 text-sm">No {filter} requests</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
