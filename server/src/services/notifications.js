const pool     = require('../db/pool');
const io       = require('../socket');
const { sendSMS } = require('./sms');

async function notify({ recipientId, triggerType, triggerTable, triggerId, channel, title, body, phone }) {
  // Write to notifications table
  await pool.query(
    `INSERT INTO notifications (recipient_id, trigger_type, trigger_table, trigger_id, channel, message_title, message_body, sent_at, is_delivered)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),true)`,
    [recipientId, triggerType, triggerTable, triggerId, channel, title, body]
  );

  // Push notification via Socket.io (demo replaces FCM)
  io.emit('push', { recipientId, title, body, ts: new Date().toISOString() });

  // SMS simulation
  if ((channel === 'sms' || channel === 'both') && phone) {
    await sendSMS(recipientId, phone, body);
  }
}

// Notify national admin + all national officers
async function notifyNational({ triggerType, triggerTable, triggerId, title, body }) {
  const { rows } = await pool.query(
    `SELECT id, phone_number FROM users WHERE role IN ('national_admin','national_officer') AND is_active=true`
  );
  for (const u of rows) {
    await notify({ recipientId: u.id, triggerType, triggerTable, triggerId, channel: 'push', title, body });
  }
}

// Notify AEA linked to a farmer
async function notifyAEA({ farmerId, triggerType, triggerTable, triggerId, title, body, sms = false }) {
  const { rows } = await pool.query(
    `SELECT u.id, u.phone_number FROM farmers f JOIN aeas a ON f.aea_id=a.id JOIN users u ON a.user_id=u.id WHERE f.id=$1`,
    [farmerId]
  );
  for (const u of rows) {
    await notify({
      recipientId: u.id, triggerType, triggerTable, triggerId,
      channel: sms ? 'both' : 'push', title, body,
      phone: sms ? u.phone_number : null
    });
  }
}

module.exports = { notify, notifyNational, notifyAEA };
