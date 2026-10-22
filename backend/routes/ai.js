// routes/ai.js
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/ai/status     → is AI configured?
// POST /api/ai/suggest    → titles, captions, hashtags, YouTube tags, best times
// GET  /api/ai/trending   → live Google/YouTube trends + AI content ideas
// GET  /api/ai/events     → upcoming festivals / events + AI content ideas
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const authMiddleware = require('../middleware/auth');
const logger         = require('../utils/logger');
const ai             = require('../services/aiService');
const trends         = require('../services/trendsService');

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
  res.json({
    configured: ai.isConfigured(),
    provider: ai.getProvider() || null,
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

    const suggestions = await ai.generatePostSuggestions({
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

    res.json(suggestions);
  } catch (error) {
    sendError(res, error, 'Failed to generate suggestions');
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/ai/trending?region=IN&platforms=instagram,youtube&niche=gifting&refresh=true
// ════════════════════════════════════════════════════════════
router.get('/trending', authMiddleware, async (req, res) => {
  try {
    const region    = ai.normalizeRegion(req.query.region);
    const platforms = parsePlatforms(req.query.platforms);
    const niche     = String(req.query.niche || '').slice(0, 200);
    const refresh   = req.query.refresh === 'true';
    const list      = platforms.length ? platforms : ['facebook', 'instagram', 'youtube', 'twitter'];

    const [google, youtube] = await Promise.all([
      trends.safely('Google Trends', () => trends.fetchGoogleTrends(region, { refresh })),
      trends.safely('YouTube trending', () => trends.fetchYouTubeTrending(region, req.user.id, { refresh })),
    ]);

    let summary = '';
    let ideas = [];
    let aiError = null;

    if (ai.isConfigured()) {
      const cacheKey = `trend-ideas:${req.user.id}:${region}:${list.join(',')}:${niche.toLowerCase()}`;
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
          });
        }, { refresh });
        summary = result.summary;
        ideas = result.ideas;
      } catch (error) {
        aiError = error.message;
      }
    } else {
      aiError = 'AI is not configured — showing live trends only.';
    }

    res.json({
      region,
      generatedAt: new Date().toISOString(),
      summary,
      ideas,
      aiError,
      sources: {
        googleTrends: google.data,
        googleTrendsError: google.error,
        youtube: youtube.data,
        youtubeError: youtube.error || (youtube.data.length === 0 && !process.env.YOUTUBE_API_KEY
          ? 'Connect a YouTube account or add YOUTUBE_API_KEY to see YouTube trends.'
          : null),
      },
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
      return res.status(503).json({ detail: 'AI is not configured. Add ANTHROPIC_API_KEY (or OPENAI_API_KEY) to the backend .env and restart.' });
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

module.exports = router;
