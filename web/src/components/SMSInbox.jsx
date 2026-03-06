import React, { useState, useEffect, useRef } from 'react';
import socket from '../lib/socket';

export default function SMSInbox() {
  const [messages, setMessages] = useState([]);
  const [pushEvents, setPushEvents] = useState([]);
  const bottomRef = useRef();

  useEffect(() => {
    const onSMS = (msg) => {
      setMessages(prev => [{ ...msg, id: Date.now() }, ...prev].slice(0, 50));
    };
    const onPush = (event) => {
      setPushEvents(prev => [{ ...event, id: Date.now() }, ...prev].slice(0, 20));
    };
    socket.on('sms',  onSMS);
    socket.on('push', onPush);
    return () => { socket.off('sms', onSMS); socket.off('push', onPush); };
  }, []);

  const clear = () => { setMessages([]); setPushEvents([]); };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 text-sm">Live Feed</h3>
        <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Clear</button>
      </div>

      {/* Push events */}
      {pushEvents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Push Notifications</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {pushEvents.map(e => (
              <div key={e.id} className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-blue-800">{e.title}</p>
                <p className="text-xs text-blue-600">{e.body}</p>
                <p className="text-xs text-blue-400 mt-0.5">{new Date(e.ts).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SMS messages */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">SMS Messages ({messages.length})</p>
        {messages.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
            <p className="text-2xl mb-1">💬</p>
            <p className="text-xs text-gray-400">SMS will appear here in real-time</p>
            <p className="text-xs text-gray-300 mt-1">Run USSD session or trigger farmer delivery</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto" ref={bottomRef}>
            {messages.map(m => (
              <div key={m.id} className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-semibold text-brand-primary">{m.to}</span>
                  <span className="text-xs text-gray-400">{new Date(m.sentAt).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
