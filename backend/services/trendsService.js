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

// ── Instagram top posts for hashtags (Instagram Graph API) ──────────────────
// Needs a connected Instagram Business/Creator account. Meta also requires the
// "Instagram Public Content Access" feature on the app for hashtag search.
// Meta limit: 30 unique hashtags per account per 7 days, so results are cached
// for 12 hours and at most 3 hashtags are searched per request.
const toHashtagName = (value = '') =>
  String(value).replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase().slice(0, 60);

const friendlyInstagramError = (message = '') => {
  if (/permission|public content|\(#10\)|\(#200\)|not authorized|does not have/i.test(message)) {
    return 'Instagram top posts need the "Instagram Public Content Access" feature approved for your Meta app. Until then, Instagram ideas are AI-suggested.';
  }
  if (/limit|too many|\(#4\)|\(#17\)|\(#32\)/i.test(message)) {
    return 'Instagram hashtag search limit reached (30 hashtags per 7 days). Showing cached results only.';
  }
  return `Instagram top posts are unavailable: ${message}`;
};

const fetchInstagramTopMedia = async (userId, hashtags = [], { refresh = false } = {}) => {
  const errorKey = `igerr:${userId}`;
  const knownError = cache.get(errorKey);
  if (!refresh && knownError && knownError.expires > Date.now()) {
    return { groups: [], error: knownError.value };
  }

  const account = await SocialAccount.findOne({ userId, platform: 'instagram', isActive: true });
  if (!account) {
    return { groups: [], error: 'Connect an Instagram Business account on the Accounts page to see top Instagram posts.' };
  }

  const token = decrypt(account.accessToken);
  const igUserId = account.accountId;
  const names = [...new Set(hashtags.map(toHashtagName).filter(Boolean))].slice(0, 3);

  const groups = [];
  let lastError = null;

  for (const name of names) {
    try {
      const posts = await cached(`ig:${igUserId}:${name}`, 12 * 60 * MIN, async () => {
        const search = await axios.get('https://graph.facebook.com/ig_hashtag_search', {
          params: { user_id: igUserId, q: name, access_token: token },
          timeout: 15000,
        });
        const hashtagId = search.data?.data?.[0]?.id;
        if (!hashtagId) return [];

        const media = await axios.get(`https://graph.facebook.com/${hashtagId}/top_media`, {
          params: {
            user_id: igUserId,
            fields: 'id,caption,media_type,media_url,permalink,like_count,comments_count',
            limit: 6,
            access_token: token,
          },
          timeout: 15000,
        });

        return (media.data?.data || []).map(m => ({
          id: m.id,
          caption: (m.caption || '').slice(0, 220),
          mediaType: m.media_type || '',
          mediaUrl: m.media_type === 'VIDEO' ? '' : (m.media_url || ''),
          permalink: m.permalink || '',
          likes: Number(m.like_count) || 0,
          comments: Number(m.comments_count) || 0,
        }));
      }, { refresh });

      groups.push({ hashtag: `#${name}`, posts });
    } catch (error) {
      lastError = error.response?.data?.error?.message || error.message;
      logger.error(`Instagram hashtag search failed for #${name}`, lastError);
    }
  }

  if (!groups.length && lastError) {
    const friendly = friendlyInstagramError(lastError);
    cache.set(errorKey, { value: friendly, expires: Date.now() + 60 * MIN });
    return { groups: [], error: friendly };
  }

  return { groups, error: lastError ? friendlyInstagramError(lastError) : null };
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
  fetchInstagramTopMedia,
  toHashtagName,
  parseGoogleTrendsRss,
};
