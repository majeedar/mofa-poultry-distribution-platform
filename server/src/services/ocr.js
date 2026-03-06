// Mock OCR service for prototype
// Simulates Google Vision API bird count analysis.
// Returns a count within ±10% of farmer's stated count (realistic prototype behaviour).

function analyzePhoto(farmerCount) {
  const variance    = (Math.random() * 0.2 - 0.1); // -10% to +10%
  const ocrCount    = Math.max(0, Math.round(farmerCount * (1 + variance)));
  const variancePct = farmerCount > 0
    ? Math.abs(farmerCount - ocrCount) / farmerCount * 100
    : 0;
  const threshold   = parseFloat(process.env.OCR_VARIANCE_THRESHOLD || 20);

  return {
    ocr_count:        ocrCount,
    ocr_confidence:   parseFloat((85 + Math.random() * 10).toFixed(2)),
    ocr_status:       variancePct <= threshold ? 'confirmed' : 'flagged',
    count_match:      variancePct <= threshold,
    variance_percent: parseFloat(variancePct.toFixed(2)),
    is_flagged:       variancePct > threshold,
    flag_reason:      variancePct > threshold ? 'count_mismatch' : null,
  };
}

module.exports = { analyzePhoto };
