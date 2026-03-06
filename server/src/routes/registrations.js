const router  = require('express').Router();
const multer  = require('multer');
const bcrypt  = require('bcrypt');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');
const { parseExcel, generateTemplate } = require('../services/excel');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const GHANA_CARD_REGEX = /^GHA-\d{9}-\d$/;

// Validate Ghana Card uniqueness across users + pending requests
async function isGhanaCardUnique(ghanaCard, excludeReqId = null) {
  const inUsers = await pool.query('SELECT id FROM users WHERE ghana_card_number=$1', [ghanaCard]);
  if (inUsers.rows.length > 0) return false;
  let q = 'SELECT id FROM registration_requests WHERE ghana_card_number=$1 AND status=\'pending\'';
  const params = [ghanaCard];
  if (excludeReqId) { params.push(excludeReqId); q += ` AND id!=$${params.length}`; }
  const inReqs = await pool.query(q, params);
  return inReqs.rows.length === 0;
}

// GET /registrations/pending — National Admin: all pending
router.get('/pending', auth, allow('national_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT rr.*, u.full_name AS submitted_by_name
      FROM registration_requests rr
      LEFT JOIN users u ON rr.submitted_by=u.id
      WHERE rr.status='pending' ORDER BY rr.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /registrations — all requests with filter
router.get('/', auth, allow('national_admin','national_officer'), async (req, res) => {
  const { status, role } = req.query;
  try {
    let q = 'SELECT rr.*, u.full_name AS submitted_by_name FROM registration_requests rr LEFT JOIN users u ON rr.submitted_by=u.id WHERE 1=1';
    const params = [];
    if (status) { params.push(status); q += ` AND rr.status=$${params.length}`; }
    if (role)   { params.push(role);   q += ` AND rr.requested_role=$${params.length}`; }
    q += ' ORDER BY rr.created_at DESC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /registrations — submit a registration request
router.post('/', auth, async (req, res) => {
  const { ghana_card_number, requested_role, submitted_data } = req.body;

  if (!GHANA_CARD_REGEX.test(ghana_card_number)) {
    return res.status(400).json({ error: 'Invalid Ghana Card format. Expected: GHA-XXXXXXXXX-X' });
  }

  // Role permission check
  const allowedToSubmit = {
    farmer:           ['aea'],
    regional_officer: ['national_admin','national_officer'],
    district_officer: ['national_admin','national_officer'],
    aea:              ['national_admin','national_officer'],
    distributor:      ['national_admin','national_officer'],
    sp_operator:      ['national_admin','national_officer'],
    national_officer: ['national_admin'],
  };
  if (allowedToSubmit[requested_role] && !allowedToSubmit[requested_role].includes(req.user.role)) {
    return res.status(403).json({ error: `Your role cannot submit ${requested_role} registrations` });
  }

  try {
    if (!(await isGhanaCardUnique(ghana_card_number))) {
      return res.status(409).json({ error: 'Ghana Card number already registered or pending approval' });
    }

    const { rows } = await pool.query(
      `INSERT INTO registration_requests (ghana_card_number, requested_role, submitted_data, submitted_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [ghana_card_number, requested_role, JSON.stringify(submitted_data), req.user.id]
    );
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'created', tableName: 'registration_requests', recordId: rows[0].id, newValues: { ghana_card_number, requested_role }, ipAddress: req.ip });
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /registrations/upload — Excel bulk registration
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Excel file required' });
  const { requested_role } = req.body;

  const requiredCols = ['ghana_card_number','full_name','phone_number'];
  const { valid, errors, total } = parseExcel(req.file.buffer, requiredCols);

  const created = [], skipped = [];
  for (const row of valid) {
    if (!GHANA_CARD_REGEX.test(row.ghana_card_number)) {
      errors.push({ row: row.ghana_card_number, error: 'Invalid Ghana Card format' });
      continue;
    }
    if (!(await isGhanaCardUnique(row.ghana_card_number))) {
      skipped.push({ ghana_card_number: row.ghana_card_number, reason: 'Already registered or pending' });
      continue;
    }
    const { rows } = await pool.query(
      `INSERT INTO registration_requests (ghana_card_number, requested_role, submitted_data, submitted_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [row.ghana_card_number, requested_role, JSON.stringify(row), req.user.id]
    );
    created.push(rows[0].id);
  }

  res.json({ total, created: created.length, skipped: skipped.length, errors_count: errors.length, errors, skipped });
});

// GET /registrations/template/:role — download Excel template
router.get('/template/:role', auth, (req, res) => {
  const templates = {
    farmer:           ['ghana_card_number','full_name','phone_number','gender','production_tier','sp_id','farm_location','region','district','farm_gps_lat','farm_gps_lng','flock_capacity'],
    distributor:      ['ghana_card_number','full_name','phone_number','email','distributor_number','vehicle_number','assigned_region'],
    sp_operator:      ['ghana_card_number','full_name','phone_number','email','sp_number','sp_name','location_name','region','district'],
    aea:              ['ghana_card_number','full_name','phone_number','email','aea_number','district','region'],
    regional_officer: ['ghana_card_number','full_name','phone_number','email','region'],
    district_officer: ['ghana_card_number','full_name','phone_number','email','region','district'],
  };
  const cols = templates[req.params.role];
  if (!cols) return res.status(400).json({ error: 'Unknown role' });
  const buf = generateTemplate(cols);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${req.params.role}-template.xlsx"` });
  res.send(buf);
});

// PUT /registrations/:id/approve — National Admin approves → creates user
router.put('/:id/approve', auth, allow('national_admin'), async (req, res) => {
  const { review_notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: rRows } = await client.query('SELECT * FROM registration_requests WHERE id=$1 AND status=\'pending\'', [req.params.id]);
    if (!rRows[0]) return res.status(404).json({ error: 'Pending request not found' });
    const request = rRows[0];
    const data    = typeof request.submitted_data === 'string' ? JSON.parse(request.submitted_data) : request.submitted_data;

    // Create user
    const defaultPassword = 'Demo2026!';
    const hash = await bcrypt.hash(data.password || defaultPassword, 10);
    const email = data.email || `${request.ghana_card_number.replace(/-/g,'').toLowerCase()}@pircmes.auto`;

    const { rows: uRows } = await client.query(
      `INSERT INTO users (full_name, phone_number, email, password_hash, role, ghana_card_number, region, district)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [data.full_name, data.phone_number, email, hash, request.requested_role, request.ghana_card_number, data.region||null, data.district||null]
    );
    const user = uRows[0];

    // Create role-specific record
    if (request.requested_role === 'farmer') {
      const barcode = `FMBC${Date.now()}`;
      await client.query(
        `INSERT INTO farmers (user_id, farmer_number, farmer_barcode, full_name, phone_number, gender, production_tier, sp_id, aea_id, farm_location, region, district, farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, registered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [user.id, data.farmer_number||`F${Date.now()}`, barcode, data.full_name, data.phone_number, data.gender||null, data.production_tier||'small_medium',
         data.sp_id, data.aea_id, data.farm_location, data.region, data.district,
         data.farm_gps_lat||0, data.farm_gps_lng||0, data.flock_capacity||null, data.has_tablet||false, req.user.id]
      );
    } else if (request.requested_role === 'distributor') {
      await client.query(
        `INSERT INTO distributors (user_id, distributor_number, identity_barcode, vehicle_number, assigned_region) VALUES ($1,$2,$3,$4,$5)`,
        [user.id, data.distributor_number||`DIST${Date.now()}`, `IBC${Date.now()}`, data.vehicle_number||null, data.region||null]
      );
    } else if (request.requested_role === 'sp_operator') {
      await client.query(
        `INSERT INTO service_providers (user_id, sp_number, sp_name, sp_barcode, location_name, region, district) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [user.id, data.sp_number||`SP${Date.now()}`, data.sp_name||data.full_name, `SPBC${Date.now()}`, data.location_name||data.district, data.region, data.district]
      );
    } else if (request.requested_role === 'aea') {
      await client.query(
        `INSERT INTO aeas (user_id, aea_number, district, region) VALUES ($1,$2,$3,$4)`,
        [user.id, data.aea_number||`AEA${Date.now()}`, data.district, data.region]
      );
    }

    await client.query(
      `UPDATE registration_requests SET status='approved', reviewed_by=$1, review_notes=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [req.user.id, review_notes||null, request.id]
    );

    await client.query('COMMIT');
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'approved', tableName: 'registration_requests', recordId: request.id, newValues: { status: 'approved', user_created: user.id }, ipAddress: req.ip });

    res.json({ message: 'Approved and user created', user: { id: user.id, email: user.email, role: user.role, defaultPassword } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT /registrations/:id/reject
router.put('/:id/reject', auth, allow('national_admin'), async (req, res) => {
  const { review_notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE registration_requests SET status='rejected', reviewed_by=$1, review_notes=$2, reviewed_at=NOW(), updated_at=NOW()
       WHERE id=$3 AND status='pending' RETURNING *`,
      [req.user.id, review_notes||null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pending request not found' });
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'rejected', tableName: 'registration_requests', recordId: rows[0].id, newValues: { status: 'rejected' }, ipAddress: req.ip });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
