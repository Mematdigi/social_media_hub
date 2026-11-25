// routes/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/ai/status     → is AI configured?
// POST /api/ai/suggest    → titles, captions, hashtags, YouTube tags, best times
// GET  /api/ai/trending   → live Google/YouTube trends + AI content ideas
// GET  /api/ai/trends/sources   → live Google/YouTube trends only (no AI quota)
// GET  /api/ai/trends/instagram → top Instagram posts for trending hashtags
// GET  /api/ai/events     → upcoming festivals / events + AI content ideas
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const authMiddleware = require('../middleware/auth');
const logger         = require('../utils/logger');
const ai             = require('../services/aiService');
const trends         = require('../services/trendsService');
const credits        = require('../services/creditService'); // 🆕 1 AI post credit per "Write with AI"
const thumbnails     = require('../services/thumbnailService'); // 🆕 YouTube thumbnails with AI
const mediaGen       = require('../services/mediaGenService');  // 🆕 "Generate with AI" in Create post
const images         = require('../services/imageService');

const router = express.Router();

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'threads'];
const TONES     = ['friendly', 'professional', 'witty', 'inspirational', 'promotional', 'informative', 'emotional'];
const LANGUAGES = ['english', 'hindi', 'hinglish'];
const MIN = 60 * 1000;

// ── Per-user rate limit for AI calls (protects your API bill) ─────────────────
const usage = new Map(); // userId → [timestamps]
const LIMIT_PER_HOUR = Number(process.env.AI_RATE_LIMIT_PER_HOUR) || 60;

const consumeAiCredit = (userId) => {
  const now = Date.now();
  const recent = (usage.get(userId) || []).filter(t => now - t < 60 * MIN);
  if (recent.length >= LIMIT_PER_HOUR) {
    usage.set(userId, recent);
    return false;
  }
  recent.push(now);
  usage.set(userId, recent);
  return true;
};

const rateLimited = (res) =>
  res.status(429).json({ detail: `AI limit reached (${LIMIT_PER_HOUR} requests per hour). Please try again later.` });

const parsePlatforms = (value) =>
  String(value || '')
    .split(',')
    .map(p => p.trim().toLowerCase())
    .map(p => (p === 'x' ? 'twitter' : p))
    .filter(p => SUPPORTED_PLATFORMS.includes(p));

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

// ════════════════════════════════════════════════════════════
// GET /api/ai/status
// ════════════════════════════════════════════════════════════
router.get('/status', authMiddleware, (req, res) => {
  const status = ai.getStatus();
  res.json({
    configured: status.configured,
    provider: status.provider,
    model: status.model,
    reason: status.reason,
    regions: ai.REGION_NAMES,
    holidaysSource: process.env.CALENDARIFIC_API_KEY ? 'calendarific' : 'ai',
    youtubeTrendsSource: process.env.YOUTUBE_API_KEY ? 'api_key' : 'connected_account',
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/ai/suggest
// body: { topic, title, content, platforms[], tone, language, audience, region, mode, mediaKind }
// ════════════════════════════════════════════════════════════
router.post('/suggest', authMiddleware, async (req, res) => {
  try {
    const {
      topic = '', title = '', content = '', platforms = [],
      tone = 'friendly', language = 'english', audience = '',
      region = 'IN', mode = 'generate', mediaKind = 'none',
    } = req.body || {};

    if (!String(topic).trim() && !String(title).trim() && !String(content).trim()) {
      return res.status(400).json({ detail: 'Describe your post, or write a title or caption first.' });
    }
    if (mode === 'improve' && !String(content).trim()) {
      return res.status(400).json({ detail: 'Write a caption first, then ask the AI to improve it.' });
    }
    if (!consumeAiCredit(req.user.id)) return rateLimited(res);

    // 🆕 Uses 1 AI post credit (given back if the AI call fails)
    let credit;
    try {
      credit = await credits.charge(req.user, 'post', { action: 'write_with_ai', model: ai.getStatus().model });
    } catch (error) {
      if (error.code !== 'NO_CREDITS') throw error;
      return res.status(402).json({ detail: error.message, code: error.code, kind: 'post' });
    }

    let suggestions;
    try {
      suggestions = await ai.generatePostSuggestions({
      topic:     String(topic).slice(0, 1500),
      title:     String(title).slice(0, 300),
      content:   String(content).slice(0, 5000),
      platforms: parsePlatforms(Array.isArray(platforms) ? platforms.join(',') : platforms),
      tone:      TONES.includes(tone) ? tone : 'friendly',
      language:  LANGUAGES.includes(language) ? language : 'english',
      audience:  String(audience).slice(0, 300),
      region:    ai.normalizeRegion(region),
      mode:      mode === 'improve' ? 'improve' : 'generate',
      mediaKind: ['video', 'image', 'none'].includes(mediaKind) ? mediaKind : 'none',
      });
    } catch (error) {
      await credit.refund();
      throw error;
    }

    res.json(suggestions);
  } catch (error) {
    sendError(res, error, 'Failed to generate suggestions');
  }
});

// Live Google + YouTube data (no AI call, cached 30 min)
const loadLiveSources = async (region, userId, refresh) => {
  const [google, youtube] = await Promise.all([
    trends.safely('Google Trends', () => trends.fetchGoogleTrends(region, { refresh })),
    trends.safely('YouTube trending', () => trends.fetchYouTubeTrending(region, userId, { refresh })),
  ]);

  return {
    google,
    youtube,
    sources: {
      googleTrends: google.data,
      googleTrendsError: google.error,
      youtube: youtube.data,
      youtubeError: youtube.error || (youtube.data.length === 0 && !process.env.YOUTUBE_API_KEY
        ? 'Connect a YouTube account or add YOUTUBE_API_KEY to see YouTube trends.'
        : null),
    },
  };
};

// ════════════════════════════════════════════════════════════
// GET /api/ai/trends/sources?region=IN&refresh=true
// Live trending searches + videos only. Free: does not use the AI quota.
// ════════════════════════════════════════════════════════════
router.get('/trends/sources', authMiddleware, async (req, res) => {
  try {
    const region = ai.normalizeRegion(req.query.region);
    const { sources } = await loadLiveSources(region, req.user.id, req.query.refresh === 'true');
    res.json({ region, generatedAt: new Date().toISOString(), ...sources });
  } catch (error) {
    sendError(res, error, 'Failed to load trends');
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/ai/trends/instagram?region=IN&hashtags=diwali,diwaligifts&refresh=true
// Top Instagram posts for up to 3 hashtags (needs a connected Instagram account).
// ════════════════════════════════════════════════════════════
router.get('/trends/instagram', authMiddleware, async (req, res) => {
  try {
    const region = ai.normalizeRegion(req.query.region);
    const refresh = req.query.refresh === 'true';
    let hashtags = String(req.query.hashtags || '').split(',').map(h => h.trim()).filter(Boolean);

    // No hashtags given → use today's top Google searches
    if (!hashtags.length) {
      const google = await trends.safely('Google Trends', () => trends.fetchGoogleTrends(region));
      hashtags = google.data.slice(0, 3).map(t => t.title);
    }

    const result = await trends.fetchInstagramTopMedia(req.user.id, hashtags, { refresh });
    res.json({ region, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to load Instagram trends');
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/ai/trending?region=IN&platforms=instagram,youtube&niche=gifting&perPlatform=3&refresh=true
// ════════════════════════════════════════════════════════════
router.get('/trending', authMiddleware, async (req, res) => {
  try {
    const region      = ai.normalizeRegion(req.query.region);
    const platforms   = parsePlatforms(req.query.platforms);
    const niche       = String(req.query.niche || '').slice(0, 200);
    const refresh     = req.query.refresh === 'true';
    const perPlatform = Math.min(Math.max(parseInt(req.query.perPlatform, 10) || 2, 1), 4);
    const list        = platforms.length ? platforms : ['facebook', 'instagram', 'youtube', 'twitter'];

    const { google, youtube, sources } = await loadLiveSources(region, req.user.id, refresh);

    let summary = '';
    let ideas = [];
    let aiError = null;

    if (ai.isConfigured()) {
      const cacheKey = `trend-ideas:${req.user.id}:${region}:${list.join(',')}:${niche.toLowerCase()}:${perPlatform}`;
      try {
        const result = await trends.cached(cacheKey, 30 * MIN, async () => {
          if (!consumeAiCredit(req.user.id)) {
            const err = new Error(`AI limit reached (${LIMIT_PER_HOUR} requests per hour). Please try again later.`);
            err.status = 429;
            throw err;
          }
          return ai.generateTrendIdeas({
            platforms: list,
            region,
            niche,
            googleTrends: google.data,
            youtubeTrending: youtube.data,
            perPlatform,
          });
        }, { refresh });
        summary = result.summary;
        ideas = result.ideas;
      } catch (error) {
        aiError = error.message;
      }
    } else {
      aiError = `${ai.getStatus().reason} Showing live trends only.`;
    }

    res.json({
      region,
      generatedAt: new Date().toISOString(),
      summary,
      ideas,
      aiError,
      sources,
    });
  } catch (error) {
    sendError(res, error, 'Failed to load trends');
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/ai/events?region=IN&days=45&niche=gifting&refresh=true
// ════════════════════════════════════════════════════════════
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const region  = ai.normalizeRegion(req.query.region);
    const days    = Math.min(Math.max(parseInt(req.query.days, 10) || 45, 7), 120);
    const niche   = String(req.query.niche || '').slice(0, 200);
    const refresh = req.query.refresh === 'true';

    const holidays = await trends.safely('Holiday calendar', () => trends.fetchHolidays(region, days));

    if (!ai.isConfigured()) {
      if (holidays.data.length) {
        return res.json({
          region, days,
          source: 'calendarific',
          aiError: 'AI is not configured — showing the holiday calendar without post ideas.',
          events: holidays.data.map(h => ({
            name: h.name, date: h.date, type: h.type, description: '',
            contentIdeas: [], hashtags: [], dateConfidence: 'confirmed',
          })),
        });
      }
      return res.status(503).json({ detail: ai.getStatus().reason });
    }

    const cacheKey = `events:${region}:${days}:${niche.toLowerCase()}:${holidays.data.length}`;
    const events = await trends.cached(cacheKey, 12 * 60 * MIN, async () => {
      if (!consumeAiCredit(req.user.id)) {
        const err = new Error(`AI limit reached (${LIMIT_PER_HOUR} requests per hour). Please try again later.`);
        err.status = 429;
        throw err;
      }
      return ai.generateEventIdeas({ region, days, niche, holidays: holidays.data });
    }, { refresh });

    res.json({
      region,
      days,
      source: holidays.data.length ? 'calendarific+ai' : 'ai',
      events,
    });
  } catch (error) {
    sendError(res, error, 'Failed to load events');
  }
});

// ── 🆕 YouTube thumbnail with AI ─────────────────────────────────────────────
// POST /api/ai/thumbnail/ideas     { title, description, tags } → 3 ideas (free, cached 24 h)
// POST /api/ai/thumbnail/generate  { title, description, idea, referenceUrl? } → { url }
//                                  paid plans only (or company / admin), 1 AI image credit
const publicBase = (req) => (process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`).replace(/\/+$/, '');

router.post('/thumbnail/ideas', authMiddleware, async (req, res) => {
  try {
    if (!consumeAiCredit(req.user.id)) return rateLimited(res);
    const { title = '', description = '', tags = [] } = req.body || {};
    const ideas = await thumbnails.suggestIdeas({ title, description, tags });
    const paid = await credits.isPaidUser(req.user);
    res.json({ ideas, canGenerate: paid });
  } catch (error) {
    logger.error('Thumbnail ideas failed', error.message);
    res.status(error.status || 500).json({ detail: error.message || 'Could not suggest thumbnails' });
  }
});

router.post('/thumbnail/generate', authMiddleware, async (req, res) => {
  try {
    if (!(await credits.isPaidUser(req.user))) {
      return res.status(403).json({ detail: 'AI thumbnails are part of the paid plans. Upgrade on the Credits page, or upload your own image.', code: 'PAID_ONLY' });
    }
    if (!consumeAiCredit(req.user.id)) return rateLimited(res);
    const { title = '', description = '', idea = {}, referenceUrl = '' } = req.body || {};

    let referenceFile = null;
    if (referenceUrl) {
      const ref = images.resolveLocalUpload(referenceUrl);
      if (images.isImageFile(ref.filename)) referenceFile = ref.filePath;
    }

    let credit;
    try {
      credit = await credits.charge(req.user, 'image', { action: 'youtube_thumbnail', model: images.getStatus().model });
    } catch (error) {
      if (error.code !== 'NO_CREDITS') throw error;
      return res.status(402).json({ detail: error.message, code: error.code, kind: 'image' });
    }

    let result;
    try {
      result = await thumbnails.generateThumbnail({ title, description, idea, referenceFile });
    } catch (error) {
      await credit.refund();
      throw error;
    }
    res.json({ url: `${publicBase(req)}/uploads/${result.filename}`, model: result.model });
  } catch (error) {
    logger.error('Thumbnail generation failed', error.message);
    res.status(error.status || 500).json({ detail: error.message || 'Could not create the thumbnail' });
  }
});

// ── 🆕 "Generate with AI" in Create post ─────────────────────────────────────
// POST /api/ai/media/prompt { caption, kind: image|video, aspectRatio } → { prompt }  (free, cached)
// POST /api/ai/media/image  { prompt, aspectRatio }  → { url, kind: 'image' }   1 AI image credit
// POST /api/ai/media/video  { prompt, aspectRatio }  → { url, kind: 'video' }   1 AI video credit (1–6 min)
const videoUse = new Map();
const VIDEO_PER_HOUR = () => Number(process.env.VIDEO_RATE_LIMIT_PER_HOUR) || 5;
const consumeVideo = (userId) => {
  const now = Date.now();
  const recent = (videoUse.get(userId) || []).filter(t => now - t < 60 * MIN);
  if (recent.length >= VIDEO_PER_HOUR()) return false;
  recent.push(now);
  videoUse.set(userId, recent);
  return true;
};

router.post('/media/prompt', authMiddleware, async (req, res) => {
  try {
    if (!consumeAiCredit(req.user.id)) return rateLimited(res);
    const { caption = '', kind = 'image', aspectRatio = '1:1' } = req.body || {};
    res.json({ prompt: await mediaGen.writePrompt({ caption, kind, aspectRatio }) });
  } catch (error) {
    res.status(error.status || 500).json({ detail: error.message || 'Could not write a prompt' });
  }
});

const generateMedia = (kind) => async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 5) return res.status(400).json({ detail: 'Describe what you want to create.' });
    if (kind === 'video') {
      const status = mediaGen.videoStatus();
      if (!status.configured) return res.status(503).json({ detail: status.reason });
      if (!consumeVideo(req.user.id)) return res.status(429).json({ detail: `Video limit reached (${VIDEO_PER_HOUR()} per hour). Try again later.` });
    } else if (!consumeAiCredit(req.user.id)) {
      return rateLimited(res);
    }

    let credit;
    try {
      credit = await credits.charge(req.user, kind, {
        action: kind === 'video' ? 'post_video' : 'post_image',
        model: kind === 'video' ? mediaGen.videoStatus().model : images.getStatus().model,
      });
    } catch (error) {
      if (error.code !== 'NO_CREDITS') throw error;
      return res.status(402).json({ detail: error.message, code: error.code, kind });
    }

    let result;
    try {
      result = kind === 'video'
        ? await mediaGen.createVideo({ prompt, aspectRatio: req.body?.aspectRatio })
        : await mediaGen.createImage({ prompt, aspectRatio: req.body?.aspectRatio });
    } catch (error) {
      await credit.refund();
      throw error;
    }
    res.json({ url: `${publicBase(req)}/uploads/${result.filename}`, kind: result.kind, aspectRatio: result.aspectRatio, model: result.model });
  } catch (error) {
    logger.error(`AI ${kind} for post failed`, error.message);
    res.status(error.status || 500).json({ detail: error.message || `Could not create the ${kind}` });
  }
};

router.post('/media/image', authMiddleware, generateMedia('image'));
router.post('/media/video', authMiddleware, generateMedia('video'));

module.exports = router;
