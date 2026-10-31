// utils/aiHelpers.js
// Shared constants and helpers for the AI features (composer, trends panel, dashboard).
import { aiAPI } from '../services/api';
import { getPlatformConfig } from './platformConfig';
import { toLocalInputValue } from './mediaRetention';

export const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'witty', label: 'Witty' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'promotional', label: 'Promotional / Sale' },
  { value: 'informative', label: 'Informative' },
  { value: 'emotional', label: 'Emotional' },
];

export const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi (Devanagari)' },
  { value: 'hinglish', label: 'Hinglish' },
];

export const REGIONS = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'UAE' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
];

export const regionLabel = (code) => REGIONS.find((r) => r.value === code)?.label || code;

// ── Per-viewer preferences (tone, language, region…) ────────────────────────
const PREFS_KEY = 'socialhub_ai_prefs';

export const loadAIPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const saveAIPrefs = (patch) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadAIPrefs(), ...patch }));
  } catch {
    /* storage unavailable — ignore */
  }
};

// ── Server AI status (cached once per page load) ────────────────────────────
let statusPromise = null;
export const getAIStatus = () => {
  if (!statusPromise) {
    statusPromise = aiAPI
      .status()
      .then((res) => res.data)
      .catch(() => {
        statusPromise = null;
        return { configured: false, reason: 'Could not reach the AI service on the server.' };
      });
  }
  return statusPromise;
};

// ── Live trends (Google + YouTube), cached 10 min per region in the browser ──
const sourcesCache = new Map();
export const getLiveTrends = (region = 'IN', { refresh = false } = {}) => {
  const hit = sourcesCache.get(region);
  if (!refresh && hit && hit.expires > Date.now()) return hit.promise;

  const promise = aiAPI
    .sources({ region, refresh: refresh ? 'true' : undefined })
    .then((res) => res.data)
    .catch((err) => {
      sourcesCache.delete(region);
      throw err;
    });
  sourcesCache.set(region, { promise, expires: Date.now() + 10 * 60 * 1000 });
  return promise;
};

// ── Formatting helpers ──────────────────────────────────────────────────────
export const platformName = (p) => getPlatformConfig(p)?.name || (p ? p[0].toUpperCase() + p.slice(1) : '');

export const formatCount = (n) => {
  if (!n) return '0';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
};

export const to12h = (hhmm = '') => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// "19:00" + "Weekdays" → next matching date/time as a datetime-local string
export const nextOccurrence = (hhmm, dayLabel = '') => {
  const [h, m] = hhmm.split(':').map(Number);
  const label = dayLabel.toLowerCase();
  const named = DAY_NAMES.filter((d) => label.includes(d) || label.includes(d.slice(0, 3)));

  const matches = (date) => {
    const dow = date.getDay();
    if (label.includes('weekend')) return dow === 0 || dow === 6;
    if (label.includes('weekday')) return dow >= 1 && dow <= 5;
    if (named.length) return named.includes(DAY_NAMES[dow]);
    return true;
  };

  const earliest = Date.now() + 10 * 60 * 1000;
  for (let i = 0; i < 8; i++) {
    const c = new Date();
    c.setDate(c.getDate() + i);
    c.setHours(h, m, 0, 0);
    if (c.getTime() > earliest && matches(c)) return toLocalInputValue(c);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(h, m, 0, 0);
  return toLocalInputValue(fallback);
};

export const daysUntil = (iso) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
};

// Brief sent to the AI when the user picks an idea / trend / video
export const ideaToBrief = (idea) =>
  [idea.topic, idea.angle, idea.format && `Format: ${idea.format}.`, idea.hook && `Hook idea: ${idea.hook}`]
    .filter(Boolean)
    .join(' ');

export const trendToBrief = (trend) =>
  `Today's trending topic: "${trend.title}"${trend.news?.[0]?.title ? ` (news: ${trend.news[0].title})` : ''}. Create a timely, brand-safe post that joins this conversation.`;

export const videoToBrief = (video) =>
  `Inspired by the trending YouTube video "${video.title}" by ${video.channel}. Create an original post on the same theme — do not copy it.`;
