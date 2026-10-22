// services/trendsService.js
// ─────────────────────────────────────────────────────────────────────────────
// Live trend signals used by the AI assistant.
//   • Google Trends  — public "trending now" RSS feed, no key needed
//   • YouTube        — most popular videos (YOUTUBE_API_KEY, or the user's
//                      connected YouTube account as a fallback)
//   • Holidays       — Calendarific (optional, CALENDARIFIC_API_KEY)
// Facebook, Instagram and X do not offer a public trending API, so the AI
// derives ideas for those platforms from the signals above.
// ─────────────────────────────────────────────────────────────────────────────
const axios         = require('axios');
const { google }    = require('googleapis');
const SocialAccount = require('../models/SocialAccount');
const { decrypt }   = require('../utils/encryption');
const logger        = require('../utils/logger');

// ── Tiny in-memory cache ─────────────────────────────────────────────────────
const cache = new Map();

const cached = async (key, ttlMs, loader, { refresh = false } = {}) => {
  const hit = cache.get(key);
  if (!refresh && hit && hit.expires > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
};

const MIN = 60 * 1000;

// ── XML helpers (no extra dependency) ────────────────────────────────────────
const decodeXml = (s = '') =>
  s
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const readTag = (xml, name) => {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1].trim()) : '';
};

const parseGoogleTrendsRss = (xml) =>
  String(xml || '')
    .split('<item>')
    .slice(1)
    .map(chunk => chunk.split('</item>')[0])
    .map(item => ({
      title: readTag(item, 'title'),
      traffic: readTag(item, 'ht:approx_traffic'),
      picture: readTag(item, 'ht:picture'),
      publishedAt: readTag(item, 'pubDate'),
      news: item
        .split('<ht:news_item>')
        .slice(1)
        .map(n => n.split('</ht:news_item>')[0])
        .map(n => ({
          title: readTag(n, 'ht:news_item_title'),
          url: readTag(n, 'ht:news_item_url'),
          source: readTag(n, 'ht:news_item_source'),
        }))
        .filter(n => n.title)
        .slice(0, 2),
    }))
    .filter(t => t.title)
    .slice(0, 20);

// ── Google Trends ────────────────────────────────────────────────────────────
const fetchGoogleTrends = (geo = 'IN', options = {}) =>
  cached(`gtrends:${geo}`, 30 * MIN, async () => {
    const res = await axios.get('https://trends.google.com/trending/rss', {
      params: { geo },
      responseType: 'text',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialHub/1.0)' },
    });
    return parseGoogleTrendsRss(res.data);
  }, options);

// ── YouTube most popular ─────────────────────────────────────────────────────
const getYouTubeClient = async (userId) => {
  if (process.env.YOUTUBE_API_KEY) {
    return google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
  }

  const account = await SocialAccount.findOne({ userId, platform: 'youtube', isActive: true });
  if (!account) return null;

  const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: decrypt(account.accessToken),
    refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined,
  });
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const fetchYouTubeTrending = (regionCode = 'IN', userId, options = {}) =>
  cached(`yt:${regionCode}:${process.env.YOUTUBE_API_KEY ? 'key' : userId}`, 30 * MIN, async () => {
    const youtube = await getYouTubeClient(userId);
    if (!youtube) return [];

    const res = await youtube.videos.list({
      part: 'snippet,statistics',
      chart: 'mostPopular',
      regionCode,
      maxResults: 12,
    });

    return (res.data.items || []).map(v => ({
      id: v.id,
      title: v.snippet?.title || '',
      channel: v.snippet?.channelTitle || '',
      views: Number(v.statistics?.viewCount) || 0,
      thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      publishedAt: v.snippet?.publishedAt || null,
    }));
  }, options);

// ── Holidays (optional, Calendarific) ────────────────────────────────────────
const fetchHolidays = async (country = 'IN', days = 45) => {
  if (!process.env.CALENDARIFIC_API_KEY) return [];

  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * MIN);
  const years = [...new Set([start.getUTCFullYear(), end.getUTCFullYear()])];
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const all = [];
  for (const year of years) {
    const list = await cached(`holidays:${country}:${year}`, 24 * 60 * MIN, async () => {
      const res = await axios.get('https://calendarific.com/api/v2/holidays', {
        params: { api_key: process.env.CALENDARIFIC_API_KEY, country, year },
        timeout: 15000,
      });
      return (res.data?.response?.holidays || []).map(h => ({
        name: h.name,
        date: String(h.date?.iso || '').slice(0, 10),
        type: Array.isArray(h.type) ? h.type.join(', ') : '',
      }));
    });
    all.push(...list);
  }

  const seen = new Set();
  return all
    .filter(h => h.date >= startStr && h.date <= endStr)
    .filter(h => {
      const key = `${h.date}|${h.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
};

// Wrap a loader so one failing source never breaks the whole response
const safely = async (label, fn) => {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.message;
    logger.error(`${label} unavailable`, message);
    return { data: [], error: message };
  }
};

module.exports = {
  cached,
  safely,
  fetchGoogleTrends,
  fetchYouTubeTrending,
  fetchHolidays,
  parseGoogleTrendsRss,
};
