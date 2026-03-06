require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./pool');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'Demo2026!';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    // --- USERS ---
    const userInsert = `
      INSERT INTO users (full_name, phone_number, email, password_hash, role, ghana_card_number, region, district)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (ghana_card_number) DO NOTHING RETURNING id`;

    const users = [
      ['Kwame Asante (National Admin)', '+233244000001', 'admin@pircmes.gov.gh',       hash, 'national_admin',    'GHA-100000001-0', 'Greater Accra', 'Accra Metro'],
      ['Abena Mensah (National Officer)','+233244000002','coordinator@pircmes.gov.gh', hash, 'national_officer',  'GHA-100000002-1', 'Greater Accra', 'Accra Metro'],
      ['Kofi Boateng (Depot Officer)',   '+233244000003', 'depot@pircmes.gov.gh',      hash, 'national_officer',  'GHA-100000003-2', 'Greater Accra', 'Accra Metro'],
      ['Yaw Darko (Regional Officer)',   '+233244000004', 'regional@pircmes.gov.gh',   hash, 'regional_officer',  'GHA-100000004-3', 'Ashanti',       null],
      ['Akua Owusu (District Officer)',  '+233244000005', 'district@pircmes.gov.gh',   hash, 'district_officer',  'GHA-100000005-4', 'Ashanti',       'Kumasi Metro'],
      ['Emmanuel Acheampong (Dist 1)',   '+233200000001', 'dist1@pircmes.gov.gh',      hash, 'distributor',       'GHA-200000001-0', 'Ashanti',       null],
      ['Francis Adjei (Dist 2)',         '+233200000002', 'dist2@pircmes.gov.gh',      hash, 'distributor',       'GHA-200000002-1', 'Greater Accra', null],
      ['SP Kumasi (SP Operator)',        '+233300000001', 'sp1@pircmes.gov.gh',        hash, 'sp_operator',       'GHA-300000001-0', 'Ashanti',       'Kumasi Metro'],
      ['SP Accra North (SP Operator)',   '+233300000002', 'sp2@pircmes.gov.gh',        hash, 'sp_operator',       'GHA-300000002-1', 'Greater Accra', 'Ga North'],
      ['SP Tamale (SP Operator)',        '+233300000003', 'sp3@pircmes.gov.gh',        hash, 'sp_operator',       'GHA-300000003-2', 'Northern',      'Tamale Metro'],
      ['AEA Kumasi (AEA 1)',             '+233400000001', 'aea1@pircmes.gov.gh',       hash, 'aea',               'GHA-400000001-0', 'Ashanti',       'Kumasi Metro'],
      ['AEA Accra (AEA 2)',              '+233400000002', 'aea2@pircmes.gov.gh',       hash, 'aea',               'GHA-400000002-1', 'Greater Accra', 'Ga North'],
      ['AEA Tamale (AEA 3)',             '+233400000003', 'aea3@pircmes.gov.gh',       hash, 'aea',               'GHA-400000003-2', 'Northern',      'Tamale Metro'],
      ['Ama Owusu (Anchor Farmer)',      '+233500000001', 'f1@pircmes.gov.gh',         hash, 'farmer',            'GHA-500000001-0', 'Ashanti',       'Kumasi Metro'],
      ['Kofi Asante (Anchor Farmer)',    '+233500000002', 'f2@pircmes.gov.gh',         hash, 'farmer',            'GHA-500000002-1', 'Ashanti',       'Kumasi Metro'],
      ['Akosua Boateng (SM Farmer)',     '+233500000003', 'f3@pircmes.gov.gh',         hash, 'farmer',            'GHA-500000003-2', 'Ashanti',       'Kumasi Metro'],
      ['Yaw Mensah (SM Farmer)',         '+233500000004', 'f4@pircmes.gov.gh',         hash, 'farmer',            'GHA-500000004-3', 'Greater Accra', 'Ga North'],
      ['Abena Darko (SM Farmer)',        '+233500000005', 'f5@pircmes.gov.gh',         hash, 'farmer',            'GHA-500000005-4', 'Greater Accra', 'Ga North'],
    ];

    const userIds = {};
    for (const u of users) {
      const r = await client.query(userInsert, u);
      if (r.rows[0]) userIds[u[4] + '_' + u[6]] = r.rows[0].id;
    }

    // Household farmers (no user account)
    const householdPhones = ['+233500000006', '+233500000007', '+233500000008'];

    // Get all user ids
    const allUsers = await client.query('SELECT id, email, role FROM users');
    const byEmail = {};
    for (const u of allUsers.rows) byEmail[u.email] = u.id;

    // --- AEAs ---
    await client.query(`
      INSERT INTO aeas (user_id, aea_number, district, region) VALUES
      ($1, 'AEA001', 'Kumasi Metro', 'Ashanti'),
      ($2, 'AEA002', 'Ga North', 'Greater Accra'),
      ($3, 'AEA003', 'Tamale Metro', 'Northern')
      ON CONFLICT (aea_number) DO NOTHING`,
      [byEmail['aea1@pircmes.gov.gh'], byEmail['aea2@pircmes.gov.gh'], byEmail['aea3@pircmes.gov.gh']]
    );
    const { rows: aeaRows } = await client.query('SELECT id, aea_number FROM aeas ORDER BY id');
    const aeaIds = {};
    for (const a of aeaRows) aeaIds[a.aea_number] = a.id;

    // --- DISTRIBUTORS ---
    await client.query(`
      INSERT INTO distributors (user_id, distributor_number, identity_barcode, vehicle_number, assigned_region) VALUES
      ($1, 'DIST042', 'IDBCDIST042', 'GR-1234-21', 'Ashanti'),
      ($2, 'DIST043', 'IDBCDIST043', 'GR-5678-21', 'Greater Accra')
      ON CONFLICT (distributor_number) DO NOTHING`,
      [byEmail['dist1@pircmes.gov.gh'], byEmail['dist2@pircmes.gov.gh']]
    );
    const { rows: distRows } = await client.query('SELECT id, distributor_number FROM distributors ORDER BY id');
    const distIds = {};
    for (const d of distRows) distIds[d.distributor_number] = d.id;

    // --- SERVICE PROVIDERS ---
    await client.query(`
      INSERT INTO service_providers (user_id, sp_number, sp_name, sp_barcode, location_name, region, district, gps_lat, gps_lng) VALUES
      ($1, 'SP001', 'Kumasi DoC Centre',     'SPBC001', 'Adum, Kumasi',      'Ashanti',       'Kumasi Metro', 6.68848,  -1.62443),
      ($2, 'SP002', 'Accra North DoC Centre','SPBC002', 'Achimota, Accra',   'Greater Accra', 'Ga North',     5.61699,  -0.22136),
      ($3, 'SP003', 'Tamale DoC Centre',     'SPBC003', 'Central, Tamale',   'Northern',      'Tamale Metro', 9.40079,  -0.84897)
      ON CONFLICT (sp_number) DO NOTHING`,
      [byEmail['sp1@pircmes.gov.gh'], byEmail['sp2@pircmes.gov.gh'], byEmail['sp3@pircmes.gov.gh']]
    );
    const { rows: spRows } = await client.query('SELECT id, sp_number FROM service_providers ORDER BY id');
    const spIds = {};
    for (const s of spRows) spIds[s.sp_number] = s.id;

    // --- FARMERS (with tablet) ---
    // $1-$5: user IDs, $6: SP001, $7: SP002, $8: AEA001, $9: AEA002
    await client.query(`
      INSERT INTO farmers (user_id, farmer_number, farmer_barcode, full_name, phone_number, gender, production_tier, sp_id, aea_id, farm_name, farm_location, region, district, farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, collection_method) VALUES
      ($1,  'F001', 'FMBC001', 'Ama Owusu',      '+233500000001', 'Female', 'anchor',       $6, $8, 'Owusu Poultry',  'Asokwa, Kumasi',   'Ashanti',       'Kumasi Metro', 6.67460, -1.61280, 2000, true,  'pickup'),
      ($2,  'F002', 'FMBC002', 'Kofi Asante',    '+233500000002', 'Male',   'anchor',       $6, $8, 'Asante Farm',    'Suame, Kumasi',    'Ashanti',       'Kumasi Metro', 6.71234, -1.59870, 1500, true,  'pickup'),
      ($3,  'F003', 'FMBC003', 'Akosua Boateng', '+233500000003', 'Female', 'small_medium', $6, $8, 'Boateng Layers', 'Manhyia, Kumasi',  'Ashanti',       'Kumasi Metro', 6.70120, -1.62100, 800,  true,  'delivery'),
      ($4,  'F004', 'FMBC004', 'Yaw Mensah',     '+233500000004', 'Male',   'small_medium', $7, $9, 'Mensah Poultry', 'Achimota, Accra',  'Greater Accra', 'Ga North',     5.62000, -0.22000, 600,  true,  'pickup'),
      ($5,  'F005', 'FMBC005', 'Abena Darko',    '+233500000005', 'Female', 'small_medium', $7, $9, 'Darko Farm',     'Pokuase, Accra',   'Greater Accra', 'Ga North',     5.65000, -0.25000, 500,  true,  'pickup')
      ON CONFLICT (farmer_number) DO NOTHING`,
      [
        byEmail['f1@pircmes.gov.gh'], byEmail['f2@pircmes.gov.gh'],
        byEmail['f3@pircmes.gov.gh'], byEmail['f4@pircmes.gov.gh'],
        byEmail['f5@pircmes.gov.gh'],
        spIds['SP001'], spIds['SP002'],
        aeaIds['AEA001'], aeaIds['AEA002']
      ]
    );

    // Household farmers (no user_id)
    await client.query(`
      INSERT INTO farmers (user_id, farmer_number, farmer_barcode, full_name, phone_number, gender, production_tier, sp_id, aea_id, farm_location, region, district, farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, collection_method) VALUES
      (NULL, 'F006', 'FMBC006', 'Kofi Nkrumah',   '+233500000006', 'Male',   'household', $1, $4, 'Ejura, Kumasi',    'Ashanti',       'Kumasi Metro', 6.64000, -1.63000, 50, false, 'pickup'),
      (NULL, 'F007', 'FMBC007', 'Ama Sarpong',     '+233500000007', 'Female', 'household', $2, $5, 'Kasoa, Accra',     'Greater Accra', 'Ga North',     5.53000, -0.42000, 30, false, 'pickup'),
      (NULL, 'F008', 'FMBC008', 'Yaw Boakye',      '+233500000008', 'Male',   'household', $3, $6, 'Tishigu, Tamale',  'Northern',      'Tamale Metro', 9.39000, -0.86000, 40, false, 'pickup')
      ON CONFLICT (farmer_number) DO NOTHING`,
      [spIds['SP001'], spIds['SP002'], spIds['SP003'], aeaIds['AEA001'], aeaIds['AEA002'], aeaIds['AEA003']]
    );

    const { rows: farmerRows } = await client.query('SELECT id, farmer_number FROM farmers ORDER BY id');
    const farmerIds = {};
    for (const f of farmerRows) farmerIds[f.farmer_number] = f.id;

    // --- BATCH BARCODE ---
    const today = new Date();
    const dateStr = today.toISOString().slice(0,10).replace(/-/g,'');
    const batchBarcode = `DIST042${dateStr}847`;

    const { rows: batchInsert } = await client.query(`
      INSERT INTO batch_barcodes (batch_barcode, distributor_id, depot_officer_id, loading_date, total_docs_loaded, num_sp_allocations, status, departure_time)
      VALUES ($1, $2, $3, CURRENT_DATE, 1000, 2, 'en_route', NOW() - INTERVAL '4 hours')
      ON CONFLICT (batch_barcode) DO NOTHING RETURNING id`,
      [batchBarcode, distIds['DIST042'], byEmail['depot@pircmes.gov.gh']]
    );

    let batchId;
    if (batchInsert && batchInsert[0]) {
      batchId = batchInsert[0].id;
    } else {
      const r = await client.query('SELECT id FROM batch_barcodes WHERE batch_barcode=$1', [batchBarcode]);
      batchId = r.rows[0].id;
    }

    // --- ALLOCATION BARCODES ---
    const alloc1Barcode = '4847001391';
    const alloc2Barcode = '4847002582';

    const { rows: alloc1 } = await client.query(`
      INSERT INTO allocation_barcodes (allocation_barcode, batch_id, sp_id, distributor_id, docs_allocated, status, scanned_by_distributor, scanned_at, docs_confirmed, barcode_on_sp_tablet, sp_notified_at)
      VALUES ($1, $2, $3, $4, 600, 'delivered', true, NOW() - INTERVAL '3 hours', 598, true, NOW() - INTERVAL '5 hours')
      ON CONFLICT (allocation_barcode) DO NOTHING RETURNING id`,
      [alloc1Barcode, batchId, spIds['SP001'], distIds['DIST042']]
    );

    await client.query(`
      INSERT INTO allocation_barcodes (allocation_barcode, batch_id, sp_id, distributor_id, docs_allocated, status, barcode_on_sp_tablet, sp_notified_at)
      VALUES ($1, $2, $3, $4, 400, 'pending', true, NOW() - INTERVAL '5 hours')
      ON CONFLICT (allocation_barcode) DO NOTHING`,
      [alloc2Barcode, batchId, spIds['SP002'], distIds['DIST042']]
    );

    const { rows: allocRows } = await client.query('SELECT id, allocation_barcode FROM allocation_barcodes ORDER BY id');
    const allocIds = {};
    for (const a of allocRows) allocIds[a.allocation_barcode] = a.id;

    // --- SP RECEIPT (for alloc1) ---
    await client.query(`
      INSERT INTO sp_receipts (allocation_id, sp_id, distributor_id, docs_received, sp_signature, signed_at, dead_on_arrival, national_notified, regional_notified, district_notified)
      VALUES ($1, $2, $3, 598, 'data:image/png;base64,DEMO_SIG', NOW() - INTERVAL '2 hours 30 minutes', 2, true, true, true)
      ON CONFLICT (allocation_id) DO NOTHING`,
      [allocIds[alloc1Barcode], spIds['SP001'], distIds['DIST042']]
    );

    // --- FARMER DELIVERY BARCODES ---
    const deliveries = [
      { farmer: 'F001', barcode: require('crypto').randomUUID(), docs: 200 },
      { farmer: 'F002', barcode: require('crypto').randomUUID(), docs: 200 },
      { farmer: 'F003', barcode: require('crypto').randomUUID(), docs: 198 },
    ];

    for (const d of deliveries) {
      await client.query(`
        INSERT INTO farmer_delivery_barcodes (delivery_barcode, allocation_id, farmer_id, sp_id, docs_allocated, collection_method, scanned_by_sp, scanned_at, docs_delivered, farmer_signed, signed_at, status, barcode_on_tablet, farmer_notified_at)
        VALUES ($1, $2, $3, $4, $5, 'pickup', true, NOW() - INTERVAL '1 hour 30 minutes', $5, true, NOW() - INTERVAL '1 hour', 'delivered', true, NOW() - INTERVAL '2 hours')
        ON CONFLICT (delivery_barcode) DO NOTHING`,
        [d.barcode, allocIds[alloc1Barcode], farmerIds[d.farmer], spIds['SP001'], d.docs]
      );
    }

    const { rows: deliveryRows } = await client.query('SELECT id, farmer_id FROM farmer_delivery_barcodes ORDER BY id');
    const deliveryByFarmer = {};
    for (const d of deliveryRows) deliveryByFarmer[d.farmer_id] = d.id;

    // --- FARMER RECEIPTS ---
    for (const d of deliveries) {
      const fid = farmerIds[d.farmer];
      const did = deliveryByFarmer[fid];
      if (did) {
        await client.query(`
          INSERT INTO farmer_receipts (delivery_barcode_id, farmer_id, sp_id, docs_received, farmer_signature, signed_at, aea_notified, national_notified)
          VALUES ($1, $2, $3, $4, 'data:image/png;base64,DEMO_FARMER_SIG', NOW() - INTERVAL '1 hour', true, true)
          ON CONFLICT (delivery_barcode_id) DO NOTHING`,
          [did, fid, spIds['SP001'], d.docs]
        );
      }
    }

    // --- DAILY FARM ENTRIES (5 days for F001) ---
    const f1id = farmerIds['F001'];
    for (let i = 4; i >= 0; i--) {
      const entryDate = new Date(today);
      entryDate.setDate(entryDate.getDate() - i);
      const dateOnly = entryDate.toISOString().slice(0,10);
      const mortality = i === 2 ? 2 : 0;
      const alive = 200 - (i === 2 ? 2 : 0) - (i < 2 ? 2 : 0);
      await client.query(`
        INSERT INTO daily_farm_entries (farmer_id, entry_date, birds_alive, mortality_count, feed_consumed_kg, water_consumed_l, entry_method, submitted_by, submitted_at, is_compliant, mortality_evidenced)
        VALUES ($1, $2, $3, $4, $5, $6, 'tablet', $7, $8, true, $9)
        ON CONFLICT (farmer_id, entry_date) DO NOTHING`,
        [f1id, dateOnly, alive, mortality, (alive * 0.12).toFixed(2), (alive * 0.3).toFixed(2),
         byEmail['f1@pircmes.gov.gh'],
         new Date(entryDate.setHours(17, 30, 0, 0)),
         mortality > 0]
      );
    }

    // --- MORTALITY EVIDENCE ---
    const { rows: mortEntryRows } = await client.query(
      `SELECT id FROM daily_farm_entries WHERE farmer_id=$1 AND mortality_count>0 ORDER BY entry_date LIMIT 1`,
      [f1id]
    );
    if (mortEntryRows[0]) {
      await client.query(`
        INSERT INTO mortality_evidence (daily_entry_id, farmer_id, aea_id, farmer_count, photo_path, ocr_count, ocr_confidence, ocr_status, count_match, variance_percent, is_flagged, aea_notified)
        VALUES ($1, $2, $3, 2, '/uploads/demo_mortality.jpg', 2, 91.5, 'confirmed', true, 0.0, false, true)
        ON CONFLICT DO NOTHING`,
        [mortEntryRows[0].id, f1id, aeaIds['AEA001']]
      );
    }

    // --- AEA VISITS ---
    await client.query(`
      INSERT INTO aea_visits (aea_id, farmer_id, visit_date, visit_type, geofence_lat, geofence_lng, distance_from_farm_m, geofence_passed, form_unlocked_at, form_submitted_at, birds_alive_observed, health_assessment, visit_duration_mins, synced_at)
      VALUES
      ($1, $2, CURRENT_DATE - 3, 'routine_weekly', 6.67490, -1.61310, 35.2, true, NOW()-INTERVAL '3 days 2 hours', NOW()-INTERVAL '3 days 1 hour 45 minutes', 198, 'Birds healthy, no visible disease signs', 15, NOW()-INTERVAL '3 days'),
      ($1, $3, CURRENT_DATE - 1, 'routine_weekly', 6.71260, -1.59900, 28.7, true, NOW()-INTERVAL '1 day 3 hours',   NOW()-INTERVAL '1 day 2 hours 50 minutes',  196, 'Minor respiratory observed in 3 birds, monitor', 20, NOW()-INTERVAL '1 day')
      ON CONFLICT DO NOTHING`,
      [aeaIds['AEA001'], farmerIds['F001'], farmerIds['F002']]
    );

    // --- NOTIFICATIONS (sample) ---
    const nationalAdminId = byEmail['admin@pircmes.gov.gh'];
    await client.query(`
      INSERT INTO notifications (recipient_id, trigger_type, trigger_table, trigger_id, channel, message_title, message_body, sent_at, is_delivered, is_read)
      VALUES
      ($1, 'sp_receipt_confirmed',   'sp_receipts',         1, 'push', 'SP Receipt Confirmed', 'SP Kumasi confirmed receipt of 598 DoCs from batch ${batchBarcode}', NOW()-INTERVAL '2 hours', true, false),
      ($1, 'farmer_receipt_confirmed','farmer_receipts',     1, 'push', 'Farmer Receipt',       'Ama Owusu (F001) confirmed receipt of 200 DoCs', NOW()-INTERVAL '1 hour', true, false),
      ($1, 'mortality_reported',      'mortality_evidence',  1, 'both', 'Mortality Reported',   'F001 reports 2 bird deaths. Photo uploaded.', NOW()-INTERVAL '2 days', true, true)
      ON CONFLICT DO NOTHING`,
      [nationalAdminId]
    );

    // --- AUDIT LOG (seed actions) ---
    await client.query(`
      INSERT INTO audit_logs (actor_id, actor_role, action, table_name, record_id, new_values, ip_address)
      VALUES
      ($1, 'national_admin',   'created', 'users', 1,            '{"action":"seed_users"}',    '127.0.0.1'),
      ($1, 'national_admin',   'created', 'batch_barcodes', $2,  '{"batch":"${batchBarcode}"}','127.0.0.1'),
      ($1, 'national_officer', 'created', 'allocation_barcodes', 1, '{"sp":"SP001","docs":600}','127.0.0.1')
      ON CONFLICT DO NOTHING`,
      [nationalAdminId, batchId]
    );

    await client.query('COMMIT');
    console.log('✅ PIRCMES seed data loaded successfully');
    console.log('   Default password for all users: Demo2026!');
    console.log('   Admin login: admin@pircmes.gov.gh');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
