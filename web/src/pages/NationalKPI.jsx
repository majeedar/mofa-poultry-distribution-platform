import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../lib/api';
import socket from '../lib/socket';
import useAuthStore from '../store/auth';

// ── Searchable combobox ───────────────────────────────────────────────────────
function SearchableSelect({ value, onChange, options, placeholder, disabled, getLabel, getValue }) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef(null);

  const resolveValue = opt => getValue ? getValue(opt) : String(opt);
  const resolveLabel = opt => getLabel ? getLabel(opt) : String(opt);
  const filtered = query.trim()
    ? options.filter(o => resolveLabel(o).toLowerCase().includes(query.toLowerCase()))
    : options;
  const selected = options.find(o => resolveValue(o) === String(value));
  const displayText = selected ? resolveLabel(selected) : '';

  useEffect(() => {
    const handler = e => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = opt => { onChange(resolveValue(opt)); setQuery(''); setOpen(false); };
  const clear = e => { e.stopPropagation(); onChange(''); setQuery(''); setOpen(false); };

  return (
    <div ref={containerRef} className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`} style={{ minWidth: 150 }}>
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center border rounded-lg bg-white cursor-pointer transition-colors
          ${open ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-gray-200 hover:border-gray-300'}`}
      >
        <input
          type="text"
          value={open ? query : displayText}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); setQuery(''); }}
          placeholder={placeholder}
          className="text-sm px-3 py-1.5 outline-none flex-1 min-w-0 bg-transparent cursor-text w-full"
          style={{ minWidth: 0 }}
        />
        {value && <button onMouseDown={clear} className="px-1 text-gray-400 hover:text-gray-600 text-base leading-none flex-shrink-0">×</button>}
        <span className="px-2 text-gray-400 text-xs flex-shrink-0">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ minWidth: '100%', maxHeight: 220, overflowY: 'auto', width: 'max-content', maxWidth: 280 }}>
          <button onMouseDown={() => { onChange(''); setQuery(''); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm ${!value ? 'bg-green-50 text-brand-primary font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
            {placeholder}
          </button>
          <div className="border-t border-gray-100" />
          {filtered.length === 0
            ? <p className="px-3 py-2 text-sm text-gray-400">No results for "{query}"</p>
            : filtered.map(opt => {
                const v = resolveValue(opt); const l = resolveLabel(opt);
                return (
                  <button key={v} onMouseDown={() => pick(opt)}
                    className={`w-full text-left px-3 py-2 text-sm ${String(value) === String(v) ? 'bg-green-50 text-brand-primary font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                );
              })
          }
        </div>
      )}
    </div>
  );
}

// ── Period select ─────────────────────────────────────────────────────────────
function PeriodSelect({ value, onChange }) {
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const months = Array.from({ length: month + 1 }, (_, m) => ({ value: `${year}-${String(m+1).padStart(2,'0')}`, label: `${monthNames[m]} ${year}` }));
  const prevMonths = year > 2024 ? Array.from({ length: 12 }, (_, m) => ({ value: `${year-1}-${String(m+1).padStart(2,'0')}`, label: `${monthNames[m]} ${year-1}` })) : [];
  const years = Array.from({ length: year - 2023 }, (_, i) => 2024 + i);
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
      style={{ minWidth: 140 }}>
      <option value="all">All time</option>
      <option value="today">Today</option>
      <option value="7d">Last 7 days</option>
      <option value="30d">Last 30 days</option>
      <option value="month">This month</option>
      <option value="year">This year</option>
      <optgroup label={`── ${year} by month`}>{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>
      {prevMonths.length > 0 && <optgroup label={`── ${year-1} by month`}>{prevMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>}
      <optgroup label="── By year">{years.map(y => <option key={y} value={String(y)}>{y}</option>)}</optgroup>
    </select>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────────
const ALERT_ICONS = { delayed: '⏰', doa_sp: '💀', discrepancy: '⚖️' };
const AlertRow = ({ alert }) => (
  <div className={`flex items-start gap-3 px-4 py-3 border-l-4 rounded-r-lg
    ${alert.severity === 'critical' ? 'border-red-500 bg-red-50' : 'border-amber-400 bg-amber-50'}`}>
    <span className="text-lg flex-shrink-0 mt-0.5">{ALERT_ICONS[alert.type]}</span>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-bold uppercase tracking-wide ${alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>{alert.severity}</span>
        <span className="text-sm font-semibold text-gray-800">{alert.message}</span>
      </div>
      <p className="text-xs text-gray-600 mt-0.5">{alert.detail}</p>
      {alert.batch && <p className="text-xs text-gray-400 mt-0.5 font-mono">{alert.batch}</p>}
    </div>
  </div>
);

// ── Pipeline stage card ───────────────────────────────────────────────────────
function PipelineCard({ icon, label, sublabel, value, color = 'gray', arrow = true }) {
  const colors = {
    gray:   'bg-gray-50  border-gray-200  text-gray-800',
    blue:   'bg-blue-50  border-blue-200  text-blue-800',
    amber:  'bg-amber-50 border-amber-200 text-amber-800',
    green:  'bg-green-50 border-green-200 text-green-800',
    teal:   'bg-teal-50  border-teal-200  text-teal-800',
    brand:  'bg-[#e8f5ee] border-[#006B3F] text-[#006B3F]',
  };
  return (
    <div className="flex items-center">
      <div className={`flex-1 border rounded-xl px-4 py-3 ${colors[color]}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        </div>
        <p className={`text-2xl font-bold`}>{value?.toLocaleString() ?? '—'}</p>
        <p className="text-xs opacity-60 mt-0.5">{sublabel}</p>
      </div>
      {arrow && <span className="text-gray-300 text-xl font-light px-2 flex-shrink-0">›</span>}
    </div>
  );
}

// ── Small stat card ───────────────────────────────────────────────────────────
const MiniCard = ({ label, value, icon, sub, color = 'green' }) => (
  <div className="card py-3">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 text-${color}-600`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className="text-2xl">{icon}</span>
    </div>
  </div>
);

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NationalKPI() {
  const { user } = useAuthStore();
  const isRegional = user?.role === 'regional_officer';
  const isDistrict = user?.role === 'district_officer';
  const lockedRegion   = (isRegional || isDistrict) ? (user?.region   || '') : null;
  const lockedDistrict = isDistrict                 ? (user?.district || '') : null;

  const EMPTY = {
    period: 'all',
    region:   lockedRegion   ?? '',
    district: lockedDistrict ?? '',
    sp_id: '', farmer_id: '',
  };

  const [filters, setFilters] = useState(EMPTY);
  const [opts, setOpts]       = useState({ regions: [], districts: [], sps: [], farmers: [] });
  const [kpi, setKpi]         = useState(null);
  const [dist, setDist]       = useState([]);
  const [alerts, setAlerts]   = useState([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const buildParams = f => {
    const p = {};
    if (f.period && f.period !== 'all') p.period    = f.period;
    if (f.region)    p.region    = f.region;
    if (f.district)  p.district  = f.district;
    if (f.sp_id)     p.sp_id     = f.sp_id;
    if (f.farmer_id) p.farmer_id = f.farmer_id;
    return p;
  };

  const load = useCallback(async () => {
    const params = buildParams(filters);
    try {
      const [k, d] = await Promise.all([
        api.get('/dashboard/kpi',          { params }),
        api.get('/dashboard/distribution', { params }),
      ]);
      setKpi(k.data); setDist(d.data.slice(0, 5));
      setLastUpdate(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadAlerts = useCallback(async () => {
    try { const { data } = await api.get('/dashboard/delivery-alerts'); setAlerts(data); }
    catch (e) { console.error(e); }
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { loadAlerts(); const t = setInterval(loadAlerts, 60000); return () => clearInterval(t); }, [loadAlerts]);
  useEffect(() => {
    const refresh = () => load();
    const events = ['sp_receipt', 'farmer_receipt', 'batch_created'];
    events.forEach(e => socket.on(e, refresh));
    const t = setInterval(load, 10000);
    return () => { clearInterval(t); events.forEach(e => socket.off(e, refresh)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    api.get('/dashboard/filter-options', { params: { type: 'regions' } })
      .then(r => setOpts(o => ({ ...o, regions: r.data }))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!filters.region) { setOpts(o => ({ ...o, districts: [], sps: [], farmers: [] })); return; }
    Promise.all([
      api.get('/dashboard/filter-options', { params: { type: 'districts', region: filters.region } }),
      api.get('/dashboard/filter-options', { params: { type: 'sps', region: filters.region } }),
    ]).then(([d, s]) => setOpts(o => ({ ...o, districts: d.data, sps: s.data, farmers: [] }))).catch(() => {});
  }, [filters.region]);
  useEffect(() => {
    if (!filters.region || !filters.district) return;
    api.get('/dashboard/filter-options', { params: { type: 'sps', region: filters.region, district: filters.district } })
      .then(r => setOpts(o => ({ ...o, sps: r.data, farmers: [] }))).catch(() => {});
  }, [filters.region, filters.district]);
  useEffect(() => {
    if (!filters.region && !filters.sp_id) { setOpts(o => ({ ...o, farmers: [] })); return; }
    const p = { type: 'farmers' };
    if (filters.sp_id) p.sp_id = filters.sp_id;
    if (filters.district) p.district = filters.district;
    if (filters.region) p.region = filters.region;
    api.get('/dashboard/filter-options', { params: p })
      .then(r => setOpts(o => ({ ...o, farmers: r.data }))).catch(() => {});
  }, [filters.region, filters.district, filters.sp_id]);

  const setF = (key, val) => setFilters(prev => {
    const next = { ...prev, [key]: val };
    if (key === 'region')   { next.district = lockedDistrict ?? ''; next.sp_id = ''; next.farmer_id = ''; }
    if (key === 'district') { next.sp_id = ''; next.farmer_id = ''; }
    if (key === 'sp_id')    { next.farmer_id = ''; }
    return next;
  });

  const hasFilters = filters.period !== 'all' || filters.region || filters.district || filters.sp_id || filters.farmer_id;
  const tierData = ['anchor','small_medium','household'].map(t => ({ name: t.replace('_',' '), count: kpi?.tier_counts?.[t] ?? 0 }));
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 5);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DoCs Delivery Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Feed Ghana · Poultry Industry Revitalization</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Last updated</p>
          <p className="text-xs font-medium text-gray-600">{lastUpdate.toLocaleTimeString()}</p>
          <button onClick={load} className="text-xs text-brand-primary mt-1">↻ Refresh</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-5 shadow-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Filter</span>
          <PeriodSelect value={filters.period} onChange={v => setF('period', v)} />
          <span className="text-gray-200 mx-0.5">│</span>
          {lockedRegion
            ? <span className="text-xs bg-brand-primary text-white px-2.5 py-1.5 rounded-lg font-medium">📍 {lockedRegion}</span>
            : <SearchableSelect value={filters.region} onChange={v => setF('region', v)} options={opts.regions} placeholder="All Regions" getLabel={r => r} getValue={r => r} />
          }
          {lockedDistrict
            ? <span className="text-xs bg-brand-primary text-white px-2.5 py-1.5 rounded-lg font-medium">🏘️ {lockedDistrict}</span>
            : <SearchableSelect value={filters.district} onChange={v => setF('district', v)} options={opts.districts} placeholder="All Districts" disabled={!filters.region} getLabel={d => d} getValue={d => d} />
          }
          <SearchableSelect value={filters.sp_id} onChange={v => setF('sp_id', v)} options={opts.sps} placeholder="All Service Points" disabled={!filters.region}
            getLabel={s => `${s.sp_name}${s.location_name ? ` · ${s.location_name}` : ''}`} getValue={s => String(s.id)} />
          <SearchableSelect value={filters.farmer_id} onChange={v => setF('farmer_id', v)} options={opts.farmers} placeholder="All Farmers" disabled={!filters.region && !filters.sp_id}
            getLabel={f => `${f.full_name} (${f.farmer_number})`} getValue={f => String(f.id)} />
          {(filters.period !== 'all' || filters.sp_id || filters.farmer_id) && (
            <button onClick={() => { setFilters(EMPTY); setOpts(o => ({ ...o, districts: lockedRegion ? o.districts : [], sps: [], farmers: [] })); }}
              className="ml-1 text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0">
              ✕ Reset
            </button>
          )}
        </div>
        {hasFilters && (
          <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-400">Viewing:</span>
            {filters.period !== 'all' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{filters.period}</span>}
            {filters.region   && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{filters.region}</span>}
            {filters.district && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{filters.district}</span>}
            {filters.sp_id    && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{opts.sps.find(s => String(s.id) === filters.sp_id)?.sp_name || `SP#${filters.sp_id}`}</span>}
            {filters.farmer_id && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{opts.farmers.find(f => String(f.id) === filters.farmer_id)?.full_name || `Farmer#${filters.farmer_id}`}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading dashboard...</div>
      ) : (
        <>
          {/* ── Delivery Pipeline ─────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Delivery Pipeline</h2>
            <div className="grid grid-cols-6 gap-0">
              <PipelineCard icon="📦" label="Total Allocated"   sublabel="All batches loaded"              value={kpi?.total_allocated}        color="gray"  arrow />
              <PipelineCard icon="🏭" label="At Depot"          sublabel="Pending pickup by distributor"   value={kpi?.at_depot}               color="blue"  arrow />
              <PipelineCard icon="🚚" label="En Route"          sublabel="With distributor, in transit"    value={kpi?.in_transit}             color="amber" arrow />
              <PipelineCard icon="✅" label="Confirmed at SP"   sublabel="SP signed receipt"               value={kpi?.confirmed_at_sp}        color="teal"  arrow />
              <PipelineCard icon="🏪" label="SP Stock"          sublabel="Received, not yet at farm"       value={kpi?.sp_remaining}           color="green" arrow />
              <PipelineCard icon="👨‍🌾" label="Confirmed at Farm" sublabel="Farmer signed receipt"           value={kpi?.confirmed_at_farmers}   color="brand" arrow={false} />
            </div>
          </div>

          {/* ── Supporting metrics ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <MiniCard label="SPs Reached"              value={kpi?.sps_reached}               icon="🏪" sub="Confirmed receipt" />
            <MiniCard label="Farmers Reached"          value={kpi?.farmers_reached}            icon="👨‍🌾" sub="Confirmed receipt" />
            <MiniCard label="Total Delivery Mortality" value={kpi?.total_delivery_mortality?.toLocaleString()} icon="⚠️" sub="Dead on arrival" color="red" />
            <MiniCard label="DOA — Dist → SP"          value={kpi?.doa_sp?.toLocaleString()}   icon="🚚" sub="At service provider" color="orange" />
            <MiniCard label="DOA — SP → Farmer"        value={kpi?.doa_farmer?.toLocaleString()} icon="🏚️" sub="At farm" color="orange" />
          </div>

          {/* ── Alerts ────────────────────────────────────────────────────── */}
          {alerts.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-4 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">⚠️ Delivery Alerts</span>
                  {criticalCount > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{criticalCount} critical</span>}
                  <span className="bg-gray-100 text-gray-500 text-xs rounded-full px-2 py-0.5">{alerts.length} total</span>
                </div>
                {alerts.length > 5 && (
                  <button onClick={() => setShowAllAlerts(v => !v)} className="text-xs text-brand-primary hover:underline">
                    {showAllAlerts ? 'Show less ▴' : `Show all ${alerts.length} ▾`}
                  </button>
                )}
              </div>
              <div className="p-3 space-y-2">
                {visibleAlerts.map((alert, i) => <AlertRow key={i} alert={alert} />)}
              </div>
            </div>
          )}

          {/* ── Charts + Batches ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-4 text-sm">Farmers by Production Tier</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tierData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#006B3F" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-4 text-sm">Recent Batches</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-100">
                      <th className="pb-2 text-left">Batch</th>
                      <th className="pb-2 text-left">Date</th>
                      <th className="pb-2 text-left">DoCs</th>
                      <th className="pb-2 text-left">SPs</th>
                      <th className="pb-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dist.map(b => (
                      <tr key={b.batch_barcode}>
                        <td className="py-2 font-mono text-gray-700 text-xs truncate max-w-28">{b.batch_barcode}</td>
                        <td className="py-2 text-gray-600">{new Date(b.loading_date).toLocaleDateString()}</td>
                        <td className="py-2 text-gray-700">{parseInt(b.total_docs_loaded)?.toLocaleString()}</td>
                        <td className="py-2 text-gray-600">{b.sps_delivered}/{b.total_sps}</td>
                        <td className="py-2">
                          <span className={`badge-${b.batch_status==='fully_delivered'?'green':b.batch_status==='en_route'?'blue':'yellow'}`}>
                            {b.batch_status?.replace(/_/g,' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {dist.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">No batches for this selection</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
