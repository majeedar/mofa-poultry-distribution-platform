const io   = require('../socket');
const pool = require('../db/pool');

// In the prototype, SMS is simulated via Socket.io broadcast.
// The web dashboard's SMSInbox component listens for 'sms' events.
async function sendSMS(recipientUserId, toPhone, body) {
  const msg = {
    to:     toPhone,
    body,
    sentAt: new Date().toISOString(),
  };
  // Broadcast to all connected web clients (dashboard sees it live)
  io.emit('sms', msg);

  // Always log to sms_log (keyed by phone) so farmer inbox can query history
  try {
    await pool.query('INSERT INTO sms_log (to_phone, body) VALUES ($1, $2)', [toPhone, body]);
  } catch (e) {
    console.error('SMS log error:', e.message);
  }

  // Log to notifications table if we have a recipientUserId
  if (recipientUserId) {
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_id, trigger_type, trigger_table, trigger_id, channel, message_title, message_body, sent_at, is_delivered)
         VALUES ($1, 'sms_sent', 'sms', 0, 'sms', 'SMS', $2, NOW(), true)`,
        [recipientUserId, body]
      );
    } catch (e) {
      console.error('SMS notification log error:', e.message);
    }
  }
}

module.exports = { sendSMS };
