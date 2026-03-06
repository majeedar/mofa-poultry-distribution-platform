import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../lib/api';
import socket from '../lib/socket';

// Fix leaflet default marker icon (broken with bundlers)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeTruckIcon(distributorNumber) {
  return new L.DivIcon({
    className: '',
    html: `<div style="
        display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="
        background:#1a6b3c;color:#fff;border-radius:50%;
        width:28px;height:28px;display:flex;align-items:center;
        justify-content:center;font-size:14px;
        box-shadow:0 2px 5px rgba(0,0,0,0.4);
        border:2px solid #fff;">🚚</div>
      <div style="
        background:#1a6b3c;color:#fff;font-size:9px;font-weight:700;
        padding:1px 4px;border-radius:3px;white-space:nowrap;
        box-shadow:0 1px 3px rgba(0,0,0,0.3);letter-spacing:0.3px;">
        ${distributorNumber}
      </div>
    </div>`,
    iconSize: [60, 46],
    iconAnchor: [30, 46],
    popupAnchor: [0, -48],
  });
}

const GHANA_CENTER = [7.9465, -1.0232];
const GHANA_BOUNDS = [[4.5, -3.5], [11.5, 1.5]];

// Keeps map bounds synced when locations change
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [positions.length]);
  return null;
}

const statusColor = { pending: 'yellow', en_route: 'blue', delivered: 'green', discrepancy: 'red' };

export default function DistributionTracker() {
  const [dist, setDist]       = useState([]);
  const [allocs, setAllocs]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]); // only en_route distributors
  const locRef = useRef({});

  // ── Load batch + allocation data ────────────────────────────────────────────
  const load = async () => {
    try {
      const { data } = await api.get('/dashboard/distribution');
      setDist(data);
      if (data[0] && !selected) setSelected(data[0].batch_barcode);
      const target = data.find(d => d.batch_barcode === (selected || data[0]?.batch_barcode));
      if (target) {
        const aRes = await api.get(`/allocations?batch_id=${target.id || ''}`);
        setAllocs(aRes.data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ── Load live locations (only active/en_route distributors) ─────────────────
  const loadLocations = async () => {
    try {
      const { data } = await api.get('/locations');
      // Only show distributors currently en_route
      const active = data.filter(l => l.status === 'en_route' || l.status === 'active');
      active.forEach(l => { locRef.current[l.distributor_id] = l; });
      setLocations(Object.values(locRef.current).filter(l => l.status === 'en_route' || l.status === 'active'));
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    load();
    loadLocations();
    const t1 = setInterval(load, 20000);
    const t2 = setInterval(loadLocations, 30000);
    socket.on('push', load);

    // Live distributor location updates — only show if en_route / active
    socket.on('distributor_location', (loc) => {
      if (loc.status === 'en_route' || loc.status === 'active') {
        locRef.current[loc.distributor_id] = loc;
      } else {
        delete locRef.current[loc.distributor_id];
      }
      setLocations(Object.values(locRef.current));
    });

    return () => {
      clearInterval(t1);
      clearInterval(t2);
      socket.off('push', load);
      socket.off('distributor_location');
    };
  }, []);

  const selectBatch = async (barcode, id) => {
    setSelected(barcode);
    const { data } = await api.get(`/allocations?batch_id=${id}`);
    setAllocs(data);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Distribution Tracker</h1>

      {/* ── Ghana live map ───────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🗺️</span>
            <h2 className="font-semibold text-gray-800 text-sm">Live Distributor Locations</h2>
            {locations.length > 0 && (
              <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {locations.length} en route
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">Updates every 30 s · only en-route distributors shown</p>
        </div>

        <div style={{ height: '320px' }}>
          <MapContainer
            center={GHANA_CENTER}
            zoom={7}
            maxBounds={GHANA_BOUNDS}
            maxBoundsViscosity={0.8}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            />

            {locations.map(loc => (
              <Marker
                key={loc.distributor_id}
                position={[loc.lat, loc.lng]}
                icon={makeTruckIcon(loc.distributor_number)}
              >
                <Popup>
                  <div className="text-xs space-y-0.5" style={{ minWidth: '160px' }}>
                    <p className="font-bold text-sm">{loc.full_name}</p>
                    <p className="text-gray-500 font-mono">{loc.distributor_number}</p>
                    <p>Region: {loc.assigned_region}</p>
                    {loc.vehicle_number && <p>Vehicle: {loc.vehicle_number}</p>}
                    {loc.speed_kmh   != null && <p>Speed: {loc.speed_kmh} km/h</p>}
                    {loc.batch_id    != null && <p>Batch: {loc.batch_id}</p>}
                    <p className="text-gray-400 mt-1">
                      Updated: {new Date(loc.updated_at).toLocaleTimeString()}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {locations.length > 0 && <FitBounds positions={locations} />}
          </MapContainer>
        </div>

        {locations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
               style={{ top: '52px' }}>
            <div className="bg-white/90 rounded-lg px-4 py-2 text-sm text-gray-500 shadow">
              No distributors currently en route
            </div>
          </div>
        )}
      </div>

      {/* ── Batch list + allocation details ──────────────────────────────────── */}
      {loading ? <div className="text-center py-20 text-gray-400">Loading...</div> : (
        <div className="grid grid-cols-3 gap-4">
          {/* Batch list */}
          <div className="col-span-1 space-y-2">
            {dist.map(b => (
              <button key={b.batch_barcode} onClick={() => selectBatch(b.batch_barcode, b.id)}
                className={`w-full text-left card cursor-pointer transition-all ${selected === b.batch_barcode ? 'ring-2 ring-brand-primary' : 'hover:border-gray-200'}`}>
                <p className="font-mono text-xs text-gray-600 truncate">{b.batch_barcode}</p>
                <p className="text-sm font-semibold text-gray-800 mt-1">{b.total_docs_loaded?.toLocaleString()} DoCs</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`badge-${b.batch_status === 'fully_delivered' ? 'green' : b.batch_status === 'en_route' ? 'blue' : 'yellow'}`}>
                    {b.batch_status?.replace(/_/g,' ')}
                  </span>
                  <span className="text-xs text-gray-400">{b.loading_date}</span>
                </div>
                <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-brand-primary h-1.5 rounded-full transition-all"
                       style={{ width: `${b.total_sps > 0 ? (b.sps_delivered / b.total_sps * 100) : 0}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{b.sps_delivered}/{b.total_sps} SPs delivered</p>
              </button>
            ))}
            {dist.length === 0 && <p className="text-xs text-gray-400">No batches found</p>}
          </div>

          {/* Allocation details */}
          <div className="col-span-2">
            {allocs.length > 0 ? (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-700">SP Allocations</h2>
                {allocs.map(a => (
                  <div key={a.id} className="card">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-800 text-sm">{a.sp_name}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{a.allocation_barcode}</p>
                        <p className="text-xs text-gray-500 mt-1">{a.location_name}</p>
                      </div>
                      <span className={`badge-${statusColor[a.status] || 'gray'}`}>{a.status}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-gray-50">
                      <div>
                        <p className="text-xs text-gray-400">Allocated</p>
                        <p className="text-sm font-semibold text-gray-800">{a.docs_allocated}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Confirmed</p>
                        <p className="text-sm font-semibold text-gray-800">{a.docs_confirmed ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Discrepancy</p>
                        <p className={`text-sm font-semibold ${a.discrepancy_flag ? 'text-red-600' : 'text-gray-400'}`}>
                          {a.discrepancy_flag ? 'YES' : 'None'}
                        </p>
                      </div>
                    </div>

                    {a.discrepancy_notes && (
                      <p className="text-xs text-red-500 mt-2 bg-red-50 rounded px-2 py-1">{a.discrepancy_notes}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                      <span>{a.scanned_by_distributor ? '✓ Scanned' : '○ Not scanned'}</span>
                      <span>{a.barcode_on_sp_tablet ? '✓ On SP tablet' : '○ Not pushed'}</span>
                      {a.scanned_at && <span>Scanned: {new Date(a.scanned_at).toLocaleTimeString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card flex items-center justify-center h-40">
                <p className="text-gray-400 text-sm">
                  {selected ? 'No allocations for this batch' : 'Select a batch to view details'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
