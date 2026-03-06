const router = require('express').Router();
const pool   = require('../db/pool');
const { sendSMS } = require('../services/sms');

// In-memory USSD session store (fine for prototype single-server)
const sessions = new Map();

// POST /ussd — USSD gateway simulator endpoint
// Compatible with Africa's Talking format (also works with custom PhoneSimulator on dashboard)
router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/plain');

  const sessionId   = req.body.sessionId   || req.body.session_id   || 'demo-session';
  const phoneNumber = req.body.phoneNumber  || req.body.phone_number || '+233500000006';
  const text        = req.body.text         || '';

  const parts = text.split('*').filter(p => p !== '');
  let session = sessions.get(sessionId) || { step: 0, data: {} };

  try {
    // Step 0: Welcome — ask for Farmer ID
    if (parts.length === 0) {
      session.step = 0;
      sessions.set(sessionId, session);
      return res.send('CON Welcome to PIRCMES.\nEnter your Farmer ID (e.g. F006):');
    }

    // Step 1: Validate farmer, ask birds alive
    if (parts.length === 1) {
      const farmerId = parts[0].toUpperCase();
      const { rows } = await pool.query('SELECT * FROM farmers WHERE farmer_number=$1', [farmerId]);
      if (!rows[0]) {
        sessions.delete(sessionId);
        return res.send(`END Farmer ID "${farmerId}" not found. Please check and try again.`);
      }
      session.step   = 1;
      session.farmer = rows[0];
      sessions.set(sessionId, session);
      return res.send(`CON Hello ${rows[0].full_name}.\nHow many birds are alive today?`);
    }

    // Step 2: Save birds alive, ask mortality
    if (parts.length === 2) {
      const alive = parseInt(parts[1]);
      if (isNaN(alive) || alive < 0) return res.send('CON Invalid number. How many birds are alive today?');
      session.data.birds_alive = alive;
      sessions.set(sessionId, session);
      return res.send('CON How many birds died today?');
    }

    // Step 3: Save mortality, ask vaccine
    if (parts.length === 3) {
      const dead = parseInt(parts[2]);
      if (isNaN(dead) || dead < 0) return res.send('CON Invalid number. How many birds died today?');
      session.data.mortality_count = dead;
      sessions.set(sessionId, session);
      return res.send('CON Was vaccine given today?\n1. Yes\n2. No');
    }

    // Step 4: Save vaccine, write entry, send SMS confirmation, END
    if (parts.length === 4) {
      const vaccineChoice = parts[3];
      const vaccineGiven  = vaccineChoice === '1';
      const { farmer, data } = session;

      const today = new Date().toISOString().slice(0,10);
      await pool.query(
        `INSERT INTO daily_farm_entries (farmer_id, entry_date, birds_alive, mortality_count, vaccine_given, entry_method, submitted_at, is_compliant)
         VALUES ($1,$2,$3,$4,$5,'ussd',NOW(),true)
         ON CONFLICT (farmer_id, entry_date) DO UPDATE SET birds_alive=EXCLUDED.birds_alive, mortality_count=EXCLUDED.mortality_count, vaccine_given=EXCLUDED.vaccine_given`,
        [farmer.id, today, data.birds_alive, data.mortality_count, vaccineGiven]
      );

      sessions.delete(sessionId);

      const confirmMsg = `PIRCMES: Report saved for ${today}. Alive: ${data.birds_alive}, Deaths: ${data.mortality_count}, Vaccine: ${vaccineGiven ? 'Yes' : 'No'}. Thank you ${farmer.full_name}.`;
      await sendSMS(farmer.user_id, phoneNumber, confirmMsg);

      return res.send(`END Thank you ${farmer.full_name}. Report saved:\n${data.birds_alive} alive, ${data.mortality_count} deaths, Vaccine: ${vaccineGiven ? 'Yes' : 'No'}.`);
    }

    sessions.delete(sessionId);
    return res.send('END Session expired. Please dial again.');
  } catch (err) {
    console.error('USSD error:', err);
    sessions.delete(sessionId);
    return res.send('END System error. Please try again later.');
  }
});

module.exports = router;
