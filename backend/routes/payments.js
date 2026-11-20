// routes/payments.js — Razorpay on the website
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/order   → { planId }  creates a Razorpay order for a plan / top-up
// POST /api/payments/verify  → { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// GET  /api/payments         → my payments
// POST /api/payments/webhook → Razorpay server → us (mounted in server.js with a raw body)
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const authMiddleware = require('../middleware/auth');
const razorpay       = require('../services/razorpayService');
const credits        = require('../services/creditService');
const Payment        = require('../models/Payment');
const logger         = require('../utils/logger');

const router = express.Router();

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

// A few orders per minute is plenty — stops someone spamming Razorpay orders
const recent = new Map();
const tooMany = (userId) => {
  const now = Date.now();
  const list = (recent.get(userId) || []).filter(t => now - t < 60 * 1000);
  list.push(now);
  recent.set(userId, list);
  return list.length > 5;
};

router.post('/order', authMiddleware, async (req, res) => {
  try {
    if (tooMany(req.user.id)) return res.status(429).json({ detail: 'Too many attempts. Wait a minute and try again.' });
    res.json(await razorpay.createOrder(req.user, req.body?.planId));
  } catch (error) {
    sendError(res, error, 'Could not start the payment');
  }
});

router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { payment, alreadyDone } = await razorpay.verifyCheckout(req.user, req.body || {});
    const wallet = await credits.getWallet(req.user.id);
    res.json({
      ok: true,
      alreadyDone,
      packName: payment?.packName,
      ...credits.formatWallet(wallet, req.user),
    });
  } catch (error) {
    sendError(res, error, 'Could not verify the payment');
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const list = await Payment.find({ userId: req.user.id, status: { $ne: 'created' } })
      .sort({ createdAt: -1 }).limit(50).select('-_id -__v -userId').lean();
    res.json(list);
  } catch (error) {
    sendError(res, error, 'Could not load payments');
  }
});

module.exports = router;
