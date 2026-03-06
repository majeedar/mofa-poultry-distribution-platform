import React, { useState, useRef } from 'react';
import api from '../lib/api';

const INIT = { screen: 'idle', display: '', input: '', sessionId: null, phoneNumber: '+233500000006' };

export default function PhoneSimulator() {
  const [state, setState] = useState(INIT);
  const inputRef = useRef();

  const sessionId = state.sessionId || `demo-${Date.now()}`;

  const dial = async () => {
    if (!state.phoneNumber) return;
    const newSession = `demo-${Date.now()}`;
    setState(s => ({ ...s, screen: 'menu', sessionId: newSession, display: 'Connecting...', input: '', history: [] }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/ussd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ sessionId: newSession, serviceCode: '*714#', phoneNumber: state.phoneNumber, text: '' })
      });
      const text = await res.text();
      const isEnd = text.startsWith('END');
      const display = text.replace(/^(CON|END)\s?/, '');
      setState(s => ({ ...s, display, screen: isEnd ? 'ended' : 'menu', accumulated: '' }));
    } catch (e) {
      setState(s => ({ ...s, display: 'Connection error. Is the server running?', screen: 'ended' }));
    }
  };

  const send = async () => {
    const entry = state.input.trim();
    if (!entry) return;
    const accumulated = state.accumulated ? `${state.accumulated}*${entry}` : entry;
    setState(s => ({ ...s, display: 'Processing...', input: '' }));
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/ussd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ sessionId: state.sessionId, serviceCode: '*714#', phoneNumber: state.phoneNumber, text: accumulated })
      });
      const text = await res.text();
      const isEnd = text.startsWith('END');
      const display = text.replace(/^(CON|END)\s?/, '');
      setState(s => ({ ...s, display, accumulated, screen: isEnd ? 'ended' : 'menu' }));
    } catch (e) {
      setState(s => ({ ...s, display: 'Connection error.', screen: 'ended' }));
    }
  };

  const reset = () => setState(INIT);

  const handleKey = (e) => { if (e.key === 'Enter') { if (state.screen === 'idle') dial(); else send(); } };

  return (
    <div className="flex flex-col items-center">
      <div className="w-60 bg-gray-900 rounded-3xl shadow-2xl p-3 border-4 border-gray-700">
        {/* Speaker */}
        <div className="flex justify-center mb-2">
          <div className="w-16 h-1.5 bg-gray-600 rounded-full" />
        </div>

        {/* Screen */}
        <div className="bg-green-950 rounded-2xl p-3 min-h-48 flex flex-col">
          {/* Status bar */}
          <div className="flex justify-between text-green-400 text-xs mb-2">
            <span>*714#</span>
            <span>{state.phoneNumber}</span>
          </div>

          {state.screen === 'idle' && (
            <div className="flex-1 flex flex-col justify-center items-center text-center gap-3">
              <span className="text-green-300 text-3xl">📱</span>
              <p className="text-green-400 text-xs">PIRCMES USSD Demo</p>
              <div className="w-full">
                <input
                  className="w-full bg-green-900 text-green-200 text-xs rounded px-2 py-1 text-center border border-green-700 focus:outline-none"
                  value={state.phoneNumber}
                  onChange={e => setState(s => ({ ...s, phoneNumber: e.target.value }))}
                  placeholder="+233500000006"
                />
              </div>
            </div>
          )}

          {(state.screen === 'menu' || state.screen === 'ended') && (
            <div className="flex-1">
              <pre className="text-green-300 text-xs whitespace-pre-wrap font-mono leading-relaxed">{state.display}</pre>
            </div>
          )}

          {state.screen === 'menu' && (
            <div className="mt-2 border-t border-green-800 pt-2">
              <input
                ref={inputRef}
                className="w-full bg-green-900 text-green-200 text-xs rounded px-2 py-1 border border-green-700 focus:outline-none"
                value={state.input}
                onChange={e => setState(s => ({ ...s, input: e.target.value }))}
                onKeyDown={handleKey}
                placeholder="Type response..."
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {state.screen === 'idle' ? (
            <button onClick={dial} className="col-span-3 bg-green-600 hover:bg-green-500 text-white text-xs py-2 rounded-xl font-semibold transition-colors">
              Dial *714#
            </button>
          ) : state.screen === 'menu' ? (
            <>
              <button onClick={reset} className="col-span-1 bg-red-700 hover:bg-red-600 text-white text-xs py-2 rounded-xl transition-colors">End</button>
              <button onClick={send} className="col-span-2 bg-green-600 hover:bg-green-500 text-white text-xs py-2 rounded-xl font-semibold transition-colors">Send</button>
            </>
          ) : (
            <button onClick={reset} className="col-span-3 bg-gray-600 hover:bg-gray-500 text-white text-xs py-2 rounded-xl transition-colors">New Session</button>
          )}
        </div>

        {/* Home button */}
        <div className="flex justify-center mt-3">
          <div className="w-8 h-8 rounded-full border-2 border-gray-600 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-gray-600" />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Uses Farmer ID (e.g. <strong>F006</strong>, <strong>F007</strong>, <strong>F008</strong>)
      </p>
    </div>
  );
}
