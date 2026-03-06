/**
 * Transaction seed — fills transactional data for all 142 new farmers
 * Creates: batches, SP allocations, SP receipts, farmer allocations,
 *          farmer receipts, daily farm entries (7 days), AEA visits
 * Run: node src/db/seed_transactions.js
 */
require('dotenv').config();
const bcrypt       = require('bcrypt');
const { randomUUID } = require('crypto');
const pool         = require('./pool');

const fmt = d => new Date(d).toISOString().split('T')[0];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Add distributor for Northern / Eastern ─────────────────────────────
    const hash = await bcrypt.hash('Demo2026!', 10);
    await client.query(`
      INSERT INTO users (full_name, phone_number, email, password_hash, role, ghana_card_number, region)
      VALUES ('Samuel Ampofo (Dist 3)','+233200000003','dist3@pircmes.gov.gh',$1,'distributor','GHA-200000003-2','Northern')
      ON CONFLICT (ghana_card_number) DO NOTHING`, [hash]);

    const { rows: [du] } = await client.query(`SELECT id FROM users WHERE email='dist3@pircmes.gov.gh'`);
    await client.query(`
      INSERT INTO distributors (user_id, distributor_number, identity_barcode, vehicle_number, assigned_region)
      VALUES ($1,'DIST044','IDBCDIST044','NT-9012-22','Northern')
      ON CONFLICT (distributor_number) DO NOTHING`, [du.id]);

    // ── 2. Fetch reference IDs ────────────────────────────────────────────────
    const { rows: distRows } = await client.query('SELECT id, distributor_number FROM distributors ORDER BY id');
    const distIds = Object.fromEntries(distRows.map(d => [d.distributor_number, d.id]));

    const { rows: spRows } = await client.query('SELECT id, sp_number, region, district FROM service_providers ORDER BY sp_number');
    const spById    = Object.fromEntries(spRows.map(s => [s.sp_number, s]));
    const spIdMap   = Object.fromEntries(spRows.map(s => [s.sp_number, s.id]));

    const { rows: aeaRows } = await client.query('SELECT id, aea_number FROM aeas ORDER BY id');
    const aeaIds = Object.fromEntries(aeaRows.map(a => [a.aea_number, a.id]));

    const { rows: [depot] } = await client.query(`SELECT id FROM users WHERE email='depot@pircmes.gov.gh'`);
    const { rows: [officer] } = await client.query(`SELECT id FROM users WHERE email='coordinator@pircmes.gov.gh'`);
    const depotId   = depot.id;
    const officerId = officer.id;

    // All new farmers (F009+)
    const { rows: newFarmers } = await client.query(`
      SELECT f.id, f.farmer_number, f.production_tier, f.sp_id, f.aea_id,
             f.region, f.district, f.flock_capacity, f.farm_gps_lat, f.farm_gps_lng,
             sp.sp_number
      FROM farmers f
      JOIN service_providers sp ON sp.id = f.sp_id
      WHERE f.farmer_number >= 'F009'
      ORDER BY f.farmer_number`);

    const anchorStm = newFarmers.filter(f => f.production_tier !== 'household');
    const docsFor   = f => f.production_tier === 'anchor'
      ? Math.min(parseInt(f.flock_capacity), 200)
      : Math.min(parseInt(f.flock_capacity), 120);

    // ── 3. Batch groups — one batch per distributor ───────────────────────────
    // DIST042 → Ashanti  (SP004,SP005,SP006)
    // DIST043 → Greater Accra (SP007,SP008,SP009)
    // DIST044 → Northern+Eastern (SP010,SP011,SP012,SP013)
    const batchGroups = [
      { dist: 'DIST042', regions: ['Ashanti'],              sps: ['SP004','SP005','SP006'],              spDocs: 800, daysAgo: 12 },
      { dist: 'DIST043', regions: ['Greater Accra'],         sps: ['SP007','SP008','SP009'],              spDocs: 700, daysAgo: 9  },
      { dist: 'DIST044', regions: ['Northern','Eastern'],    sps: ['SP010','SP011','SP012','SP013'],       spDocs: 600, daysAgo: 6  },
    ];

    for (const bg of batchGroups) {
      const bDate   = new Date(); bDate.setDate(bDate.getDate() - bg.daysAgo); bDate.setHours(6,0,0,0);
      const bDateS  = fmt(bDate).replace(/-/g,'');
      const batchBC = `${bg.dist}${bDateS}BLK`;

      // Calc total docs
      const batchFarmers = anchorStm.filter(f => bg.regions.includes(f.region));
      const farmerTotal  = batchFarmers.reduce((s, f) => s + docsFor(f), 0);
      const spTotal      = bg.sps.length * bg.spDocs;

      const { rows: bi } = await client.query(`
        INSERT INTO batch_barcodes (batch_barcode, distributor_id, depot_officer_id, loading_date,
          total_docs_loaded, num_sp_allocations, status, departure_time)
        VALUES ($1,$2,$3,$4,$5,$6,'fully_delivered',$7)
        ON CONFLICT (batch_barcode) DO NOTHING RETURNING id`,
        [batchBC, distIds[bg.dist], depotId, fmt(bDate), spTotal + farmerTotal, bg.sps.length,
         new Date(bDate)]);

      const batchId = bi[0]?.id || (await client.query(
        'SELECT id FROM batch_barcodes WHERE batch_barcode=$1',[batchBC])).rows[0].id;

      // SP allocations + receipts
      for (let si = 0; si < bg.sps.length; si++) {
        const spNum  = bg.sps[si];
        const spId   = spIdMap[spNum];
        const aBC    = `ALLOC-${batchBC}-SP${si+1}`;
        const delAt  = new Date(bDate); delAt.setHours(10 + si, 0, 0);
        const recAt  = new Date(delAt); recAt.setMinutes(recAt.getMinutes() + 45);

        const { rows: ai } = await client.query(`
          INSERT INTO allocation_barcodes
            (allocation_barcode, batch_id, sp_id, distributor_id, docs_allocated, route_order,
             status, scanned_by_distributor, scanned_at, docs_confirmed,
             barcode_on_sp_tablet, sp_notified_at, recipient_type)
          VALUES ($1,$2,$3,$4,$5,$6,'delivered',true,$7,$5,true,$8,'sp')
          ON CONFLICT (allocation_barcode) DO NOTHING RETURNING id`,
          [aBC, batchId, spId, distIds[bg.dist], bg.spDocs, si+1, delAt, new Date(bDate)]);

        const allocId = ai[0]?.id || (await client.query(
          'SELECT id FROM allocation_barcodes WHERE allocation_barcode=$1',[aBC])).rows[0].id;

        await client.query(`
          INSERT INTO sp_receipts
            (allocation_id, sp_id, distributor_id, docs_received, sp_signature,
             signed_at, dead_on_arrival, national_notified, regional_notified, district_notified)
          VALUES ($1,$2,$3,$4,'data:image/png;base64,DEMO',$5,0,true,true,true)
          ON CONFLICT (allocation_id) DO NOTHING`,
          [allocId, spId, distIds[bg.dist], bg.spDocs, recAt]);
      }

      // Anchor/STM farmer allocations + receipts
      for (let fi = 0; fi < batchFarmers.length; fi++) {
        const f     = batchFarmers[fi];
        const docs  = docsFor(f);
        const faBC  = `FALLOC-${f.farmer_number}`;
        const delAt = new Date(bDate); delAt.setHours(8 + (fi % 10), fi % 60, 0);
        const recAt = new Date(delAt); recAt.setHours(recAt.getHours() + 1);
        const sigAt = new Date(delAt); sigAt.setHours(sigAt.getHours() + 2);

        const { rows: fai } = await client.query(`
          INSERT INTO allocation_barcodes
            (allocation_barcode, batch_id, sp_id, farmer_id, distributor_id, docs_allocated, route_order,
             status, scanned_by_distributor, scanned_at, docs_confirmed,
             barcode_on_sp_tablet, sp_notified_at, recipient_type)
          VALUES ($1,$2,NULL,$3,$4,$5,$6,'delivered',true,$7,$5,true,$8,$9)
          ON CONFLICT (allocation_barcode) DO NOTHING RETURNING id`,
          [faBC, batchId, f.id, distIds[bg.dist], docs, 100 + fi, delAt,
           new Date(bDate), f.production_tier]);

        const fAllocId = fai[0]?.id || (await client.query(
          'SELECT id FROM allocation_barcodes WHERE allocation_barcode=$1',[faBC])).rows[0].id;

        // Check / create farmer_delivery_barcode
        const existing = await client.query(
          'SELECT id FROM farmer_delivery_barcodes WHERE allocation_id=$1 AND farmer_id=$2',
          [fAllocId, f.id]);

        let fdbId;
        if (existing.rows.length === 0) {
          const { rows: fdbi } = await client.query(`
            INSERT INTO farmer_delivery_barcodes
              (delivery_barcode, allocation_id, farmer_id, sp_id, docs_allocated,
               collection_method, scanned_by_sp, scanned_at, docs_delivered,
               farmer_signed, signed_at, status, barcode_on_tablet, farmer_notified_at, generated_at)
            VALUES ($1,$2,$3,NULL,$4,'delivery',true,$5,$4,true,$6,'delivered',true,$7,$8)
            RETURNING id`,
            [randomUUID(), fAllocId, f.id, docs, recAt, sigAt, new Date(bDate), new Date(bDate)]);
          fdbId = fdbi[0].id;
        } else {
          fdbId = existing.rows[0].id;
        }

        await client.query(`
          INSERT INTO farmer_receipts
            (delivery_barcode_id, farmer_id, sp_id, docs_received,
             farmer_signature, signed_at, aea_notified, national_notified)
          VALUES ($1,$2,NULL,$3,'data:image/png;base64,DEMO',$4,true,true)
          ON CONFLICT (delivery_barcode_id) DO NOTHING`,
          [fdbId, f.id, docs, sigAt]);
      }
    }

    // ── 4. Daily farm entries — 7 days for all anchor/STM farmers ─────────────
    const today = new Date(); today.setHours(23,59,0,0);

    for (const f of anchorStm) {
      let alive = docsFor(f);
      for (let d = 6; d >= 0; d--) {
        const eDate  = new Date(today); eDate.setDate(eDate.getDate() - d);
        const dateS  = fmt(eDate);
        const mort   = (d === 5 || d === 2) ? 1 : 0;
        alive        = Math.max(0, alive - mort);
        // 90% compliance; today: 80%
        const compliant = d > 0 ? Math.random() > 0.08 : Math.random() > 0.20;
        const subAt  = new Date(eDate); subAt.setHours(17, Math.floor(Math.random()*50)+5, 0);

        await client.query(`
          INSERT INTO daily_farm_entries
            (farmer_id, entry_date, birds_alive, mortality_count,
             feed_consumed_kg, water_consumed_l, entry_method,
             submitted_by, submitted_at, is_compliant, mortality_evidenced)
          VALUES ($1,$2,$3,$4,$5,$6,'tablet',$7,$8,$9,false)
          ON CONFLICT (farmer_id, entry_date) DO NOTHING`,
          [f.id, dateS, alive, mort,
           (alive * 0.11).toFixed(2), (alive * 0.28).toFixed(2),
           officerId, subAt, compliant]);
      }
    }

    // ── 5. AEA visits — 2 visits per new AEA ─────────────────────────────────
    const newAEAs = aeaRows.filter(a => a.aea_number >= 'AEA004');
    for (const aea of newAEAs) {
      const { rows: visited } = await client.query(`
        SELECT f.id, f.farm_gps_lat, f.farm_gps_lng, f.flock_capacity, f.production_tier
        FROM farmers f
        WHERE f.aea_id=$1 AND f.production_tier != 'household' AND f.farmer_number >= 'F009'
        LIMIT 3`, [aea.id]);

      for (let vi = 0; vi < visited.length; vi++) {
        const vf      = visited[vi];
        const vDate   = new Date(today); vDate.setDate(vDate.getDate() - (2 + vi * 2));
        const unlock  = new Date(vDate); unlock.setHours(9, 0, 0);
        const submit  = new Date(vDate); submit.setHours(9, 25, 0);
        const sync    = new Date(vDate); sync.setHours(10, 0, 0);

        await client.query(`
          INSERT INTO aea_visits
            (aea_id, farmer_id, visit_date, visit_type,
             geofence_lat, geofence_lng, distance_from_farm_m, geofence_passed,
             form_unlocked_at, form_submitted_at, birds_alive_observed,
             health_assessment, visit_duration_mins, synced_at)
          VALUES ($1,$2,$3,'routine_weekly',$4,$5,$6,true,$7,$8,$9,$10,$11,$12)
          ON CONFLICT DO NOTHING`,
          [aea.id, vf.id, fmt(vDate),
           parseFloat(vf.farm_gps_lat) + 0.0002, parseFloat(vf.farm_gps_lng) + 0.0002,
           18 + Math.floor(Math.random() * 25),
           unlock, submit,
           parseInt(docsFor(visited[vi]) * 0.97),
           vi === 0 ? 'Birds healthy. No disease signs.' : 'Good growth observed. Water adequate.',
           15 + vi * 5, sync]);
      }
    }

    await client.query('COMMIT');

    // Summary
    const { rows: [s] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM batch_barcodes)     AS batches,
        (SELECT COUNT(*) FROM allocation_barcodes) AS allocs,
        (SELECT COUNT(*) FROM sp_receipts)         AS sp_rec,
        (SELECT COUNT(*) FROM farmer_receipts)     AS f_rec,
        (SELECT COUNT(*) FROM daily_farm_entries)  AS entries,
        (SELECT COUNT(*) FROM aea_visits)          AS visits`);

    console.log('✅ Transaction seed complete');
    console.log(`   Batches:          ${s.batches}`);
    console.log(`   Allocations:      ${s.allocs}`);
    console.log(`   SP receipts:      ${s.sp_rec}`);
    console.log(`   Farmer receipts:  ${s.f_rec}`);
    console.log(`   Daily entries:    ${s.entries}`);
    console.log(`   AEA visits:       ${s.visits}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message, '\n', err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
