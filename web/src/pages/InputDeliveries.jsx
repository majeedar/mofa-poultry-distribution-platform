import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth';

const TABS = [
  { key: 'docs',     icon: '🐣', label: 'DoCs Delivery',    active: true  },
  { key: 'feed',     icon: '🌾', label: 'Feed Delivery',    active: false },
  { key: 'vetdrugs', icon: '💊', label: 'Vet Drugs',        active: false },
  { key: 'vaccines', icon: '💉', label: 'Vaccines',         active: false },
  { key: 'other',    icon: '📦', label: 'Other Deliveries', active: false },
];

const DOCS_PAGES = [
  { icon: '📊', label: 'Dashboard',            desc: 'Analytics & KPIs',         route: '/dashboard',         roles: ['national_admin','national_officer','regional_officer','district_officer'] },
  { icon: '🐣', label: 'DoCs Delivery',        desc: 'NDC batch allocation',      route: '/ndc',               roles: ['national_admin','national_officer'] },
  { icon: '🚚', label: 'Distribution Tracker', desc: 'Track live deliveries',     route: '/distribution',      roles: ['national_admin','national_officer','regional_officer','district_officer'] },
  { icon: '🪪', label: 'Distributors',         desc: 'Manage distributors',       route: '/distributors',      roles: ['national_admin','national_officer'] },
  { icon: '🏪', label: 'Service Providers',    desc: 'Manage service points',     route: '/service-providers', roles: ['national_admin','national_officer'] },
  { icon: '👥', label: 'User Management',      desc: 'Roles & access control',    route: '/users',             roles: ['national_admin','national_officer'] },
  { icon: '✅', label: 'Pending Approvals',    desc: 'Farmer registrations',      route: '/approvals',         roles: ['national_admin'] },
  { icon: '🔍', label: 'Audit Trail',          desc: 'System activity log',       route: '/audit',             roles: ['national_admin'] },
  { icon: '📱', label: 'Demo Simulator',       desc: 'Test & demo tools',         route: '/simulator',         roles: ['national_admin','national_officer'] },
  { icon: '🔔', label: 'Notifications',        desc: 'Alerts & broadcasts',       route: '/notifications',     roles: ['national_admin','national_officer','regional_officer','district_officer'] },
];

export default function InputDeliveries() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('docs');

  const handleLogout = () => { logout(); navigate('/login'); };

  const visiblePages = DOCS_PAGES.filter(p => p.roles.includes(user?.role));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-brand-primary px-8 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">PIRCMES</h1>
          <p className="text-green-200 text-xs">Feed Ghana Programme · MoFA · PPMED</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-white text-sm font-medium">{user?.fullName}</p>
            <p className="text-green-300 text-xs capitalize">{user?.role?.replace(/_/g,' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-red-300 hover:text-red-100 border border-red-400 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Input type tab row */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.key}
              disabled={!tab.active}
              onClick={() => tab.active && setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.key
                  ? 'border-brand-primary text-brand-primary bg-green-50'
                  : tab.active
                    ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
                }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {!tab.active && (
                <span className="text-[9px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-normal">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <main className="flex-1 px-8 py-8">
        {activeTab === 'docs' ? (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-5">
              DoCs Delivery — Select a page
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {visiblePages.map(page => (
                <button
                  key={page.route}
                  onClick={() => navigate(page.route)}
                  className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 text-left hover:border-brand-primary hover:bg-green-50 transition-all shadow-sm group"
                >
                  <span className="text-xl flex-shrink-0">{page.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-primary leading-tight truncate">
                      {page.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{page.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-5xl mb-4">{TABS.find(t => t.key === activeTab)?.icon}</p>
            <p className="text-lg font-semibold text-gray-400">
              {TABS.find(t => t.key === activeTab)?.label}
            </p>
            <p className="text-sm text-gray-300 mt-1">Under development · Coming soon</p>
          </div>
        )}
      </main>

    </div>
  );
}
