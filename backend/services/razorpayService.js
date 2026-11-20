// services/razorpayService.js
// ─────────────────────────────────────────────────────────────────────────────
// Razorpay checkout for plans and top-ups on the WEBSITE (not used by the Android app).
//
// backend/.env
//   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx           Dashboard → Account & Settings → API Keys
//   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
//   RAZORPAY_WEBHOOK_SECRET=any-long-random-text  (Dashboard → Webhooks → same secret)
//
// Flow: website asks for an order → Razorpay checkout opens → the customer pays →
// the website sends the signed result to /api/payments/verify → credits are added.
// The webhook (payment.captured / order.paid) adds the credits too if the customer
// closed the browser before that last step. Credits are added exactly once.
// Uses Razorpay's REST API through axios — no extra npm package needed.
//
// 🆕 DUMMY (TEST) PAYMENTS — no money moves, credits are added like a real payment:
//   PAYMENT_MODE=dummy                    everyone sees the test checkout (test server only!)
//   DUMMY_PAYMENT_EMAILS=a@x.com,b@y.com  only these users (and admins) see "Test payment"
// Dummy payments are marked gateway "dummy" and never count as revenue in Admin.
// ─────────────────────────────────────────────────────────────────────────────
const crypto         = require('crypto');
const axios          = require('axios');
const { v4: uuidv4 } = require('uuid');
const Payment        = require('../models/Payment');
const credits        = require('./creditService');
const logger         = require('../utils/logger');

const API = 'https://api.razorpay.com/v1';

const keyId = () => String(process.env.RAZORPAY_KEY_ID || '').trim();
const keySecret = () => String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const isEnabled = () => Boolean(keyId() && keySecret());

const fail = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  err.own = true;
  return err;
};

const client = () => axios.create({
  baseURL: API,
  auth: { username: keyId(), password: keySecret() },
  timeout: 20000,
});

const apiMessage = (error) => error.response?.data?.error?.description || error.message;

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

// What the customer pays for a plan (in paise), with GST on top if you set it in Admin
const amountFor = (price, gstPercent) => Math.round(Number(price) * (1 + (Number(gstPercent) || 0) / 100) * 100);

// ── 1. Create an order ───────────────────────────────────────────────────────
const createOrder = async (user, packId) => {
  if (!isEnabled()) throw fail('Online payment is not set up yet. Please contact us.', 503);
  const pack = await credits.findPack(String(packId || ''));
  if (!pack) throw fail('That plan does not exist any more. Refresh the page.');
  if (!pack.price || pack.price < 1) throw fail('This plan has no price set.');

  const { gstPercent = 0 } = await credits.getSettings();
  const amount = amountFor(pack.price, gstPercent);
  const receipt = `sh_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`; // max 40 chars

  let order;
  try {
    ({ data: order } = await client().post('/orders', {
      amount,
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: { userId: user.id, email: user.email || '', packId: pack.id, packName: pack.name },
    }));
  } catch (error) {
    logger.error('Razorpay order failed', apiMessage(error));
    throw fail(error.response?.status === 401 ? 'Razorpay keys are wrong. Check backend/.env.' : `Payment could not start: ${apiMessage(error)}`, 502);
  }

  await Payment.create({
    id: uuidv4(),
    userId: user.id,
    userName: user.name || '',
    userEmail: user.email || '',
    packId: pack.id,
    packName: pack.name,
    packKind: pack.kind,
    price: pack.price,
    gstPercent,
    amount,
    credits: pack.credits,
    razorpayOrderId: order.id,
    status: 'created',
    createdAt: new Date(),
  });

  return {
    keyId: keyId(),
    orderId: order.id,
    amount,
    currency: 'INR',
    packName: pack.name,
    description: `${pack.name} — SocialHub AI credits`,
  };
};

// ── 2. Add credits (once) ────────────────────────────────────────────────────
const fulfil = async (orderId, { paymentId, method = null, via }) => {
  // Claim the payment: only the first caller (checkout OR webhook) moves it to "paid"
  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId: orderId, status: { $ne: 'paid' } },
    { $set: { status: 'paid', razorpayPaymentId: paymentId, method, paidVia: via, paidAt: new Date(), error: '' } },
    { new: true }
  );
  if (!payment) return { alreadyDone: true, payment: await Payment.findOne({ razorpayOrderId: orderId }) };

  await credits.addCredits(payment.userId, payment.credits, {
    type: payment.packKind === 'topup' ? 'topup' : 'plan',
    note: `${payment.packName} — paid ₹${(payment.amount / 100).toLocaleString('en-IN')} (${payment.gateway === 'dummy' ? 'TEST payment' : 'Razorpay'} ${paymentId})`,
    plan: payment.packKind === 'plan' ? payment.packId : null,
  });
  logger.success(`💳 Razorpay: ${payment.userEmail} paid ₹${payment.amount / 100} for ${payment.packName} (${via})`);
  return { alreadyDone: false, payment };
};

// ── 3. Checkout finished in the browser ──────────────────────────────────────
const verifyCheckout = async (user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = {}) => {
  if (!isEnabled()) throw fail('Online payment is not set up.', 503);
  if (!orderId || !paymentId || !signature) throw fail('Payment details are missing.');

  const payment = await Payment.findOne({ razorpayOrderId: orderId, userId: user.id });
  if (!payment) throw fail('Payment not found.', 404);

  // Razorpay signs "order_id|payment_id" with your key secret — proves the payment is real
  if (!safeEqual(hmac(keySecret(), `${orderId}|${paymentId}`), signature)) {
    await Payment.updateOne({ id: payment.id, status: 'created' }, { $set: { error: 'Signature mismatch' } });
    throw fail('Payment could not be verified. If money was taken, it will be refunded or added automatically — contact us.', 400);
  }

  // Double-check with Razorpay that the money is really there and the amount matches
  let method = null;
  try {
    const { data } = await client().get(`/payments/${encodeURIComponent(paymentId)}`);
    method = data.method || null;
    if (data.order_id !== orderId || Number(data.amount) !== payment.amount || !['captured', 'authorized'].includes(data.status)) {
      throw fail(`Payment is ${data.status}. Credits will be added as soon as Razorpay confirms it.`, 409);
    }
  } catch (error) {
    if (error.own) throw error;
    logger.error('Razorpay payment check failed', apiMessage(error)); // signature was valid → still fulfil
  }

  return fulfil(orderId, { paymentId, method, via: 'checkout' });
};

// ── 4. Webhook (backup if the browser closed) ────────────────────────────────
// Mounted in server.js BEFORE express.json(), so req.body is the raw Buffer
const handleWebhook = async (req, res) => {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) return res.status(503).json({ detail: 'Webhook secret not set' });

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!safeEqual(hmac(secret, raw), req.get('x-razorpay-signature'))) {
    logger.error('Razorpay webhook', 'Invalid signature');
    return res.status(400).json({ detail: 'Invalid signature' });
  }

  try {
    const event = JSON.parse(raw.toString('utf8'));
    const entity = event?.payload?.payment?.entity;
    if (['payment.captured', 'order.paid'].includes(event.event) && entity?.order_id) {
      const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
      if (payment && Number(entity.amount) === payment.amount) {
        await fulfil(entity.order_id, { paymentId: entity.id, method: entity.method || null, via: 'webhook' });
      }
    } else if (event.event === 'payment.failed' && entity?.order_id) {
      await Payment.updateOne(
        { razorpayOrderId: entity.order_id, status: 'created' },
        { $set: { status: 'failed', error: String(entity.error_description || 'Payment failed').slice(0, 300) } }
      );
    }
    res.json({ ok: true });
  } catch (error) {
    logger.error('Razorpay webhook failed', error.message);
    res.status(500).json({ detail: 'Webhook error' }); // Razorpay retries
  }
};

// ── 5. Dummy (test) payments ─────────────────────────────────────────────────
const dummyForEveryone = () => String(process.env.PAYMENT_MODE || '').toLowerCase().trim() === 'dummy';
const dummyEmails = () => String(process.env.DUMMY_PAYMENT_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const canUseDummy = (user) => dummyForEveryone()
  || credits.isAdmin(user)
  || dummyEmails().includes(String(user?.email || '').toLowerCase());

const createDummyOrder = async (user, packId) => {
  if (!canUseDummy(user)) throw fail('Test payments are not switched on for your account.', 403);
  const pack = await credits.findPack(String(packId || ''));
  if (!pack) throw fail('That plan does not exist any more. Refresh the page.');
  const { gstPercent = 0 } = await credits.getSettings();
  const amount = amountFor(pack.price, gstPercent);
  const orderId = `dummy_order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await Payment.create({
    id: uuidv4(),
    userId: user.id,
    userName: user.name || '',
    userEmail: user.email || '',
    packId: pack.id,
    packName: pack.name,
    packKind: pack.kind,
    price: pack.price,
    gstPercent,
    amount,
    credits: pack.credits,
    gateway: 'dummy',
    razorpayOrderId: orderId,
    status: 'created',
    createdAt: new Date(),
  });
  return { orderId, amount, currency: 'INR', packName: pack.name, description: `${pack.name} — TEST payment`, test: true };
};

// outcome: 'success' adds the credits, 'failed' marks the payment failed
const completeDummy = async (user, { orderId, outcome = 'success', method = 'upi' } = {}) => {
  if (!canUseDummy(user)) throw fail('Test payments are not switched on for your account.', 403);
  const payment = await Payment.findOne({ razorpayOrderId: String(orderId || ''), userId: user.id, gateway: 'dummy' });
  if (!payment) throw fail('Test payment not found.', 404);
  if (outcome !== 'success') {
    await Payment.updateOne({ id: payment.id, status: 'created' }, { $set: { status: 'failed', error: 'Test payment failed (simulated)' } });
    throw fail('Payment failed (simulated). No money was taken.', 402);
  }
  const paymentId = `dummy_pay_${crypto.randomBytes(6).toString('hex')}`;
  return fulfil(payment.razorpayOrderId, { paymentId, method: `test-${String(method).slice(0, 20)}`, via: 'dummy' });
};

const getPublicConfig = (user = null) => ({
  enabled: isEnabled() && !dummyForEveryone(),
  keyId: isEnabled() ? keyId() : null,
  dummy: Boolean(user) && canUseDummy(user),
  dummyOnly: dummyForEveryone(),
});

module.exports = { isEnabled, getPublicConfig, amountFor, createOrder, verifyCheckout, handleWebhook, createDummyOrder, completeDummy };
