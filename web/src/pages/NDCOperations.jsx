import React, { useState, useEffect } from 'react';
import api from '../lib/api';

const EMPTY_ALLOC = () => ({ recipient_type: 'sp', sp_id: '', farmer_id: '', docs_allocated: '' });
const EMPTY_FORM = () => ({
  distributor_id: '',
  loading_date: new Date().toISOString().slice(0, 10),
  total_docs_loaded: '',
  allocations: [EMPTY_ALLOC(), EMPTY_ALLOC()],
});

const TIER_LABELS = { anchor: '🌟 Anchor', small_medium: '👩‍🌾 STM' };

export default function NDCOperations() {
  const [batches, setBatches]         = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [sps, setSPs]                 = useState([]);
  const [farmers, setFarmers]         = useState([]); // anchor + STM only
  const [showForm, setShowForm]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [msg, setMsg]                 = useState('');
  const [form, setForm]               = useState(EMPTY_FORM());

  useEffect(() => {
    loadBatches();
    api.get('/distributors').then(r => setDistributors(r.data)).catch(console.error);
    api.get('/service-providers').then(r => setSPs(r.data)).catch(console.error);
    // Load anchor + STM farmers for direct allocation
    Promise.all([
      api.get('/farmers', { params: { tier: 'anchor' } }),
      api.get('/farmers', { params: { tier: 'small_medium' } }),
    ]).then(([a, s]) => setFarmers([...a.data, ...s.data])).catch(console.error);
  }, []);

  const loadBatches = async () => {
    const { data } = await api.get('/batches');
    setBatches(data);
  };

  // ── Random fill (SP-only, demo helper) ─────────────────────────────────────
  const randomFill = () => {
    if (!distributors.length || !sps.length) return;
    const dist  = distributors[Math.floor(Math.random() * distributors.length)];
    const total = (Math.floor(Math.random() * 25) + 5) * 100;
    const shuffled = [...sps].sort(() => Math.random() - 0.5);
    const picked   = shuffled.slice(0, Math.min(sps.length, Math.floor(Math.random() * 2) + 2));
    const allocs = [];
    let remaining = total;
    for (let i = 0; i < picked.length - 1; i++) {
      const minAmt = Math.max(50, Math.round(remaining * 0.2 / 50) * 50);
      const maxAmt = Math.round(remaining * 0.6 / 50) * 50;
      const steps  = Math.max(0, (maxAmt - minAmt) / 50);
      const amt    = minAmt + Math.floor(Math.random() * (steps + 1)) * 50;
      allocs.push({ recipient_type: 'sp', sp_id: String(picked[i].id), farmer_id: '', docs_allocated: String(amt) });
      remaining -= amt;
    }
    allocs.push({ recipient_type: 'sp', sp_id: String(picked[picked.length - 1].id), farmer_id: '', docs_allocated: String(remaining) });
    setForm(f => ({ ...f, distributor_id: String(dist.id), total_docs_loaded: String(total), allocations: allocs }));
  };
  // ──────────────────────────────────────────────────────────────────────────

  const addAllocation    = () => setForm(f => ({ ...f, allocations: [...f.allocations, EMPTY_ALLOC()] }));
  const removeAllocation = (i) => setForm(f => ({ ...f, allocations: f.allocations.filter((_, idx) => idx !== i) }));
  const updateAllocation = (i, field, val) => setForm(f => {
    const alocs = [...f.allocations];
    alocs[i] = { ...alocs[i], [field]: val };
    // Reset the id fields when recipient_type changes
    if (field === 'recipient_type') { alocs[i].sp_id = ''; alocs[i].farmer_id = ''; }
    return { ...f, allocations: alocs };
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg('');
    try {
      const payload = {
        ...form,
        total_docs_loaded: parseInt(form.total_docs_loaded),
        allocations: form.allocations.map(a => ({
          recipient_type: a.recipient_type || 'sp',
          sp_id: a.recipient_type === 'sp' ? parseInt(a.sp_id) || null : null,
          farmer_id: a.recipient_type !== 'sp' ? parseInt(a.farmer_id) || null : null,
          docs_allocated: parseInt(a.docs_allocated),
        })),
      };
      await api.post('/batches', payload);
      setMsg('✓ Batch created successfully');
      setShowForm(false);
      setForm(EMPTY_FORM());
      loadBatches();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  const dispatch       = async (id) => { await api.put(`/batches/${id}/dispatch`); loadBatches(); };
  const downloadLabels = (id) => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/batches/${id}/labels?token=${localStorage.getItem('pircmes_token')}`, '_blank');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">DoCs Delivery</h1>
        <button onClick={() => { setShowForm(!showForm); setMsg(''); }} className="btn-primary">+ New Batch</button>
      </div>

      {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}

      {showForm && (
        <div className="card mb-6">
          {/* Form header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Create DoC Batch</h2>
            <button
              type="button"
              onClick={randomFill}
              disabled={!distributors.length || !sps.length}
              className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40"
            >
              🎲 Random Fill
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Distributor */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Distributor</label>
                <select className="input" value={form.distributor_id} onChange={e => setForm(f => ({ ...f, distributor_id: e.target.value }))} required>
                  <option value="">Select distributor...</option>
                  {distributors.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} — {d.distributor_number} ({d.assigned_region})
                    </option>
                  ))}
                </select>
              </div>

              {/* Loading date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loading Date</label>
                <input type="date" className="input" value={form.loading_date} onChange={e => setForm(f => ({ ...f, loading_date: e.target.value }))} required />
              </div>

              {/* Total DoCs */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Total DoCs to Load</label>
                <input type="number" className="input" value={form.total_docs_loaded} onChange={e => setForm(f => ({ ...f, total_docs_loaded: e.target.value }))} required min={1} placeholder="e.g. 1000" />
              </div>
            </div>

            {/* Route Allocations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">Route Allocations (SP, Anchor, or STM farmers)</label>
                <button type="button" onClick={addAllocation} className="text-xs text-brand-primary hover:underline">+ Add Stop</button>
              </div>
              {form.allocations.map((a, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                  {/* Route # */}
                  <div className="col-span-1 text-center">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white text-xs font-bold">{i + 1}</span>
                  </div>
                  {/* Type selector */}
                  <div className="col-span-3">
                    <select
                      className="input text-xs"
                      value={a.recipient_type || 'sp'}
                      onChange={e => updateAllocation(i, 'recipient_type', e.target.value)}
                    >
                      <option value="sp">🏪 Service Point</option>
                      <option value="anchor">🌟 Anchor Farmer</option>
                      <option value="small_medium">👩‍🌾 STM Farmer</option>
                    </select>
                  </div>
                  {/* Recipient dropdown */}
                  <div className="col-span-4">
                    {(!a.recipient_type || a.recipient_type === 'sp') ? (
                      <select className="input text-sm" value={a.sp_id} onChange={e => updateAllocation(i, 'sp_id', e.target.value)} required>
                        <option value="">Select service point...</option>
                        {sps.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.sp_name} ({sp.sp_number})</option>
                        ))}
                      </select>
                    ) : (
                      <select className="input text-sm" value={a.farmer_id} onChange={e => updateAllocation(i, 'farmer_id', e.target.value)} required>
                        <option value="">Select farmer...</option>
                        {farmers.filter(f =>
                          a.recipient_type === 'anchor' ? f.production_tier === 'anchor' : f.production_tier === 'small_medium'
                        ).map(f => (
                          <option key={f.id} value={f.id}>{f.full_name} ({f.farmer_number})</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {/* DoCs */}
                  <div className="col-span-3">
                    <input className="input text-sm" value={a.docs_allocated} onChange={e => updateAllocation(i, 'docs_allocated', e.target.value)} placeholder="DoCs" type="number" required min={1} />
                  </div>
                  <button type="button" onClick={() => removeAllocation(i)} className="col-span-1 text-red-400 text-sm hover:text-red-600 justify-self-center" disabled={form.allocations.length <= 1}>✕</button>
                </div>
              ))}
              {/* Allocation sum hint */}
              {form.total_docs_loaded && (
                <p className={`text-xs mt-1 ${
                  form.allocations.reduce((s, a) => s + (parseInt(a.docs_allocated) || 0), 0) === parseInt(form.total_docs_loaded)
                    ? 'text-green-600' : 'text-amber-600'
                }`}>
                  Allocated: {form.allocations.reduce((s, a) => s + (parseInt(a.docs_allocated) || 0), 0).toLocaleString()} / {parseInt(form.total_docs_loaded).toLocaleString()} DoCs
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Creating...' : 'Create Batch'}</button>
              <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM()); }} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Batch table */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4">All Batches</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="pb-2 text-left">Batch Barcode</th>
                <th className="pb-2 text-left">Date</th>
                <th className="pb-2 text-left">Distributor</th>
                <th className="pb-2 text-left">DoCs</th>
                <th className="pb-2 text-left">Stops</th>
                <th className="pb-2 text-left">Status</th>
                <th className="pb-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="py-2 font-mono text-gray-700 text-xs">{b.batch_barcode}</td>
                  <td className="py-2 text-gray-600">{b.loading_date}</td>
                  <td className="py-2 text-gray-700">{b.distributor_name}</td>
                  <td className="py-2 text-gray-700">{b.total_docs_loaded?.toLocaleString()}</td>
                  <td className="py-2 text-gray-600">{b.num_sp_allocations}</td>
                  <td className="py-2">
                    <span className={`badge-${b.status === 'fully_delivered' ? 'green' : b.status === 'en_route' ? 'blue' : b.status === 'loaded' ? 'yellow' : 'gray'}`}>
                      {b.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2 flex gap-2">
                    {b.status === 'loaded' && <button onClick={() => dispatch(b.id)} className="text-xs text-brand-primary hover:underline">Dispatch</button>}
                    <button onClick={() => downloadLabels(b.id)} className="text-xs text-gray-500 hover:underline">Labels PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {batches.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No batches yet. Create the first batch.</p>}
        </div>
      </div>
    </div>
  );
}
