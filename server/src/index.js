require('dotenv').config();
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const io      = require('./socket');
const pool    = require('./db/pool');
const auth    = require('./middleware/auth');

const app    = express();
const server = http.createServer(app);
io.attach(server);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Lookup endpoints for mobile app ──────────────────────────────────────────
// GET /service-providers — list all active SPs (used by AEA app farmer registration)
app.get('/service-providers', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, sp_number, sp_name, region, district FROM service_providers WHERE is_active=true ORDER BY sp_name'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /aeas/mine — returns the current user's AEA record (for AEA app)
app.get('/aeas/mine', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, aea_number, district, region FROM aeas WHERE user_id=$1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /service-providers/mine — returns current user's SP record (for SP app)
app.get('/service-providers/mine', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, sp_number, sp_name, sp_barcode, region, district, gps_lat, gps_lng FROM service_providers WHERE user_id=$1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /distributors — list all distributors (for NDC web batch form)
app.get('/distributors', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.distributor_number, d.vehicle_number, d.assigned_region, u.full_name
       FROM distributors d JOIN users u ON d.user_id=u.id ORDER BY d.distributor_number`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /farmers/mine — returns current user's farmer record (for farmer app)
app.get('/farmers/mine', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT f.* FROM farmers f WHERE f.user_id=$1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /distributors/mine — returns current user's distributor record (for distributor app)
app.get('/distributors/mine', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, distributor_number, assigned_region FROM distributors WHERE user_id=$1',
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// GET /sms-log?phone=xxx — SMS history for a phone number (farmer inbox on demo dashboard)
app.get('/sms-log', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const { rows } = await pool.query(
      'SELECT * FROM sms_log WHERE to_phone=$1 ORDER BY sent_at DESC LIMIT 100',
      [phone]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// ─────────────────────────────────────────────────────────────────────────────

// Routes
app.use('/auth',          require('./routes/auth'));
app.use('/batches',       require('./routes/batches'));
app.use('/allocations',   require('./routes/allocations'));
app.use('/farmers',       require('./routes/farmers'));
app.use('/deliveries',    require('./routes/deliveries'));
app.use('/daily-entries', require('./routes/daily-entries'));
app.use('/mortality',     require('./routes/mortality'));
app.use('/visits',        require('./routes/visits'));
app.use('/dashboard',     require('./routes/dashboard'));
app.use('/notifications', require('./routes/notifications'));
app.use('/ussd',          require('./routes/ussd'));
app.use('/registrations', require('./routes/registrations'));
app.use('/users',         require('./routes/users'));
app.use('/audit',         require('./routes/audit'));
app.use('/locations',     require('./routes/locations'));
app.use('/data-explorer', require('./routes/dataExplorer'));

// Socket.io connection log
io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);
  socket.on('disconnect', () => console.log('Socket client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ PIRCMES API running on http://localhost:${PORT}`);
  console.log(`   Socket.io attached`);
});
