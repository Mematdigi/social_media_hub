// routes/adminAiCosts.js — Admin → "AI costs" (exact Google AI spend, from every recorded call)
// Mounted inside routes/admin.js, so only admins can use it.
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/admin/ai-costs?days=30            → totals, by model / feature / day / user / post, unit costs
// GET  /api/admin/ai-costs/calls?page=1&…      → every single AI call (filters: model, feature, kind, status, userId, postId, q)
// GET  /api/admin/ai-costs/posts/:postId       → one post: every AI call that went into it
// GET  /api/admin/ai-costs/export.csv?days=30  → all calls as a spreadsheet
// GET  /api/admin/ai-costs/pricing             → price list (USD per 1M tokens) + ₹ rate + GST
// PUT  /api/admin/ai-costs/pricing             → save it (applies to new calls)
// POST /api/admin/ai-costs/recalculate?days=30 → re-price past calls with the current price list
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const AiUsage = require('../models/AiUsage');
const Post = require('../models/Post');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const credits = require('../services/creditService');
const aiUsage = require('../services/aiUsageService');
const logger = require('../utils/logger');

const router = express.Router();
const TZ = 'Asia/Kolkata';

const sendError = (res, error, fallback) => {
  logger.error(fallback, error.message);
  res.status(error.status || 500).json({ detail: error.message || fallback });
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;

// ?days=30  or  ?from=2026-11-01&to=2026-11-25 (dates in India time, "to" inclusive)
const range = (q) => {
  if (q.from) {
    const from = new Date(`${q.from}T00:00:00+05:30`);
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 24 * 3600 * 1000) : new Date();
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) return { $gte: from, $lt: to };
  }
  const days = Math.min(366, Math.max(1, Number(q.days) || 30));
  return { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) };
};

const SUMS = {
  calls: { $sum: 1 },
  errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
  estimated: { $sum: { $cond: ['$estimated', 1, 0] } },
  unpriced: { $sum: { $cond: [{ $and: [{ $eq: ['$priceFound', false] }, { $eq: ['$status', 'ok'] }] }, 1, 0] } },
  inputTokens: { $sum: '$inputTokens' },
  cachedTokens: { $sum: '$cachedTokens' },
  thoughtTokens: { $sum: '$thoughtTokens' },
  outputTextTokens: { $sum: '$outputTextTokens' },
  outputImageTokens: { $sum: '$outputImageTokens' },
  outputVideoTokens: { $sum: '$outputVideoTokens' },
  totalTokens: { $sum: '$totalTokens' },
  videoSeconds: { $sum: '$videoSeconds' },
  images: { $sum: '$images' },
  costUsd: { $sum: '$costUsd' },
  costInr: { $sum: '$costInr' },
  durationMs: { $sum: '$durationMs' },
};

const tidy = (r, gst) => {
  const okCalls = r.calls - r.errors;
  return {
    ...r,
    costUsd: round(r.costUsd, 4),
    costInr: round(r.costInr, 2),
    costInrWithGst: round(r.costInr * (1 + gst / 100), 2),
    avgInrPerCall: okCalls ? round(r.costInr / okCalls, 3) : 0,
    avgSeconds: r.calls ? round(r.durationMs / r.calls / 1000, 1) : 0,
    durationMs: undefined,
  };
};

const group = (match, by, gst, sort = { costInr: -1 }, limit = 200) =>
  AiUsage.aggregate([{ $match: match }, { $group: { _id: by, ...SUMS } }, { $sort: sort }, { $limit: limit }])
    .then(rows => rows.map(r => tidy(r, gst)));

// ── Summary ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const createdAt = range(req.query);
    const match = { createdAt };
    const pricing = await aiUsage.getPricing();
    const gst = pricing.gstPercent;

    const [totalRow] = await group(match, null, gst);
    const totals = totalRow || tidy({ calls: 0, errors: 0, costUsd: 0, costInr: 0, durationMs: 0 }, gst);

    const [byModel, byFeature, byKind, byDayRaw, byUserRaw, byPostRaw, linkedRow] = await Promise.all([
      group(match, '$model', gst),
      group(match, { feature: '$feature', kind: '$kind' }, gst),
      group(match, '$kind', gst),
      group(match, { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, kind: '$kind' }, gst, { '_id.day': 1 }, 2000),
      AiUsage.aggregate([
        { $match: match },
        { $group: { _id: '$userId', ...SUMS, email: { $last: '$email' }, posts: { $addToSet: '$postId' } } },
        { $sort: { costInr: -1 } }, { $limit: 100 },
      ]),
      AiUsage.aggregate([
        { $match: { ...match, postId: { $ne: null } } },
        { $group: { _id: '$postId', ...SUMS, email: { $last: '$email' }, kinds: { $addToSet: '$kind' }, models: { $addToSet: '$model' }, first: { $min: '$createdAt' } } },
        { $sort: { costInr: -1 } }, { $limit: 100 },
      ]),
      AiUsage.aggregate([
        { $match: { ...match, postId: { $ne: null } } },
        { $group: { _id: null, costInr: { $sum: '$costInr' }, posts: { $addToSet: '$postId' } } },
      ]),
    ]);

    // Day × kind → one row per day
    const days = {};
    for (const r of byDayRaw) {
      const d = (days[r._id.day] = days[r._id.day] || { day: r._id.day, text: 0, agent: 0, image: 0, video: 0, embedding: 0, costInr: 0, calls: 0 });
      d[r._id.kind] = round((d[r._id.kind] || 0) + r.costInr, 2);
      d.costInr = round(d.costInr + r.costInr, 2);
      d.calls += r.calls;
    }

    // Users: names + how many posts their AI went into
    const users = await User.find({ id: { $in: byUserRaw.map(u => u._id).filter(Boolean) } }).select('id name email').lean();
    const userById = Object.fromEntries(users.map(u => [u.id, u]));
    const byUser = byUserRaw.map(u => ({
      ...tidy({ ...u, posts: undefined }, gst),
      name: userById[u._id]?.name || '',
      email: userById[u._id]?.email || u.email || (u._id ? '(deleted user)' : '(no user — background)'),
      posts: u.posts.filter(Boolean).length,
    }));

    // Posts: caption, channels, status
    const posts = await Post.find({ id: { $in: byPostRaw.map(p => p._id) } }).select('id content youtubeTitle platforms status createdAt').lean();
    const postById = Object.fromEntries(posts.map(p => [p.id, p]));
    const byPost = byPostRaw.map(p => ({
      ...tidy(p, gst),
      caption: String(postById[p._id]?.youtubeTitle || postById[p._id]?.content || '(post deleted)').slice(0, 120),
      platforms: postById[p._id]?.platforms || [],
      status: postById[p._id]?.status || 'deleted',
    }));

    // Unit costs (only successful calls)
    const ok = { ...match, status: 'ok' };
    const unit = await AiUsage.aggregate([
      { $match: ok },
      { $group: { _id: '$feature', calls: { $sum: 1 }, costInr: { $sum: '$costInr' }, seconds: { $sum: '$videoSeconds' }, videoTokens: { $sum: '$outputVideoTokens' } } },
    ]);
    const unitCosts = unit.map(u => ({
      feature: u._id,
      calls: u.calls,
      avgInr: round(u.costInr / u.calls, 3),
      perVideoSecondInr: u.seconds ? round(u.costInr / u.seconds, 3) : null,
      avgVideoSeconds: u.seconds ? round(u.seconds / u.calls, 1) : null,
    })).sort((a, b) => b.avgInr - a.avgInr);

    const linked = linkedRow[0] || { costInr: 0, posts: [] };

    // Real ₹ per credit = AI cost of that kind ÷ credits used (compare with "cost per credit" in Plans & settings)
    const creditRows = await CreditTransaction.aggregate([
      { $match: { type: { $in: ['usage', 'refund'] }, createdAt } },
      { $group: { _id: '$kind', used: { $sum: { $multiply: ['$amount', -1] } } } },
    ]);
    const creditsUsed = Object.fromEntries(creditRows.map(r => [r._id, Math.max(0, r.used)]));
    const kindCost = Object.fromEntries(byKind.map(k => [k._id, k.costInr]));
    const settings = await credits.getSettings();
    const perCredit = {
      post: { used: creditsUsed.post || 0, costInr: round((kindCost.text || 0) + (kindCost.agent || 0)), setting: settings.costPerCredit?.post },
      image: { used: creditsUsed.image || 0, costInr: round(kindCost.image || 0), setting: settings.costPerCredit?.image },
      video: { used: creditsUsed.video || 0, costInr: round(kindCost.video || 0), setting: settings.costPerCredit?.video },
    };
    Object.values(perCredit).forEach(p => { p.actualPerCredit = p.used ? round(p.costInr / p.used) : null; });

    res.json({
      range: { from: createdAt.$gte, to: createdAt.$lt || new Date() },
      pricing: { usdToInr: pricing.usdToInr, gstPercent: gst },
      totals,
      linkedToPosts: { posts: linked.posts.length, costInr: round(linked.costInr), avgPerPostInr: linked.posts.length ? round(linked.costInr / linked.posts.length) : 0 },
      notLinkedInr: round(totals.costInr - linked.costInr), // AI used on drafts that were never saved, ideas, agent chats…
      byModel, byFeature, byKind,
      byDay: Object.values(days),
      byUser, byPost, unitCosts, perCredit,
    });
  } catch (error) {
    sendError(res, error, 'Failed to load AI costs');
  }
});

// ── Every call ──────────────────────────────────────────────────────────────
const callFilter = (q) => {
  const filter = { createdAt: range(q) };
  for (const key of ['model', 'feature', 'kind', 'status', 'userId', 'postId']) {
    if (q[key]) filter[key] = String(q[key]);
  }
  if (q.q) {
    const re = new RegExp(escapeRegex(String(q.q).slice(0, 100)), 'i');
    filter.$or = [{ email: re }, { promptPreview: re }, { postId: re }, { mediaUrl: re }];
  }
  return filter;
};

router.get('/calls', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = callFilter(req.query);
    const [rows, total] = await Promise.all([
      AiUsage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-__v').lean(),
      AiUsage.countDocuments(filter),
    ]);
    res.json({ total, page, limit, rows });
  } catch (error) {
    sendError(res, error, 'Failed to load AI calls');
  }
});

router.get('/posts/:postId', async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId }).select('id userId content youtubeTitle platforms status mediaUrls createdAt').lean();
    const calls = await AiUsage.find({ postId: req.params.postId }).sort({ createdAt: 1 }).select('-__v').lean();
    const pricing = await aiUsage.getPricing();
    const costInr = calls.reduce((s, c) => s + c.costInr, 0);
    res.json({
      post,
      calls,
      totals: {
        calls: calls.length,
        costUsd: round(calls.reduce((s, c) => s + c.costUsd, 0), 4),
        costInr: round(costInr),
        costInrWithGst: round(costInr * (1 + pricing.gstPercent / 100)),
        tokens: calls.reduce((s, c) => s + c.totalTokens, 0),
      },
    });
  } catch (error) {
    sendError(res, error, 'Failed to load post AI cost');
  }
});

router.get('/export.csv', async (req, res) => {
  try {
    const rows = await AiUsage.find(callFilter(req.query)).sort({ createdAt: -1 }).limit(50000).lean();
    const cols = ['createdAt', 'email', 'feature', 'kind', 'model', 'status', 'postId', 'mediaUrl', 'inputTokens', 'cachedTokens',
      'thoughtTokens', 'outputTextTokens', 'outputImageTokens', 'outputVideoTokens', 'totalTokens', 'videoSeconds', 'images',
      'costUsd', 'costInr', 'estimated', 'durationMs', 'promptPreview', 'error'];
    const cell = (v) => {
      const s = v instanceof Date ? v.toISOString() : String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ai-costs-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'));
  } catch (error) {
    sendError(res, error, 'Failed to export AI costs');
  }
});

// ── Price list ──────────────────────────────────────────────────────────────
router.get('/pricing', async (req, res) => {
  try {
    const pricing = await aiUsage.getPricing({ fresh: true });
    // Models that were called but are not in the price list → shown so you can add them
    const used = await AiUsage.distinct('model');
    const missing = used.filter(m => !aiUsage.priceFor(pricing, m));
    res.json({ ...pricing, defaults: aiUsage.DEFAULT_PRICING, missing });
  } catch (error) {
    sendError(res, error, 'Failed to load prices');
  }
});

router.put('/pricing', async (req, res) => {
  try {
    res.json(await aiUsage.savePricing(req.body || {}, req.user.email));
  } catch (error) {
    sendError(res, error, 'Failed to save prices');
  }
});

// Re-price past calls (e.g. after fixing a price or the ₹ rate)
router.post('/recalculate', async (req, res) => {
  try {
    const pricing = await aiUsage.getPricing({ fresh: true });
    let updated = 0;
    const ops = [];
    for await (const row of AiUsage.find({ createdAt: range(req.query), status: 'ok' }).lean().cursor()) {
      const price = aiUsage.priceFor(pricing, row.model);
      const { usd, parts } = aiUsage.costOf({ ...row, videoSeconds: price?.perSecond ? row.videoSeconds : 0 }, price);
      ops.push({ updateOne: { filter: { _id: row._id }, update: { costUsd: +usd.toFixed(6), costInr: +(usd * pricing.usdToInr).toFixed(4), costParts: parts, priceFound: Boolean(price) } } });
      if (ops.length >= 500) { updated += (await AiUsage.bulkWrite(ops.splice(0))).modifiedCount; }
    }
    if (ops.length) updated += (await AiUsage.bulkWrite(ops)).modifiedCount;
    res.json({ updated });
  } catch (error) {
    sendError(res, error, 'Failed to recalculate');
  }
});

module.exports = router;
