// services/creditService.js
// ─────────────────────────────────────────────────────────────────────────────
// AI credits: free credits on sign-up, plans, top-ups, admin grants, and
// charging one credit each time an AI feature is used.
//
//   post  → 1 per "Write with AI" request and 1 per AI Agent post card
//   image → 1 per AI image and 1 per AI photo enhancement (the free quick-fix is free)
//   video → 1 per AI-generated video
//
// Everything that is NOT AI (manual posts, scheduling, uploads, inbox, analytics)
// never uses credits. Trending / festival ideas are cheap and cached, so they are free.
//
// .env:
//   ADMIN_EMAILS=you@company.com,partner@company.com   who can open the Admin page (more can be
//                                                     added on the Admin page → Admins)
//   COMPANY_EMAIL_DOMAINS=mematdigi.com               everyone with this email domain is a
//                                                     "company" account: free + tracked
// Company accounts and admins are never charged, but every AI use is still recorded
// (with free: true) so the Admin → Usage tab shows what your team uses and what it costs you.
// Plans, prices and free credits are edited on the Admin page (stored in MongoDB).
// ─────────────────────────────────────────────────────────────────────────────
const { v4: uuidv4 }      = require('uuid');
const CreditWallet        = require('../models/CreditWallet');
const CreditTransaction   = require('../models/CreditTransaction');
const AppSetting          = require('../models/AppSetting');
const logger              = require('../utils/logger');

const KINDS = ['post', 'image', 'video'];
const KIND_LABELS = { post: 'AI post', image: 'AI image', video: 'AI video' };

// ── Default settings (change them on the Admin page, not here) ──────────────
const DEFAULT_SETTINGS = {
  signupCredits: { post: 50, image: 5, video: 0 },
  plans: [
    { id: 'starter', name: 'Starter', price: 2499, period: 'month', credits: { post: 50,  image: 25,  video: 0 },  highlight: false,
      features: ['25 AI images', '50 AI-written posts', 'No AI videos', 'All channels, scheduling & inbox'] },
    { id: 'growth',  name: 'Growth',  price: 4999, period: 'month', credits: { post: 100, image: 100, video: 4 },  highlight: true,
      features: ['100 AI-written posts', '100 AI images', '4 AI videos', 'All channels, scheduling & inbox'] },
    { id: 'pro',     name: 'Pro',     price: 9999, period: 'month', credits: { post: 300, image: 300, video: 10 }, highlight: false,
      features: ['300 AI-written posts', '300 AI images', '10 AI videos', 'All channels, scheduling & inbox'] },
  ],
  topups: [
    { id: 'topup', name: 'Top-up', price: 149, credits: { post: 2, image: 2, video: 0 },
      features: ['2 AI-written posts', '2 AI images', 'Use any time'] },
  ],
  gstPercent: 0, // 0 = prices already include GST; 18 = add 18% GST on top at checkout
  // Your approximate Google AI cost per credit (₹) — used only for the Admin → Usage cost estimate
  costPerCredit: { post: 3, image: 7, video: 80 },
  admins: [],     // extra admin emails added on the Admin page (ADMIN_EMAILS in .env always count too)
  // 🆕 Enterprise: no price — "Call us / WhatsApp / Email / Request a call back" (website only)
  enterprise: {
    enabled: true,
    name: 'Enterprise',
    tagline: 'For agencies, brands and large teams',
    features: ['Custom AI credits & video limits', 'Unlimited team members & brands', 'Dedicated account manager', 'Priority support & onboarding', 'Custom invoicing (GST)'],
    phone: '',
    whatsapp: '',
    email: 'hello@mematdigi.com',
  },
  paymentInstructions:
    'After you send the request, our team will contact you on your registered email with the payment details. ' +
    'Your credits are added as soon as the payment is confirmed.',
};

const SETTINGS_KEY = 'credits';
let settingsCache = null;
let settingsCacheAt = 0;
let dbAdmins = new Set(); // admin emails saved on the Admin page

const cleanCredits = (c = {}) => Object.fromEntries(KINDS.map(k => [k, Math.max(0, Math.floor(Number(c?.[k]) || 0))]));

const cleanPack = (p = {}, fallbackId) => ({
  id: String(p.id || fallbackId || uuidv4()).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || fallbackId,
  name: String(p.name || 'Plan').slice(0, 40),
  price: Math.max(0, Math.round(Number(p.price) || 0)),
  period: p.period === 'once' ? 'once' : (p.period || 'month'),
  credits: cleanCredits(p.credits),
  highlight: Boolean(p.highlight),
  features: (Array.isArray(p.features) ? p.features : []).map(f => String(f).slice(0, 80)).filter(Boolean).slice(0, 8),
});

const cleanEnterprise = (e = {}) => ({
  enabled: e.enabled !== false,
  name: String(e.name || 'Enterprise').slice(0, 40),
  tagline: String(e.tagline || '').slice(0, 120),
  features: (Array.isArray(e.features) ? e.features : []).map(f => String(f).trim().slice(0, 80)).filter(Boolean).slice(0, 8),
  phone: String(e.phone || '').replace(/[^\d+ ]/g, '').slice(0, 20),
  whatsapp: String(e.whatsapp || '').replace(/\D/g, '').slice(0, 15),   // digits with country code, e.g. 919876543210
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e.email || '').trim()) ? String(e.email).trim() : '',
});

const normalizeSettings = (value = {}) => ({
  signupCredits: cleanCredits(value.signupCredits ?? DEFAULT_SETTINGS.signupCredits),
  plans: (Array.isArray(value.plans) && value.plans.length ? value.plans : DEFAULT_SETTINGS.plans).map((p, i) => cleanPack(p, `plan${i + 1}`)),
  topups: (Array.isArray(value.topups) ? value.topups : DEFAULT_SETTINGS.topups).map((p, i) => ({ ...cleanPack(p, `topup${i + 1}`), period: 'once' })),
  gstPercent: Math.min(28, Math.max(0, Number(value.gstPercent ?? DEFAULT_SETTINGS.gstPercent) || 0)),
  enterprise: cleanEnterprise(value.enterprise ?? DEFAULT_SETTINGS.enterprise),
  costPerCredit: Object.fromEntries(KINDS.map(k => [k, Math.max(0, Number(value.costPerCredit?.[k] ?? DEFAULT_SETTINGS.costPerCredit[k]) || 0)])),
  admins: [...new Set((Array.isArray(value.admins) ? value.admins : [])
    .map(e => String(e).trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 50),
  paymentInstructions: String(value.paymentInstructions ?? DEFAULT_SETTINGS.paymentInstructions).slice(0, 1000),
});

const getSettings = async () => {
  if (settingsCache && Date.now() - settingsCacheAt < 60 * 1000) return settingsCache;
  const doc = await AppSetting.findOne({ key: SETTINGS_KEY }).lean();
  settingsCache = normalizeSettings(doc?.value || DEFAULT_SETTINGS);
  settingsCacheAt = Date.now();
  dbAdmins = new Set(settingsCache.admins);
  return settingsCache;
};

const saveSettings = async (value, adminId) => {
  const clean = normalizeSettings(value);
  const ids = [...clean.plans, ...clean.topups].map(p => p.id);
  if (new Set(ids).size !== ids.length) {
    const err = new Error('Every plan and top-up needs a different id.');
    err.status = 400;
    throw err;
  }
  await AppSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { value: clean, updatedBy: adminId || null, updatedAt: new Date() } },
    { upsert: true }
  );
  settingsCache = clean;
  settingsCacheAt = Date.now();
  dbAdmins = new Set(clean.admins);
  return clean;
};

const findPack = async (packId) => {
  const s = await getSettings();
  const plan = s.plans.find(p => p.id === packId);
  if (plan) return { ...plan, kind: 'plan' };
  const topup = s.topups.find(p => p.id === packId);
  if (topup) return { ...topup, kind: 'topup' };
  return null;
};

// ── Admins ───────────────────────────────────────────────────────────────────
const adminEmails = () => String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const isAdmin = (user) => {
  const email = String(user?.email || '').toLowerCase();
  return Boolean(email) && (adminEmails().includes(email) || dbAdmins.has(email));
};

// Make sure admins saved on the Admin page are loaded (call before isAdmin in middleware)
const loadAdmins = async () => { await getSettings(); };

// ── Company (your own team) ──────────────────────────────────────────────────
const companyDomains = () => String(process.env.COMPANY_EMAIL_DOMAINS || '')
  .split(',')
  .map(d => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

const isCompanyEmail = (email) => {
  const domain = String(email || '').toLowerCase().split('@')[1];
  return Boolean(domain) && companyDomains().includes(domain);
};

// Free = admin, company account (switched on in Admin) or company email domain
const isFreeUser = (user, wallet) => isAdmin(user) || Boolean(wallet?.company) || isCompanyEmail(user?.email);

// ── Ledger ───────────────────────────────────────────────────────────────────
const log = (entry) => CreditTransaction.create({ id: uuidv4(), createdAt: new Date(), ...entry })
  .catch(error => logger.error('Could not write credit transaction', error.message));

// ── Wallet ───────────────────────────────────────────────────────────────────
// Every user (new or existing) gets the free sign-up credits the first time we look.
const getWallet = async (userId) => {
  let wallet = await CreditWallet.findOne({ userId });
  if (wallet) return wallet;

  const { signupCredits } = await getSettings();
  try {
    wallet = await CreditWallet.create({ userId, ...signupCredits, plan: 'free' });
    for (const kind of KINDS) {
      if (signupCredits[kind] > 0) {
        log({ userId, type: 'signup', kind, amount: signupCredits[kind], balanceAfter: signupCredits[kind], note: 'Free credits' });
      }
    }
    return wallet;
  } catch (error) {
    if (error.code === 11000) return CreditWallet.findOne({ userId }); // created by a parallel request
    throw error;
  }
};

const formatWallet = (wallet, user) => ({
  balance: Object.fromEntries(KINDS.map(k => [k, wallet?.[k] || 0])),
  used: Object.fromEntries(KINDS.map(k => [k, wallet?.used?.[k] || 0])),
  plan: isFreeUser(user, wallet) && !isAdmin(user) ? 'company' : (wallet?.plan || 'free'),
  planActivatedAt: wallet?.planActivatedAt || null,
  unlimited: isFreeUser(user, wallet),
  company: Boolean(wallet?.company) || isCompanyEmail(user?.email),
  isAdmin: isAdmin(user),
});

const outOfCreditsError = (kind) => {
  // Neutral wording on purpose: the same text is shown in the Android app, which must not
  // point people to a purchase outside Google Play. The website adds its own "Upgrade" button.
  const err = new Error(`You have no ${KIND_LABELS[kind]} credits left.`);
  err.status = 402;
  err.code = 'NO_CREDITS';
  err.kind = kind;
  return err;
};

// Take credits BEFORE calling the AI. Returns { refund() } so a failed AI call gives them back.
// user: the logged-in user (req.user) — admins are never charged.
const charge = async (user, kind, { amount = 1, action = null, model = null } = {}) => {
  if (!KINDS.includes(kind)) throw new Error(`Unknown credit kind "${kind}"`);
  if (!user?.id) throw outOfCreditsError(kind);

  await getSettings(); // loads admins saved on the Admin page (cached for 60 s)
  const current = await getWallet(user.id); // make sure the free credits exist
  if (isFreeUser(user, current)) {
    // Company / admin: no charge, but record the use so you can track it
    await CreditWallet.updateOne({ userId: user.id }, { $inc: { [`used.${kind}`]: amount }, $set: { updatedAt: new Date() } });
    log({ userId: user.id, type: 'usage', kind, amount: -amount, balanceAfter: null, action, model, free: true, note: 'Company / admin (free)' });
    let undone = false;
    return {
      charged: false,
      free: true,
      refund: async (note = 'AI request failed') => {
        if (undone) return;
        undone = true;
        await CreditWallet.updateOne({ userId: user.id }, { $inc: { [`used.${kind}`]: -amount } });
        log({ userId: user.id, type: 'refund', kind, amount, balanceAfter: null, action, model, free: true, note });
      },
    };
  }

  const wallet = await CreditWallet.findOneAndUpdate(
    { userId: user.id, [kind]: { $gte: amount } },
    { $inc: { [kind]: -amount, [`used.${kind}`]: amount }, $set: { updatedAt: new Date() } },
    { new: true }
  );
  if (!wallet) throw outOfCreditsError(kind);

  log({ userId: user.id, type: 'usage', kind, amount: -amount, balanceAfter: wallet[kind], action, model });

  let refunded = false;
  return {
    charged: true,
    balanceAfter: wallet[kind],
    refund: async (note = 'AI request failed') => {
      if (refunded) return;
      refunded = true;
      const back = await CreditWallet.findOneAndUpdate(
        { userId: user.id },
        { $inc: { [kind]: amount, [`used.${kind}`]: -amount }, $set: { updatedAt: new Date() } },
        { new: true }
      );
      log({ userId: user.id, type: 'refund', kind, amount, balanceAfter: back?.[kind] ?? null, action, model, note });
    },
  };
};

// 🆕 Paid = bought a plan (anything but "free"), or company / admin. Used for paid-only AI features.
const isPaidUser = async (user) => {
  await getSettings();
  const w = await getWallet(user.id);
  return isFreeUser(user, w) || (w.plan && w.plan !== 'free');
};

// Is there at least one credit of any kind? (used before an AI Agent chat turn)
const hasAnyCredits = async (user) => {
  await getSettings();
  const w = await getWallet(user.id);
  if (isFreeUser(user, w)) return true;
  return KINDS.some(k => (w[k] || 0) > 0);
};

// Add (or with negative numbers, remove) credits
const addCredits = async (userId, credits, { type = 'grant', note = '', adminId = null, requestId = null, plan = null } = {}) => {
  await getWallet(userId);
  const inc = {};
  for (const kind of KINDS) {
    const n = Math.trunc(Number(credits?.[kind]) || 0);
    if (n) inc[kind] = n;
  }
  const set = { updatedAt: new Date() };
  if (plan) { set.plan = plan; set.planActivatedAt = new Date(); }

  let wallet = await CreditWallet.findOneAndUpdate({ userId }, { ...(Object.keys(inc).length ? { $inc: inc } : {}), $set: set }, { new: true });

  // Never leave a negative balance after an admin removes credits
  const negative = KINDS.filter(k => wallet[k] < 0);
  if (negative.length) {
    wallet = await CreditWallet.findOneAndUpdate({ userId }, { $set: Object.fromEntries(negative.map(k => [k, 0])) }, { new: true });
  }

  for (const kind of Object.keys(inc)) {
    log({ userId, type, kind, amount: inc[kind], balanceAfter: wallet[kind], note, adminId, requestId });
  }
  return wallet;
};

const history = (userId, limit = 50) =>
  CreditTransaction.find({ userId }).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).select('-_id -__v').lean();

module.exports = {
  KINDS,
  KIND_LABELS,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  findPack,
  isAdmin,
  loadAdmins,
  isCompanyEmail,
  isFreeUser,
  getWallet,
  formatWallet,
  charge,
  hasAnyCredits,
  isPaidUser,
  addCredits,
  history,
  outOfCreditsError,
};
