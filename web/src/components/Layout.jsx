import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth';
import api from '../lib/api';

const NAV = [
  // ── Distribution ──────────────────────────────────────────────────────────
  { to: '/dashboard',         label: 'Dashboard',            icon: '📊', category: 'distribution', roles: ['national_admin','national_officer','regional_officer','district_officer'] },
  { to: '/database',          label: 'Data Explorer',        icon: '🗄️',  category: 'distribution', roles: ['national_admin','national_officer','regional_officer','district_officer'] },
  { to: '/ndc',               label: 'DoCs Delivery',        icon: '🐣', category: 'distribution', roles: ['national_admin','national_officer'] },
  { to: '/distribution',      label: 'Distribution Tracker', icon: '🚚', category: 'distribution', roles: ['national_admin','national_officer','regional_officer','district_officer'] },
  { to: '/distributors',      label: 'Distributors',         icon: '🪪',  category: 'distribution', roles: ['national_admin','national_officer'] },
  { to: '/service-providers', label: 'Service Providers',    icon: '🏪', category: 'distribution', roles: ['national_admin','national_officer'] },
  { to: '/users',             label: 'User Management',      icon: '👥', category: 'distribution', roles: ['national_admin','national_officer'] },
  { to: '/approvals',         label: 'Pending Approvals',    icon: '✅', category: 'distribution', roles: ['national_admin'] },
  { to: '/audit',             label: 'Audit Trail',          icon: '🔍', category: 'distribution', roles: ['national_admin'] },
  { to: '/simulator',         label: 'Demo Simulator',       icon: '📱', category: 'distribution', roles: ['national_admin','national_officer'] },
  { to: '/notifications',     label: 'Notifications',        icon: '🔔', category: 'distribution', roles: ['national_admin','national_officer','regional_officer','district_officer'] },

  // ── Farm Monitoring (all Soon) ────────────────────────────────────────────
  { label: 'Farm Compliance', icon: '🌿', category: 'farm_monitoring', soon: true },
  { label: 'Mortality Map',   icon: '💀', category: 'farm_monitoring', soon: true },
  { label: 'AEA Visits',      icon: '👷', category: 'farm_monitoring', soon: true },
  { label: 'Delivery Alerts', icon: '⚠️',  category: 'farm_monitoring', soon: true },

  // ── Credit & Finance (all Soon) ───────────────────────────────────────────
  { label: 'Outgrower Credit',  icon: '💳', category: 'credit', soon: true },
  { label: 'Anchor Repayments', icon: '🏦', category: 'credit', soon: true },
  { label: 'Production Cycles', icon: '🔄', category: 'credit', soon: true },
  { label: 'Sales & Off-take',  icon: '📈', category: 'credit', soon: true },
];

const CATEGORIES = [
  { key: 'distribution',    label: 'Distribution',    icon: '🚚' },
  { key: 'farm_monitoring', label: 'Farm Monitoring',  icon: '🐔' },
  { key: 'credit',          label: 'Credit & Finance', icon: '💳' },
];

const INPUT_TABS = [
  { key: 'docs',     icon: '🐣', label: 'DoCs Delivery',    active: true  },
  { key: 'feed',     icon: '🌾', label: 'Feed Delivery',    active: false },
  { key: 'vetdrugs', icon: '💊', label: 'Vet Drugs',        active: false },
  { key: 'vaccines', icon: '💉', label: 'Vaccines',         active: false },
  { key: 'other',    icon: '📦', label: 'Other Deliveries', active: false },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        setUnread(data.count);
      } catch {}
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const [activeCategory, setActiveCategory] = useState('distribution');

  const handleLogout = () => { logout(); navigate('/login'); };
  const visible = NAV.filter(n =>
    n.category === activeCategory &&
    (!n.roles || n.roles.includes(user?.role))
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-brand-primary flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-brand-dark">
          <h1 className="text-white font-bold text-base leading-tight">PIRCMES</h1>
          <p className="text-green-200 text-xs mt-0.5">Feed Ghana Programme</p>
          <p className="text-green-300 text-xs">MoFA · PPMED</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visible.map(n => n.soon ? (
            <div
              key={n.label}
              className="sidebar-link opacity-50 cursor-not-allowed select-none"
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
              <span className="ml-auto text-[9px] bg-green-800 text-green-300 px-1.5 py-0.5 rounded-full font-normal leading-tight">
                Soon
              </span>
            </div>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
              {n.to === '/notifications' && unread > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unread}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-brand-dark">
          <p className="text-green-200 text-xs font-medium truncate">{user?.fullName}</p>
          <p className="text-green-300 text-xs capitalize mb-3">{user?.role?.replace(/_/g,' ')}</p>
          <button onClick={handleLogout} className="w-full text-xs text-red-300 hover:text-red-100 text-left">Sign out</button>
        </div>
      </aside>

      {/* Right side */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top-level category bar */}
        <div className="bg-brand-primary flex-shrink-0">
          <div className="flex">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-2.5 px-8 py-3.5 text-base font-bold border-b-4 transition-colors whitespace-nowrap
                  ${activeCategory === cat.key
                    ? 'border-white text-white'
                    : 'border-transparent text-green-200 hover:text-white hover:border-green-300'
                  }`}
              >
                <span className="text-lg">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input delivery type tab bar (shown under Distribution category) */}
        {activeCategory === 'distribution' && (
          <div className="bg-white border-b border-gray-200 flex-shrink-0">
            <div className="flex">
              {INPUT_TABS.map(tab => (
                <button
                  key={tab.key}
                  disabled={!tab.active}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                    ${tab.active && tab.key === 'docs'
                      ? 'border-brand-primary text-brand-primary'
                      : tab.active
                        ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        : 'border-transparent text-gray-300 cursor-not-allowed'
                    }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {!tab.active && (
                    <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-normal leading-tight">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {activeCategory === 'distribution' ? (
            <Outlet />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="text-6xl mb-6">
                {CATEGORIES.find(c => c.key === activeCategory)?.icon}
              </div>
              <h2 className="text-2xl font-bold text-gray-700 mb-2">
                {CATEGORIES.find(c => c.key === activeCategory)?.label}
              </h2>
              <p className="text-gray-400 text-sm max-w-sm">
                This section is under development and will be available in a future release.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
