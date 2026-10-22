// services/aiService.js
// ─────────────────────────────────────────────────────────────────────────────
// AI writing assistant: titles, captions, hashtags, YouTube tags, best times,
// trend-based content ideas and festival / event ideas.
//
// Providers (pick one in .env):
//   AI_PROVIDER=anthropic   ANTHROPIC_API_KEY=...   AI_MODEL=claude-sonnet-5-5
//   AI_PROVIDER=openai      OPENAI_API_KEY=...      AI_MODEL=<model name>
//     (works with any OpenAI-compatible API — set AI_BASE_URL, e.g. Gemini:
//      https://generativelanguage.googleapis.com/v1beta/openai)
// If AI_PROVIDER is empty, the provider is picked from whichever key is set.
// ─────────────────────────────────────────────────────────────────────────────
const axios  = require('axios');
const logger = require('../utils/logger');

const REGION_NAMES = {
  IN: 'India',
  US: 'United States',
  GB: 'United Kingdom',
  AE: 'United Arab Emirates',
  CA: 'Canada',
  AU: 'Australia',
  SG: 'Singapore',
};

const normalizeRegion = (region) => {
  const code = String(region || 'IN').toUpperCase();
  return REGION_NAMES[code] ? code : 'IN';
};

const PLATFORM_RULES = {
  facebook:  'Facebook: 1-3 short paragraphs, conversational, one clear call to action, 3-5 hashtags at the end.',
  instagram: 'Instagram: strong hook in the first line (only ~125 chars show before "more"), short lines with line breaks, emojis welcome, hashtags block at the end (8-15). Max 2,200 characters.',
  twitter:   'X/Twitter: max 280 characters INCLUDING hashtags and spaces. Punchy, 1-2 hashtags.',
  youtube:   'YouTube: description with a 2-line hook, then details, then 3-5 hashtags at the end. Titles max 100 characters (aim for 50-70).',
  linkedin:  'LinkedIn: professional, insight-led, short lines, 3-5 hashtags.',
  threads:   'Threads: casual and conversational, max 500 characters, 0-3 hashtags.',
};

const LANGUAGE_RULES = {
  english:  'English.',
  hindi:    'Hindi written in Devanagari script (hashtags may stay in English/Latin script).',
  hinglish: 'Hinglish — Hindi written in Latin script, naturally mixed with English.',
};

// ── Provider plumbing ────────────────────────────────────────────────────────
const getProvider = () => {
  const explicit = String(process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return '';
};

const isConfigured = () => {
  const provider = getProvider();
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  return false;
};

const callAnthropic = async ({ system, prompt, maxTokens }) => {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.AI_MODEL || 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 120000,
    }
  );
  return (res.data?.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
};

// Some OpenAI-compatible providers (e.g. Gemini) may not accept JSON mode.
// Once rejected, we stop sending it — the prompts already ask for JSON only.
let jsonModeSupported = String(process.env.AI_JSON_MODE || 'true').toLowerCase() !== 'false';

const callOpenAICompatible = async ({ system, prompt }) => {
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

  const send = (withJsonMode) => axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeout: 120000,
    }
  );

  let res;
  try {
    res = await send(jsonModeSupported);
  } catch (error) {
    const status = error.response?.status;
    const message = JSON.stringify(error.response?.data || '').toLowerCase();
    const jsonModeRejected =
      jsonModeSupported && (status === 400 || status === 422) &&
      (message.includes('response_format') || message.includes('json'));

    if (!jsonModeRejected) throw error;

    logger.info('🤖', 'AI provider rejected JSON mode — retrying without it');
    jsonModeSupported = false;
    res = await send(false);
  }

  return res.data?.choices?.[0]?.message?.content || '';
};

const extractJson = (text) => {
  if (!text) throw new Error('The AI returned an empty response');
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The AI response was not valid JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
};

const askJson = async ({ system, prompt, maxTokens = 4000 }) => {
  if (!isConfigured()) {
    const err = new Error('AI is not configured. Add ANTHROPIC_API_KEY (or OPENAI_API_KEY) to the backend .env and restart.');
    err.status = 503;
    throw err;
  }

  const call = getProvider() === 'anthropic' ? callAnthropic : callOpenAICompatible;

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await call({
        system,
        prompt: attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous answer could not be parsed. Reply with ONE valid JSON object only — no markdown fences, no comments, no trailing commas.`,
        maxTokens,
      });
      return extractJson(text);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const apiMessage = error.response?.data?.error?.message || error.message;
      logger.error(`AI request failed (attempt ${attempt})`, apiMessage);

      // Auth / quota / bad request errors will not fix themselves on retry
      if (status && status < 500 && status !== 429) break;
    }
  }

  const err = new Error(
    lastError?.response?.data?.error?.message
      ? `AI provider error: ${lastError.response.data.error.message}`
      : (lastError?.message || 'AI request failed')
  );
  err.status = 502;
  throw err;
};

const todayString = () =>
  new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  });

const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (typeof v === 'string' ? v.trim() : '');

const cleanHashtag = (tag) => {
  const t = asString(tag).replace(/\s+/g, '');
  if (!t) return '';
  return t.startsWith('#') ? t : `#${t}`;
};

// ── 1. Post suggestions ──────────────────────────────────────────────────────
const generatePostSuggestions = async ({
  topic = '',
  title = '',
  content = '',
  platforms = [],
  tone = 'friendly',
  language = 'english',
  audience = '',
  region = 'IN',
  mode = 'generate',
  mediaKind = 'none',
}) => {
  const regionCode = normalizeRegion(region);
  const targetPlatforms = platforms.length
    ? platforms.filter(p => PLATFORM_RULES[p])
    : ['facebook', 'instagram'];
  const safePlatforms = targetPlatforms.length ? targetPlatforms : ['facebook', 'instagram'];
  const wantsYoutube = safePlatforms.includes('youtube');

  const system =
    'You are a senior social media strategist and copywriter. You write scroll-stopping, platform-native posts ' +
    'and you know every platform\'s limits and best practices. You never invent facts. ' +
    'You reply with ONE valid JSON object only — no markdown, no explanations.';

  const task = mode === 'improve'
    ? 'IMPROVE the existing caption: keep its meaning and every fact, make it more engaging, and adapt it to each platform.'
    : 'CREATE fresh post options from the brief.';

  const prompt = `
${task}

Today: ${todayString()}
Audience region: ${REGION_NAMES[regionCode]}
Post brief: ${topic || '(none — infer it from the title and caption below)'}
Current title: ${title || '(empty)'}
Current caption: ${content || '(empty)'}
Platforms: ${safePlatforms.join(', ')}
Tone: ${tone}
Output language: ${LANGUAGE_RULES[language] || LANGUAGE_RULES.english}
Target audience: ${audience || 'general audience for this topic'}
Attached media: ${mediaKind}

Platform rules:
${safePlatforms.map(p => `- ${PLATFORM_RULES[p]}`).join('\n')}

Rules:
- Never invent prices, discounts, dates, stats, names or claims that are not in the brief. Use placeholders like [price] or [link] when needed.
- Captions must NOT start with the title — the app automatically places the title above the caption.
- Include hashtags inside each caption where the platform rules say so.
- Hashtags: relevant to the topic and region, a mix of broad and niche, no spaces, no spammy or banned tags.
- bestTimes: 24-hour "HH:MM" in local time for ${REGION_NAMES[regionCode]}.
${wantsYoutube ? '- youtubeTags: 10-15 search keywords without "#", total under 450 characters. youtubeCategoryId must be a valid YouTube category id (e.g. 22 People & Blogs, 24 Entertainment, 26 Howto & Style, 27 Education, 28 Science & Technology).' : '- youtubeTags must be an empty array and youtubeCategoryId an empty string.'}

Return exactly this JSON shape:
{
  "titles": ["5 title options, max 100 characters each"],
  "captions": [{ "platform": "one of: ${safePlatforms.join(', ')}", "text": "ready-to-post caption" }],
  "hashtags": ["15 hashtags starting with #, most relevant first"],
  "youtubeTags": ["..."],
  "youtubeCategoryId": "22",
  "bestTimes": [{ "platform": "...", "day": "e.g. Weekdays / Saturday", "time": "19:00", "reason": "short reason" }],
  "tips": ["3 short, practical tips to boost reach for this post"]
}
One caption per platform listed above.`.trim();

  const raw = await askJson({ system, prompt, maxTokens: 4000 });

  return {
    titles: asArray(raw.titles).map(asString).filter(Boolean).map(t => t.slice(0, 100)).slice(0, 6),
    captions: asArray(raw.captions)
      .map(c => ({ platform: asString(c?.platform).toLowerCase(), text: asString(c?.text) }))
      .filter(c => c.text),
    hashtags: [...new Set(asArray(raw.hashtags).map(cleanHashtag).filter(Boolean))].slice(0, 30),
    youtubeTags: wantsYoutube
      ? [...new Set(asArray(raw.youtubeTags).map(t => asString(t).replace(/^#/, '')).filter(Boolean))].slice(0, 20)
      : [],
    youtubeCategoryId: wantsYoutube ? asString(String(raw.youtubeCategoryId || '')) : '',
    bestTimes: asArray(raw.bestTimes)
      .map(b => ({
        platform: asString(b?.platform).toLowerCase(),
        day: asString(b?.day),
        time: /^\d{1,2}:\d{2}$/.test(asString(b?.time)) ? asString(b.time).padStart(5, '0') : '',
        reason: asString(b?.reason),
      }))
      .filter(b => b.time),
    tips: asArray(raw.tips).map(asString).filter(Boolean).slice(0, 5),
  };
};

// ── 2. Trend-based content ideas ─────────────────────────────────────────────
const generateTrendIdeas = async ({ platforms = [], region = 'IN', niche = '', googleTrends = [], youtubeTrending = [] }) => {
  const regionCode = normalizeRegion(region);
  const safePlatforms = platforms.length ? platforms : ['facebook', 'instagram', 'youtube', 'twitter'];

  const trendLines = googleTrends.slice(0, 20)
    .map(t => `- ${t.title}${t.traffic ? ` (${t.traffic} searches)` : ''}${t.news?.[0]?.title ? ` — news: ${t.news[0].title}` : ''}`)
    .join('\n') || '(not available)';

  const ytLines = youtubeTrending.slice(0, 12)
    .map(v => `- ${v.title} — ${v.channel}`)
    .join('\n') || '(not available)';

  const system =
    'You are a social media trend analyst. You turn live trend signals into practical, brand-safe content ideas. ' +
    'You reply with ONE valid JSON object only — no markdown, no explanations.';

  const prompt = `
Today: ${todayString()}
Region: ${REGION_NAMES[regionCode]}
Brand niche: ${niche || '(general — pick trends most brands can use)'}
Platforms: ${safePlatforms.join(', ')}

Live Google search trends right now:
${trendLines}

Trending YouTube videos right now:
${ytLines}

Rules:
- Base ideas on the live signals above. If a trend does not fit the niche, prefer evergreen ideas that suit the niche and say so in "basedOn".
- Skip tragedies, deaths, crime, disasters, and political controversy — never suggest brands piggyback on them.
- Respect each platform's native format (Reels/Stories for Instagram, Shorts or long video for YouTube, short text for X, etc.).
- 2 ideas per platform.

Return exactly this JSON shape:
{
  "summary": "2 sentences on what people are talking about today",
  "ideas": [{
    "platform": "one of: ${safePlatforms.join(', ')}",
    "topic": "short idea title",
    "angle": "how the brand should approach it, 1-2 sentences",
    "format": "e.g. Reel, Carousel, Short, Thread, Text post",
    "hook": "opening line",
    "hashtags": ["#..."],
    "basedOn": "the trend this is based on, or 'evergreen'",
    "urgency": "today | this week | evergreen"
  }]
}`.trim();

  const raw = await askJson({ system, prompt, maxTokens: 3500 });

  return {
    summary: asString(raw.summary),
    ideas: asArray(raw.ideas)
      .map(i => ({
        platform: asString(i?.platform).toLowerCase(),
        topic: asString(i?.topic),
        angle: asString(i?.angle),
        format: asString(i?.format),
        hook: asString(i?.hook),
        hashtags: asArray(i?.hashtags).map(cleanHashtag).filter(Boolean).slice(0, 10),
        basedOn: asString(i?.basedOn),
        urgency: asString(i?.urgency),
      }))
      .filter(i => i.topic),
  };
};

// ── 3. Festivals, holidays and events ────────────────────────────────────────
const generateEventIdeas = async ({ region = 'IN', days = 45, niche = '', holidays = [] }) => {
  const regionCode = normalizeRegion(region);
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const system =
    'You are a marketing calendar planner. You know festivals, national days, global awareness days, ' +
    'shopping events and major sports events, and you turn them into post ideas. ' +
    'You reply with ONE valid JSON object only — no markdown, no explanations.';

  const source = holidays.length
    ? `Confirmed holidays and observances from the official calendar (keep these dates exactly):
${holidays.slice(0, 60).map(h => `- ${h.date}: ${h.name}${h.type ? ` (${h.type})` : ''}`).join('\n')}

Pick the most marketable ones (max 14). You may add up to 4 extra well-known global days or shopping/sports events in the window, marked "approximate" unless you are certain of the date.`
    : `List the most marketable festivals, national days, global awareness days, shopping events (big sales) and major sports events between ${fmt(start)} and ${fmt(end)} relevant to ${REGION_NAMES[regionCode]} (max 14).
Movable festivals follow lunar calendars — give your best date and mark dateConfidence "approximate" unless you are certain.
Only include events that fall inside the window.`;

  const prompt = `
Today: ${todayString()}
Region: ${REGION_NAMES[regionCode]}
Window: ${fmt(start)} to ${fmt(end)}
Brand niche: ${niche || '(general)'}

${source}

Return exactly this JSON shape, sorted by date:
{
  "events": [{
    "name": "...",
    "date": "YYYY-MM-DD",
    "type": "festival | national | global day | shopping | sports | awareness",
    "description": "1 sentence",
    "contentIdeas": ["3 short post ideas a brand can publish"],
    "hashtags": ["#..."],
    "dateConfidence": "confirmed | approximate"
  }]
}`.trim();

  const raw = await askJson({ system, prompt, maxTokens: 4000 });

  // An event is "confirmed" only when it matches a holiday from the official calendar
  const isConfirmed = (date, name) => {
    const n = name.toLowerCase();
    return holidays.some(h => {
      const hn = String(h.name || '').toLowerCase();
      return h.date === date && hn && (hn.includes(n) || n.includes(hn));
    });
  };

  return asArray(raw.events)
    .map(e => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(asString(e?.date)) ? asString(e.date) : '';
      const name = asString(e?.name);
      return {
        name,
        date,
        type: asString(e?.type),
        description: asString(e?.description),
        contentIdeas: asArray(e?.contentIdeas).map(asString).filter(Boolean).slice(0, 4),
        hashtags: asArray(e?.hashtags).map(cleanHashtag).filter(Boolean).slice(0, 10),
        dateConfidence: isConfirmed(date, name) ? 'confirmed' : 'approximate',
      };
    })
    .filter(e => e.name && e.date && e.date >= fmt(start) && e.date <= fmt(end))
    .sort((a, b) => a.date.localeCompare(b.date));
};

module.exports = {
  isConfigured,
  getProvider,
  normalizeRegion,
  REGION_NAMES,
  generatePostSuggestions,
  generateTrendIdeas,
  generateEventIdeas,
  extractJson,
};