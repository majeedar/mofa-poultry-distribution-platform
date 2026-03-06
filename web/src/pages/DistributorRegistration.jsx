import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import ExcelUploader from '../components/ExcelUploader';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;

export default function DistributorRegistration() {
  const [tab, setTab]           = useState('manual');
  const [distributors, setDistributors] = useState([]);
  const [form, setForm]         = useState({ ghana_card_number: '', full_name: '', phone_number: '', email: '', distributor_number: '', vehicle_number: '', assigned_region: '' });
  const [errors, setErrors]     = useState({});
  const [msg, setMsg]           = useState('');
  const [loading, setLoading]   = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/users?role=distributor');
      setDistributors(data);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const validate = () => {
    const e = {};
    if (!GHANA_CARD_RE.test(form.ghana_card_number)) e.ghana_card_number = 'Format: GHA-XXXXXXXXX-X';
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!form.phone_number.trim()) e.phone_number = 'Required';
    if (!form.distributor_number.trim()) e.distributor_number = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setMsg('');
    try {
      await api.post('/registrations', {
        ghana_card_number: form.ghana_card_number,
        requested_role: 'distributor',
        submitted_data: form,
      });
      setMsg('✓ Distributor registration submitted. Pending admin approval.');
      setForm({ ghana_card_number: '', full_name: '', phone_number: '', email: '', distributor_number: '', vehicle_number: '', assigned_region: '' });
      load();
    } catch (err) {
      setMsg('Error: ' + (err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  };

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
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Distributor Registration</h1>
      <p className="text-gray-500 text-sm mb-6">Register new distributors manually or upload via Excel. Registrations require National Admin approval.</p>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('manual')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'manual' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Manual Registration</button>
            <button onClick={() => setTab('excel')}  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'excel'  ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Excel Upload</button>
          </div>

          {tab === 'manual' && (
            <div className="card">
              <h2 className="font-semibold text-gray-700 mb-4">New Distributor</h2>
              {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Field name="ghana_card_number" label="Ghana Card Number *" placeholder="GHA-123456789-0" />
                </div>
                <Field name="full_name"          label="Full Name *"          placeholder="Emmanuel Acheampong" />
                <Field name="phone_number"        label="Phone Number *"        placeholder="+233244000000" />
                <Field name="email"               label="Email Address"         type="email" placeholder="distributor@example.com" />
                <Field name="distributor_number"  label="Distributor Number *"  placeholder="DIST042" />
                <Field name="vehicle_number"      label="Vehicle Registration"   placeholder="GR-1234-21" />
                <Field name="assigned_region"     label="Assigned Region"        placeholder="Ashanti" />
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Submitting...' : 'Submit for Approval'}</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'excel' && (
            <div className="card">
              <h2 className="font-semibold text-gray-700 mb-4">Bulk Upload via Excel</h2>
              <ExcelUploader
                uploadUrl="/registrations/upload"
                requestedRole="distributor"
                onSuccess={() => { setMsg('✓ Excel upload complete'); load(); }}
                templateUrl={`${API}/registrations/template/distributor`}
              />
            </div>
          )}
        </div>

        {/* Registered distributors */}
        <div className="card col-span-1 self-start">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Registered Distributors ({distributors.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {distributors.map(d => (
              <div key={d.id} className="border border-gray-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-gray-800">{d.full_name}</p>
                <p className="text-xs text-gray-500 font-mono">{d.ghana_card_number}</p>
                <p className="text-xs text-gray-400">{d.region}</p>
                <span className={`badge-${d.is_active ? 'green' : 'gray'} mt-1`}>{d.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
            {distributors.length === 0 && <p className="text-xs text-gray-400">No distributors registered yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
