import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';

export default function FarmerSMSInbox() {
  const [farmers, setFarmers]           = useState([]);
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState(null);
  const [messages, setMessages]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef();

  // Load farmer list on mount
  useEffect(() => {
    api.get('/farmers').then(r => setFarmers(r.data)).catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Live SMS — prepend to inbox if it matches the selected farmer's phone
  useEffect(() => {
    if (!selected) return;
    const onSMS = (msg) => {
      if (msg.to === selected.phone_number) {
        setMessages(prev => [
          { id: Date.now(), to_phone: msg.to, body: msg.body, sent_at: msg.sentAt },
          ...prev,
        ]);
      }
    };
    socket.on('sms', onSMS);
    return () => socket.off('sms', onSMS);
  }, [selected]);

  const selectFarmer = async (farmer) => {
    setSelected(farmer);
    setSearch(`${farmer.full_name} (${farmer.farmer_number})`);
    setShowDropdown(false);
    setLoading(true);
    try {
      const { data } = await api.get('/sms-log', { params: { phone: farmer.phone_number } });
      setMessages(data);
    } catch { setMessages([]); }
    finally { setLoading(false); }
  };

  const clearSelection = () => {
    setSelected(null);
    setSearch('');
    setMessages([]);
  };

  const filtered = farmers
    .filter(f =>
      f.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      f.farmer_number?.toLowerCase().includes(search.toLowerCase()) ||
      f.phone_number?.includes(search)
    )
    .slice(0, 8);

  return (
    <div className="mt-6">
      <div className="card">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <span>📨</span> Farmer SMS Inbox
          </h2>
          {selected && (
            <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Search for any farmer to view all SMS messages sent to their phone. New messages appear live.
        </p>

        {/* Farmer search */}
        <div className="relative mb-4" ref={dropdownRef}>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-200 transition-all"
              placeholder="Search by name, farmer ID or phone number..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setShowDropdown(true);
                if (!e.target.value) clearSelection();
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>

          {/* Dropdown */}
          {showDropdown && search.length > 0 && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-xl z-20 overflow-hidden">
              {filtered.map(f => (
                <button
                  key={f.id}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors"
                  onMouseDown={() => selectFarmer(f)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {f.full_name?.[0] ?? 'F'}
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800">{f.full_name}</span>
                      <span className="text-gray-400 ml-2 text-xs">{f.farmer_number}</span>
                      <span className="text-gray-400 ml-1 text-xs">· {f.production_tier}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-gray-400 flex-shrink-0">{f.phone_number}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages area */}
        {!selected ? (
          <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
            <p className="text-4xl mb-3">📲</p>
            <p className="text-sm text-gray-500 font-medium">Select a farmer to view their SMS inbox</p>
            <p className="text-xs text-gray-400 mt-1">Includes delivery codes, collection reminders and confirmations</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            <div className="animate-spin text-2xl mb-2">⟳</div>
            Loading messages...
          </div>
        ) : (
          <>
            {/* Farmer identity bar */}
            <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-green-50 rounded-xl border border-green-100">
              <div className="w-10 h-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {selected.full_name?.[0] ?? 'F'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm">{selected.full_name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {selected.farmer_number} · {selected.phone_number} · {selected.production_tier}
                </p>
              </div>
              <span className="text-xs bg-white border border-green-200 text-green-700 font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                {messages.length} SMS
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-8 text-center">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm text-gray-400">No SMS messages found for this farmer yet.</p>
                <p className="text-xs text-gray-300 mt-1">Trigger an allocation or delivery to generate messages.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {messages.map((m, i) => (
                  <div key={m.id ?? i} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        <span className="text-xs font-mono font-semibold text-green-700">PIRCMES</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(m.sent_at || m.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{m.body}</p>
                    {/* Highlight collection code if present */}
                    {/Your collection code: ([A-Z0-9]{6})/.test(m.body) && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                        <span className="text-xs text-amber-600">Collection code:</span>
                        <span className="font-mono font-bold text-amber-800 text-sm tracking-widest">
                          {m.body.match(/Your collection code: ([A-Z0-9]{6})/)[1]}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
