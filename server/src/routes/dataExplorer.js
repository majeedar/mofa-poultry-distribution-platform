const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

// GET /data-explorer?table=farmers&region=X&district=Y&sp_id=Z&tier=anchor&status=active&limit=100&offset=0
// Supported tables: farmers, service_providers, distributors, batches, allocations, deliveries
router.get('/', auth, async (req, res) => {
  try {
    const { table = 'farmers', limit = 100, offset = 0 } = req.query;
    const lim = Math.min(parseInt(limit) || 100, 100000);
    const off = parseInt(offset) || 0;

    // Role-based region/district scoping
    let scopedRegion   = req.query.region   || null;
    let scopedDistrict = req.query.district || null;
    if (req.user.role === 'regional_officer')  scopedRegion   = req.user.region;
    if (req.user.role === 'district_officer') { scopedRegion   = req.user.region; scopedDistrict = req.user.district; }

    const sp_id  = req.query.sp_id  ? parseInt(req.query.sp_id)  : null;
    const status = req.query.status || null;
    const tier   = req.query.tier   || null;
    const active = req.query.active != null && req.query.active !== ''
      ? req.query.active === 'true'
      : null;

    let dataQ, countQ, params, countParams;

    // ── FARMERS ────────────────────────────────────────────────────────────
    if (table === 'farmers') {
      const where = `
        WHERE ($1::text IS NULL OR f.region   ILIKE $1)
          AND ($2::text IS NULL OR f.district ILIKE $2)
          AND ($3::int  IS NULL OR f.sp_id    = $3)
          AND ($4::text IS NULL OR f.production_tier = $4)
          AND ($5::boolean IS NULL OR f.is_active = $5)
      `;
      const from = `
        FROM farmers f
        LEFT JOIN service_providers sp ON sp.id = f.sp_id
      `;
      const select = `
        SELECT f.farmer_number, f.full_name, f.phone_number, f.gender,
               f.production_tier, sp.sp_name, sp.location_name AS sp_location,
               f.region, f.district, f.farm_location, f.flock_capacity,
               f.collection_method, f.is_active,
               TO_CHAR(f.created_at,'YYYY-MM-DD') AS registered_date
      `;
      params      = [scopedRegion, scopedDistrict, sp_id, tier, active, lim, off];
      countParams = [scopedRegion, scopedDistrict, sp_id, tier, active];
      dataQ  = `${select} ${from} ${where} ORDER BY f.created_at DESC LIMIT $6 OFFSET $7`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    // ── SERVICE PROVIDERS ──────────────────────────────────────────────────
    } else if (table === 'service_providers') {
      const where = `
        WHERE ($1::text IS NULL OR sp.region   ILIKE $1)
          AND ($2::text IS NULL OR sp.district ILIKE $2)
          AND ($3::boolean IS NULL OR sp.is_active = $3)
      `;
      const from = `
        FROM service_providers sp
        LEFT JOIN users u ON u.id = sp.user_id
      `;
      const select = `
        SELECT sp.sp_number, sp.sp_name, sp.location_name, sp.region, sp.district,
               sp.catchment_area, u.full_name AS operator_name, u.phone_number AS operator_phone,
               sp.is_active, TO_CHAR(sp.created_at,'YYYY-MM-DD') AS registered_date
      `;
      params      = [scopedRegion, scopedDistrict, active, lim, off];
      countParams = [scopedRegion, scopedDistrict, active];
      dataQ  = `${select} ${from} ${where} ORDER BY sp.created_at DESC LIMIT $4 OFFSET $5`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    // ── DISTRIBUTORS ───────────────────────────────────────────────────────
    } else if (table === 'distributors') {
      const where = `
        WHERE ($1::text IS NULL OR d.assigned_region ILIKE $1)
          AND ($2::boolean IS NULL OR d.is_active = $2)
      `;
      const from = `
        FROM distributors d
        LEFT JOIN users u ON u.id = d.user_id
      `;
      const select = `
        SELECT d.distributor_number, u.full_name, u.phone_number,
               d.vehicle_number, d.assigned_region,
               d.is_active, TO_CHAR(u.created_at,'YYYY-MM-DD') AS registered_date
      `;
      params      = [scopedRegion, active, lim, off];
      countParams = [scopedRegion, active];
      dataQ  = `${select} ${from} ${where} ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    // ── BATCHES ────────────────────────────────────────────────────────────
    } else if (table === 'batches') {
      const where = `WHERE ($1::text IS NULL OR bb.status = $1)`;
      const from  = `
        FROM batch_barcodes bb
        LEFT JOIN distributors d ON d.id = bb.distributor_id
        LEFT JOIN users u ON u.id = d.user_id
      `;
      const select = `
        SELECT bb.batch_barcode, TO_CHAR(bb.loading_date,'YYYY-MM-DD') AS loading_date,
               bb.status, bb.total_docs_loaded, bb.num_sp_allocations,
               u.full_name AS distributor_name, d.distributor_number
      `;
      params      = [status, lim, off];
      countParams = [status];
      dataQ  = `${select} ${from} ${where} ORDER BY bb.loading_date DESC LIMIT $2 OFFSET $3`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    // ── ALLOCATIONS ────────────────────────────────────────────────────────
    } else if (table === 'allocations') {
      const where = `
        WHERE ($1::text IS NULL OR COALESCE(sp.region,  f.region)   ILIKE $1)
          AND ($2::text IS NULL OR COALESCE(sp.district, f.district) ILIKE $2)
          AND ($3::int  IS NULL OR ab.sp_id = $3)
          AND ($4::text IS NULL OR ab.status = $4)
      `;
      const from = `
        FROM allocation_barcodes ab
        LEFT JOIN batch_barcodes bb ON bb.id = ab.batch_id
        LEFT JOIN service_providers sp ON sp.id = ab.sp_id
        LEFT JOIN farmers f ON f.id = ab.farmer_id
      `;
      const select = `
        SELECT ab.allocation_barcode, bb.batch_barcode,
               TO_CHAR(bb.loading_date,'YYYY-MM-DD') AS batch_date,
               COALESCE(sp.sp_name, f.full_name)           AS recipient_name,
               COALESCE(sp.location_name, f.farm_location) AS recipient_location,
               COALESCE(sp.region,   f.region)   AS region,
               COALESCE(sp.district, f.district) AS district,
               ab.docs_allocated, ab.docs_confirmed, ab.status,
               TO_CHAR(ab.scanned_at,'YYYY-MM-DD HH24:MI') AS scanned_at
      `;
      params      = [scopedRegion, scopedDistrict, sp_id, status, lim, off];
      countParams = [scopedRegion, scopedDistrict, sp_id, status];
      dataQ  = `${select} ${from} ${where} ORDER BY bb.loading_date DESC, ab.id DESC LIMIT $5 OFFSET $6`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    // ── DELIVERIES ─────────────────────────────────────────────────────────
    } else if (table === 'deliveries') {
      const where = `
        WHERE ($1::text IS NULL OR f.region   ILIKE $1)
          AND ($2::text IS NULL OR f.district ILIKE $2)
          AND ($3::int  IS NULL OR fdb.sp_id   = $3)
          AND ($4::text IS NULL OR fdb.status  = $4)
      `;
      const from = `
        FROM farmer_delivery_barcodes fdb
        LEFT JOIN farmers f ON f.id = fdb.farmer_id
        LEFT JOIN service_providers sp ON sp.id = fdb.sp_id
      `;
      const select = `
        SELECT fdb.delivery_barcode, f.farmer_number, f.full_name AS farmer_name,
               sp.sp_name, sp.location_name AS sp_location,
               f.region, f.district,
               fdb.docs_allocated, fdb.docs_delivered, fdb.collection_method,
               fdb.status, TO_CHAR(fdb.signed_at,'YYYY-MM-DD HH24:MI') AS signed_at
      `;
      params      = [scopedRegion, scopedDistrict, sp_id, status, lim, off];
      countParams = [scopedRegion, scopedDistrict, sp_id, status];
      dataQ  = `${select} ${from} ${where} ORDER BY fdb.id DESC LIMIT $5 OFFSET $6`;
      countQ = `SELECT COUNT(*) ${from} ${where}`;

    } else {
      return res.status(400).json({ error: `Unknown table: ${table}` });
    }

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(dataQ, params),
      pool.query(countQ, countParams),
    ]);

    res.json({ rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    console.error('data-explorer error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
