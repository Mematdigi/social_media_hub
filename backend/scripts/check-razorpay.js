// node scripts/check-razorpay.js   (run on the server, inside backend/)
// Checks the Razorpay keys in .env WITHOUT taking any payment:
//   1. the 3 settings are present   2. Razorpay accepts the key id + secret
//   3. test vs live mode            4. the webhook URL is reachable
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const id = process.env.RAZORPAY_KEY_ID || '';
const secret = process.env.RAZORPAY_KEY_SECRET || '';
const webhook = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const site = process.env.FRONTEND_URL || 'https://media.mematdigi.com';
const hide = (s) => (s ? `${s.slice(0, 8)}…(${s.length} chars)` : '(missing)');

(async () => {
  console.log('RAZORPAY_KEY_ID        ', hide(id));
  console.log('RAZORPAY_KEY_SECRET    ', secret ? `set (${secret.length} chars)` : '(missing)');
  console.log('RAZORPAY_WEBHOOK_SECRET', webhook ? `set (${webhook.length} chars)` : '(missing — credits still added on the payment page, but not if the customer closes it)');
  if (process.env.PAYMENT_MODE === 'dummy') console.log('⚠️  PAYMENT_MODE=dummy is set — everyone gets the TEST checkout. Remove it for real payments.');
  if (!id || !secret) { console.log('❌ Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env'); process.exit(1); }
  console.log('Mode:', id.startsWith('rzp_live_') ? 'LIVE (real money)' : id.startsWith('rzp_test_') ? 'TEST (no real money)' : 'unknown key format');

  try {
    // Read-only call: lists at most 1 order. Proves the keys are valid.
    await axios.get('https://api.razorpay.com/v1/orders?count=1', { auth: { username: id, password: secret }, timeout: 15000 });
    console.log('✅ Razorpay accepted the keys');
  } catch (e) {
    const msg = e.response?.data?.error?.description || e.message;
    console.log(`❌ Razorpay rejected the keys: ${msg}`);
    console.log('   Check for spaces/quotes in .env, and that ID and secret come from the same mode (test or live).');
    process.exit(1);
  }

  try {
    // Unsigned request → our server must answer 400 (signature check), not 404
    const r = await axios.post(`${site.replace(/\/$/, '')}/api/payments/webhook`, '{}', { headers: { 'Content-Type': 'application/json' }, validateStatus: () => true, timeout: 15000 });
    if (r.status === 404) console.log('❌ Webhook URL gives 404 — the backend is old or nginx does not forward /api/payments/webhook');
    else console.log(`✅ Webhook URL is reachable (${site}/api/payments/webhook answered ${r.status} to an unsigned test, as expected)`);
  } catch (e) {
    console.log(`⚠️  Could not reach the webhook URL: ${e.message}`);
  }
  console.log('\nNext: in the website, open Credits & plans and buy the ₹149 top-up.');
})();
