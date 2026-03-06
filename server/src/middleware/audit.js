const pool = require('../db/pool');

// Maps route path segments to table names for audit logging
const ROUTE_TABLE_MAP = {
  'batches':          'batch_barcodes',
  'allocations':      'allocation_barcodes',
  'farmers':          'farmers',
  'deliveries':       'farmer_delivery_barcodes',
  'daily-entries':    'daily_farm_entries',
  'mortality':        'mortality_evidence',
  'visits':           'aea_visits',
  'notifications':    'notifications',
  'registrations':    'registration_requests',
  'users':            'users',
};

function getTableName(req) {
  const parts = req.path.replace(/^\//, '').split('/');
  return ROUTE_TABLE_MAP[parts[0]] || parts[0];
}

// Audit middleware — call after a successful write
async function logAudit({ actorId, actorRole, action, tableName, recordId, oldValues, newValues, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, table_name, record_id, old_values, new_values, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, actorRole, action, tableName,
       recordId || null,
       oldValues ? JSON.stringify(oldValues) : null,
       newValues ? JSON.stringify(newValues) : null,
       ipAddress || null]
    );
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAudit, getTableName };
