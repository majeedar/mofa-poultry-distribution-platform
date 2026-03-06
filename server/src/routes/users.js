const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');

// GET /users — National Admin: list all users
router.get('/', auth, allow('national_admin','national_officer'), async (req, res) => {
  const { role, region } = req.query;
  try {
    let q = 'SELECT id, full_name, phone_number, email, role, ghana_card_number, region, district, is_active, last_login_at, created_at FROM users WHERE 1=1';
    const params = [];
    if (role)   { params.push(role);   q += ` AND role=$${params.length}`; }
    if (region) { params.push(region); q += ` AND region=$${params.length}`; }
    q += ' ORDER BY full_name';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /users/me — current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, phone_number, email, role, ghana_card_number, region, district, is_active, last_login_at FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /users/:id — National Admin: update user
router.put('/:id', auth, allow('national_admin'), async (req, res) => {
  const { full_name, phone_number, email, region, district, is_active } = req.body;
  try {
    const { rows: old } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    if (!old[0]) return res.status(404).json({ error: 'User not found' });

    const { rows } = await pool.query(
      `UPDATE users SET full_name=$1, phone_number=$2, email=$3, region=$4, district=$5, is_active=$6, updated_at=NOW()
       WHERE id=$7 RETURNING id, full_name, phone_number, email, role, ghana_card_number, region, district, is_active`,
      [full_name||old[0].full_name, phone_number||old[0].phone_number, email||old[0].email,
       region||old[0].region, district||old[0].district, is_active !== undefined ? is_active : old[0].is_active,
       req.params.id]
    );
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'updated', tableName: 'users', recordId: rows[0].id, oldValues: old[0], newValues: rows[0], ipAddress: req.ip });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /users/:id — deactivate (soft delete)
router.delete('/:id', auth, allow('national_admin'), async (req, res) => {
  try {
    const { rows: old } = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    await pool.query('UPDATE users SET is_active=false, updated_at=NOW() WHERE id=$1', [req.params.id]);
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'deleted', tableName: 'users', recordId: parseInt(req.params.id), oldValues: old[0], newValues: { is_active: false }, ipAddress: req.ip });
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
