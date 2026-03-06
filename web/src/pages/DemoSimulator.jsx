import React from 'react';
import PhoneSimulator from '../components/PhoneSimulator';
import SMSInbox from '../components/SMSInbox';
import FarmerSMSInbox from '../components/FarmerSMSInbox';

export default function DemoSimulator() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Demo Simulator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Built-in USSD and SMS simulation — no external services required.
          Use the phone on the left to simulate a household farmer dialling <strong>*714#</strong>.
          SMS confirmations appear on the right in real-time.
        </p>
      </div>

      {/* Household farmers reference */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm">
        <p className="font-semibold text-amber-800 mb-1">Household Farmers (USSD only — no smartphone)</p>
        <div className="grid grid-cols-3 gap-4 text-xs text-amber-700">
          <div><strong>F006</strong> — Kofi Nkrumah (+233500000006)</div>
          <div><strong>F007</strong> — Ama Sarpong (+233500000007)</div>
          <div><strong>F008</strong> — Yaw Boakye (+233500000008)</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-8">
        {/* USSD Phone Simulator */}
        <div className="col-span-2">
          <div className="card">
            <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <span>📱</span> USSD Phone Simulator
            </h2>
            <p className="text-xs text-gray-400 mb-6">Simulates a basic GSM phone dialling *714#</p>
            <PhoneSimulator />
          </div>
        </div>

        {/* SMS Inbox + Live Feed */}
        <div className="col-span-3">
          <div className="card h-full">
            <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <span>💬</span> Live SMS & Push Notification Feed
            </h2>
            <p className="text-xs text-gray-400 mb-4">All SMS and push notifications appear here in real-time via WebSocket</p>
            <SMSInbox />
          </div>
        </div>
      </div>

      {/* Farmer SMS Inbox */}
      <FarmerSMSInbox />

      {/* Demo instructions */}
      <div className="mt-6 card bg-brand-primary text-white">
        <h3 className="font-semibold mb-3">Demo Script — Step 6: USSD Household Farmer</h3>
        <ol className="text-sm space-y-2 text-green-100">
          <li>1. On the phone simulator, enter phone number <strong className="text-white">+233500000006</strong></li>
          <li>2. Click <strong className="text-white">Dial *714#</strong> — welcome message appears</li>
          <li>3. Enter Farmer ID: <strong className="text-white">F006</strong> → Send → Kofi Nkrumah is confirmed</li>
          <li>4. Enter birds alive: <strong className="text-white">48</strong> → Send</li>
          <li>5. Enter deaths: <strong className="text-white">0</strong> → Send</li>
          <li>6. Enter vaccine: <strong className="text-white">2</strong> (No) → Send</li>
          <li>7. Session ends — watch SMS confirmation appear on the right panel</li>
          <li>8. Data is now recorded in the database and visible on the national dashboard</li>
        </ol>
      </div>
    </div>
  );
}
