const router  = require('express').Router();
const { randomUUID } = require('crypto');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { allow } = require('../middleware/rbac');
const { logAudit } = require('../middleware/audit');
const { notifyNational } = require('../services/notifications');
const { sendSMS } = require('../services/sms');

// Short human-readable code (6 chars, no ambiguous 0/O/1/I/L)
function generateCollectionCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// GET /deliveries — list for an allocation or farmer
router.get('/', auth, async (req, res) => {
  const { allocation_id, farmer_id, sp_id } = req.query;
  try {
    let q = `SELECT fdb.*, f.full_name AS farmer_name, f.phone_number AS farmer_phone,
                    f.farm_gps_lat, f.farm_gps_lng
             FROM farmer_delivery_barcodes fdb
             JOIN farmers f ON fdb.farmer_id=f.id WHERE 1=1`;
    const params = [];
    if (allocation_id) { params.push(allocation_id); q += ` AND fdb.allocation_id=$${params.length}`; }
    if (farmer_id)     { params.push(farmer_id);     q += ` AND fdb.farmer_id=$${params.length}`; }
    if (sp_id)         { params.push(sp_id);         q += ` AND fdb.sp_id=$${params.length}`; }
    q += ' ORDER BY fdb.generated_at DESC';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /deliveries/farmer/:farmerId — all deliveries for farmer with batch info
router.get('/farmer/:farmerId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fdb.*, b.loading_date, b.batch_barcode
       FROM farmer_delivery_barcodes fdb
       JOIN allocation_barcodes ab ON fdb.allocation_id = ab.id
       JOIN batch_barcodes b ON ab.batch_id = b.id
       WHERE fdb.farmer_id=$1
       ORDER BY fdb.generated_at DESC`,
      [req.params.farmerId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /deliveries/code/:code — look up a delivery by collection code
router.get('/code/:code', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT fdb.*, f.full_name AS farmer_name, f.phone_number AS farmer_phone,
              f.farm_gps_lat, f.farm_gps_lng
       FROM farmer_delivery_barcodes fdb
       JOIN farmers f ON fdb.farmer_id=f.id
       WHERE fdb.collection_code=$1`,
      [req.params.code.toUpperCase().trim()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Code not found. Please check and try again.' });
    if (rows[0].status === 'delivered') {
      return res.status(409).json({
        error: `Already confirmed — ${rows[0].farmer_name}'s ${rows[0].docs_delivered ?? rows[0].docs_allocated} DoCs were previously delivered.`,
      });
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /deliveries — SP allocates DoCs to farmers
router.post('/', auth, allow('sp_operator','national_admin'), async (req, res) => {
  const { allocation_id, sp_id, farmers_allocations } = req.body;
  // farmers_allocations: [{ farmer_id, docs_allocated, collection_method }]
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const fa of farmers_allocations) {
      const barcode        = randomUUID();
      const collectionCode = generateCollectionCode();
      const { rows } = await client.query(
        `INSERT INTO farmer_delivery_barcodes
           (delivery_barcode, allocation_id, farmer_id, sp_id, docs_allocated,
            collection_method, collection_code, barcode_on_tablet, farmer_notified_at, generated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW()) RETURNING *`,
        [barcode, allocation_id, fa.farmer_id, sp_id, fa.docs_allocated,
         fa.collection_method || 'pickup', collectionCode]
      );
      created.push(rows[0]);
      // SMS farmer with collection code
      const { rows: fRows } = await client.query(
        'SELECT full_name, phone_number FROM farmers WHERE id=$1', [fa.farmer_id]
      );
      if (fRows[0]) {
        await sendSMS(null, fRows[0].phone_number,
          `PIRCMES: Dear ${fRows[0].full_name}, ${fa.docs_allocated} Day-Old Chicks have been allocated to you. ` +
          `Your collection code: ${collectionCode}. Show this code to collect your chicks from your Service Provider.`
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(created);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT /deliveries/:id/confirm — SP (or distributor for anchor/STM) scans farmer barcode + farmer signs
router.put('/:id/confirm', auth, allow('sp_operator','distributor','national_admin'), async (req, res) => {
  const { docs_delivered, farmer_signature, receipt_gps_lat, receipt_gps_lng, dead_on_receipt } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: dRows } = await client.query('SELECT * FROM farmer_delivery_barcodes WHERE id=$1', [req.params.id]);
    if (!dRows[0]) throw new Error('Delivery not found');
    const delivery = dRows[0];

    await client.query(
      `UPDATE farmer_delivery_barcodes SET scanned_by_sp=true, scanned_at=NOW(), docs_delivered=$1, farmer_signed=true, farmer_signature=$2, signed_at=NOW(), status='delivered', updated_at=NOW() WHERE id=$3`,
      [docs_delivered, farmer_signature, delivery.id]
    );

    const { rows: rRows } = await client.query(
      `INSERT INTO farmer_receipts (delivery_barcode_id, farmer_id, sp_id, docs_received, farmer_signature, signed_at, receipt_gps_lat, receipt_gps_lng, dead_on_receipt, aea_notified, national_notified, notifications_sent_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,false,true,NOW()) RETURNING *`,
      [delivery.id, delivery.farmer_id, delivery.sp_id, docs_delivered, farmer_signature, receipt_gps_lat||null, receipt_gps_lng||null, dead_on_receipt||0]
    );

    await client.query('COMMIT');
    await logAudit({ actorId: req.user.id, actorRole: req.user.role, action: 'updated', tableName: 'farmer_delivery_barcodes', recordId: delivery.id, newValues: { status: 'delivered', docs_delivered }, ipAddress: req.ip });
    await notifyNational({ triggerType: 'farmer_receipt_confirmed', triggerTable: 'farmer_receipts', triggerId: rRows[0].id, title: 'Farmer Receipt', body: `Farmer ${delivery.farmer_id} confirmed ${docs_delivered} DoCs` });

    // Stage 4 SMS: confirmation to farmer
    try {
      const { rows: fRows } = await pool.query(
        'SELECT f.user_id, f.phone_number, f.full_name FROM farmers f WHERE f.id=$1',
        [delivery.farmer_id]
      );
      if (fRows[0]) {
        await sendSMS(fRows[0].user_id || null, fRows[0].phone_number,
          `PIRCMES: Dear ${fRows[0].full_name}, ${docs_delivered} Day-Old Chicks have been confirmed as received. Thank you for participating in the Feed Ghana Programme.`
        );
      }
    } catch { /* non-blocking */ }

    res.json({ delivery: dRows[0], receipt: rRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

module.exports = router;
