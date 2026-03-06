import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';

const typeIcon = { sp_receipt_confirmed: '🏪', farmer_receipt_confirmed: '👨‍🌾', mortality_reported: '⚠️', mortality_flagged: '🚩', daily_entry_submitted: '📋', daily_entry_missed: '❌', sms_sent: '💬', aea_visit_triggered: '🗓️' };

export default function Notifications() {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifs(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const onPush = () => load();
    socket.on('push', onPush);
    return () => socket.off('push', onPush);
  }, []);

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
  };

  const markAll = async () => {
    await api.put('/notifications/read-all');
    setNotifs(n => n.map(x => ({ ...x, is_read: true })));
  };

  const unread = notifs.filter(n => !n.is_read).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unread > 0 && <p className="text-sm text-red-500 mt-0.5">{unread} unread</p>}
        </div>
        {unread > 0 && <button onClick={markAll} className="btn-secondary text-xs">Mark all read</button>}
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">Loading...</div> : (
        <div className="space-y-2">
          {notifs.map(n => (
            <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
              className={`card cursor-pointer transition-all ${!n.is_read ? 'border-l-4 border-l-brand-primary bg-green-50' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">{typeIcon[n.trigger_type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>{n.message_title}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{n.message_body}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`badge-${n.channel === 'sms' ? 'blue' : 'green'}`}>{n.channel}</span>
                    <span className="text-xs text-gray-400">{n.trigger_type?.replace(/_/g,' ')}</span>
                  </div>
                </div>
                {!n.is_read && <div className="w-2 h-2 bg-brand-primary rounded-full flex-shrink-0 mt-1" />}
              </div>
            </div>
          ))}
          {notifs.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-3xl mb-2">🔔</p>
              <p className="text-gray-400 text-sm">No notifications yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
