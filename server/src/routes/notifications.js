const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /notifications — list for logged-in user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE recipient_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM notifications WHERE recipient_id=$1 AND is_read=false', [req.user.id]);
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true, read_at=NOW() WHERE id=$1 AND recipient_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /notifications/read-all
router.put('/read-all', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true, read_at=NOW() WHERE recipient_id=$1 AND is_read=false', [req.user.id]);
    res.json({ message: 'All marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
