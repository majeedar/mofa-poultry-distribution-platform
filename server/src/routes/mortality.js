const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { analyzePhoto } = require('../services/ocr');
const { notifyAEA, notifyNational } = require('../services/notifications');
const io      = require('../socket');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (_, file, cb) => cb(null, `mort_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /mortality
router.get('/', auth, async (req, res) => {
  const { farmer_id, is_flagged } = req.query;
  try {
    let q = `SELECT me.*, f.full_name AS farmer_name FROM mortality_evidence me JOIN farmers f ON me.farmer_id=f.id WHERE 1=1`;
    const params = [];
    if (farmer_id)  { params.push(farmer_id);  q += ` AND me.farmer_id=$${params.length}`; }
    if (is_flagged !== undefined) { params.push(is_flagged === 'true'); q += ` AND me.is_flagged=$${params.length}`; }
    q += ' ORDER BY me.created_at DESC LIMIT 100';
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /mortality — submit with photo
router.post('/', auth, upload.single('photo'), async (req, res) => {
  const { daily_entry_id, farmer_id, aea_id, farmer_count, photo_gps_lat, photo_gps_lng } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : req.body.photo_path || '/uploads/demo_mortality.jpg';

  try {
    const ocrResult = analyzePhoto(parseInt(farmer_count));
    const thresholdPct = parseFloat(process.env.MORTALITY_THRESHOLD_PERCENT || 5);

    // Get flock size to check mortality threshold
    const { rows: fRows } = await pool.query('SELECT current_flock, flock_capacity FROM farmers WHERE id=$1', [farmer_id]);
    const flock = fRows[0]?.current_flock || fRows[0]?.flock_capacity || 1000;
    const mortalityThresholdExceeded = (parseInt(farmer_count) / flock * 100) > thresholdPct;

    const { rows } = await pool.query(
      `INSERT INTO mortality_evidence (daily_entry_id, farmer_id, aea_id, farmer_count, photo_path, photo_taken_at, photo_gps_lat, photo_gps_lng,
        ocr_count, ocr_confidence, ocr_status, count_match, variance_percent, is_flagged, flag_reason,
        mortality_threshold_exceeded, aea_notified, aea_notified_at, aea_visit_required)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,NOW(),$16) RETURNING *`,
      [daily_entry_id, farmer_id, aea_id, farmer_count, photoPath, photo_gps_lat||null, photo_gps_lng||null,
       ocrResult.ocr_count, ocrResult.ocr_confidence, ocrResult.ocr_status, ocrResult.count_match,
       ocrResult.variance_percent, ocrResult.is_flagged, ocrResult.flag_reason,
       mortalityThresholdExceeded, mortalityThresholdExceeded]
    );

    const evidence = rows[0];

    // Update daily entry as evidenced
    await pool.query('UPDATE daily_farm_entries SET mortality_evidenced=true WHERE id=$1', [daily_entry_id]);

    await logAudit({ actorId: req.user?.id, actorRole: req.user?.role, action: 'created', tableName: 'mortality_evidence', recordId: evidence.id, newValues: { farmer_count, ocr_count: ocrResult.ocr_count }, ipAddress: req.ip });

    // Emit to dashboard
    io.emit('mortality', { farmer_id, evidence_id: evidence.id, ocr_result: ocrResult, photo_path: photoPath });

    // Notify AEA (SMS + push with photo)
    await notifyAEA({ farmerId: farmer_id, triggerType: 'mortality_reported', triggerTable: 'mortality_evidence',
      triggerId: evidence.id, title: 'Mortality Evidence Submitted',
      body: `Farmer count: ${farmer_count}, OCR: ${ocrResult.ocr_count} (${ocrResult.ocr_status}). Photo: ${photoPath}`, sms: true });

    if (ocrResult.is_flagged) {
      await notifyNational({ triggerType: 'mortality_flagged', triggerTable: 'mortality_evidence', triggerId: evidence.id,
        title: 'Mortality Flagged', body: `OCR mismatch: farmer=${farmer_count}, OCR=${ocrResult.ocr_count} (${ocrResult.variance_percent.toFixed(1)}% variance)` });
    }

    res.status(201).json(evidence);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /mortality/:id/review — AEA reviews flagged mortality
router.put('/:id/review', auth, async (req, res) => {
  const { aea_review_notes, flag_resolved } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE mortality_evidence SET aea_reviewed=true, aea_review_notes=$1, aea_reviewed_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [aea_review_notes, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
