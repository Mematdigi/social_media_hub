// routes/admin.js — your Admin page (only ADMIN_EMAILS can use these)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/overview                → totals for the dashboard cards
// GET  /api/admin/users?search=           → users with their credit balances
// POST /api/admin/users/:id/credits       → { post, image, video, note } add (or remove with −) credits
// GET  /api/admin/users/:id/history       → a user's credit history
// GET  /api/admin/requests?status=pending → upgrade / top-up requests
// POST /api/admin/requests/:id/approve    → { note } adds the plan's credits
// POST /api/admin/requests/:id/reject     → { note }
// GET  /api/admin/settings                → plans, top-ups, free sign-up credits
// PUT  /api/admin/settings                → save them
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const authMiddleware = require('../middleware/auth');
const adminOnly      = require('../middleware/adminOnly');
const credits        = require('../services/creditService');
const User           = require('../models/User');
const CreditWallet   = require('../models/CreditWallet');
const CreditTransaction = require('../models/CreditTransaction');
const UpgradeRequest = require('../models/UpgradeRequest');
const Payment        = require('../models/Payment'); // 🆕 Razorpay
const logger         = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware, adminOnly);

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/overview', async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [users, pending, approved, usage, paid] = await Promise.all([
      User.countDocuments({}),
      UpgradeRequest.countDocuments({ status: 'pending' }),
      UpgradeRequest.aggregate([
        { $match: { status: 'approved', handledAt: { $gte: since } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$price' } } },
      ]),
      CreditTransaction.aggregate([
        { $match: { type: 'usage', createdAt: { $gte: since } } },
        { $group: { _id: '$kind', used: { $sum: { $multiply: ['$amount', -1] } } } },
      ]),
      Payment.aggregate([
        { $match: { status: 'paid', paidAt: { $gte: since } } },
        { $group: { _id: null, count: { $sum: 1 }, paise: { $sum: '$amount' } } },
      ]),
    ]);
    res.json({
      users,
      pendingRequests: pending,
      last30Days: {
        approvedRequests: approved[0]?.count || 0,
        onlinePayments: paid[0]?.count || 0,
        revenue: (approved[0]?.revenue || 0) + Math.round((paid[0]?.paise || 0) / 100),
        used: Object.fromEntries(credits.KINDS.map(k => [k, usage.find(u => u._id === k)?.used || 0])),
      },
    });
  } catch (error) {
    sendError(res, error, 'Failed to load overview');
  }
});

router.get('/users', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter = search
      ? { $or: [{ email: new RegExp(escapeRegex(search), 'i') }, { name: new RegExp(escapeRegex(search), 'i') }] }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(100).select('id name email createdAt').lean();
    const wallets = await CreditWallet.find({ userId: { $in: users.map(u => u.id) } }).lean();
    const byUser = Object.fromEntries(wallets.map(w => [w.userId, w]));
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      isAdmin: credits.isAdmin(u),
      // users who never opened an AI feature have no wallet yet (they get free credits on first use)
      wallet: byUser[u.id] ? credits.formatWallet(byUser[u.id], u) : null,
    })));
  } catch (error) {
    sendError(res, error, 'Failed to load users');
  }
});

router.post('/users/:id/credits', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id }).select('id name email').lean();
    if (!user) return res.status(404).json({ detail: 'User not found' });
    const { post = 0, image = 0, video = 0, note = '' } = req.body || {};
    const amounts = { post: Math.trunc(Number(post) || 0), image: Math.trunc(Number(image) || 0), video: Math.trunc(Number(video) || 0) };
    if (!amounts.post && !amounts.image && !amounts.video) return res.status(400).json({ detail: 'Enter how many credits to add or remove.' });
    if (Object.values(amounts).some(n => Math.abs(n) > 100000)) return res.status(400).json({ detail: 'That number is too large.' });

    const wallet = await credits.addCredits(user.id, amounts, {
      type: 'grant',
      note: String(note).slice(0, 300) || 'Added by admin',
      adminId: req.user.id,
    });
    logger.info('🎁', `${req.user.email} changed credits for ${user.email}: ${JSON.stringify(amounts)}`);
    res.json({ ...user, wallet: credits.formatWallet(wallet, user) });
  } catch (error) {
    sendError(res, error, 'Failed to update credits');
  }
});

router.get('/users/:id/history', async (req, res) => {
  try {
    res.json(await credits.history(req.params.id, Number(req.query.limit) || 100));
  } catch (error) {
    sendError(res, error, 'Failed to load history');
  }
});

router.get('/requests', async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const filter = status === 'all' ? {} : { status };
    const list = await UpgradeRequest.find(filter).sort({ createdAt: -1 }).limit(200).select('-_id -__v').lean();
    res.json(list);
  } catch (error) {
    sendError(res, error, 'Failed to load requests');
  }
});

router.post('/requests/:id/approve', async (req, res) => {
  try {
    // Claim the request first so a double click can never add credits twice
    const request = await UpgradeRequest.findOneAndUpdate(
      { id: req.params.id, status: 'pending' },
      { $set: { status: 'approved', handledBy: req.user.id, handledAt: new Date(), adminNote: String(req.body?.note || '').slice(0, 300) } },
      { new: true }
    );
    if (!request) return res.status(409).json({ detail: 'This request was already handled.' });

    const pack = await credits.findPack(request.planId); // may be gone if you renamed the plan since
    const kind = pack ? pack.kind : (String(request.planId).startsWith('topup') ? 'topup' : 'plan');
    const wallet = await credits.addCredits(request.userId, request.credits, {
      type: kind,
      note: `${request.planName} (₹${request.price}) approved`,
      adminId: req.user.id,
      requestId: request.id,
      plan: kind === 'plan' ? request.planId : null,
    });
    logger.success(`Approved ${request.planName} for ${request.userEmail}`);
    res.json({ request, wallet: credits.formatWallet(wallet, { email: request.userEmail }) });
  } catch (error) {
    sendError(res, error, 'Failed to approve');
  }
});

router.post('/requests/:id/reject', async (req, res) => {
  try {
    const request = await UpgradeRequest.findOneAndUpdate(
      { id: req.params.id, status: 'pending' },
      { $set: { status: 'rejected', handledBy: req.user.id, handledAt: new Date(), adminNote: String(req.body?.note || '').slice(0, 300) } },
      { new: true }
    );
    if (!request) return res.status(409).json({ detail: 'This request was already handled.' });
    res.json({ request });
  } catch (error) {
    sendError(res, error, 'Failed to reject');
  }
});

// 🆕 Razorpay payments
router.get('/payments', async (req, res) => {
  try {
    const status = String(req.query.status || 'all');
    const filter = status === 'all' ? {} : { status };
    res.json(await Payment.find(filter).sort({ createdAt: -1 }).limit(200).select('-_id -__v').lean());
  } catch (error) {
    sendError(res, error, 'Failed to load payments');
  }
});

router.get('/settings', async (req, res) => {
  try {
    res.json(await credits.getSettings());
  } catch (error) {
    sendError(res, error, 'Failed to load settings');
  }
});

router.put('/settings', async (req, res) => {
  try {
    res.json(await credits.saveSettings(req.body || {}, req.user.id));
  } catch (error) {
    sendError(res, error, 'Failed to save settings');
  }
});

module.exports = router;
