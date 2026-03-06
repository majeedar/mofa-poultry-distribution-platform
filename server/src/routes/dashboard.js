const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// Compute date range from a period string
function periodToRange(period) {
  if (!period || period === 'all') return [null, null];
  const now  = new Date();
  const fmt  = d => d.toISOString().split('T')[0];
  const ymd  = (y, m, d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if (period === 'today')  return [fmt(now), null];
  if (period === '7d')     { const d=new Date(now); d.setDate(d.getDate()-6);  return [fmt(d), null]; }
  if (period === '30d')    { const d=new Date(now); d.setDate(d.getDate()-29); return [fmt(d), null]; }
  if (period === 'month')  return [ymd(now.getFullYear(), now.getMonth()+1, 1), null];
  if (period === 'year')   return [`${now.getFullYear()}-01-01`, null];
  // 'YYYY-MM' — specific month
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    const next   = m === 12 ? `${y+1}-01-01` : ymd(y, m+1, 1);
    return [ymd(y, m, 1), next];
  }
  // 'YYYY' — specific year
  if (/^\d{4}$/.test(period)) return [`${period}-01-01`, `${parseInt(period)+1}-01-01`];
  return [null, null];
}

// Build parameterized WHERE suffix for SP-side queries (alias sp)
function spConds(q, dateCol = null) {
  const params = [];
  const conds  = [];
  if (q.region)   { params.push(q.region);          conds.push(`sp.region=$${params.length}`); }
  if (q.district) { params.push(q.district);         conds.push(`sp.district=$${params.length}`); }
  if (q.sp_id)    { params.push(parseInt(q.sp_id));  conds.push(`sp.id=$${params.length}`); }
  if (dateCol && q.dateFrom) { params.push(q.dateFrom); conds.push(`${dateCol}::date >= $${params.length}`); }
  if (dateCol && q.dateTo)   { params.push(q.dateTo);   conds.push(`${dateCol}::date < $${params.length}`); }
  return { params, suffix: conds.length ? ' AND ' + conds.join(' AND ') : '' };
}

// Build parameterized WHERE suffix for farmer-side queries (alias f)
function farmerConds(q, dateCol = null) {
  const params = [];
  const conds  = [];
  if (q.region)    { params.push(q.region);           conds.push(`f.region=$${params.length}`); }
  if (q.district)  { params.push(q.district);          conds.push(`f.district=$${params.length}`); }
  if (q.farmer_id) { params.push(parseInt(q.farmer_id)); conds.push(`f.id=$${params.length}`); }
  if (q.sp_id && !q.farmer_id) { params.push(parseInt(q.sp_id)); conds.push(`f.sp_id=$${params.length}`); }
  if (dateCol && q.dateFrom) { params.push(q.dateFrom); conds.push(`${dateCol}::date >= $${params.length}`); }
  if (dateCol && q.dateTo)   { params.push(q.dateTo);   conds.push(`${dateCol}::date < $${params.length}`); }
  return { params, suffix: conds.length ? ' AND ' + conds.join(' AND ') : '' };
}

// Enforce region/district scope for regional/district officers
function scopeByRole(user, q) {
  if (user.role === 'regional_officer')  return { ...q, region: user.region };
  if (user.role === 'district_officer')  return { ...q, region: user.region, district: user.district };
  return q;
}

// ─── GET /dashboard/kpi ──────────────────────────────────────────────────────
router.get('/kpi', auth, async (req, res) => {
  try {
    const [dateFrom, dateTo] = periodToRange(req.query.period);
    const q = scopeByRole(req.user, { ...req.query, dateFrom, dateTo });

    const [
      { rows: [{ sp_docs }] },
      { rows: [{ farmer_docs }] },
      { rows: [{ sps_reached }] },
      { rows: [{ farmers_reached }] },
      { rows: rows_tiers },
      { rows: [{ doa_sp }] },
      { rows: [{ doa_farmer }] },
      { rows: [{ total_allocated }] },
      { rows: [{ at_depot }] },
      { rows: [{ in_transit }] },
      { rows: [{ sp_distributed }] },
    ] = await Promise.all([

      // Docs confirmed received via SP receipts
      (() => { const f = spConds(q, 'sr.signed_at');
        return pool.query(`SELECT COALESCE(SUM(sr.docs_received),0) AS sp_docs
          FROM sp_receipts sr
          JOIN allocation_barcodes ab ON ab.id=sr.allocation_id
          JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // Docs confirmed received via farmer receipts
      (() => { const f = farmerConds(q, 'fr.signed_at');
        return pool.query(`SELECT COALESCE(SUM(fr.docs_received),0) AS farmer_docs
          FROM farmer_receipts fr
          JOIN farmers f ON f.id=fr.farmer_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // SPs reached
      (() => { const f = spConds(q, 'sr.signed_at');
        return pool.query(`SELECT COUNT(DISTINCT sr.sp_id) AS sps_reached
          FROM sp_receipts sr
          JOIN allocation_barcodes ab ON ab.id=sr.allocation_id
          JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // Farmers reached
      (() => { const f = farmerConds(q, 'fr.signed_at');
        return pool.query(`SELECT COUNT(DISTINCT fr.farmer_id) AS farmers_reached
          FROM farmer_receipts fr
          JOIN farmers f ON f.id=fr.farmer_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // Farmers by production tier
      (() => { const f = farmerConds(q);
        return pool.query(`SELECT f.production_tier, COUNT(*) AS cnt
          FROM farmers f
          WHERE f.is_active=true${f.suffix}
          GROUP BY f.production_tier`, f.params); })(),

      // DOA at SP level (distributor → SP)
      (() => { const f = spConds(q, 'sr.signed_at');
        return pool.query(`SELECT COALESCE(SUM(sr.dead_on_arrival),0) AS doa_sp
          FROM sp_receipts sr
          JOIN allocation_barcodes ab ON ab.id=sr.allocation_id
          JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // DOA at farmer level (SP → farmer)
      (() => { const f = farmerConds(q, 'fr.signed_at');
        return pool.query(`SELECT COALESCE(SUM(fr.dead_on_receipt),0) AS doa_farmer
          FROM farmer_receipts fr
          JOIN farmers f ON f.id=fr.farmer_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // Pipeline: total docs allocated across all batches
      (() => { const f = spConds(q, 'b.loading_date');
        return pool.query(`SELECT COALESCE(SUM(ab.docs_allocated),0) AS total_allocated
          FROM allocation_barcodes ab
          JOIN batch_barcodes b ON b.id=ab.batch_id
          LEFT JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE 1=1${f.suffix}`, f.params); })(),

      // Pipeline: at depot (pending — batch loaded, not yet picked up by distributor)
      (() => { const f = spConds(q);
        return pool.query(`SELECT COALESCE(SUM(ab.docs_allocated),0) AS at_depot
          FROM allocation_barcodes ab
          LEFT JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE ab.status='pending'${f.suffix}`, f.params); })(),

      // Pipeline: en route (distributor has scanned, in transit to SP)
      (() => { const f = spConds(q);
        return pool.query(`SELECT COALESCE(SUM(ab.docs_allocated),0) AS in_transit
          FROM allocation_barcodes ab
          LEFT JOIN service_providers sp ON sp.id=ab.sp_id
          WHERE ab.status='en_route'${f.suffix}`, f.params); })(),

      // Pipeline: SP distributed to farmers (via farmer_delivery_barcodes, delivered FDBs only)
      (() => { const f = spConds(q);
        return pool.query(`SELECT COALESCE(SUM(fdb.docs_delivered),0) AS sp_distributed
          FROM farmer_delivery_barcodes fdb
          JOIN service_providers sp ON sp.id=fdb.sp_id
          WHERE fdb.status='delivered'${f.suffix}`, f.params); })(),
    ]);

    const tier_counts = { anchor: 0, small_medium: 0, household: 0 };
    rows_tiers.forEach(r => { if (tier_counts[r.production_tier] !== undefined) tier_counts[r.production_tier] = parseInt(r.cnt); });

    const confirmed_at_sp  = parseInt(sp_docs);
    const confirmed_at_farmers = parseInt(farmer_docs);
    const sp_remaining     = Math.max(0, confirmed_at_sp - parseInt(sp_distributed));

    res.json({
      // Pipeline stages
      total_allocated,        // All DoCs loaded into batches
      at_depot:               parseInt(at_depot),       // Pending pickup
      in_transit:             parseInt(in_transit),     // En route with distributor
      confirmed_at_sp,                                  // SP confirmed receipt
      sp_remaining,                                     // SP stock not yet given to farmers
      confirmed_at_farmers,                             // Farmers confirmed receipt
      // Supporting metrics
      sps_reached:            parseInt(sps_reached),
      farmers_reached:        parseInt(farmers_reached),
      doa_sp:                 parseInt(doa_sp),
      doa_farmer:             parseInt(doa_farmer),
      total_delivery_mortality: parseInt(doa_sp) + parseInt(doa_farmer),
      tier_counts,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /dashboard/distribution ────────────────────────────────────────────
router.get('/distribution', auth, async (req, res) => {
  try {
    const [dateFrom, dateTo] = periodToRange(req.query.period);
    const scoped = scopeByRole(req.user, req.query);
    const { region, district, sp_id } = scoped;

    const params = [];
    const conds  = ['1=1'];
    if (region)   { params.push(region);         conds.push(`sp.region=$${params.length}`); }
    if (district) { params.push(district);        conds.push(`sp.district=$${params.length}`); }
    if (sp_id)    { params.push(parseInt(sp_id)); conds.push(`sp.id=$${params.length}`); }
    if (dateFrom) { params.push(dateFrom);        conds.push(`b.loading_date::date >= $${params.length}`); }
    if (dateTo)   { params.push(dateTo);          conds.push(`b.loading_date::date < $${params.length}`); }

    const where = conds.join(' AND ');

    const { rows } = await pool.query(`
      SELECT b.batch_barcode, b.loading_date, b.status AS batch_status, b.total_docs_loaded,
             COUNT(ab.id) AS total_sps,
             COUNT(ab.id) FILTER (WHERE ab.status='delivered') AS sps_delivered,
             SUM(ab.docs_allocated) AS docs_allocated,
             SUM(ab.docs_confirmed) FILTER (WHERE ab.docs_confirmed IS NOT NULL) AS docs_confirmed,
             d.distributor_number
      FROM batch_barcodes b
      JOIN distributors d ON b.distributor_id=d.id
      LEFT JOIN allocation_barcodes ab ON ab.batch_id=b.id
      LEFT JOIN service_providers sp ON sp.id=ab.sp_id
      WHERE ${where}
      GROUP BY b.id, d.distributor_number
      ORDER BY b.loading_date DESC LIMIT 50`, params);

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /dashboard/farm-compliance ─────────────────────────────────────────
router.get('/farm-compliance', auth, async (req, res) => {
  try {
    const [dateFrom] = periodToRange(req.query.period);
    const scoped = scopeByRole(req.user, req.query);
    const { region, district, sp_id, farmer_id } = scoped;

    const params  = [];
    const fConds  = ['f.is_active=true', "f.production_tier != 'household'"];
    const deConds = ['de.entry_date=CURRENT_DATE'];

    if (region)    { params.push(region);            fConds.push(`f.region=$${params.length}`); }
    if (district)  { params.push(district);           fConds.push(`f.district=$${params.length}`); }
    if (sp_id)     { params.push(parseInt(sp_id));    fConds.push(`f.sp_id=$${params.length}`); }
    if (farmer_id) { params.push(parseInt(farmer_id)); fConds.push(`f.id=$${params.length}`); }
    if (dateFrom)  { params.push(dateFrom);           deConds.push(`de.entry_date >= $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT f.id, f.farmer_number, f.full_name, f.production_tier,
             sp.sp_name, a.aea_number,
             de.entry_date, de.birds_alive, de.mortality_count, de.is_compliant,
             CASE WHEN de.id IS NULL THEN 'missing' WHEN de.is_compliant THEN 'compliant' ELSE 'late' END AS status
      FROM farmers f
      JOIN service_providers sp ON f.sp_id=sp.id
      JOIN aeas a ON f.aea_id=a.id
      LEFT JOIN daily_farm_entries de ON de.farmer_id=f.id AND ${deConds.join(' AND ')}
      WHERE ${fConds.join(' AND ')}
      ORDER BY status, f.full_name`, params);

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /dashboard/filter-options ──────────────────────────────────────────
// type=regions | districts&region= | sps&region=&district= | farmers&sp_id=&region=&district=
router.get('/filter-options', auth, async (req, res) => {
  try {
    const scoped = scopeByRole(req.user, req.query);
    const { type, sp_id } = req.query;
    const { region, district } = scoped;

    if (type === 'regions') {
      const { rows } = await pool.query(`
        SELECT DISTINCT region FROM (
          SELECT region FROM service_providers WHERE region IS NOT NULL
          UNION SELECT region FROM farmers WHERE region IS NOT NULL
        ) r ORDER BY region`);
      return res.json(rows.map(r => r.region));
    }

    if (type === 'districts') {
      const { rows } = await pool.query(`
        SELECT DISTINCT district FROM (
          SELECT district FROM service_providers WHERE region=$1 AND district IS NOT NULL
          UNION SELECT district FROM farmers WHERE region=$1 AND district IS NOT NULL
        ) d ORDER BY district`, [region]);
      return res.json(rows.map(r => r.district));
    }

    if (type === 'sps') {
      const params = [];
      const conds  = ['1=1'];
      if (region)   { params.push(region);   conds.push(`region=$${params.length}`); }
      if (district) { params.push(district); conds.push(`district=$${params.length}`); }
      const { rows } = await pool.query(
        `SELECT id, sp_name, location_name FROM service_providers WHERE ${conds.join(' AND ')} ORDER BY sp_name`,
        params);
      return res.json(rows);
    }

    if (type === 'farmers') {
      const params = [];
      const conds  = ['f.is_active=true'];
      if (sp_id)    { params.push(parseInt(sp_id)); conds.push(`f.sp_id=$${params.length}`); }
      if (district) { params.push(district);         conds.push(`f.district=$${params.length}`); }
      if (region)   { params.push(region);            conds.push(`f.region=$${params.length}`); }
      const { rows } = await pool.query(
        `SELECT f.id, f.full_name, f.farmer_number FROM farmers f
         WHERE ${conds.join(' AND ')} ORDER BY f.full_name LIMIT 200`,
        params);
      return res.json(rows);
    }

    res.status(400).json({ error: 'Invalid type' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /dashboard/delivery-alerts ─────────────────────────────────────────
router.get('/delivery-alerts', auth, async (req, res) => {
  try {
    const THRESHOLD = parseFloat(process.env.MORTALITY_THRESHOLD_PERCENT || 5) / 100;
    const { region, district } = scopeByRole(req.user, {});

    // Build optional region/district WHERE suffix for alerts
    const regionCond = region   ? `AND sp.region=$1`   : '';
    const distCond   = district ? `AND sp.district=$2` : '';
    const alertParams = [region, district].filter(Boolean);
    const regionIdx  = region   ? 1 : null;
    const distIdx    = district ? (region ? 2 : 1) : null;
    const rCond = regionIdx  ? `AND sp.region=$${regionIdx}` : '';
    const dCond = distIdx    ? `AND sp.district=$${distIdx}` : '';

    const [delayedRes, doaSpRes, discrepancyRes] = await Promise.all([

      // A. Delayed allocations — not delivered, batch loaded > 2 days ago
      pool.query(`
        SELECT 'delayed' AS type,
               ab.allocation_barcode, ab.status, ab.docs_allocated,
               b.batch_barcode, b.loading_date::date,
               COALESCE(sp.sp_name, 'Direct farmer') AS sp_name, sp.region,
               EXTRACT(DAY FROM NOW() - b.loading_date::timestamp)::int AS days_overdue
        FROM allocation_barcodes ab
        JOIN batch_barcodes b ON ab.batch_id=b.id
        LEFT JOIN service_providers sp ON sp.id=ab.sp_id
        WHERE ab.status NOT IN ('delivered','discrepancy')
          AND b.loading_date::date < CURRENT_DATE - INTERVAL '2 days'
          ${rCond} ${dCond}
        ORDER BY b.loading_date LIMIT 20`, alertParams),

      // B. High DOA at SP — dead_on_arrival > threshold
      pool.query(`
        SELECT 'doa_sp' AS type,
               sr.dead_on_arrival, sr.docs_received, ab.docs_allocated,
               sp.sp_name, sp.region, b.batch_barcode, sr.signed_at,
               ROUND(sr.dead_on_arrival::numeric / NULLIF(ab.docs_allocated,0)*100,1) AS doa_pct
        FROM sp_receipts sr
        JOIN allocation_barcodes ab ON ab.id=sr.allocation_id
        JOIN service_providers sp ON sp.id=ab.sp_id
        JOIN batch_barcodes b ON ab.batch_id=b.id
        WHERE sr.dead_on_arrival > 0
          AND sr.dead_on_arrival::float / NULLIF(ab.docs_allocated,0) > $${alertParams.length + 1}
          ${rCond} ${dCond}
        ORDER BY sr.signed_at DESC LIMIT 20`, [...alertParams, THRESHOLD]),

      // C. Tally discrepancy — docs_confirmed differs > 10% or discrepancy_flag
      pool.query(`
        SELECT 'discrepancy' AS type,
               ab.allocation_barcode, ab.docs_allocated, ab.docs_confirmed,
               ab.docs_allocated - ab.docs_confirmed AS shortfall,
               ROUND(ABS(ab.docs_allocated - ab.docs_confirmed)::numeric / NULLIF(ab.docs_allocated,0)*100,1) AS diff_pct,
               COALESCE(sp.sp_name, 'Direct farmer') AS sp_name, b.batch_barcode, ab.discrepancy_flag
        FROM allocation_barcodes ab
        JOIN batch_barcodes b ON ab.batch_id=b.id
        LEFT JOIN service_providers sp ON sp.id=ab.sp_id
        WHERE ab.docs_confirmed IS NOT NULL
          AND (ab.discrepancy_flag = true
            OR ABS(ab.docs_allocated - ab.docs_confirmed)::float / NULLIF(ab.docs_allocated,0) > 0.10)
          ${rCond} ${dCond}
        ORDER BY b.loading_date DESC LIMIT 20`, alertParams),
    ]);

    const alerts = [];

    delayedRes.rows.forEach(r => alerts.push({
      type:      'delayed',
      severity:  r.days_overdue >= 5 ? 'critical' : 'warning',
      message:   'Delayed delivery',
      detail:    `${r.days_overdue} day${r.days_overdue !== 1 ? 's' : ''} overdue — ${r.sp_name}`,
      batch:     r.batch_barcode,
      sp_name:   r.sp_name,
      region:    r.region,
      days_overdue: r.days_overdue,
      created_at: r.loading_date,
    }));

    doaSpRes.rows.forEach(r => alerts.push({
      type:     'doa_sp',
      severity: parseFloat(r.doa_pct) >= 15 ? 'critical' : 'warning',
      message:  'High delivery mortality at SP',
      detail:   `${r.doa_pct}% DOA (${r.dead_on_arrival} birds) — ${r.sp_name}`,
      batch:    r.batch_barcode,
      sp_name:  r.sp_name,
      region:   r.region,
      doa_pct:  parseFloat(r.doa_pct),
      created_at: r.signed_at,
    }));

    discrepancyRes.rows.forEach(r => alerts.push({
      type:     'discrepancy',
      severity: 'warning',
      message:  'Delivery tally discrepancy',
      detail:   `${r.shortfall > 0 ? r.shortfall + ' DoCs short' : Math.abs(r.shortfall) + ' DoCs over'} (${r.diff_pct}%) — ${r.sp_name}`,
      batch:    r.batch_barcode,
      sp_name:  r.sp_name,
      shortfall: parseInt(r.shortfall),
      diff_pct:  parseFloat(r.diff_pct),
      created_at: r.batch_barcode,
    }));

    // Sort: critical first, then warning
    alerts.sort((a, b) => (a.severity === 'critical' ? -1 : 1) - (b.severity === 'critical' ? -1 : 1));

    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /dashboard/mortality-map ───────────────────────────────────────────
router.get('/mortality-map', auth, async (req, res) => {
  try {
    const { region, district } = scopeByRole(req.user, {});
    const params = [];
    const conds  = ['me.is_flagged=true'];
    if (region)   { params.push(region);   conds.push(`f.region=$${params.length}`); }
    if (district) { params.push(district); conds.push(`f.district=$${params.length}`); }
    const { rows } = await pool.query(`
      SELECT me.id, me.farmer_count, me.ocr_count, me.is_flagged, me.ocr_status,
             me.photo_path, me.created_at,
             f.full_name, f.farm_gps_lat AS lat, f.farm_gps_lng AS lng, f.region, f.district
      FROM mortality_evidence me JOIN farmers f ON me.farmer_id=f.id
      WHERE ${conds.join(' AND ')} ORDER BY me.created_at DESC LIMIT 50`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
