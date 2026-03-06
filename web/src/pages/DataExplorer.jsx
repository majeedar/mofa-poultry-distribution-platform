import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../lib/api';
import useAuthStore from '../store/auth';

// ── Table definitions ─────────────────────────────────────────────────────────
const TABLES = [
  { key: 'farmers',           label: 'Farmers',            icon: '👨‍🌾', filters: ['region','district','sp','tier','active'] },
  { key: 'service_providers', label: 'Service Providers',  icon: '🏪', filters: ['region','district','active'] },
  { key: 'distributors',      label: 'Distributors',       icon: '🚚', filters: ['region','active'] },
  { key: 'batches',           label: 'DoC Batches',        icon: '🐣', filters: ['batch_status'] },
  { key: 'allocations',       label: 'Allocations',        icon: '📦', filters: ['region','district','sp','alloc_status'] },
  { key: 'deliveries',        label: 'Farmer Deliveries',  icon: '🏠', filters: ['region','district','sp','delivery_status'] },
];

const COL_LABELS = {
  farmer_number: 'Farmer #', full_name: 'Full Name', phone_number: 'Phone',
  gender: 'Gender', production_tier: 'Tier', sp_name: 'Service Point',
  sp_location: 'SP Location', region: 'Region', district: 'District',
  farm_location: 'Farm Location', flock_capacity: 'Flock Cap.', collection_method: 'Collection',
  is_active: 'Active', registered_date: 'Registered',
  sp_number: 'SP #', location_name: 'Location', catchment_area: 'Catchment',
  operator_name: 'Operator', operator_phone: 'Op. Phone',
  distributor_number: 'Dist. #', vehicle_number: 'Vehicle', assigned_region: 'Region',
  batch_barcode: 'Batch #', loading_date: 'Load Date', status: 'Status',
  total_docs_loaded: 'Total DoCs', num_sp_allocations: 'SPs', distributor_name: 'Distributor',
  allocation_barcode: 'Alloc. #', batch_date: 'Batch Date', recipient_name: 'Recipient',
  recipient_location: 'Location', docs_allocated: 'Allocated', docs_confirmed: 'Confirmed',
  scanned_at: 'Scanned At',
  delivery_barcode: 'Delivery #', farmer_name: 'Farmer', farmer_number: 'Farmer #',
  docs_delivered: 'Delivered', signed_at: 'Signed At',
};

const STATUS_COLORS = {
  active: 'badge-green', inactive: 'badge-red',
  loaded: 'badge-blue', en_route: 'badge-yellow', fully_delivered: 'badge-green',
  partially_delivered: 'badge-amber', pending: 'badge-yellow',
  delivered: 'badge-green', collected: 'badge-teal', discrepancy: 'badge-red',
};

const TIER_LABELS = { anchor: '🌟 Anchor', small_medium: '👩‍🌾 Small/Medium', household: '🏠 Household' };

const PAGE_SIZE = 100;

// ── Searchable combobox (same as NationalKPI) ─────────────────────────────────
function SearchableSelect({ value, onChange, options, placeholder, disabled, getLabel, getValue }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  const rv  = opt => getValue ? getValue(opt) : String(opt);
  const rl  = opt => getLabel ? getLabel(opt) : String(opt);
  const filtered = query.trim() ? options.filter(o => rl(o).toLowerCase().includes(query.toLowerCase())) : options;
  const selected = options.find(o => rv(o) === String(value));

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`} style={{ minWidth: 140 }}>
      <div onClick={() => !disabled && setOpen(o => !o)}
        className={`flex items-center border rounded-lg bg-white cursor-pointer transition-colors
          ${open ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-gray-200 hover:border-gray-300'}`}>
        <input type="text" value={open ? query : (selected ? rl(selected) : '')}
          onChange={e => setQuery(e.target.value)} onFocus={() => { setOpen(true); setQuery(''); }}
          placeholder={placeholder}
          className="text-sm px-3 py-1.5 outline-none flex-1 min-w-0 bg-transparent w-full" style={{ minWidth: 0 }} />
        {value && <button onMouseDown={e => { e.stopPropagation(); onChange(''); setQuery(''); setOpen(false); }}
          className="px-1 text-gray-400 hover:text-gray-600 text-base leading-none flex-shrink-0">×</button>}
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
            ? <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            : filtered.map(opt => {
                const v = rv(opt); const l = rl(opt);
                return <button key={v} onMouseDown={() => { onChange(v); setQuery(''); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm ${String(value) === String(v) ? 'bg-green-50 text-brand-primary font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>{l}</button>;
              })
          }
        </div>
      )}
    </div>
  );
}

// ── Cell renderer ─────────────────────────────────────────────────────────────
function CellValue({ col, val }) {
  if (val === null || val === undefined || val === '') return <span className="text-gray-300">—</span>;
  if (col === 'is_active') return <span className={`badge ${val ? 'badge-green' : 'badge-red'}`}>{val ? 'Active' : 'Inactive'}</span>;
  if (col === 'production_tier') return <span className="text-xs font-medium">{TIER_LABELS[val] || val}</span>;
  if (col === 'status') return <span className={`badge ${STATUS_COLORS[val] || 'badge-gray'}`}>{val.replace(/_/g, ' ')}</span>;
  if (col === 'collection_method') return <span className="capitalize">{val}</span>;
  if (col === 'gender') return <span className="capitalize">{val}</span>;
  return <span>{String(val)}</span>;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DataExplorer() {
  const { user } = useAuthStore();
  const isRegional = user?.role === 'regional_officer';
  const isDistrict = user?.role === 'district_officer';
  const lockedRegion   = (isRegional || isDistrict) ? (user?.region   || '') : null;
  const lockedDistrict = isDistrict                 ? (user?.district || '') : null;

  const [tableKey, setTableKey]   = useState('farmers');
  const lockedInit = { ...(lockedRegion ? { region: lockedRegion } : {}), ...(lockedDistrict ? { district: lockedDistrict } : {}) };
  const [filters, setFilters]     = useState(lockedInit);
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError]         = useState('');

  // Cascading filter options
  const [regions, setRegions]     = useState([]);
  const [districts, setDistricts] = useState([]);
  const [sps, setSps]             = useState([]);

  const tableDef = TABLES.find(t => t.key === tableKey);

  // Load region options on mount
  useEffect(() => {
    api.get('/dashboard/filter-options', { params: { type: 'regions' } })
      .then(r => setRegions(r.data))
      .catch(() => {});
  }, []);

  // Load districts when region changes
  useEffect(() => {
    if (!filters.region) { setDistricts([]); return; }
    api.get('/dashboard/filter-options', { params: { type: 'districts', region: filters.region } })
      .then(r => setDistricts(r.data))
      .catch(() => {});
  }, [filters.region]);

  // Load SPs when region/district changes
  useEffect(() => {
    if (!filters.region && !filters.district) { setSps([]); return; }
    api.get('/dashboard/filter-options', { params: { type: 'sps', region: filters.region, district: filters.district } })
      .then(r => setSps(r.data))
      .catch(() => {});
  }, [filters.region, filters.district]);

  const buildParams = useCallback((overrideLimit) => {
    const p = {
      table: tableKey,
      limit: overrideLimit ?? PAGE_SIZE,
      offset: overrideLimit ? 0 : page * PAGE_SIZE,
    };
    if (filters.region)   p.region   = filters.region;
    if (filters.district) p.district = filters.district;
    if (filters.sp_id)    p.sp_id    = filters.sp_id;
    if (filters.tier)     p.tier     = filters.tier;
    if (filters.active != null && filters.active !== '') p.active = filters.active;
    if (filters.status)   p.status   = filters.status;
    return p;
  }, [tableKey, filters, page]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/data-explorer', { params: buildParams() });
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when table or filters change
  const changeTable = key => { setTableKey(key); setFilters(lockedInit); setPage(0); };
  const setFilter   = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); };
  const resetFilters = () => { setFilters({}); setPage(0); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/data-explorer', { params: buildParams(99999) });
      const ws = XLSX.utils.json_to_sheet(data.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tableDef.label);
      XLSX.writeFile(wb, `${tableKey}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert('Export failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setExporting(false);
    }
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const start   = page * PAGE_SIZE + 1;
  const end     = Math.min((page + 1) * PAGE_SIZE, total);
  const hasFilters = Object.entries(filters).some(([k, v]) => v != null && v !== '' && k !== 'region' && k !== 'district') ||
    (!lockedRegion && filters.region) || (!lockedDistrict && filters.district);

  // Filter controls for current table
  const activeFilters = tableDef?.filters || [];

  return (
    <div className="p-6 space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">🗄️ Data Explorer</h1>
          <p className="text-xs text-gray-400 mt-0.5">Browse and export programme data</p>
        </div>

        {/* Table selector */}
        <div className="flex flex-wrap gap-2">
          {TABLES.map(t => (
            <button
              key={t.key}
              onClick={() => changeTable(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${tableKey === t.key
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-brand-primary hover:text-brand-primary'
                }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="card py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter</span>

          {activeFilters.includes('region') && (
            lockedRegion
              ? <span className="text-xs bg-brand-primary text-white px-2.5 py-1.5 rounded-lg font-medium">📍 {lockedRegion}</span>
              : <SearchableSelect
                  value={filters.region || ''}
                  onChange={v => setFilter('region', v)}
                  options={regions}
                  placeholder="All Regions"
                  getLabel={o => o} getValue={o => o}
                />
          )}

          {activeFilters.includes('district') && (
            lockedDistrict
              ? <span className="text-xs bg-brand-primary text-white px-2.5 py-1.5 rounded-lg font-medium">🏘️ {lockedDistrict}</span>
              : <SearchableSelect
                  value={filters.district || ''}
                  onChange={v => setFilter('district', v)}
                  options={districts}
                  placeholder="All Districts"
                  disabled={!filters.region}
                  getLabel={o => o} getValue={o => o}
                />
          )}

          {activeFilters.includes('sp') && (
            <SearchableSelect
              value={filters.sp_id || ''}
              onChange={v => setFilter('sp_id', v)}
              options={sps}
              placeholder="All Service Points"
              disabled={!filters.region}
              getLabel={o => o.sp_name} getValue={o => String(o.id)}
            />
          )}

          {activeFilters.includes('tier') && (
            <select
              value={filters.tier || ''}
              onChange={e => setFilter('tier', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-brand-primary"
            >
              <option value="">All Tiers</option>
              <option value="anchor">🌟 Anchor</option>
              <option value="small_medium">👩‍🌾 Small/Medium</option>
              <option value="household">🏠 Household</option>
            </select>
          )}

          {activeFilters.includes('active') && (
            <select
              value={filters.active ?? ''}
              onChange={e => setFilter('active', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-brand-primary"
            >
              <option value="">All Status</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          )}

          {activeFilters.includes('batch_status') && (
            <select
              value={filters.status || ''}
              onChange={e => setFilter('status', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-brand-primary"
            >
              <option value="">All Statuses</option>
              <option value="loaded">Loaded</option>
              <option value="en_route">En Route</option>
              <option value="partially_delivered">Partially Delivered</option>
              <option value="fully_delivered">Fully Delivered</option>
            </select>
          )}

          {activeFilters.includes('alloc_status') && (
            <select
              value={filters.status || ''}
              onChange={e => setFilter('status', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-brand-primary"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="en_route">En Route</option>
              <option value="delivered">Delivered</option>
              <option value="discrepancy">Discrepancy</option>
            </select>
          )}

          {activeFilters.includes('delivery_status') && (
            <select
              value={filters.status || ''}
              onChange={e => setFilter('status', e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-brand-primary"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="collected">Collected</option>
              <option value="discrepancy">Discrepancy</option>
            </select>
          )}

          {hasFilters && (
            <button
              onClick={() => { setFilters(lockedInit); setPage(0); }}
              className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors"
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Toolbar: count + export + pagination ──────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          {loading
            ? 'Loading...'
            : total === 0
              ? 'No records found'
              : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} records`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-40"
          >
            {exporting ? '⏳ Exporting...' : '📥 Export Excel'}
          </button>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >◀</button>
            <span className="text-xs text-gray-500 px-2">Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
            <button
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >▶</button>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <div className="text-4xl mb-3">{tableDef?.icon}</div>
            <p className="text-sm">No records match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {COL_LABELS[col] || col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    {columns.map(col => (
                      <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                        <CellValue col={col} val={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
