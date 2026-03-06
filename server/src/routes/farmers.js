const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');

// GET /farmers
router.get('/', auth, async (req, res) => {
  const { sp_id, aea_id, tier } = req.query;
  try {
    let q = `SELECT f.*, sp.sp_name, a.aea_number FROM farmers f
             JOIN service_providers sp ON f.sp_id=sp.id
             JOIN aeas a ON f.aea_id=a.id WHERE f.is_active=true`;
    const params = [];
    if (sp_id) { params.push(sp_id); q += ` AND f.sp_id=$${params.length}`; }
    if (aea_id){ params.push(aea_id); q += ` AND f.aea_id=$${params.length}`; }
    if (tier)  { params.push(tier);  q += ` AND f.production_tier=$${params.length}`; }
    // Field roles only see their own farmers
    if (req.user.role === 'aea') {
      const { rows: aeaR } = await pool.query('SELECT id FROM aeas WHERE user_id=$1', [req.user.id]);
      if (aeaR[0]) { params.push(aeaR[0].id); q += ` AND f.aea_id=$${params.length}`; }
    }
    if (req.user.role === 'sp_operator') {
      const { rows: spR } = await pool.query('SELECT id FROM service_providers WHERE user_id=$1', [req.user.id]);
      if (spR[0]) { params.push(spR[0].id); q += ` AND f.sp_id=$${params.length}`; }
    }
    q += ' ORDER BY f.full_name';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /farmers/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, sp.sp_name, sp.sp_barcode, a.aea_number FROM farmers f
       JOIN service_providers sp ON f.sp_id=sp.id JOIN aeas a ON f.aea_id=a.id WHERE f.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /farmers/number/:number — lookup by farmer_number (for USSD)
router.get('/number/:number', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM farmers WHERE farmer_number=$1', [req.params.number]);
    if (!rows[0]) return res.status(404).json({ error: 'Farmer not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /farmers — national admin direct registration
router.post('/', auth, allow('national_admin','national_officer'), async (req, res) => {
  const { full_name, phone_number, gender, production_tier, sp_id, aea_id, farm_location, region, district,
          farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, collection_method, farmer_number } = req.body;
  try {
    const barcode = `FMBC${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO farmers (farmer_number, farmer_barcode, full_name, phone_number, gender, production_tier, sp_id, aea_id,
        farm_location, region, district, farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, collection_method, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [farmer_number||`F${Date.now()}`, barcode, full_name, phone_number, gender, production_tier,
       sp_id, aea_id, farm_location, region, district, farm_gps_lat, farm_gps_lng,
       flock_capacity||null, has_tablet||false, collection_method||'pickup', req.user.id]
    );
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'created', tableName: 'farmers', recordId: rows[0].id, newValues: rows[0], ipAddress: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
