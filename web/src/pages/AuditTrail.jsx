import React, { useState, useEffect } from 'react';
import api from '../lib/api';

const actionColor = { created: 'green', updated: 'blue', deleted: 'red', approved: 'green', rejected: 'red', login: 'gray' };

export default function AuditTrail() {
  const [logs, setLogs]       = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ actor_id: '', table_name: '', action: '', date_from: '', date_to: '' });
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab]         = useState('logs');

  const load = async () => {
    setLoading(true);
    try {
      const params = Object.entries(filters).filter(([,v]) => v).reduce((o,[k,v]) => { o[k]=v; return o; }, {});
      const [l, s] = await Promise.all([
        api.get('/audit', { params }),
        api.get('/audit/summary'),
      ]);
      setLogs(l.data);
      setSummary(s.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyFilters = (e) => { e.preventDefault(); load(); };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Audit Trail</h1>
      <p className="text-gray-500 text-sm mb-6">Complete record of all data changes. Shows who changed what, when. Visible to National Admin only.</p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('logs')}    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'logs'    ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Activity Log</button>
        <button onClick={() => setTab('summary')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'summary' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Summary</button>
      </div>

      {tab === 'logs' && (
        <>
          {/* Filters */}
          <form onSubmit={applyFilters} className="card mb-4">
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Action</label>
                <select className="input" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
                  <option value="">All actions</option>
                  {['created','updated','deleted','approved','rejected','login'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Table</label>
                <select className="input" value={filters.table_name} onChange={e => setFilters(f => ({ ...f, table_name: e.target.value }))}>
                  <option value="">All tables</option>
                  {['users','farmers','batch_barcodes','allocation_barcodes','farmer_delivery_barcodes','sp_receipts','farmer_receipts','daily_farm_entries','mortality_evidence','aea_visits','registration_requests'].map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                <input type="date" className="input" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                <input type="date" className="input" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">Apply Filters</button>
              </div>
            </div>
          </form>

          {loading ? <div className="text-center py-12 text-gray-400">Loading audit log...</div> : (
            <div className="card">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="pb-2 text-left">Timestamp</th>
                      <th className="pb-2 text-left">Actor</th>
                      <th className="pb-2 text-left">Role</th>
                      <th className="pb-2 text-left">Action</th>
                      <th className="pb-2 text-left">Table</th>
                      <th className="pb-2 text-left">Record ID</th>
                      <th className="pb-2 text-left">IP</th>
                      <th className="pb-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {logs.map(log => (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="py-2 text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2 text-gray-800 font-medium">{log.actor_name || 'System'}</td>
                          <td className="py-2"><span className="badge-blue">{log.actor_role?.replace(/_/g,' ') || '—'}</span></td>
                          <td className="py-2"><span className={`badge-${actionColor[log.action] || 'gray'}`}>{log.action}</span></td>
                          <td className="py-2 font-mono text-gray-600">{log.table_name?.replace(/_/g,' ')}</td>
                          <td className="py-2 text-gray-500">{log.record_id || '—'}</td>
                          <td className="py-2 text-gray-400 font-mono">{log.ip_address || '—'}</td>
                          <td className="py-2">
                            {(log.old_values || log.new_values) && (
                              <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                className="text-brand-primary hover:underline">
                                {expanded === log.id ? 'Hide' : 'View'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {expanded === log.id && (
                          <tr>
                            <td colSpan={8} className="pb-3 px-2">
                              <div className="grid grid-cols-2 gap-3">
                                {log.old_values && (
                                  <div className="bg-red-50 rounded-lg p-3">
                                    <p className="text-xs font-medium text-red-700 mb-1">Before</p>
                                    <pre className="text-xs text-red-600 overflow-x-auto">{JSON.stringify(typeof log.old_values === 'string' ? JSON.parse(log.old_values) : log.old_values, null, 2)}</pre>
                                  </div>
                                )}
                                {log.new_values && (
                                  <div className="bg-green-50 rounded-lg p-3">
                                    <p className="text-xs font-medium text-green-700 mb-1">After</p>
                                    <pre className="text-xs text-green-600 overflow-x-auto">{JSON.stringify(typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No audit records match filters</p>}
              </div>
              <p className="text-xs text-gray-400 mt-3">Showing {logs.length} records</p>
            </div>
          )}
        </>
      )}

      {tab === 'summary' && (
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-4">Activity Summary by Actor</h3>
          <table className="min-w-full text-xs">
            <thead><tr className="text-gray-500 border-b border-gray-100">
              <th className="pb-2 text-left">Actor</th>
              <th className="pb-2 text-left">Role</th>
              <th className="pb-2 text-left">Action</th>
              <th className="pb-2 text-left">Table</th>
              <th className="pb-2 text-left">Count</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {summary.map((s, i) => (
                <tr key={i}>
                  <td className="py-2 text-gray-800 font-medium">{s.full_name || '—'}</td>
                  <td className="py-2"><span className="badge-blue">{s.actor_role?.replace(/_/g,' ')}</span></td>
                  <td className="py-2"><span className={`badge-${actionColor[s.action] || 'gray'}`}>{s.action}</span></td>
                  <td className="py-2 font-mono text-gray-600">{s.table_name?.replace(/_/g,' ')}</td>
                  <td className="py-2 font-bold text-gray-800">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
