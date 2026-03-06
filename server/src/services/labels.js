const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

async function generateBatchLabels(batch, allocations) {
  return new Promise(async (resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 30 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const LABEL_W = 240;
    const LABEL_H = 180;
    const COLS    = 2;
    let col = 0, row = 0;

    for (const alloc of allocations) {
      const x = 30 + col * (LABEL_W + 10);
      const y = 30 + row * (LABEL_H + 10);

      // Border
      doc.rect(x, y, LABEL_W, LABEL_H).stroke();

      // Header
      doc.fontSize(9).font('Helvetica-Bold')
        .text('PIRCMES · Feed Ghana Programme', x + 5, y + 5, { width: LABEL_W - 10 });

      // QR Code
      const qrDataUrl = await QRCode.toDataURL(alloc.allocation_barcode, { width: 80 });
      doc.image(qrDataUrl, x + LABEL_W - 90, y + 20, { width: 80 });

      // Text info
      doc.fontSize(8).font('Helvetica')
        .text(`Batch:    ${batch.batch_barcode}`, x + 5, y + 22)
        .text(`SP:       ${alloc.sp_name}`,       x + 5, y + 34)
        .text(`DoCs:     ${alloc.docs_allocated}`, x + 5, y + 46)
        .text(`Date:     ${batch.loading_date}`,   x + 5, y + 58)
        .text(`Barcode:  ${alloc.allocation_barcode}`, x + 5, y + 70)
        .text(`District: ${alloc.district}`,       x + 5, y + 82)
        .text(`Region:   ${alloc.region}`,         x + 5, y + 94);

      col++;
      if (col >= COLS) { col = 0; row++; }
      if (y + LABEL_H + 10 > 780 && col === 0) {
        doc.addPage();
        row = 0;
      }
    }

    doc.end();
  });
}

module.exports = { generateBatchLabels };
