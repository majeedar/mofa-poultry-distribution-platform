const router   = require('express').Router();
const { randomUUID } = require('crypto');
const pool     = require('../db/pool');
const auth     = require('../middleware/auth');
const { allow }= require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');
const { generateBatchLabels } = require('../services/labels');
const { sendSMS } = require('../services/sms');

// Barcode generators
function generateBatchBarcode(distributorNumber, loadingDate) {
  const dateStr  = new Date(loadingDate).toISOString().slice(0,10).replace(/-/g,'');
  const random3  = String(Math.floor(Math.random() * 900) + 100);
  return `${distributorNumber}${dateStr}${random3}`;
}
function generateCollectionCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function generateAllocationBarcode(batchBarcode, recipientNumber) {
  const last4 = batchBarcode.slice(-4);
  const last3  = String(recipientNumber).slice(-3);
  const rand3  = String(Math.floor(Math.random() * 900) + 100);
  return `${last4}${last3}${rand3}`;
}

// GET /batches
router.get('/', auth, allow('national_admin','national_officer','district_officer','regional_officer'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, d.distributor_number, u.full_name AS distributor_name
      FROM batch_barcodes b
      JOIN distributors d ON b.distributor_id=d.id
      JOIN users u ON d.user_id=u.id
      ORDER BY b.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /batches/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM batch_barcodes WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /batches — create new batch (NDC Officer)
router.post('/', auth, allow('national_admin','national_officer'), async (req, res) => {
  const { distributor_id, loading_date, total_docs_loaded, allocations } = req.body;
  if (!distributor_id || !loading_date || !total_docs_loaded) {
    return res.status(400).json({ error: 'distributor_id, loading_date, total_docs_loaded required' });
  }
  if (!allocations || allocations.length < 1) {
    return res.status(400).json({ error: 'At least 1 allocation required per batch' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: dRows } = await client.query('SELECT distributor_number FROM distributors WHERE id=$1', [distributor_id]);
    if (!dRows[0]) throw new Error('Distributor not found');

    const batchBarcode = generateBatchBarcode(dRows[0].distributor_number, loading_date);

    const { rows: bRows } = await client.query(
      `INSERT INTO batch_barcodes (batch_barcode, distributor_id, depot_officer_id, loading_date, total_docs_loaded, num_sp_allocations, status)
       VALUES ($1,$2,$3,$4,$5,$6,'loaded') RETURNING *`,
      [batchBarcode, distributor_id, req.user.id, loading_date, total_docs_loaded, allocations.length]
    );
    const batch = bRows[0];

    // Create allocation barcodes (route_order = form position, 1-based)
    // Each alloc has: { recipient_type: 'sp'|'anchor'|'small_medium', sp_id?, farmer_id?, docs_allocated }
    const allocResult = [];
    for (const [idx, alloc] of allocations.entries()) {
      const rtype = alloc.recipient_type || 'sp';

      if (rtype === 'sp') {
        // ── SP allocation (existing flow) ──────────────────────────────────
        const { rows: spRows } = await client.query('SELECT sp_number FROM service_providers WHERE id=$1', [alloc.sp_id]);
        if (!spRows[0]) throw new Error(`SP ${alloc.sp_id} not found`);
        const allocBarcode = generateAllocationBarcode(batchBarcode, spRows[0].sp_number);
        const { rows: aRows } = await client.query(
          `INSERT INTO allocation_barcodes (allocation_barcode, batch_id, sp_id, farmer_id, recipient_type, distributor_id, docs_allocated, route_order, barcode_on_sp_tablet, sp_notified_at)
           VALUES ($1,$2,$3,NULL,'sp',$4,$5,$6,true,NOW()) RETURNING *`,
          [allocBarcode, batch.id, alloc.sp_id, distributor_id, alloc.docs_allocated, idx + 1]
        );
        allocResult.push(aRows[0]);

      } else {
        // ── Anchor / STM farmer direct allocation ──────────────────────────
        const { rows: fRows } = await client.query(
          'SELECT farmer_number, full_name, phone_number, farm_gps_lat, farm_gps_lng FROM farmers WHERE id=$1',
          [alloc.farmer_id]
        );
        if (!fRows[0]) throw new Error(`Farmer ${alloc.farmer_id} not found`);
        const farmer = fRows[0];
        const allocBarcode = generateAllocationBarcode(batchBarcode, farmer.farmer_number);
        const { rows: aRows } = await client.query(
          `INSERT INTO allocation_barcodes (allocation_barcode, batch_id, sp_id, farmer_id, recipient_type, distributor_id, docs_allocated, route_order, barcode_on_sp_tablet, sp_notified_at)
           VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,true,NOW()) RETURNING *`,
          [allocBarcode, batch.id, alloc.farmer_id, rtype, distributor_id, alloc.docs_allocated, idx + 1]
        );
        // Create farmer_delivery_barcodes so farmer QR is immediately visible in farmer app
        const deliveryBarcode  = randomUUID();
        const collectionCode   = generateCollectionCode();
        await client.query(
          `INSERT INTO farmer_delivery_barcodes (delivery_barcode, allocation_id, farmer_id, sp_id, docs_allocated, collection_method, collection_code, barcode_on_tablet, farmer_notified_at, generated_at)
           VALUES ($1,$2,$3,NULL,$4,'delivery',$5,true,NOW(),NOW())`,
          [deliveryBarcode, aRows[0].id, alloc.farmer_id, alloc.docs_allocated, collectionCode]
        );
        // Notify farmer via SMS — include collection code
        if (farmer.phone_number) {
          await sendSMS(null, farmer.phone_number,
            `PIRCMES: Dear ${farmer.full_name}, ${alloc.docs_allocated} Day-Old Chicks will be delivered to your farm. ` +
            `Your collection code: ${collectionCode}. Loading date: ${loading_date}.`
          );
        }
        allocResult.push(aRows[0]);
      }
    }

    await client.query('COMMIT');
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'created', tableName: 'batch_barcodes', recordId: batch.id, newValues: batch, ipAddress: req.ip });

    res.status(201).json({ batch, allocations: allocResult });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT /batches/:id/dispatch
router.put('/:id/dispatch', auth, allow('national_admin','national_officer'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE batch_barcodes SET status='en_route', departure_time=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'updated', tableName: 'batch_barcodes', recordId: rows[0].id, newValues: { status: 'en_route' }, ipAddress: req.ip });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /batches/:id/labels — PDF of QR labels
router.get('/:id/labels', auth, allow('national_admin','national_officer'), async (req, res) => {
  try {
    const { rows: bRows } = await pool.query('SELECT * FROM batch_barcodes WHERE id=$1', [req.params.id]);
    if (!bRows[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: aRows } = await pool.query(
      `SELECT ab.*, sp.sp_name, sp.district, sp.region FROM allocation_barcodes ab JOIN service_providers sp ON ab.sp_id=sp.id WHERE ab.batch_id=$1`,
      [req.params.id]
    );
    const pdfBuffer = await generateBatchLabels(bRows[0], aRows);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="labels-${req.params.id}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
