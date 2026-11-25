// services/aiUsageService.js — records the exact cost of EVERY AI call
// ─────────────────────────────────────────────────────────────────────────────
// How it works
//  1. server.js runs every /api request inside a small "context" (AsyncLocalStorage),
//     so any AI call made while handling it knows the user, the page/feature and the draft.
//  2. Each Gemini call site passes Google's own usage numbers (usageMetadata / interaction usage)
//     to record(). We store the tokens + the cost worked out from the price list below.
//  3. When the post is saved, its AI calls are linked to the post (by draft id or by media URL).
//
// Prices are USD per 1 million tokens (Google's paid tier, standard). Change them any time
// from Admin → AI costs → Prices — no deploy needed. Old rows keep the cost they had.
// ─────────────────────────────────────────────────────────────────────────────
const { AsyncLocalStorage } = require('async_hooks');
const AiUsage = require('../models/AiUsage');
const AppSetting = require('../models/AppSetting');
const logger = require('../utils/logger');

const als = new AsyncLocalStorage();

// ── Default price list (USD per 1M tokens; perSecond = USD per second of video) ─
// Source: Google Gemini API pricing page (standard paid tier), November 2026.
const DEFAULT_MODELS = {
  'gemini-3.1-flash-lite':  { label: 'Gemini 3.1 Flash-Lite', input: 0.25, cached: 0.025, output: 1.50 },
  'gemini-3.5-flash-lite':  { label: 'Gemini 3.5 Flash-Lite', input: 0.30, cached: 0.03,  output: 2.50 },
  'gemini-3-flash':         { label: 'Gemini 3 Flash',        input: 0.50, cached: 0.05,  output: 3.00 },
  'gemini-3.5-flash':       { label: 'Gemini 3.5 Flash',      input: 1.50, cached: 0.15,  output: 9.00 },
  // Introductory price until 31 Dec 2026 — Google lists $1.50 / $7.50 from 1 Jan 2027
  'gemini-3.6-flash':       { label: 'Gemini 3.6 Flash',      input: 0.75, cached: 0.075, output: 3.75 },
  'gemini-2.5-flash':       { label: 'Gemini 2.5 Flash',      input: 0.30, cached: 0.03,  output: 2.50 },
  'gemini-2.5-flash-lite':  { label: 'Gemini 2.5 Flash-Lite', input: 0.10, cached: 0.01,  output: 0.40 },
  // Nano Banana 2 — a 1K image = 1,120 image tokens ≈ $0.067
  'gemini-3.1-flash-image': { label: 'Nano Banana 2 (3.1 Flash Image)', input: 0.50, output: 3.00, image: 60 },
  'gemini-2.5-flash-image': { label: 'Gemini 2.5 Flash Image', input: 0.30, output: 2.50, image: 30 },
  // Omni video — 720p = 5,792 video tokens per second ≈ $0.10/second
  'gemini-omni-1.1-flash':  { label: 'Gemini Omni 1.1 Flash (video)', input: 1.50, output: 9.00, video: 17.50 },
  'gemini-omni-flash':      { label: 'Gemini Omni Flash (video)',     input: 1.50, output: 9.00, video: 17.50 },
  // Veo is billed per second of video — check this against your Google bill
  'veo-3.0-fast-generate':  { label: 'Veo 3 Fast (video)', perSecond: 0.10 },
  'gemini-embedding-001':   { label: 'Gemini Embedding',   input: 0.15 },
};

const DEFAULT_PRICING = {
  // From your own AI Studio billing page: Tier 1 cap $250 = ₹23,807.50 → ₹95.23 per $
  usdToInr: 95.23,
  gstPercent: 18,          // Google adds 18% GST on Indian invoices; AI Studio "Spend" shows cost before tax
  videoTokensPerSecond: { '360p': 1931, '720p': 5792, '1080p': 5792 },
  models: DEFAULT_MODELS,
};

const SETTING_KEY = 'aiPricing';
let pricingCache = null;
let pricingCachedAt = 0;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const getPricing = async ({ fresh = false } = {}) => {
  if (!fresh && pricingCache && Date.now() - pricingCachedAt < 60 * 1000) return pricingCache;
  let saved = null;
  try {
    saved = (await AppSetting.findOne({ key: SETTING_KEY }).lean())?.value || null;
  } catch (_) { /* DB not ready → defaults */ }
  pricingCache = {
    ...DEFAULT_PRICING,
    ...(saved || {}),
    videoTokensPerSecond: { ...DEFAULT_PRICING.videoTokensPerSecond, ...(saved?.videoTokensPerSecond || {}) },
    models: { ...DEFAULT_MODELS, ...(saved?.models || {}) },
  };
  pricingCachedAt = Date.now();
  return pricingCache;
};

const savePricing = async (value, email) => {
  const clean = {
    usdToInr: num(value.usdToInr, DEFAULT_PRICING.usdToInr),
    gstPercent: num(value.gstPercent, DEFAULT_PRICING.gstPercent),
    videoTokensPerSecond: Object.fromEntries(Object.entries(value.videoTokensPerSecond || {}).map(([k, v]) => [k, num(v)])),
    models: Object.fromEntries(Object.entries(value.models || {})
      .filter(([id]) => /^[a-z0-9._-]{3,80}$/i.test(id))
      .map(([id, p]) => [id.toLowerCase(), {
        label: String(p.label || id).slice(0, 80),
        ...['input', 'cached', 'output', 'image', 'video', 'perSecond'].reduce((o, k) => (p[k] === '' || p[k] == null ? o : { ...o, [k]: num(p[k]) }), {}),
      }])),
  };
  await AppSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { key: SETTING_KEY, value: clean, updatedBy: email, updatedAt: new Date() },
    { upsert: true }
  );
  pricingCache = null;
  return getPricing({ fresh: true });
};

// "models/gemini-3-flash-preview-11-2026" → finds "gemini-3-flash"
const priceFor = (pricing, model) => {
  const id = String(model || '').toLowerCase().replace(/^models\//, '');
  if (pricing.models[id]) return { id, ...pricing.models[id] };
  const stripped = id.replace(/-(preview|latest|exp)(-.*)?$/, '').replace(/-\d{3}$/, '');
  if (pricing.models[stripped]) return { id: stripped, ...pricing.models[stripped] };
  // Longest price-list id that the model name starts with
  const match = Object.keys(pricing.models).filter(k => id.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return match ? { id: match, ...pricing.models[match] } : null;
};

// ── Reading Google's usage numbers ──────────────────────────────────────────
// generateContent → usageMetadata
const fromGemini = (usage = {}) => {
  const prompt = num(usage.promptTokenCount);
  const cached = num(usage.cachedContentTokenCount);
  const thought = num(usage.thoughtsTokenCount);
  const candidates = num(usage.candidatesTokenCount);
  const details = usage.candidatesTokensDetails || [];
  const byModality = (m) => details.filter(d => String(d.modality).toUpperCase() === m).reduce((s, d) => s + num(d.tokenCount), 0);
  const image = byModality('IMAGE');
  const video = byModality('VIDEO');
  const text = details.length ? Math.max(0, candidates - image - video) : candidates;
  return {
    inputTokens: Math.max(0, prompt - cached) + num(usage.toolUsePromptTokenCount),
    cachedTokens: cached,
    thoughtTokens: thought,
    outputTextTokens: text,
    outputImageTokens: image,
    outputVideoTokens: video,
    totalTokens: num(usage.totalTokenCount) || prompt + thought + candidates,
  };
};

// Interactions API (Omni video) → usage. Field names vary between versions, so read them loosely.
const findNumber = (obj, regex) => {
  if (!obj || typeof obj !== 'object') return 0;
  for (const [k, v] of Object.entries(obj)) if (regex.test(k) && Number.isFinite(Number(v)) && typeof v !== 'object') return Number(v);
  return 0;
};
const fromInteraction = (interaction = {}) => {
  const usage = interaction.usage || interaction.usage_metadata || interaction.usageMetadata || null;
  if (!usage) return null;
  const input = findNumber(usage, /^(total_)?input_tokens$|^prompt_?token_?count$|^inputTokens$/i);
  const cached = findNumber(usage, /cached/i);
  const thought = findNumber(usage, /thought|reasoning/i);
  const output = findNumber(usage, /^(total_)?output_tokens$|^candidates_?token_?count$|^outputTokens$/i);
  const list = usage.output_tokens_by_modality || usage.outputTokensByModality || usage.candidates_tokens_details || usage.candidatesTokensDetails || [];
  const modality = (m) => (Array.isArray(list) ? list : []).filter(d => String(d.modality || d.type).toUpperCase() === m)
    .reduce((s, d) => s + num(d.tokens ?? d.token_count ?? d.tokenCount), 0);
  let video = modality('VIDEO');
  const image = modality('IMAGE');
  // No per-modality split: everything that is not "thinking" is the video itself
  if (!video && !image) video = output;
  return {
    inputTokens: Math.max(0, input - cached),
    cachedTokens: cached,
    thoughtTokens: thought,
    outputTextTokens: Math.max(0, output - video - image),
    outputImageTokens: image,
    outputVideoTokens: video,
    totalTokens: findNumber(usage, /^total_?tokens$|^total_?token_?count$/i) || input + thought + output,
  };
};

// ── Cost ─────────────────────────────────────────────────────────────────────
const costOf = (u, price) => {
  if (!price) return { usd: 0, parts: {} };
  const per = (tokens, rate) => (num(tokens) * num(rate)) / 1e6;
  const parts = {
    input: per(u.inputTokens, price.input),
    cached: per(u.cachedTokens, price.cached ?? num(price.input) * 0.1),
    thought: per(u.thoughtTokens, price.output),
    outputText: per(u.outputTextTokens, price.output),
    outputImage: per(u.outputImageTokens, price.image ?? price.output),
    outputVideo: per(u.outputVideoTokens, price.video ?? price.output),
    perSecond: num(u.videoSeconds) * num(price.perSecond),
  };
  const usd = Object.values(parts).reduce((s, v) => s + v, 0);
  return { usd, parts: Object.fromEntries(Object.entries(parts).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(6)])) };
};

// ── Request context ─────────────────────────────────────────────────────────
const FEATURES = [
  [/^\/api\/ai\/suggest/, 'Write with AI'],
  [/^\/api\/ai\/trending/, 'Trending ideas'],
  [/^\/api\/ai\/events/, 'Festival ideas'],
  [/^\/api\/ai\/thumbnail\/ideas/, 'Thumbnail ideas'],
  [/^\/api\/ai\/thumbnail\/generate/, 'Thumbnail image'],
  [/^\/api\/ai\/media\/prompt/, 'Write media prompt'],
  [/^\/api\/ai\/media\/image/, 'AI photo'],
  [/^\/api\/ai\/media\/video/, 'AI video'],
  [/^\/api\/agent/, 'AI Agent'],
  [/^\/api\/search/, 'Semantic search'],
  [/^\/api\/posts/, 'Posts'],
];
const featureFor = (path = '') => (FEATURES.find(([re]) => re.test(path)) || [null, path ? path.replace(/^\/api\//, '').split('?')[0] : 'background'])[1];

// app.use(aiUsage.middleware) — before the routes
const middleware = (req, res, next) => {
  const draft = String(req.headers['x-draft-id'] || '').replace(/[^\w:.-]/g, '').slice(0, 80) || null;
  als.run({ req, draftId: draft, ids: [] }, next);
};

// Run background work (cron, scheduler) with a label
const run = (info, fn) => als.run({ req: null, draftId: null, ids: [], ...info }, fn);

const store = () => als.getStore() || null;
const setDraft = (id) => { const s = store(); if (s && id) s.draftId = String(id).slice(0, 80); };
const currentDraftId = () => store()?.draftId || null;

// ── Save one AI call ─────────────────────────────────────────────────────────
// record({ model, kind, usage: googleUsageMetadata | interaction, usageType: 'gemini'|'interaction',
//          videoSeconds, images, prompt, error, startedAt, provider, estimate: { videoTokens } })
const record = async (info = {}) => {
  try {
    const s = store();
    const req = s?.req;
    const pricing = await getPricing();

    let u = info.usageType === 'interaction' ? fromInteraction(info.usage) : (info.usage ? fromGemini(info.usage) : null);
    let estimated = false;
    if (!u) {
      u = { inputTokens: 0, cachedTokens: 0, thoughtTokens: 0, outputTextTokens: 0, outputImageTokens: 0, outputVideoTokens: 0, totalTokens: 0 };
      if (info.estimate?.videoTokens) { u.outputVideoTokens = info.estimate.videoTokens; u.totalTokens = info.estimate.videoTokens; }
      if (info.estimate?.imageTokens) { u.outputImageTokens = info.estimate.imageTokens; u.totalTokens += info.estimate.imageTokens; }
      estimated = info.status !== 'error' && Boolean(info.estimate);
    }
    const videoSeconds = num(info.videoSeconds);
    const price = priceFor(pricing, info.model);
    // Only bill per-second when the model has a per-second price (Veo)
    const { usd, parts } = costOf({ ...u, videoSeconds: price?.perSecond ? videoSeconds : 0 }, price);

    const row = await AiUsage.create({
      userId: info.userId || req?.user?.id || s?.userId || null,
      email: info.email || req?.user?.email || s?.email || null,
      feature: info.feature || s?.feature || featureFor(req?.originalUrl),
      route: req ? `${req.method} ${String(req.originalUrl || '').split('?')[0]}` : (s?.route || null),
      kind: info.kind || 'text',
      draftId: s?.draftId || null,
      provider: info.provider || 'gemini',
      model: String(info.model || 'unknown').replace(/^models\//, ''),
      status: info.error ? 'error' : 'ok',
      error: info.error ? String(info.error).slice(0, 300) : null,
      durationMs: info.startedAt ? Date.now() - info.startedAt : 0,
      promptPreview: String(info.prompt || '').replace(/\s+/g, ' ').slice(0, 200),
      ...u,
      videoSeconds,
      images: num(info.images),
      estimated,
      costUsd: +usd.toFixed(6),
      costInr: +(usd * pricing.usdToInr).toFixed(4),
      costParts: parts,
      priceFound: Boolean(price),
    });
    if (s) s.ids.push(row._id);
    return row;
  } catch (error) {
    logger.error('AI usage record failed', error.message); // never break the AI feature
    return null;
  }
};

// Image / video file saved → remember which AI calls made it (used to link them to the post)
const attachMedia = async (url) => {
  const s = store();
  if (!s?.ids?.length || !url) return;
  const name = String(url).split('/').pop();
  await AiUsage.updateMany({ _id: { $in: s.ids }, mediaUrl: null, kind: { $in: ['image', 'video'] } }, { mediaUrl: name }).catch(() => {});
};

// Post saved → link its AI calls (same draft, or the AI image/video files it uses)
const linkPost = async ({ userId, postId, draftId, mediaUrls = [] }) => {
  if (!postId) return;
  const names = (mediaUrls || []).map(u => String(u).split('?')[0].split('/').pop()).filter(Boolean);
  const or = [];
  if (draftId) or.push({ draftId });
  if (names.length) or.push({ mediaUrl: { $in: names } });
  if (!or.length) return;
  await AiUsage.updateMany({ userId, postId: null, $or: or }, { postId }).catch(e => logger.error('AI usage link failed', e.message));
};

module.exports = {
  DEFAULT_PRICING, getPricing, savePricing, priceFor, costOf, fromGemini, fromInteraction,
  middleware, run, setDraft, currentDraftId, record, attachMedia, linkPost, featureFor,
};
