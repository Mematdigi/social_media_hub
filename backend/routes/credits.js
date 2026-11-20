// routes/credits.js — the customer side of AI credits (web + mobile app)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/credits              → balance, plans, top-ups, my recent requests
// GET  /api/credits/history      → my credit history (added / used)
// POST /api/credits/request      → { planId, note?, source? } ask for a plan or a top-up
// POST /api/credits/request/:id/cancel → cancel my pending request
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const credits        = require('../services/creditService');
const UpgradeRequest = require('../models/UpgradeRequest');
const razorpay       = require('../services/razorpayService'); // 🆕 online payment (website)
const logger         = require('../utils/logger');

const router = express.Router();

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

const formatRequest = (r) => ({
  id: r.id,
  planId: r.planId,
  planName: r.planName,
  price: r.price,
  credits: r.credits,
  note: r.note,
  status: r.status,
  adminNote: r.adminNote,
  createdAt: r.createdAt,
  handledAt: r.handledAt,
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const [wallet, settings, requests] = await Promise.all([
      credits.getWallet(req.user.id),
      credits.getSettings(),
      UpgradeRequest.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    res.json({
      ...credits.formatWallet(wallet, req.user),
      plans: settings.plans,
      topups: settings.topups,
      signupCredits: settings.signupCredits,
      paymentInstructions: settings.paymentInstructions,
      gstPercent: settings.gstPercent,
      razorpay: razorpay.getPublicConfig(req.user), // { enabled, keyId, dummy, dummyOnly } — website only
      requests: requests.map(formatRequest),
    });
  } catch (error) {
    sendError(res, error, 'Failed to load credits');
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    res.json(await credits.history(req.user.id, Number(req.query.limit) || 50));
  } catch (error) {
    sendError(res, error, 'Failed to load credit history');
  }
});

router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { planId, note = '', source = 'web' } = req.body || {};
    const pack = await credits.findPack(String(planId || ''));
    if (!pack) return res.status(400).json({ detail: 'That plan does not exist any more. Refresh the page.' });

    // One open request per plan is enough
    const open = await UpgradeRequest.findOne({ userId: req.user.id, planId: pack.id, status: 'pending' });
    if (open) {
      return res.status(409).json({ detail: `You already asked for ${pack.name}. We will contact you soon — or cancel that request first.` });
    }
    const pendingCount = await UpgradeRequest.countDocuments({ userId: req.user.id, status: 'pending' });
    if (pendingCount >= 3) return res.status(429).json({ detail: 'You have 3 open requests. Please wait for us to process them.' });

    const request = await UpgradeRequest.create({
      id: uuidv4(),
      userId: req.user.id,
      userName: req.user.name || '',
      userEmail: req.user.email || '',
      planId: pack.id,
      planName: pack.name,
      price: pack.price,
      credits: pack.credits,
      note: String(note).slice(0, 500),
      source: source === 'app' ? 'app' : 'web',
      status: 'pending',
      createdAt: new Date(),
    });
    logger.info('💳', `Upgrade request: ${req.user.email} → ${pack.name} (₹${pack.price})`);
    res.status(201).json(formatRequest(request));
  } catch (error) {
    sendError(res, error, 'Failed to send the request');
  }
});

router.post('/request/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const request = await UpgradeRequest.findOneAndUpdate(
      { id: req.params.id, userId: req.user.id, status: 'pending' },
      { $set: { status: 'cancelled', handledAt: new Date() } },
      { new: true }
    );
    if (!request) return res.status(404).json({ detail: 'Request not found or already handled.' });
    res.json(formatRequest(request));
  } catch (error) {
    sendError(res, error, 'Failed to cancel the request');
  }
});

module.exports = router;
