const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');

// GET /audit — National Admin only, filterable
router.get('/', auth, allow('national_admin'), async (req, res) => {
  const { actor_id, table_name, action, date_from, date_to, limit = 200 } = req.query;
  try {
    let q = `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
             FROM audit_logs al LEFT JOIN users u ON al.actor_id=u.id WHERE 1=1`;
    const params = [];
    if (actor_id)   { params.push(actor_id);   q += ` AND al.actor_id=$${params.length}`; }
    if (table_name) { params.push(table_name); q += ` AND al.table_name=$${params.length}`; }
    if (action)     { params.push(action);     q += ` AND al.action=$${params.length}`; }
    if (date_from)  { params.push(date_from);  q += ` AND al.created_at>=$${params.length}`; }
    if (date_to)    { params.push(date_to);    q += ` AND al.created_at<=$${params.length}`; }
    q += ` ORDER BY al.created_at DESC LIMIT ${parseInt(limit)}`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /audit/summary — counts by actor and action
router.get('/summary', auth, allow('national_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.full_name, al.actor_role, al.action, al.table_name, COUNT(*) AS count
      FROM audit_logs al LEFT JOIN users u ON al.actor_id=u.id
      GROUP BY u.full_name, al.actor_role, al.action, al.table_name
      ORDER BY count DESC LIMIT 50`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
