import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import useAuthStore from '../store/auth';

const DEMO_USERS = [
  { label: 'Kwame Asante',   role: 'National Admin',    email: 'admin@pircmes.gov.gh' },
  { label: 'Abena Mensah',   role: 'National Officer',  email: 'coordinator@pircmes.gov.gh' },
  { label: 'Kofi Boateng',   role: 'Depot Officer',     email: 'depot@pircmes.gov.gh' },
  { label: 'Yaw Darko',      role: 'Regional Officer',  email: 'regional@pircmes.gov.gh' },
  { label: 'Akua Owusu',     role: 'District Officer',  email: 'district@pircmes.gov.gh' },
];

function DemoUserDropdown({ onSelect }) {
  const [search, setSearch]   = useState('');
  const [open, setOpen]       = useState(false);
  const wrapRef               = useRef(null);

  const filtered = DEMO_USERS.filter(u =>
    u.label.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (user) => {
    setOpen(false);
    setSearch('');
    onSelect(user.email);
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-sm text-brand-primary border border-brand-primary rounded-xl px-4 py-2.5 hover:bg-green-50 transition-colors font-medium"
      >
        <span>🧪 Select demo user to log in</span>
        <span className="text-xs ml-2 opacity-60">{open ? '▴' : '▾'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or role..."
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* List */}
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">No users match "{search}"</li>
            )}
            {filtered.map(u => (
              <li key={u.email}>
                <button
                  type="button"
                  onClick={() => handleSelect(u)}
                  className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">{u.label}</span>
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">{u.role}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{u.email}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const { login }   = useAuthStore();
  const navigate    = useNavigate();

  const doLogin = async (email, password) => {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.user, data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleSubmit = (e) => { e.preventDefault(); doLogin(form.email, form.password); };
  const handleDemoSelect = (email) => doLogin(email, 'Demo2026!');

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-primary to-brand-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🐣</div>
          <h1 className="text-white text-2xl font-bold">PIRCMES</h1>
          <p className="text-green-200 text-sm mt-1">Poultry Industry Revitalization</p>
          <p className="text-green-300 text-xs">Central Monitoring &amp; Evaluation System</p>
          <p className="text-green-400 text-xs mt-1">Feed Ghana Programme · MoFA · PPMED</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-gray-800 font-semibold text-lg mb-6">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
              <input type="email" className="input" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="admin@pircmes.gov.gh" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" className="input" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Demo2026!" required />
            </div>

            {error && <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo quick-login */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-3 font-medium text-center">
              Demo · password for all accounts: <strong>Demo2026!</strong>
            </p>
            <DemoUserDropdown onSelect={handleDemoSelect} />
          </div>
        </div>
      </div>
    </div>
  );
}
