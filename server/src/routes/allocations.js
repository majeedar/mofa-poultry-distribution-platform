const router  = require('express').Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');
const { notifyNational } = require('../services/notifications');
const { sendSMS }        = require('../services/sms');
const io      = require('../socket');

// GET /allocations — list (filtered by batch, sp, or distributor)
router.get('/', auth, async (req, res) => {
  const { batch_id, sp_id, distributor_id } = req.query;
  try {
    let q = `SELECT ab.*,
                    sp.sp_name, sp.sp_barcode, sp.location_name, sp.region AS sp_region, sp.district AS sp_district,
                    sp.gps_lat AS sp_gps_lat, sp.gps_lng AS sp_gps_lng,
                    f.full_name AS farmer_name, f.farmer_number, f.farm_gps_lat AS farmer_gps_lat, f.farm_gps_lng AS farmer_gps_lng,
                    fdb.id AS farmer_delivery_id, fdb.delivery_barcode AS farmer_delivery_barcode,
                    r.signed_at AS receipt_signed_at, r.docs_received AS receipt_docs
             FROM allocation_barcodes ab
             LEFT JOIN service_providers sp ON ab.sp_id=sp.id
             LEFT JOIN farmers f ON ab.farmer_id=f.id
             LEFT JOIN LATERAL (
               SELECT id, delivery_barcode FROM farmer_delivery_barcodes
               WHERE allocation_id=ab.id LIMIT 1
             ) fdb ON true
             LEFT JOIN sp_receipts r ON r.allocation_id=ab.id
             WHERE 1=1`;
    const params = [];
    if (batch_id)       { params.push(batch_id);       q += ` AND ab.batch_id=$${params.length}`; }
    if (sp_id)          { params.push(sp_id);          q += ` AND ab.sp_id=$${params.length}`; }
    if (distributor_id) { params.push(distributor_id); q += ` AND ab.distributor_id=$${params.length}`; }
    q += ' ORDER BY ab.created_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /allocations/sp/:spId — for SP tablet (current allocation)
router.get('/sp/:spId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ab.*, b.batch_barcode, b.loading_date FROM allocation_barcodes ab
       JOIN batch_barcodes b ON ab.batch_id=b.id
       WHERE ab.sp_id=$1 AND ab.status IN ('pending','en_route','delivered') ORDER BY ab.created_at DESC LIMIT 10`,
      [req.params.spId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /allocations/:id/scan — distributor scans SP barcode
router.put('/:id/scan', auth, allow('distributor','national_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE allocation_barcodes SET scanned_by_distributor=true, scanned_at=NOW(), status='en_route', updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Stage 2 SMS: distributor is en route — message differs by recipient type
    try {
      const { rows: farmerRows } = await pool.query(
        `SELECT f.user_id, f.phone_number, f.full_name, fdb.docs_allocated,
                ab.recipient_type, ab.sp_id AS alloc_sp_id, ab.farmer_id AS alloc_farmer_id,
                f.production_tier, sp.sp_name
         FROM farmer_delivery_barcodes fdb
         JOIN farmers f ON f.id = fdb.farmer_id
         JOIN allocation_barcodes ab ON ab.id = fdb.allocation_id
         LEFT JOIN service_providers sp ON sp.id = ab.sp_id
         WHERE fdb.allocation_id = $1`,
        [req.params.id]
      );
      for (const farmer of farmerRows) {
        // Direct farm delivery: explicit recipient_type OR (no sp_id and has farmer_id) OR farmer's own tier
        const isDirectFarm = farmer.recipient_type === 'anchor' || farmer.recipient_type === 'small_medium'
          || (!farmer.alloc_sp_id && farmer.alloc_farmer_id)
          || farmer.production_tier === 'anchor' || farmer.production_tier === 'small_medium';
        const msg = isDirectFarm
          ? `PIRCMES: Dear ${farmer.full_name}, your ${farmer.docs_allocated} Day-Old Chicks are being delivered directly to your farm by our distributor. Please be available to receive them.`
          : `PIRCMES: Dear ${farmer.full_name}, your ${farmer.docs_allocated} Day-Old Chicks are on the way to ${farmer.sp_name || 'your Service Provider'}. Watch for arrival.`;
        await sendSMS(farmer.user_id || null, farmer.phone_number, msg);
      }
    } catch { /* non-blocking — delivery proceeds even if SMS fails */ }

    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /allocations/:id/confirm — recipient confirms receipt (SP or direct farmer)
router.put('/:id/confirm', auth, allow('distributor','sp_operator','national_admin'), async (req, res) => {
  const { docs_confirmed, sp_signature, discrepancy_notes, dead_on_arrival, receipt_gps_lat, receipt_gps_lng } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: aRows } = await client.query('SELECT * FROM allocation_barcodes WHERE id=$1', [req.params.id]);
    if (!aRows[0]) throw new Error('Allocation not found');
    const alloc = aRows[0];

    const discrepancy = docs_confirmed !== alloc.docs_allocated;
    await client.query(
      `UPDATE allocation_barcodes SET docs_confirmed=$1, discrepancy_flag=$2, discrepancy_notes=$3, status='delivered', updated_at=NOW()
       WHERE id=$4`,
      [docs_confirmed, discrepancy, discrepancy_notes || null, alloc.id]
    );

    const alreadyDelivered = alloc.status === 'delivered';
    let receiptId;

    // Use sp_id/farmer_id as the reliable discriminator (recipient_type may be NULL on old rows)
    const isDirectFarmerDelivery = !alloc.sp_id && alloc.farmer_id;
    if (!isDirectFarmerDelivery) {
      // ── SP receipt (existing flow) ────────────────────────────────────────
      const { rows: rRows } = await client.query(
        `INSERT INTO sp_receipts (allocation_id, sp_id, distributor_id, docs_received, sp_signature, signed_at, receipt_gps_lat, receipt_gps_lng, dead_on_arrival, national_notified, regional_notified, district_notified, notifications_sent_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,true,true,true,NOW())
         ON CONFLICT (allocation_id) DO UPDATE SET
           docs_received=EXCLUDED.docs_received, sp_signature=EXCLUDED.sp_signature,
           dead_on_arrival=EXCLUDED.dead_on_arrival, receipt_gps_lat=EXCLUDED.receipt_gps_lat,
           receipt_gps_lng=EXCLUDED.receipt_gps_lng, signed_at=NOW()
         RETURNING *`,
        [alloc.id, alloc.sp_id, alloc.distributor_id, docs_confirmed, sp_signature, receipt_gps_lat||null, receipt_gps_lng||null, dead_on_arrival||0]
      );
      receiptId = rRows[0].id;
      if (!alreadyDelivered) {
        await notifyNational({ triggerType: 'sp_receipt_confirmed', triggerTable: 'sp_receipts', triggerId: receiptId, title: 'SP Receipt Confirmed', body: `SP confirmed ${docs_confirmed} DoCs received. Discrepancy: ${discrepancy}` });
      }
    } else {
      // ── Anchor / STM farmer direct delivery from distributor ──────────────
      await client.query(
        `UPDATE farmer_delivery_barcodes SET scanned_by_sp=true, scanned_at=NOW(), docs_delivered=$1,
         farmer_signed=true, farmer_signature=$2, signed_at=NOW(), status='delivered', updated_at=NOW()
         WHERE allocation_id=$3`,
        [docs_confirmed, sp_signature, alloc.id]
      );
      const { rows: fdbRows } = await client.query(
        'SELECT id FROM farmer_delivery_barcodes WHERE allocation_id=$1', [alloc.id]
      );
      if (fdbRows[0]) {
        const { rows: rRows } = await client.query(
          `INSERT INTO farmer_receipts (delivery_barcode_id, farmer_id, sp_id, docs_received, farmer_signature, signed_at, receipt_gps_lat, receipt_gps_lng, dead_on_receipt, aea_notified, national_notified, notifications_sent_at)
           VALUES ($1,$2,NULL,$3,$4,NOW(),$5,$6,$7,true,true,NOW())
           ON CONFLICT (delivery_barcode_id) DO UPDATE SET
             docs_received=EXCLUDED.docs_received, farmer_signature=EXCLUDED.farmer_signature, signed_at=NOW()
           RETURNING *`,
          [fdbRows[0].id, alloc.farmer_id, docs_confirmed, sp_signature, receipt_gps_lat||null, receipt_gps_lng||null, dead_on_arrival||0]
        );
        receiptId = rRows[0].id;
        if (!alreadyDelivered) {
          await notifyNational({ triggerType: 'farmer_receipt_confirmed', triggerTable: 'farmer_receipts', triggerId: receiptId, title: 'Farmer Receipt (Direct)', body: `Anchor/STM farmer confirmed ${docs_confirmed} DoCs from distributor. Discrepancy: ${discrepancy}` });
        }
      }
    }

    await client.query('COMMIT');

    // Delivery confirmation SMS for anchor/STM direct farm delivery
    if (isDirectFarmerDelivery) {
      try {
        const { rows: fRows } = await pool.query(
          'SELECT user_id, phone_number, full_name FROM farmers WHERE id=$1',
          [alloc.farmer_id]
        );
        if (fRows[0]) {
          await sendSMS(fRows[0].user_id || null, fRows[0].phone_number,
            `PIRCMES: Dear ${fRows[0].full_name}, ${docs_confirmed} Day-Old Chicks have been successfully delivered to your farm. Thank you for participating in the Feed Ghana Programme.`
          );
        }
      } catch { /* non-blocking */ }
    }
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'updated', tableName: 'allocation_barcodes', recordId: alloc.id, newValues: { status: 'delivered', docs_confirmed }, ipAddress: req.ip });

    // Emit live dashboard update
    const eventType = isDirectFarmerDelivery ? 'farmer_receipt' : 'sp_receipt';
    io.emit(eventType, { allocation_id: alloc.id, docs_confirmed, recipient_type: alloc.recipient_type });

    // SMS farmers — stage 3: DoCs confirmed at SP
    if (!isDirectFarmerDelivery) {
      try {
        const { rows: farmerRows } = await pool.query(
          `SELECT f.user_id, f.phone_number, f.full_name, fdb.docs_allocated,
                  fdb.collection_method, sp.sp_name
           FROM farmer_delivery_barcodes fdb
           JOIN farmers f ON f.id = fdb.farmer_id
           LEFT JOIN service_providers sp ON sp.id = fdb.sp_id
           WHERE fdb.allocation_id = $1`,
          [alloc.id]
        );
        for (const farmer of farmerRows) {
          const msg = farmer.collection_method === 'delivery'
            ? `PIRCMES: Dear ${farmer.full_name}, your ${farmer.docs_allocated} Day-Old Chicks have arrived at ${farmer.sp_name || 'the Service Provider'} and will be delivered to your farm.`
            : `PIRCMES: Dear ${farmer.full_name}, your ${farmer.docs_allocated} Day-Old Chicks are now at ${farmer.sp_name || 'your Service Provider'}. Please collect them.`;
          await sendSMS(farmer.user_id || null, farmer.phone_number, msg);
        }
      } catch { /* non-blocking */ }
    }

    res.json({ allocation: aRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
