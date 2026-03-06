const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { notifyAEA } = require('../services/notifications');
const io      = require('../socket');

// GET /daily-entries
router.get('/', auth, async (req, res) => {
  const { farmer_id, date_from, date_to } = req.query;
  try {
    let q = 'SELECT * FROM daily_farm_entries WHERE 1=1';
    const params = [];
    if (farmer_id) { params.push(farmer_id); q += ` AND farmer_id=$${params.length}`; }
    if (date_from) { params.push(date_from); q += ` AND entry_date>=$${params.length}`; }
    if (date_to)   { params.push(date_to);   q += ` AND entry_date<=$${params.length}`; }
    q += ' ORDER BY entry_date DESC LIMIT 200';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /daily-entries
router.post('/', auth, async (req, res) => {
  const { farmer_id, entry_date, birds_alive, birds_added, mortality_count, feed_consumed_kg,
          water_consumed_l, vaccine_given, vaccine_type, health_flags, observations, entry_method } = req.body;

  const cutoff = parseInt(process.env.DAILY_ENTRY_CUTOFF_HOUR || 20);
  const isCompliant = new Date().getHours() < cutoff;

  try {
    const { rows } = await pool.query(
      `INSERT INTO daily_farm_entries (farmer_id, entry_date, birds_alive, birds_added, mortality_count,
        feed_consumed_kg, water_consumed_l, vaccine_given, vaccine_type, health_flags, observations,
        entry_method, submitted_by, submitted_at, is_compliant)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14)
       ON CONFLICT (farmer_id, entry_date) DO UPDATE SET
         birds_alive=EXCLUDED.birds_alive, mortality_count=EXCLUDED.mortality_count, is_compliant=EXCLUDED.is_compliant,
         updated_at=NOW() RETURNING *`,
      [farmer_id, entry_date, birds_alive, birds_added||0, mortality_count||0,
       feed_consumed_kg||null, water_consumed_l||null, vaccine_given||false, vaccine_type||null,
       health_flags||null, observations||null, entry_method||'tablet', req.user?.id||null, isCompliant]
    );

    const entry = rows[0];
    await logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'created', tableName: 'daily_farm_entries', recordId: entry.id, newValues: entry, ipAddress: req.ip });

    // Broadcast to dashboard
    io.emit('daily_entry', { farmer_id, entry_date, birds_alive, mortality_count, is_compliant: isCompliant });

    // Notify AEA if mortality > 0
    if (mortality_count > 0) {
      await notifyAEA({ farmerId: farmer_id, triggerType: 'mortality_reported', triggerTable: 'daily_farm_entries',
        triggerId: entry.id, title: 'Mortality Reported', body: `Farmer ${farmer_id} reports ${mortality_count} deaths on ${entry_date}. Photo required.`, sms: true });
    }

    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
