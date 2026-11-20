// routes/admin.js — your Admin page (only ADMIN_EMAILS can use these)
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/overview                → totals for the dashboard cards
// GET  /api/admin/creators               → 🆕 your company's creator accounts + their usage
// POST /api/admin/creators               → 🆕 { name, email, password } create a creator account (free AI, tracked)
// GET  /api/admin/usage?days=30           → credits used per day, active users, avg credits per AI post, top users
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
const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const adminOnly      = require('../middleware/adminOnly');
const credits        = require('../services/creditService');
const User           = require('../models/User');
const CreditWallet   = require('../models/CreditWallet');
const CreditTransaction = require('../models/CreditTransaction');
const UpgradeRequest = require('../models/UpgradeRequest');
const Payment        = require('../models/Payment'); // 🆕 Razorpay
const SocialAccount  = require('../models/SocialAccount');
const Post           = require('../models/Post');
const logger         = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware, adminOnly);

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TZ = 'Asia/Kolkata';
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// Net credits used (usage minus refunds) per user and kind since a date
const usageByUser = async (since, userIds = null) => {
  const match = { type: { $in: ['usage', 'refund'] }, createdAt: { $gte: since } };
  if (userIds) match.userId = { $in: userIds };
  const rows = await CreditTransaction.aggregate([
    { $match: match },
    { $group: {
      _id: { userId: '$userId', kind: '$kind', free: { $ifNull: ['$free', false] } },
      used: { $sum: { $multiply: ['$amount', -1] } },
      last: { $max: '$createdAt' },
    } },
  ]);
  const { costPerCredit = {} } = await credits.getSettings();
  const out = {};
  for (const r of rows) {
    const u = (out[r._id.userId] = out[r._id.userId] || { post: 0, image: 0, video: 0, total: 0, free: 0, costInr: 0, lastUsedAt: null });
    const used = Math.max(0, r.used);
    u[r._id.kind] += used;
    if (r._id.free) u.free += used;                         // company / admin use (not charged)
    u.costInr += used * (costPerCredit[r._id.kind] || 0);   // your estimated Google AI cost
    u.total = u.post + u.image + u.video;
    if (!u.lastUsedAt || r.last > u.lastUsedAt) u.lastUsedAt = r.last;
  }
  for (const u of Object.values(out)) u.costInr = Math.round(u.costInr);
  // average credits spent for each AI-written post (post + image + video credits ÷ post credits)
  for (const u of Object.values(out)) u.avgPerPost = u.post ? Math.round((u.total / u.post) * 100) / 100 : null;
  return out;
};

router.get('/overview', async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const IST = 330 * 60 * 1000; // midnight in India
    const todayStart = new Date(Math.floor((Date.now() + IST) / 86400000) * 86400000 - IST);
    const [users, pending, approved, usage, paid, connected, today] = await Promise.all([
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
        { $match: { status: 'paid', paidAt: { $gte: since }, gateway: { $ne: 'dummy' } } }, // test payments are not revenue
        { $group: { _id: null, count: { $sum: 1 }, paise: { $sum: '$amount' } } },
      ]),
      SocialAccount.distinct('userId', { isActive: true }),
      CreditTransaction.aggregate([
        { $match: { type: { $in: ['usage', 'refund'] }, createdAt: { $gte: todayStart } } },
        { $group: { _id: '$kind', used: { $sum: { $multiply: ['$amount', -1] } } } },
      ]),
    ]);
    res.json({
      users,
      connectedUsers: connected.length, // users with at least one social account connected
      usedToday: Object.fromEntries(credits.KINDS.map(k => [k, Math.max(0, today.find(u => u._id === k)?.used || 0)])),
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

// 🆕 Credits used per day + per user
router.get('/usage', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = daysAgo(days);
    const settings = await credits.getSettings();

    const daily = await CreditTransaction.aggregate([
      { $match: { type: { $in: ['usage', 'refund'] }, createdAt: { $gte: since } } },
      { $group: {
        _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, kind: '$kind' },
        used: { $sum: { $multiply: ['$amount', -1] } },
        free: { $sum: { $cond: [{ $eq: ['$free', true] }, { $multiply: ['$amount', -1] }, 0] } },
        users: { $addToSet: '$userId' },
      } },
      { $sort: { '_id.day': 1 } },
    ]);

    const byDay = {};
    for (const r of daily) {
      const d = (byDay[r._id.day] = byDay[r._id.day] || { day: r._id.day, post: 0, image: 0, video: 0, free: 0, costInr: 0, users: new Set() });
      d[r._id.kind] = Math.max(0, r.used);
      d.free += Math.max(0, r.free);
      d.costInr += Math.max(0, r.used) * (settings.costPerCredit[r._id.kind] || 0);
      r.users.forEach(u => d.users.add(u));
    }
    const dayList = Object.values(byDay).map(d => ({ ...d, costInr: Math.round(d.costInr), total: d.post + d.image + d.video, activeUsers: d.users.size, users: undefined }));

    const perUser = await usageByUser(since);
    const userIds = Object.keys(perUser);
    const totals = { post: 0, image: 0, video: 0 };
    for (const u of Object.values(perUser)) credits.KINDS.forEach(k => { totals[k] += u[k]; });
    const totalAll = totals.post + totals.image + totals.video;

    const top = Object.entries(perUser).sort((a, b) => b[1].total - a[1].total).slice(0, 50);
    const people = await User.find({ id: { $in: top.map(([id]) => id) } }).select('id name email').lean();
    const byId = Object.fromEntries(people.map(p => [p.id, p]));
    const topWallets = await CreditWallet.find({ userId: { $in: top.map(([id]) => id) } }).select('userId company').lean();
    const companyIds = new Set(topWallets.filter(w => w.company).map(w => w.userId));

    // Company / admin (free) vs paying customers
    const all = Object.values(perUser);
    const freeCredits = all.reduce((a, u) => a + u.free, 0);
    const costInr = all.reduce((a, u) => a + u.costInr, 0);
    const freeCostInr = Math.round(all.reduce((a, u) => a + (u.total ? u.costInr * (u.free / u.total) : 0), 0));

    res.json({
      days,
      totals: { ...totals, total: totalAll },
      activeUsers: userIds.length,
      avgPerActiveUser: userIds.length ? Math.round((totalAll / userIds.length) * 10) / 10 : 0,
      avgPerDay: Math.round((totalAll / days) * 10) / 10,
      avgCreditsPerPost: totals.post ? Math.round((totalAll / totals.post) * 100) / 100 : null,
      daily: dayList,
      costPerCredit: settings.costPerCredit,
      costInr,                                                   // estimated Google AI cost, all users
      company: { credits: freeCredits, costInr: freeCostInr },  // your team's free use
      customers: { credits: totalAll - freeCredits, costInr: costInr - freeCostInr },
      topUsers: top.map(([id, u]) => ({
        id,
        name: byId[id]?.name || '',
        email: byId[id]?.email || '(deleted user)',
        company: companyIds.has(id) || credits.isCompanyEmail(byId[id]?.email) || credits.isAdmin(byId[id]),
        ...u,
      })),
    });
  } catch (error) {
    sendError(res, error, 'Failed to load usage');
  }
});

router.get('/users', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter = search
      ? { $or: [{ email: new RegExp(escapeRegex(search), 'i') }, { name: new RegExp(escapeRegex(search), 'i') }] }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(100).select('id name email createdAt').lean();
    const ids = users.map(u => u.id);
    const since = daysAgo(30);
    const [wallets, accounts, usage, posts] = await Promise.all([
      CreditWallet.find({ userId: { $in: ids } }).lean(),
      SocialAccount.find({ userId: { $in: ids }, isActive: true }).select('userId platform').lean(),
      usageByUser(since, ids),
      Post.aggregate([
        { $match: { userId: { $in: ids }, status: 'published', createdAt: { $gte: since } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
    ]);
    const byUser = Object.fromEntries(wallets.map(w => [w.userId, w]));
    const platformsByUser = {};
    for (const a of accounts) (platformsByUser[a.userId] = platformsByUser[a.userId] || new Set()).add(a.platform);
    const postsByUser = Object.fromEntries(posts.map(p => [p._id, p.count]));
    res.json(users.map(u => ({
      connected: [...(platformsByUser[u.id] || [])],          // 🆕 connected platforms
      usage30d: usage[u.id] || { post: 0, image: 0, video: 0, total: 0, avgPerPost: null, lastUsedAt: null }, // 🆕
      publishedPosts30d: postsByUser[u.id] || 0,               // 🆕
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      isAdmin: credits.isAdmin(u),
      company: credits.isCompanyEmail(u.email) || Boolean(byUser[u.id]?.company),
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

// 🆕 Company account on/off: unlimited free AI for your team, every use still tracked
router.post('/users/:id/company', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id }).select('id name email').lean();
    if (!user) return res.status(404).json({ detail: 'User not found' });
    await credits.getWallet(user.id);
    const company = Boolean(req.body?.company);
    const wallet = await CreditWallet.findOneAndUpdate(
      { userId: user.id },
      { $set: { company, companyNote: String(req.body?.note || '').slice(0, 200), updatedAt: new Date() } },
      { new: true }
    );
    logger.info('🏢', `${req.user.email} set company=${company} for ${user.email}`);
    res.json({ ...user, wallet: credits.formatWallet(wallet, user) });
  } catch (error) {
    sendError(res, error, 'Failed to update the account');
  }
});

// 🆕 Company creator accounts — separate logins for your team. Free AI, every use tracked.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/creators', async (req, res) => {
  try {
    await credits.getSettings();
    const domains = String(process.env.COMPANY_EMAIL_DOMAINS || '').split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    const walletIds = (await CreditWallet.find({ company: true }).select('userId').lean()).map(w => w.userId);
    const domainFilter = domains.map(d => ({ email: new RegExp(`@${escapeRegex(d)}$`, 'i') }));
    const users = await User.find({ $or: [{ id: { $in: walletIds } }, ...domainFilter] })
      .sort({ createdAt: -1 }).limit(500).select('id name email createdAt').lean();
    const ids = users.map(u => u.id);
    const since = daysAgo(30);
    const [wallets, accounts, usage, posts] = await Promise.all([
      CreditWallet.find({ userId: { $in: ids } }).lean(),
      SocialAccount.find({ userId: { $in: ids }, isActive: true }).select('userId platform').lean(),
      usageByUser(since, ids),
      Post.aggregate([
        { $match: { userId: { $in: ids }, status: 'published', createdAt: { $gte: since } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ]),
    ]);
    const walletBy = Object.fromEntries(wallets.map(w => [w.userId, w]));
    const platformsBy = {};
    for (const a of accounts) (platformsBy[a.userId] = platformsBy[a.userId] || new Set()).add(a.platform);
    const postsBy = Object.fromEntries(posts.map(p => [p._id, p.count]));
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      byDomain: !walletBy[u.id]?.company,
      note: walletBy[u.id]?.companyNote || '',
      connected: [...(platformsBy[u.id] || [])],
      usage30d: usage[u.id] || { post: 0, image: 0, video: 0, total: 0, free: 0, costInr: 0, avgPerPost: null, lastUsedAt: null },
      publishedPosts30d: postsBy[u.id] || 0,
    })));
  } catch (error) {
    sendError(res, error, 'Failed to load creators');
  }
});

router.post('/creators', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ detail: 'Enter the creator\'s name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ detail: 'Enter a valid email.' });

    let user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }).select('id name email').lean();
    let created = false;
    if (!user) {
      if (password.length < 8) return res.status(400).json({ detail: 'Password must be at least 8 characters.' });
      const id = uuidv4();
      await User.create({ id, name, email, password: await bcrypt.hash(password, 12), avatar: '', role: 'editor', createdAt: new Date() });
      user = { id, name, email };
      created = true;
    }
    await credits.getWallet(user.id);
    const wallet = await CreditWallet.findOneAndUpdate(
      { userId: user.id },
      { $set: { company: true, companyNote: note || 'Company creator', updatedAt: new Date() } },
      { new: true }
    );
    logger.info('🏢', `${req.user.email} ${created ? 'created' : 'converted'} creator account ${email}`);
    res.status(created ? 201 : 200).json({ ...user, created, wallet: credits.formatWallet(wallet, user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ detail: 'An account with this email already exists.' });
    sendError(res, error, 'Failed to create the creator account');
  }
});

// 🆕 Admins (ADMIN_EMAILS from .env + the ones you add here)
router.get('/admins', async (req, res) => {
  try {
    const s = await credits.getSettings();
    const fromEnv = String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    res.json({ fromEnv, added: s.admins });
  } catch (error) {
    sendError(res, error, 'Failed to load admins');
  }
});

router.put('/admins', async (req, res) => {
  try {
    const s = await credits.getSettings();
    const list = Array.isArray(req.body?.admins) ? req.body.admins : [];
    const saved = await credits.saveSettings({ ...s, admins: list }, req.user.id);
    logger.info('🛡️', `${req.user.email} updated admins: ${saved.admins.join(', ') || '(none)'}`);
    res.json({ added: saved.admins });
  } catch (error) {
    sendError(res, error, 'Failed to save admins');
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
    const current = await credits.getSettings();
    // Admins are managed separately (PUT /admins) — never overwritten from the Plans form
    res.json(await credits.saveSettings({ ...(req.body || {}), admins: current.admins }, req.user.id));
  } catch (error) {
    sendError(res, error, 'Failed to save settings');
  }
});

module.exports = router;
