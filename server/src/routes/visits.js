const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const io      = require('../socket');

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// GET /visits
router.get('/', auth, async (req, res) => {
  const { aea_id, farmer_id } = req.query;
  try {
    let q = `SELECT av.*, f.full_name AS farmer_name FROM aea_visits av JOIN farmers f ON av.farmer_id=f.id WHERE 1=1`;
    const params = [];
    if (aea_id)    { params.push(aea_id);    q += ` AND av.aea_id=$${params.length}`; }
    if (farmer_id) { params.push(farmer_id); q += ` AND av.farmer_id=$${params.length}`; }
    q += ' ORDER BY av.visit_date DESC, av.created_at DESC LIMIT 100';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /visits/geofence-check — validate AEA is within 50m of farm
router.post('/geofence-check', auth, async (req, res) => {
  const { farmer_id, aea_lat, aea_lng } = req.body;
  try {
    const { rows } = await pool.query('SELECT farm_gps_lat, farm_gps_lng FROM farmers WHERE id=$1', [farmer_id]);
    if (!rows[0]) return res.status(404).json({ error: 'Farmer not found' });
    const { farm_gps_lat, farm_gps_lng } = rows[0];
    const distance = haversineDistance(aea_lat, aea_lng, farm_gps_lat, farm_gps_lng);
    res.json({ distance_m: Math.round(distance * 100) / 100, passed: distance <= 50 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /visits
router.post('/', auth, async (req, res) => {
  const { aea_id, farmer_id, visit_type, trigger_event_id, geofence_lat, geofence_lng,
          birds_alive_observed, mortality_verified, health_assessment, recommendations, flag_resolved } = req.body;
  try {
    const { rows: fRows } = await pool.query('SELECT farm_gps_lat, farm_gps_lng FROM farmers WHERE id=$1', [farmer_id]);
    const { farm_gps_lat, farm_gps_lng } = fRows[0] || { farm_gps_lat: geofence_lat, farm_gps_lng: geofence_lng };
    const distance      = haversineDistance(geofence_lat, geofence_lng, farm_gps_lat, farm_gps_lng);
    const geofencePassed= distance <= 50;

    const { rows } = await pool.query(
      `INSERT INTO aea_visits (aea_id, farmer_id, visit_date, visit_type, trigger_event_id, geofence_lat, geofence_lng,
        distance_from_farm_m, geofence_passed, form_unlocked_at, form_submitted_at, birds_alive_observed,
        mortality_verified, health_assessment, recommendations, flag_resolved, synced_at)
       VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9,$10,$11,$12,$13,NOW()) RETURNING *`,
      [aea_id, farmer_id, visit_type, trigger_event_id||null, geofence_lat, geofence_lng,
       Math.round(distance*100)/100, geofencePassed,
       birds_alive_observed||null, mortality_verified||null, health_assessment||null, recommendations||null, flag_resolved||false]
    );

    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'created', tableName: 'aea_visits', recordId: rows[0].id, newValues: rows[0], ipAddress: req.ip });
    io.emit('aea_visit', { farmer_id, visit: rows[0] });

    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
