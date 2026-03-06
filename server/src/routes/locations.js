/**
 * Distributor live location tracking
 * - In-memory store (no DB schema change needed)
 * - Pre-seeded with regional center coordinates for demo
 * - POST /locations — distributor tablet updates position
 * - GET  /locations — web dashboard gets all current positions
 */
const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');
const io     = require('../socket');

// ── Ghana regional center coordinates ────────────────────────────────────────
const REGION_CENTERS = {
  'Greater Accra': { lat:  5.5600, lng: -0.2057 },
  'Ashanti':       { lat:  6.6885, lng: -1.6244 },
  'Northern':      { lat:  9.4034, lng: -0.8424 },
  'Eastern':       { lat:  6.1037, lng: -0.7201 },
  'Western':       { lat:  4.9167, lng: -1.7333 },
  'Central':       { lat:  5.3000, lng: -1.3833 },
  'Volta':         { lat:  6.5833, lng:  0.4500  },
  'Brong-Ahafo':   { lat:  7.3667, lng: -1.6167 },
  'Upper East':    { lat: 10.7833, lng: -0.8500  },
  'Upper West':    { lat: 10.4167, lng: -2.6000  },
};
const GHANA_CENTER = { lat: 7.9465, lng: -1.0232 };

// ── In-memory location store ──────────────────────────────────────────────────
const liveLocations = new Map(); // key: distributor_id → location object
let   seeded = false;

async function seedLocations() {
  if (seeded) return;
  seeded = true;
  try {
    const { rows } = await pool.query(`
      SELECT d.id, d.distributor_number, d.assigned_region,
             d.vehicle_number, u.full_name
      FROM distributors d JOIN users u ON u.id=d.user_id
      ORDER BY d.distributor_number`);

    // First 4 distributors get demo en_route status with realistic movement data
    const EN_ROUTE_DEMO = [
      { heading: 45,  speed_kmh: 68, batch_id: 'DEMO-BATCH-001' },
      { heading: 180, speed_kmh: 54, batch_id: 'DEMO-BATCH-001' },
      { heading: 290, speed_kmh: 72, batch_id: 'DEMO-BATCH-002' },
      { heading: 130, speed_kmh: 61, batch_id: 'DEMO-BATCH-002' },
    ];

    rows.forEach((d, idx) => {
      const center  = REGION_CENTERS[d.assigned_region] || GHANA_CENTER;
      const jitter  = () => (Math.random() - 0.5) * 0.4;
      const demo    = EN_ROUTE_DEMO[idx];          // undefined for idx >= 4
      liveLocations.set(d.id, {
        distributor_id:     d.id,
        distributor_number: d.distributor_number,
        full_name:          d.full_name,
        assigned_region:    d.assigned_region,
        vehicle_number:     d.vehicle_number,
        lat:        center.lat + jitter(),
        lng:        center.lng + jitter(),
        heading:    demo ? demo.heading   : null,
        speed_kmh:  demo ? demo.speed_kmh : null,
        batch_id:   demo ? demo.batch_id  : null,
        status:     demo ? 'en_route'     : 'idle',
        updated_at: new Date().toISOString(),
      });
    });
  } catch (e) {
    seeded = false; // retry on next request
    console.error('Location seed error:', e.message);
  }
}

// ── GET /locations — all distributor positions ────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    await seedLocations();
    res.json([...liveLocations.values()]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /locations — distributor tablet reports position ─────────────────────
// Body: { lat, lng, heading?, speed_kmh?, batch_id?, status? }
router.post('/', auth, async (req, res) => {
  try {
    const { lat, lng, heading, speed_kmh, batch_id, status } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });

    const { rows } = await pool.query(
      `SELECT d.id, d.distributor_number, d.assigned_region, d.vehicle_number, u.full_name
       FROM distributors d JOIN users u ON u.id=d.user_id WHERE d.user_id=$1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Not a distributor account' });

    const d = rows[0];
    const loc = {
      distributor_id:     d.id,
      distributor_number: d.distributor_number,
      full_name:          d.full_name,
      assigned_region:    d.assigned_region,
      vehicle_number:     d.vehicle_number,
      lat:        parseFloat(lat),
      lng:        parseFloat(lng),
      heading:    heading    != null ? parseFloat(heading)   : null,
      speed_kmh:  speed_kmh  != null ? parseFloat(speed_kmh) : null,
      batch_id:   batch_id   || null,
      status:     status     || 'active',
      updated_at: new Date().toISOString(),
    };

    liveLocations.set(d.id, loc);
    io.emit('distributor_location', loc);

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
