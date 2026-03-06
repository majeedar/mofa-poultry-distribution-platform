import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import ExcelUploader from '../components/ExcelUploader';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;

export default function SPRegistration() {
  const [tab, setTab]   = useState('manual');
  const [sps, setSPs]   = useState([]);
  const [form, setForm] = useState({ ghana_card_number: '', full_name: '', phone_number: '', email: '', sp_number: '', sp_name: '', location_name: '', region: '', district: '', gps_lat: '', gps_lng: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg]   = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try { const { data } = await api.get('/users?role=sp_operator'); setSPs(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const validate = () => {
    const e = {};
    if (!GHANA_CARD_RE.test(form.ghana_card_number)) e.ghana_card_number = 'Format: GHA-XXXXXXXXX-X';
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!form.phone_number.trim()) e.phone_number = 'Required';
    if (!form.sp_name.trim()) e.sp_name = 'Required';
    if (!form.region.trim()) e.region = 'Required';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setMsg('');
    try {
      await api.post('/registrations', { ghana_card_number: form.ghana_card_number, requested_role: 'sp_operator', submitted_data: form });
      setMsg('✓ Service Provider registration submitted. Pending admin approval.');
      setForm({ ghana_card_number: '', full_name: '', phone_number: '', email: '', sp_number: '', sp_name: '', location_name: '', region: '', district: '', gps_lat: '', gps_lng: '' });
      load();
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setLoading(false); }
  };

  const fillRandom = () => {
    const rand9 = () => String(Math.floor(100000000 + Math.random() * 800000000));
    const regions = [
      { region: 'Ashanti',  district: 'Kumasi Metro', loc: 'Adum, Kumasi',   lat: '6.68830', lng: '-1.62480' },
      { region: 'Greater Accra', district: 'Accra Metro', loc: 'Accra North', lat: '5.60360', lng: '-0.18690' },
      { region: 'Northern', district: 'Tamale Metro', loc: 'Tamale Central', lat: '9.40390', lng: '-0.83990' },
    ];
    const r = regions[Math.floor(Math.random() * regions.length)];
    const n = Math.floor(10 + Math.random() * 90);
    setForm({ ghana_card_number: `GHA-${rand9()}-${Math.floor(Math.random()*10)}`, full_name: `SP${n} Operator`, phone_number: `+23330${String(Math.floor(1000000 + Math.random()*8999999))}`, email: `sp${n}@doccentre.gh`, sp_number: `SP0${n}`, sp_name: `${r.loc} DoC Centre`, location_name: r.loc, region: r.region, district: r.district, gps_lat: r.lat, gps_lng: r.lng });
  };

  const fillExisting = () => setForm({ ghana_card_number: 'GHA-300000001-0', full_name: 'SP Kumasi Operator', phone_number: '+233300000001', email: 'sp1@pircmes.gov.gh', sp_number: 'SP001', sp_name: 'Kumasi DoC Centre', location_name: 'Adum, Kumasi', region: 'Ashanti', district: 'Kumasi Metro', gps_lat: '6.68848', gps_lng: '-1.62443' });

  const Field = ({ name, label, type = 'text', placeholder }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} className={`input ${errors[name] ? 'border-red-400' : ''}`} value={form[name]} placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      {errors[name] && <p className="text-xs text-red-500 mt-0.5">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Service Provider Registration</h1>
      <p className="text-gray-500 text-sm mb-6">Register DoC distribution centres (Service Providers). Requires National Admin approval.</p>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('manual')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'manual' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Manual</button>
            <button onClick={() => setTab('excel')}  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'excel'  ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Excel Upload</button>
          </div>

          {tab === 'manual' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">New Service Provider</h2>
                <div className="flex gap-2">
                  <button type="button" onClick={fillRandom} className="px-3 py-1.5 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100">⚡ Fill New (Random)</button>
                  <button type="button" onClick={fillExisting} className="px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">🚫 Fill Existing (Reject)</button>
                </div>
              </div>
              {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Field name="ghana_card_number" label="Ghana Card Number (Operator) *" placeholder="GHA-123456789-0" /></div>
                <Field name="full_name"    label="Operator Full Name *" placeholder="SP Kumasi Operator" />
                <Field name="phone_number" label="Phone Number *"       placeholder="+233300000001" />
                <Field name="email"        label="Email"                type="email" placeholder="sp@example.com" />
                <Field name="sp_number"    label="SP Number *"          placeholder="SP001" />
                <Field name="sp_name"      label="Distribution Centre Name *" placeholder="Kumasi DoC Centre" />
                <Field name="location_name" label="Location Name *"    placeholder="Adum, Kumasi" />
                <Field name="region"       label="Region *"             placeholder="Ashanti" />
                <Field name="district"     label="District *"           placeholder="Kumasi Metro" />
                <Field name="gps_lat"      label="GPS Latitude"         type="number" placeholder="6.68848" />
                <Field name="gps_lng"      label="GPS Longitude"        type="number" placeholder="-1.62443" />
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Submitting...' : 'Submit for Approval'}</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'excel' && (
            <div className="card">
              <h2 className="font-semibold text-gray-700 mb-4">Bulk Upload via Excel</h2>
              <ExcelUploader uploadUrl="/registrations/upload" requestedRole="sp_operator" onSuccess={() => { setMsg('✓ Upload complete'); load(); }} templateUrl={`${API}/registrations/template/sp_operator`} />
            </div>
          )}
        </div>

        <div className="card col-span-1 self-start">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Service Providers ({sps.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sps.map(s => (
              <div key={s.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-gray-800">{s.full_name}</p>
                <p className="text-xs text-gray-500 font-mono">{s.ghana_card_number}</p>
                <p className="text-xs text-gray-400">{s.region} · {s.district}</p>
                <span className={`badge-${s.is_active ? 'green' : 'gray'} mt-1`}>{s.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
            {sps.length === 0 && <p className="text-xs text-gray-400">No SPs registered yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
