const xlsx = require('xlsx');

const GHANA_CARD_REGEX = /^GHA-\d{9}-\d$/;

function parseExcel(buffer, requiredColumns) {
  const wb   = xlsx.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

  const valid  = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, row 1 is header
    const missing = requiredColumns.filter(c => !row[c] || String(row[c]).trim() === '');
    if (missing.length > 0) {
      errors.push({ row: rowNum, error: `Missing required columns: ${missing.join(', ')}` });
      return;
    }

    // Ghana Card validation if present
    if (row.ghana_card_number && !GHANA_CARD_REGEX.test(String(row.ghana_card_number).trim())) {
      errors.push({ row: rowNum, error: `Invalid Ghana Card format: ${row.ghana_card_number}. Expected GHA-XXXXXXXXX-X` });
      return;
    }

    // Phone normalisation
    if (row.phone_number) {
      let phone = String(row.phone_number).trim().replace(/\s/g,'');
      if (phone.startsWith('0')) phone = '+233' + phone.slice(1);
      row.phone_number = phone;
    }

    valid.push(row);
  });

  return { valid, errors, total: rows.length };
}

// Generate a downloadable Excel template for a given set of columns
function generateTemplate(columns) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([columns]);
  xlsx.utils.book_append_sheet(wb, ws, 'Template');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { parseExcel, generateTemplate };
