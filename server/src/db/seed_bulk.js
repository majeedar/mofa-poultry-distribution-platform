/**
 * Bulk seed: 150 farmers across 4 regions / 10 districts / 10 SPs / 10 AEAs
 * Run with: node src/db/seed_bulk.js
 * Distribution: Anchor ~25, STM ~45, HH ~80
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool   = require('./pool');

const PASS   = 'Demo2026!';
const SALT   = 10;

// ── Ghanaian name banks ───────────────────────────────────────────────────────
const MALE_FIRST   = ['Kwame','Kofi','Yaw','Kwaku','Kojo','Kwesi','Kwabena','Nana','Ato','Ekow','Fiifi','Kobina','Kweku','Ebo','Mensah'];
const FEMALE_FIRST = ['Ama','Abena','Akosua','Adwoa','Afia','Afua','Akua','Yaa','Efua','Esi','Araba','Maame','Nana','Akwele','Adjoa'];
const SURNAMES     = ['Mensah','Asante','Boateng','Owusu','Darko','Acheampong','Adjei','Amoah','Appiah','Ofori',
                      'Osei','Bonsu','Agyei','Frimpong','Antwi','Amponsah','Agyemang','Asiedu','Asare','Baah',
                      'Dankwa','Donkor','Duodu','Gyimah','Kwarteng','Nkrumah','Nyarko','Obeng','Sarpong','Tetteh',
                      'Acquah','Aidoo','Akoto','Asamoah','Bediako','Atta','Quaye','Quansah','Tagoe','Laryea'];

function farmerName(i) {
  const male    = i % 2 === 0;
  const first   = male ? MALE_FIRST[i % MALE_FIRST.length] : FEMALE_FIRST[i % FEMALE_FIRST.length];
  const surname = SURNAMES[Math.floor(i * 7 / 3) % SURNAMES.length];
  return { name: `${first} ${surname}`, gender: male ? 'Male' : 'Female' };
}

// ── Location table ────────────────────────────────────────────────────────────
// Each entry: region, district, spKey, aeaKey, lat, lng, farmLocations[]
const LOCATIONS = [
  { region: 'Ashanti',       district: 'Kumasi Metro',  sp: 'SP004', aea: 'AEA004', lat: 6.685, lng: -1.622, loc: ['Adum','Suame','Manhyia','Asafo','Bantama'] },
  { region: 'Ashanti',       district: 'Asokwa',        sp: 'SP005', aea: 'AEA005', lat: 6.670, lng: -1.600, loc: ['Asokwa','Kaase','Ofoase','Kwadaso','Nhyiaeso'] },
  { region: 'Ashanti',       district: 'Oforikrom',     sp: 'SP006', aea: 'AEA006', lat: 6.682, lng: -1.593, loc: ['Oforikrom','Patasi','Ayigya','Bomso','Kentinkrono'] },
  { region: 'Greater Accra', district: 'Ga North',      sp: 'SP007', aea: 'AEA007', lat: 5.700, lng: -0.280, loc: ['Pokuase','Amasaman','Kwabenya','Ofankor','Nsawam Rd'] },
  { region: 'Greater Accra', district: 'Accra Metro',   sp: 'SP008', aea: 'AEA008', lat: 5.550, lng: -0.205, loc: ['Achimota','Legon','Madina','Adentan','Adenta'] },
  { region: 'Greater Accra', district: 'Ga West',       sp: 'SP009', aea: 'AEA009', lat: 5.575, lng: -0.395, loc: ['Kasoa','Bortianor','Weija','Kokrobite','Winneba Rd'] },
  { region: 'Northern',      district: 'Tamale Metro',  sp: 'SP010', aea: 'AEA010', lat: 9.401, lng: -0.849, loc: ['Tamale Central','Choggu','Lamashegu','Vittin','Gumani'] },
  { region: 'Northern',      district: 'Sagnarigu',     sp: 'SP011', aea: 'AEA011', lat: 9.442, lng: -0.843, loc: ['Sagnarigu','Dungu','Kalpohini','Kakpayili','Tishigu'] },
  { region: 'Eastern',       district: 'New Juaben',    sp: 'SP012', aea: 'AEA012', lat: 6.082, lng: -0.261, loc: ['Koforidua','Effiduase','Juaben','Oyoko','Nkawkaw'] },
  { region: 'Eastern',       district: 'Birim North',   sp: 'SP013', aea: 'AEA013', lat: 6.270, lng: -0.578, loc: ['Akim Oda','Kade','Aboabo','Manso','Anomabo'] },
];

// Farmer allocation per location: [anchor, stm, hh]
// Total across all: anchor=23, stm=42, hh=77 (=142 new)
// + existing 2 anchor, 3 stm, 3 hh = 25 anchor, 45 stm, 80 hh = 150 total
const ALLOC = [
  [4, 5, 5],   // Ashanti / Kumasi Metro     = 14
  [4, 5, 6],   // Ashanti / Asokwa           = 15
  [3, 4, 6],   // Ashanti / Oforikrom        = 13
  [3, 5, 7],   // Greater Accra / Ga North   = 15
  [3, 6, 8],   // Greater Accra / Accra Metro= 17
  [2, 5, 8],   // Greater Accra / Ga West    = 15
  [2, 4, 9],   // Northern / Tamale Metro    = 15
  [2, 4, 10],  // Northern / Sagnarigu       = 16
  [0, 2, 9],   // Eastern / New Juaben       = 11
  [0, 2, 9],   // Eastern / Birim North      = 11
  // Total new: 23 anchor, 42 stm, 77 hh = 142
];

async function seedBulk() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(PASS, SALT);

    // ── Insert SP operator users ──────────────────────────────────────────────
    const spUserInsert = `
      INSERT INTO users (full_name, phone_number, email, password_hash, role, ghana_card_number, region, district)
      VALUES ($1,$2,$3,$4,'sp_operator',$5,$6,$7)
      ON CONFLICT (ghana_card_number) DO NOTHING RETURNING id`;

    const aeaUserInsert = `
      INSERT INTO users (full_name, phone_number, email, password_hash, role, ghana_card_number, region, district)
      VALUES ($1,$2,$3,$4,'aea',$5,$6,$7)
      ON CONFLICT (ghana_card_number) DO NOTHING RETURNING id`;

    const spUsers = [
      ['SP Kumasi Centre 2 (SP Operator)',    '+233300000004', 'sp4@pircmes.gov.gh',  hash, 'GHA-300000004-3', 'Ashanti',       'Kumasi Metro' ],
      ['SP Asokwa Centre (SP Operator)',      '+233300000005', 'sp5@pircmes.gov.gh',  hash, 'GHA-300000005-4', 'Ashanti',       'Asokwa'       ],
      ['SP Oforikrom Centre (SP Operator)',   '+233300000006', 'sp6@pircmes.gov.gh',  hash, 'GHA-300000006-5', 'Ashanti',       'Oforikrom'    ],
      ['SP Ga North 2 (SP Operator)',         '+233300000007', 'sp7@pircmes.gov.gh',  hash, 'GHA-300000007-6', 'Greater Accra', 'Ga North'     ],
      ['SP Accra Metro (SP Operator)',        '+233300000008', 'sp8@pircmes.gov.gh',  hash, 'GHA-300000008-7', 'Greater Accra', 'Accra Metro'  ],
      ['SP Ga West Centre (SP Operator)',     '+233300000009', 'sp9@pircmes.gov.gh',  hash, 'GHA-300000009-8', 'Greater Accra', 'Ga West'      ],
      ['SP Tamale 2 (SP Operator)',           '+233300000010', 'sp10@pircmes.gov.gh', hash, 'GHA-300000010-9', 'Northern',      'Tamale Metro' ],
      ['SP Sagnarigu Centre (SP Operator)',   '+233300000011', 'sp11@pircmes.gov.gh', hash, 'GHA-300000011-0', 'Northern',      'Sagnarigu'    ],
      ['SP New Juaben Centre (SP Operator)',  '+233300000012', 'sp12@pircmes.gov.gh', hash, 'GHA-300000012-1', 'Eastern',       'New Juaben'   ],
      ['SP Birim North Centre (SP Operator)', '+233300000013', 'sp13@pircmes.gov.gh', hash, 'GHA-300000013-2', 'Eastern',       'Birim North'  ],
    ];

    const aeaUsers = [
      ['AEA Kumasi 2 (AEA)',    '+233400000004', 'aea4@pircmes.gov.gh',  hash, 'GHA-400000004-3', 'Ashanti',       'Kumasi Metro' ],
      ['AEA Asokwa (AEA)',      '+233400000005', 'aea5@pircmes.gov.gh',  hash, 'GHA-400000005-4', 'Ashanti',       'Asokwa'       ],
      ['AEA Oforikrom (AEA)',   '+233400000006', 'aea6@pircmes.gov.gh',  hash, 'GHA-400000006-5', 'Ashanti',       'Oforikrom'    ],
      ['AEA Ga North 2 (AEA)',  '+233400000007', 'aea7@pircmes.gov.gh',  hash, 'GHA-400000007-6', 'Greater Accra', 'Ga North'     ],
      ['AEA Accra Metro (AEA)', '+233400000008', 'aea8@pircmes.gov.gh',  hash, 'GHA-400000008-7', 'Greater Accra', 'Accra Metro'  ],
      ['AEA Ga West (AEA)',     '+233400000009', 'aea9@pircmes.gov.gh',  hash, 'GHA-400000009-8', 'Greater Accra', 'Ga West'      ],
      ['AEA Tamale 2 (AEA)',    '+233400000010', 'aea10@pircmes.gov.gh', hash, 'GHA-400000010-9', 'Northern',      'Tamale Metro' ],
      ['AEA Sagnarigu (AEA)',   '+233400000011', 'aea11@pircmes.gov.gh', hash, 'GHA-400000011-0', 'Northern',      'Sagnarigu'    ],
      ['AEA New Juaben (AEA)',  '+233400000012', 'aea12@pircmes.gov.gh', hash, 'GHA-400000012-1', 'Eastern',       'New Juaben'   ],
      ['AEA Birim North (AEA)', '+233400000013', 'aea13@pircmes.gov.gh', hash, 'GHA-400000013-2', 'Eastern',       'Birim North'  ],
    ];

    for (const u of spUsers)  await client.query(spUserInsert,  u);
    for (const u of aeaUsers) await client.query(aeaUserInsert, u);

    // Fetch all users by email
    const { rows: allUsers } = await client.query('SELECT id, email FROM users');
    const byEmail = {};
    for (const u of allUsers) byEmail[u.email] = u.id;

    // ── Insert SPs ────────────────────────────────────────────────────────────
    const spData = [
      ['SP004', 'Kumasi Centre 2',       'SPBC004', 'Bantama, Kumasi',    'Ashanti',       'Kumasi Metro', 6.691, -1.617, 'sp4@pircmes.gov.gh'  ],
      ['SP005', 'Asokwa DoC Centre',     'SPBC005', 'Asokwa, Kumasi',     'Ashanti',       'Asokwa',       6.671, -1.601, 'sp5@pircmes.gov.gh'  ],
      ['SP006', 'Oforikrom DoC Centre',  'SPBC006', 'Oforikrom, Kumasi',  'Ashanti',       'Oforikrom',    6.683, -1.594, 'sp6@pircmes.gov.gh'  ],
      ['SP007', 'Ga North Centre 2',     'SPBC007', 'Pokuase, Accra',     'Greater Accra', 'Ga North',     5.702, -0.281, 'sp7@pircmes.gov.gh'  ],
      ['SP008', 'Accra Metro Centre',    'SPBC008', 'Achimota, Accra',    'Greater Accra', 'Accra Metro',  5.551, -0.206, 'sp8@pircmes.gov.gh'  ],
      ['SP009', 'Ga West DoC Centre',    'SPBC009', 'Kasoa, Accra',       'Greater Accra', 'Ga West',      5.576, -0.396, 'sp9@pircmes.gov.gh'  ],
      ['SP010', 'Tamale Centre 2',       'SPBC010', 'Choggu, Tamale',     'Northern',      'Tamale Metro', 9.402, -0.850, 'sp10@pircmes.gov.gh' ],
      ['SP011', 'Sagnarigu DoC Centre',  'SPBC011', 'Sagnarigu, Tamale',  'Northern',      'Sagnarigu',    9.443, -0.844, 'sp11@pircmes.gov.gh' ],
      ['SP012', 'New Juaben DoC Centre', 'SPBC012', 'Koforidua, Eastern', 'Eastern',       'New Juaben',   6.083, -0.262, 'sp12@pircmes.gov.gh' ],
      ['SP013', 'Birim North Centre',    'SPBC013', 'Akim Oda, Eastern',  'Eastern',       'Birim North',  6.271, -0.579, 'sp13@pircmes.gov.gh' ],
    ];

    for (const s of spData) {
      await client.query(`
        INSERT INTO service_providers (user_id,sp_number,sp_name,sp_barcode,location_name,region,district,gps_lat,gps_lng)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (sp_number) DO NOTHING`,
        [byEmail[s[8]], s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]
      );
    }

    // ── Insert AEAs ───────────────────────────────────────────────────────────
    const aeaData = [
      ['AEA004', 'Kumasi Metro',  'Ashanti',       'aea4@pircmes.gov.gh'  ],
      ['AEA005', 'Asokwa',        'Ashanti',       'aea5@pircmes.gov.gh'  ],
      ['AEA006', 'Oforikrom',     'Ashanti',       'aea6@pircmes.gov.gh'  ],
      ['AEA007', 'Ga North',      'Greater Accra', 'aea7@pircmes.gov.gh'  ],
      ['AEA008', 'Accra Metro',   'Greater Accra', 'aea8@pircmes.gov.gh'  ],
      ['AEA009', 'Ga West',       'Greater Accra', 'aea9@pircmes.gov.gh'  ],
      ['AEA010', 'Tamale Metro',  'Northern',      'aea10@pircmes.gov.gh' ],
      ['AEA011', 'Sagnarigu',     'Northern',      'aea11@pircmes.gov.gh' ],
      ['AEA012', 'New Juaben',    'Eastern',       'aea12@pircmes.gov.gh' ],
      ['AEA013', 'Birim North',   'Eastern',       'aea13@pircmes.gov.gh' ],
    ];

    for (const a of aeaData) {
      await client.query(`
        INSERT INTO aeas (user_id, aea_number, district, region)
        VALUES ($1,$2,$3,$4) ON CONFLICT (aea_number) DO NOTHING`,
        [byEmail[a[3]], a[0], a[1], a[2]]
      );
    }

    // Fetch SP and AEA IDs
    const { rows: spRows }  = await client.query('SELECT id, sp_number  FROM service_providers ORDER BY id');
    const { rows: aeaRows } = await client.query('SELECT id, aea_number FROM aeas ORDER BY id');
    const spIds  = {}; for (const s of spRows)  spIds[s.sp_number]  = s.id;
    const aeaIds = {}; for (const a of aeaRows) aeaIds[a.aea_number] = a.id;

    // ── Insert bulk farmers ───────────────────────────────────────────────────
    let farmerIndex = 0;  // name generator index
    let farmerNum   = 9;  // start from F009

    const tierCodes = ['anchor', 'small_medium', 'household'];
    const capacity  = { anchor: [1000,2000], small_medium: [400,800], household: [30,100] };

    for (let li = 0; li < LOCATIONS.length; li++) {
      const loc   = LOCATIONS[li];
      const alloc = ALLOC[li];

      for (let ti = 0; ti < 3; ti++) {
        const tier  = tierCodes[ti];
        const count = alloc[ti];
        const [capMin, capMax] = capacity[tier];

        for (let fi = 0; fi < count; fi++) {
          const num     = `F${String(farmerNum).padStart(3,'0')}`;
          const barcode = `FMBC${String(farmerNum).padStart(3,'0')}`;
          const { name, gender } = farmerName(farmerIndex);
          const phone   = `+23360${String(7000000 + farmerNum).padStart(7,'0')}`;
          const cap     = capMin + Math.floor(Math.random() * (capMax - capMin));
          const lat     = loc.lat + (Math.random() - 0.5) * 0.04;
          const lng     = loc.lng + (Math.random() - 0.5) * 0.04;
          const farmLoc = loc.loc[fi % loc.loc.length];
          const hasTab  = tier !== 'household';
          const method  = tier === 'anchor' ? 'pickup' : 'delivery';

          await client.query(`
            INSERT INTO farmers
              (user_id, farmer_number, farmer_barcode, full_name, phone_number, gender,
               production_tier, sp_id, aea_id, farm_location, region, district,
               farm_gps_lat, farm_gps_lng, flock_capacity, has_tablet, collection_method, is_active)
            VALUES
              (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)
            ON CONFLICT (farmer_number) DO NOTHING`,
            [num, barcode, name, phone, gender, tier,
             spIds[loc.sp], aeaIds[loc.aea], farmLoc, loc.region, loc.district,
             lat.toFixed(6), lng.toFixed(6), cap, hasTab, method]
          );

          farmerNum++;
          farmerIndex++;
        }
      }
    }

    await client.query('COMMIT');

    const { rows: [{ cnt }] } = await pool.query('SELECT COUNT(*) AS cnt FROM farmers');
    const { rows: tiers }     = await pool.query('SELECT production_tier, COUNT(*) AS n FROM farmers GROUP BY production_tier ORDER BY production_tier');

    console.log(`✅ Bulk seed complete — ${cnt} total farmers`);
    for (const t of tiers) console.log(`   ${t.production_tier}: ${t.n}`);
    console.log(`   Regions: ${[...new Set(LOCATIONS.map(l=>l.region))].join(', ')}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Bulk seed failed:', err.message, err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

seedBulk();
