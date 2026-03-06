import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import ExcelUploader from '../components/ExcelUploader';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const GHANA_CARD_RE = /^GHA-\d{9}-\d$/;
const ROLES = ['regional_officer', 'district_officer', 'aea', 'national_officer'];

export default function UserManagement() {
  const [tab, setTab]         = useState('manual');
  const [selectedRole, setRole] = useState('aea');
  const [users, setUsers]     = useState([]);
  const [filterRole, setFilterRole] = useState('');
  const [form, setForm]       = useState({ ghana_card_number: '', full_name: '', phone_number: '', email: '', region: '', district: '', aea_number: '', distributor_number: '' });
  const [errors, setErrors]   = useState({});
  const [msg, setMsg]         = useState('');
  const [loading, setLoading] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const load = async () => {
    try {
      const q = filterRole ? `?role=${filterRole}` : '';
      const { data } = await api.get(`/users${q}`);
      setUsers(data);
    } catch {}
  };
  useEffect(() => { load(); }, [filterRole]);

  const validate = () => {
    const e = {};
    if (!GHANA_CARD_RE.test(form.ghana_card_number)) e.ghana_card_number = 'Format: GHA-XXXXXXXXX-X';
    if (!form.full_name.trim()) e.full_name = 'Required';
    if (!form.phone_number.trim()) e.phone_number = 'Required';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!validate()) return;
    setLoading(true); setMsg('');
    try {
      await api.post('/registrations', { ghana_card_number: form.ghana_card_number, requested_role: selectedRole, submitted_data: form });
      setMsg(`✓ ${selectedRole.replace(/_/g,' ')} registration submitted. Pending admin approval.`);
      setForm({ ghana_card_number: '', full_name: '', phone_number: '', email: '', region: '', district: '', aea_number: '', distributor_number: '' });
      load();
    } catch (err) { setMsg('Error: ' + (err.response?.data?.error || err.message)); }
    finally { setLoading(false); }
  };

  const toggleActive = async (id, isActive) => {
    await api.put(`/users/${id}`, { is_active: !isActive });
    load();
  };

  const Field = ({ name, label, type = 'text', placeholder }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} className={`input ${errors[name] ? 'border-red-400' : ''}`} value={form[name]}
        placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      {errors[name] && <p className="text-xs text-red-500 mt-0.5">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">User Management</h1>
      <p className="text-gray-500 text-sm mb-6">Register oversight members and AEAs. All registrations require National Admin approval.</p>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('manual')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'manual' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Manual</button>
            <button onClick={() => setTab('excel')}  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'excel'  ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Excel Upload</button>
            <button onClick={() => setTab('list')}   className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'list'   ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'}`}>All Users</button>
          </div>

          {tab === 'manual' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-semibold text-gray-700">Register User</h2>
                <select className="input max-w-xs" value={selectedRole} onChange={e => setRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>}
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Field name="ghana_card_number" label="Ghana Card Number *" placeholder="GHA-123456789-0" /></div>
                <Field name="full_name"    label="Full Name *"   placeholder="Yaw Darko" />
                <Field name="phone_number" label="Phone Number *" placeholder="+233244000004" />
                <Field name="email"        label="Email"         type="email" placeholder="user@pircmes.gov.gh" />
                <Field name="region"       label="Region *"      placeholder="Ashanti" />
                <Field name="district"     label="District"      placeholder="Kumasi Metro" />
                {selectedRole === 'aea' && <Field name="aea_number" label="AEA Number" placeholder="AEA004" />}
                <div className="col-span-2">
                  <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Submitting...' : 'Submit for Approval'}</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'excel' && (
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-semibold text-gray-700">Bulk Upload</h2>
                <select className="input max-w-xs" value={selectedRole} onChange={e => setRole(e.target.value)}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <ExcelUploader uploadUrl="/registrations/upload" requestedRole={selectedRole}
                onSuccess={() => { setMsg('✓ Upload complete'); load(); }}
                templateUrl={`${API}/registrations/template/${selectedRole}`} />
            </div>
          )}

          {tab === 'list' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">All Users</h2>
                <select className="input max-w-xs" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                  <option value="">All roles</option>
                  {['national_admin','national_officer','regional_officer','district_officer','aea','distributor','sp_operator','farmer'].map(r => (
                    <option key={r} value={r}>{r.replace(/_/g,' ')}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-100">
                    <th className="pb-2 text-left">Name</th>
                    <th className="pb-2 text-left">Ghana Card</th>
                    <th className="pb-2 text-left">Role</th>
                    <th className="pb-2 text-left">Region</th>
                    <th className="pb-2 text-left">Last Login</th>
                    <th className="pb-2 text-left">Status</th>
                    <th className="pb-2 text-left">Actions</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="py-2 text-gray-800 font-medium">{u.full_name}</td>
                        <td className="py-2 font-mono text-gray-600">{u.ghana_card_number}</td>
                        <td className="py-2"><span className="badge-blue">{u.role?.replace(/_/g,' ')}</span></td>
                        <td className="py-2 text-gray-500">{u.region || '—'}</td>
                        <td className="py-2 text-gray-400">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
                        <td className="py-2"><span className={`badge-${u.is_active ? 'green' : 'gray'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td className="py-2">
                          <button onClick={() => toggleActive(u.id, u.is_active)} className={`text-xs ${u.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'}`}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">No users found</p>}
              </div>
            </div>
          )}
        </div>

        <div className="card col-span-1 self-start">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">Quick Stats</h3>
          <div className="space-y-2">
            {['national_admin','national_officer','regional_officer','district_officer','aea'].map(r => {
              const count = users.filter(u => u.role === r).length;
              return (
                <div key={r} className="flex justify-between items-center text-xs">
                  <span className="text-gray-600 capitalize">{r.replace(/_/g,' ')}</span>
                  <span className="font-semibold text-gray-800">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
