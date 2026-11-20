// services/agentService.js
// ─────────────────────────────────────────────────────────────────────────────
// SocialHub AI Agent — plans, writes, designs, enhances, publishes and schedules
// posts on the user's behalf. Runs on Google Gemini or Anthropic Claude.
//
// .env:
//   AGENT_PROVIDER=gemini                  gemini | anthropic
//                                          (empty → anthropic if ANTHROPIC_API_KEY is set, else gemini)
//   GEMINI_API_KEY=...                     for gemini (the same key "Write with AI" uses)
//   ANTHROPIC_API_KEY=sk-ant-...           for anthropic
//   AGENT_MODEL=                           optional. Defaults: gemini-3.5-flash / claude-sonnet-5-5
//                                          (gemini-3.1-pro-preview or claude-opus-5-5 = best quality)
//   PUBLIC_BASE_URL=https://media.mematdigi.com   optional, used for image links
//   Images: see services/imageService.js (uses GEMINI_API_KEY by default)
//
// Safety: the agent can NEVER publish by itself. Publishing/scheduling always goes
// through `propose_post`, which shows a card in the chat where the user picks the
// channels and pages and presses "Post now" or "Schedule".
// The actual post is created through the normal POST /api/posts endpoint, so it
// behaves exactly like a post made from the composer (same publisher, scheduler,
// validation and media cleanup).
// ─────────────────────────────────────────────────────────────────────────────
const axios         = require('axios');
const { v4: uuidv4 } = require('uuid');
const SocialAccount = require('../models/SocialAccount');
const trends        = require('./trendsService');
const images        = require('./imageService');
const logger        = require('../utils/logger');

const TIMEZONE  = 'Asia/Kolkata';
const MAX_STEPS = 12;
const RECENT_IMAGE_MESSAGES = 8; // older images are replaced by their link to keep requests small

const DEFAULT_MODELS = { gemini: 'gemini-3.5-flash', anthropic: 'claude-sonnet-5-5' };
const KEY_NAMES = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

const getProvider = () => {
  const explicit = String(process.env.AGENT_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return '';
};

// Ignores an AGENT_MODEL that belongs to the other provider (e.g. a claude-* name while on Gemini)
const getModel = () => {
  const provider = getProvider();
  const custom = String(process.env.AGENT_MODEL || '').trim();
  const prefix = provider === 'gemini' ? 'gemini' : 'claude';
  return custom && custom.toLowerCase().startsWith(prefix) ? custom : (DEFAULT_MODELS[provider] || '');
};

const getStatus = () => {
  const provider = getProvider();
  const imageStatus = images.getStatus();
  let reason = null;
  if (!provider) reason = 'Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to backend/.env and restart the backend to use the AI Agent.';
  else if (!KEY_NAMES[provider]) reason = `AGENT_PROVIDER "${provider}" is not supported. Use gemini or anthropic.`;
  else if (!process.env[KEY_NAMES[provider]]) reason = `AGENT_PROVIDER is "${provider}" but ${KEY_NAMES[provider]} is empty in backend/.env.`;
  return {
    configured: !reason,
    provider: provider || null,
    model: reason ? null : getModel(),
    reason,
    images: imageStatus,
  };
};

const fail = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const asString = (v) => (typeof v === 'string' ? v.trim() : '');
const asArray  = (v) => (Array.isArray(v) ? v : []);

// ── Rate limits (protect the API bill) ───────────────────────────────────────
const usage = new Map();
const HOUR = 60 * 60 * 1000;
const consume = (key, limit) => {
  const now = Date.now();
  const recent = (usage.get(key) || []).filter(t => now - t < HOUR);
  if (recent.length >= limit) { usage.set(key, recent); return false; }
  recent.push(now);
  usage.set(key, recent);
  return true;
};
const AGENT_LIMIT = () => Number(process.env.AGENT_RATE_LIMIT_PER_HOUR) || 40;
const IMAGE_LIMIT = () => Number(process.env.IMAGE_RATE_LIMIT_PER_HOUR) || 20;

const consumeAgentTurn = (userId) => {
  if (!consume(`agent:${userId}`, AGENT_LIMIT())) {
    throw fail(`AI Agent limit reached (${AGENT_LIMIT()} messages per hour). Please try again later.`, 429);
  }
};

// ── System prompt ────────────────────────────────────────────────────────────
const buildSystemPrompt = () => {
  const now = new Date();
  const local = now.toLocaleString('en-IN', { timeZone: TIMEZONE, dateStyle: 'full', timeStyle: 'short' });

  return `You are the SocialHub AI Agent: a senior social media manager, copywriter and art director working on behalf of the user. You plan, write, design, publish and schedule posts on their connected accounts.

Current date and time: ${local} (India, IST, UTC+05:30). Unless the user says otherwise, the audience is in India and every time is IST.

HOW YOU WORK
1. Understand the goal. If one essential detail is missing (for example which brand, product or offer), ask ONE short question. Otherwise make sensible choices and proceed — don't interrogate the user.
2. For timely content (festivals, "what's trending", news hooks) call get_trending_topics first.
3. Write platform-native copy (rules below). Never invent prices, discounts, dates, phone numbers, stats or claims the user did not give you; use a placeholder like [price] or ask.
4. Visuals:
   • If the user attached a photo, use it. If they ask to enhance it, call enhance_image.
   • If the post needs a visual and none was attached, call generate_image. Pass the user's attached photos (e.g. their product or logo) as reference_image_urls when they should appear in the design.
   • After generating, LOOK at the image. If text is misspelled, the product is wrong, or it looks off, regenerate once with a corrected prompt.
   • Videos: you cannot watch videos. If the user attaches one, ask what it shows only if you need that to write the caption.
5. Call list_channels, then call propose_post with the finished post. The user will see a card, choose the channels and Facebook pages, edit anything, and press "Post now" or "Schedule". Pre-select channels in suggested_account_ids / suggested_page_ids ONLY if the user named them; otherwise leave them empty so the user picks.
6. propose_post is the ONLY way to publish or schedule. Never say a post is published or scheduled until the propose_post result confirms it. After the result, give a short summary (and mention any platform that failed and why).

ONE CAPTION PER POST
A post has one caption shared by every selected channel. If the user wants different wording per platform (or X/Twitter plus long-form platforms), propose separate posts, one at a time, waiting for each result.

PLATFORM RULES
• Facebook: 1–3 short paragraphs, conversational, one clear call to action, 3–5 hashtags at the end. Visual: 4:5 or 1:1.
• Instagram: strong hook in the first line (~125 chars show before "more"), short lines, emojis welcome, 8–15 hashtags at the end, max 2,200 characters. Instagram needs an image or video — no text-only posts. Feed images: 4:5 (best) or 1:1. Stories/Reels: 9:16.
• X/Twitter: max 280 characters including hashtags. 1–2 hashtags. Visual: 16:9 or 1:1.
• LinkedIn: professional, insight-led, short lines, 3–5 hashtags. Visual: 1:1 or 4:5.
• YouTube: needs a video and a title (max 100 chars, aim for 50–70). Description: 2-line hook, details, 3–5 hashtags. Thumbnails: 16:9.
• Threads: casual, max 500 characters, 0–3 hashtags.

IMAGE PROMPTS (generate_image)
Write a detailed art-direction brief: subject, setting, composition and focal point, camera angle, lighting, colour palette (brand colours if known), style (photo-real, 3D, flat illustration…), mood, and free space for text. Put any on-image text in double quotes and keep it short (max ~6 words), spelled exactly. Prefer clean, premium, uncluttered layouts that stop the scroll on a phone. Don't depict real, identifiable people or other companies' logos and characters; only use the user's own logo/products from their reference images.

SCHEDULING
If the user asks for a time, convert it to ISO 8601 with the +05:30 offset (e.g. 2026-11-08T19:00:00+05:30) in scheduled_at. If they want it scheduled but gave no time, suggest a strong slot for the platform and audience (e.g. 12:30–14:00 or 19:00–21:30 IST on weekdays) and explain why in notes. Leave scheduled_at empty for "post now".

STYLE
Reply in the user's language (English, Hindi or Hinglish — match them). Keep chat replies short and clear. Don't repeat the caption in chat when you are about to propose it; the card shows it.`;
};

// ── Tools ────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_channels',
    description: 'List the social media accounts the user has connected (with account ids) and, for Facebook, the pages each account can post to. Call before propose_post.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_trending_topics',
    description: 'Live Google search trends right now for a country, plus upcoming holidays when available. Use for timely, trend-based or festival content.',
    input_schema: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Two-letter country code, e.g. IN, US, GB. Default IN.' },
      },
    },
  },
  {
    name: 'generate_image',
    description: 'Create a new image for a post with an AI image model. Returns the image URL and shows you the image so you can check it.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed art-direction brief for the image.' },
        aspect_ratio: { type: 'string', enum: images.ASPECT_RATIOS, description: 'Pick to fit the platform (Instagram feed 4:5, Stories/Reels 9:16, YouTube/X 16:9, Facebook/LinkedIn 1:1 or 4:5).' },
        reference_image_urls: { type: 'array', items: { type: 'string' }, description: 'Optional: up to 4 images the user uploaded (product, logo, style) to include or follow.' },
      },
      required: ['prompt', 'aspect_ratio'],
    },
  },
  {
    name: 'enhance_image',
    description: 'Enhance a photo the user uploaded (lighting, colour, sharpness, clarity) and save the result as a new image. The original is kept.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of the uploaded photo.' },
        mode: { type: 'string', enum: ['auto', 'ai', 'basic'], description: 'auto (default) uses AI enhancement when available; basic is a fast, free colour/sharpness fix that never changes content.' },
        instructions: { type: 'string', description: 'Optional extra edits the user asked for, e.g. "make the background brighter".' },
      },
      required: ['image_url'],
    },
  },
  {
    name: 'propose_post',
    description: 'Show the user a ready-to-publish post as a card. The user picks channels and Facebook pages, can edit, and presses Post now or Schedule (or cancels). This is the only way to publish or schedule. Propose one post at a time and wait for the result.',
    input_schema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The final caption, hashtags included.' },
        media_urls: { type: 'array', items: { type: 'string' }, description: 'Image/video URLs to attach (uploaded, generated or enhanced).' },
        suggested_account_ids: { type: 'array', items: { type: 'string' }, description: 'Account ids from list_channels — only if the user named the channels.' },
        suggested_page_ids: { type: 'array', items: { type: 'string' }, description: 'Facebook page ids from list_channels — only if the user named the pages.' },
        scheduled_at: { type: 'string', description: 'ISO 8601 time with offset to schedule; leave empty to post now.' },
        youtube_title: { type: 'string', description: 'Required when posting to YouTube.' },
        youtube_tags: { type: 'array', items: { type: 'string' } },
        youtube_privacy: { type: 'string', enum: ['public', 'unlisted', 'private'] },
        notes: { type: 'string', description: 'One or two short lines for the user, e.g. why this time or what to check.' },
      },
      required: ['caption'],
    },
  },
];

const TOOL_LABELS = {
  list_channels: 'Checked your connected channels',
  get_trending_topics: 'Looked up what’s trending',
  generate_image: 'Designed an image',
  enhance_image: 'Enhanced your photo',
};

// ── Display helpers (what the chat page shows) ───────────────────────────────
const pushDisplay = (session, item) => {
  session.display.push({ id: uuidv4(), at: new Date().toISOString(), ...item });
};

const toolResult = (toolUseId, content, isError = false) => ({
  type: 'tool_result',
  tool_use_id: toolUseId,
  // strings and content-block arrays (text + images) go as-is; plain objects become JSON
  content: typeof content === 'string' || Array.isArray(content) ? content : JSON.stringify(content),
  ...(isError ? { is_error: true } : {}),
});

// Image blocks are stored as references to /uploads and turned into base64 at send time
const localImageBlock = (filename, url) => ({ type: 'image', source: { type: 'local_upload', file: filename, url } });

const appendUserContent = (session, blocks) => {
  const last = session.messages[session.messages.length - 1];
  if (last && last.role === 'user' && Array.isArray(last.content)) {
    last.content = [...last.content, ...blocks];
  } else {
    session.messages.push({ role: 'user', content: blocks });
  }
};

// ── Tool implementations ─────────────────────────────────────────────────────
const fileUrl = (ctx, filename) => `${ctx.baseUrl}/uploads/${filename}`;

const listChannels = async (ctx) => {
  const accounts = await SocialAccount.find({ userId: ctx.userId })
    .select('id platform accountName isActive pages.pageId pages.pageName');

  const channels = accounts
    .filter(a => a.isActive !== false)
    .map(a => ({
      account_id: a.id,
      platform: a.platform,
      name: a.accountName,
      ...(a.platform === 'facebook' && a.pages?.length
        ? { pages: a.pages.map(p => ({ page_id: p.pageId, page_name: p.pageName })) }
        : {}),
    }));

  return channels.length
    ? { channels }
    : { channels: [], note: 'No accounts are connected. Ask the user to connect accounts on the Accounts page first.' };
};

const getTrendingTopics = async (input) => {
  const region = /^[A-Za-z]{2}$/.test(asString(input.region)) ? input.region.toUpperCase() : 'IN';
  const [google, holidays] = await Promise.all([
    trends.safely('Google Trends', () => trends.fetchGoogleTrends(region)),
    trends.safely('Holiday calendar', () => trends.fetchHolidays(region, 30)),
  ]);

  return {
    region,
    trending_searches: google.data.slice(0, 15).map(t => ({
      topic: t.title,
      searches: t.traffic || null,
      news: t.news?.[0]?.title || null,
    })),
    trends_error: google.error || null,
    upcoming_holidays: holidays.data.slice(0, 15).map(h => ({ date: h.date, name: h.name })),
    note: holidays.data.length ? null : 'No holiday calendar configured — use your own knowledge of upcoming festivals and mark dates as approximate.',
  };
};

const generateImageTool = async (input, session, ctx) => {
  if (!consume(`image:${ctx.userId}`, IMAGE_LIMIT())) {
    throw fail(`Image limit reached (${IMAGE_LIMIT()} images per hour). Try again later.`, 429);
  }
  const prompt = asString(input.prompt).slice(0, 4000);
  if (!prompt) throw fail('prompt is required');

  const referenceFiles = asArray(input.reference_image_urls)
    .slice(0, 4)
    .map(url => images.resolveLocalUpload(url))
    .filter(f => images.isImageFile(f.filename))
    .map(f => f.filePath);

  const result = await images.generateImage({ prompt, aspectRatio: input.aspect_ratio, referenceFiles });
  const url = fileUrl(ctx, result.filename);

  pushDisplay(session, { type: 'image', url, label: 'Generated image', detail: `${result.aspectRatio} · ${result.model}`, prompt });

  return [
    { type: 'text', text: JSON.stringify({ image_url: url, aspect_ratio: result.aspectRatio }) },
    localImageBlock(result.filename, url),
  ];
};

const enhanceImageTool = async (input, session, ctx) => {
  const mode = ['auto', 'ai', 'basic'].includes(input.mode) ? input.mode : 'auto';
  if (mode !== 'basic' && !consume(`image:${ctx.userId}`, IMAGE_LIMIT())) {
    throw fail(`Image limit reached (${IMAGE_LIMIT()} images per hour). Use mode "basic" or try again later.`, 429);
  }
  const { filePath } = images.resolveLocalUpload(input.image_url);
  const result = await images.enhanceImage({ filePath, mode, instructions: asString(input.instructions).slice(0, 1000) });
  const url = fileUrl(ctx, result.filename);

  pushDisplay(session, {
    type: 'image',
    url,
    beforeUrl: input.image_url,
    label: result.mode === 'ai' ? 'Enhanced with AI' : 'Enhanced (quick fix)',
    detail: result.note || null,
  });

  return [
    { type: 'text', text: JSON.stringify({ enhanced_image_url: url, original_image_url: input.image_url, mode: result.mode, note: result.note }) },
    localImageBlock(result.filename, url),
  ];
};

const executeTool = async (toolUse, session, ctx) => {
  try {
    let content;
    if (toolUse.name === 'list_channels') content = await listChannels(ctx);
    else if (toolUse.name === 'get_trending_topics') content = await getTrendingTopics(toolUse.input || {});
    else if (toolUse.name === 'generate_image') content = await generateImageTool(toolUse.input || {}, session, ctx);
    else if (toolUse.name === 'enhance_image') content = await enhanceImageTool(toolUse.input || {}, session, ctx);
    else throw fail(`Unknown tool ${toolUse.name}`);

    if (TOOL_LABELS[toolUse.name] && !['generate_image', 'enhance_image'].includes(toolUse.name)) {
      pushDisplay(session, { type: 'activity', text: TOOL_LABELS[toolUse.name] });
    }
    return toolResult(toolUse.id, content);
  } catch (error) {
    logger.error(`Agent tool ${toolUse.name} failed`, error.message);
    pushDisplay(session, { type: 'activity', text: `${TOOL_LABELS[toolUse.name] || toolUse.name} — failed: ${error.message}`, error: true });
    return toolResult(toolUse.id, `Error: ${error.message}`, true);
  }
};

// ── Claude API ───────────────────────────────────────────────────────────────
const rehydrateBlock = async (block, recent) => {
  if (block?.type === 'image' && block.source?.type === 'local_upload') {
    if (!recent) return { type: 'text', text: `[image: ${block.source.url}]` };
    const data = await images.readForVision(block.source.file).catch(() => null);
    if (!data) return { type: 'text', text: `[image no longer on the server: ${block.source.url}]` };
    return { type: 'image', source: { type: 'base64', media_type: data.mediaType, data: data.base64 } };
  }
  if (block?.type === 'tool_result' && Array.isArray(block.content)) {
    return { ...block, content: await Promise.all(block.content.map(b => rehydrateBlock(b, recent))) };
  }
  return block;
};

const buildApiMessages = async (messages) => Promise.all(messages.map(async (m, i) => {
  if (!Array.isArray(m.content)) return m;
  const recent = i >= messages.length - RECENT_IMAGE_MESSAGES;
  return {
    role: m.role,
    content: await Promise.all(m.content.map(b => rehydrateBlock(b, recent))),
    ...(m._raw ? { _raw: m._raw } : {}),
  };
}));

// Anthropic rejects unknown fields, so drop our private ones (_raw, _geminiId…)
const forAnthropic = (messages) => messages.map(m => ({
  role: m.role,
  content: Array.isArray(m.content)
    ? m.content.map(b => Object.fromEntries(Object.entries(b).filter(([k]) => !k.startsWith('_'))))
    : m.content,
}));

const callClaude = async (messages) => {
  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: getModel(),
        max_tokens: 4096,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages: forAnthropic(messages),
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 180000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    logger.error('Agent Claude request failed', message);
    if (status === 401) throw fail('ANTHROPIC_API_KEY is invalid. Check backend/.env.', 502);
    if (status === 429) throw fail('Anthropic rate limit reached. Please wait a minute and try again.', 429);
    throw fail(`AI provider error: ${message}`, 502);
  }
};

// ── Gemini API ───────────────────────────────────────────────────────────────
// The conversation is stored in one format (Claude-style blocks). For Gemini it is
// converted on every call:
//   • model turns are replayed from the raw Gemini parts (_raw) so the "thought
//     signatures" Gemini 3 requires for function calling are sent back unchanged
//   • tool results become functionResponse parts; generated images are placed
//     INSIDE the function response (Gemini 3 multimodal function responses)
let geminiToolImages = String(process.env.AGENT_GEMINI_TOOL_IMAGES || 'true').toLowerCase() !== 'false';

const parseOutput = (text) => {
  try { return JSON.parse(text); } catch (_) { return text; }
};

const toFunctionResponse = (result, names, ids) => {
  const items = typeof result.content === 'string' ? [{ type: 'text', text: result.content }] : asArray(result.content);
  const text = items.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const functionResponse = {
    name: names[result.tool_use_id] || 'unknown_tool',
    response: result.is_error ? { error: text } : { output: parseOutput(text) },
  };
  if (ids[result.tool_use_id]) functionResponse.id = ids[result.tool_use_id];

  const imageBlocks = items.filter(b => b.type === 'image' && b.source?.type === 'base64');
  if (imageBlocks.length && geminiToolImages) {
    functionResponse.parts = imageBlocks.map((b, i) => ({
      inlineData: { mimeType: b.source.media_type, data: b.source.data, displayName: `${result.tool_use_id}-${i}.jpg` },
    }));
    functionResponse.response.images = functionResponse.parts.map(p => ({ $ref: p.inlineData.displayName }));
  }
  return { functionResponse };
};

const userPart = (b) => {
  if (b.type === 'text' && b.text) return { text: b.text };
  if (b.type === 'image' && b.source?.type === 'base64') return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
  return null;
};

const toGeminiContents = (messages) => {
  const contents = [];
  const names = {};
  const ids = {};
  let callOrder = [];

  for (const m of messages) {
    if (m.role === 'assistant') {
      const blocks = asArray(m.content);
      const calls = blocks.filter(b => b.type === 'tool_use');
      calls.forEach(b => { names[b.id] = b.name; ids[b.id] = b._geminiId || null; });
      callOrder = calls.map(b => b.id);

      const parts = Array.isArray(m._raw) && m._raw.length
        ? m._raw
        : blocks.map(b => (b.type === 'text' && b.text ? { text: b.text }
          : b.type === 'tool_use' ? { functionCall: { name: b.name, args: b.input || {} } } : null)).filter(Boolean);
      if (parts.length) contents.push({ role: 'model', parts });
      continue;
    }

    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : asArray(m.content);
    const results = blocks
      .filter(b => b.type === 'tool_result')
      .sort((a, b) => callOrder.indexOf(a.tool_use_id) - callOrder.indexOf(b.tool_use_id));
    const others = blocks.filter(b => b.type !== 'tool_result').map(userPart).filter(Boolean);

    if (results.length) {
      contents.push({ role: 'user', parts: results.map(r => toFunctionResponse(r, names, ids)) });
      // Keep function responses on their own turn; the user's new message follows it
      if (others.length) contents.push({ role: 'model', parts: [{ text: 'Noted.' }] });
    }
    if (others.length) contents.push({ role: 'user', parts: others });
  }
  return contents;
};

const geminiFunctionDeclarations = () => TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  ...(Object.keys(t.input_schema.properties || {}).length ? { parameters: t.input_schema } : {}),
}));

const callGemini = async (messages, attempt = 1) => {
  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: toGeminiContents(messages),
    tools: [{ functionDeclarations: geminiFunctionDeclarations() }],
    generationConfig: { maxOutputTokens: 8192 },
  };

  let res;
  try {
    res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent`,
      body,
      {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        timeout: 180000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    logger.error('Agent Gemini request failed', message);

    // Older models don't accept images inside function responses → send them as text links instead
    if (status === 400 && geminiToolImages && /function_?response|displayName|display_name|\$ref|parts/i.test(message)) {
      logger.info('🤖', 'Gemini rejected images in tool results — retrying without them');
      geminiToolImages = false;
      return callGemini(messages, attempt);
    }
    if (status === 400 || status === 403) {
      if (/api key/i.test(message)) throw fail('GEMINI_API_KEY is invalid. Check backend/.env.', 502);
    }
    if (status === 429) throw fail('Gemini usage limit reached (free tier limits are low). Wait a minute, or enable billing for the key in Google AI Studio.', 429);
    throw fail(`AI provider error: ${message}`, 502);
  }

  const candidate = res.data?.candidates?.[0];
  const parts = asArray(candidate?.content?.parts);

  if (!parts.length) {
    if (candidate?.finishReason === 'MALFORMED_FUNCTION_CALL' && attempt < 2) return callGemini(messages, attempt + 1);
    const blocked = res.data?.promptFeedback?.blockReason;
    throw fail(blocked
      ? `Gemini refused this request (${blocked}). Try rephrasing.`
      : `Gemini returned no answer${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}. Please try again.`, 502);
  }

  const content = [];
  for (const part of parts) {
    if (part.thought) continue;
    if (part.functionCall) {
      content.push({
        type: 'tool_use',
        id: part.functionCall.id || `gem_${uuidv4().replace(/-/g, '')}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
        _geminiId: part.functionCall.id || null,
      });
    } else if (part.text) {
      content.push({ type: 'text', text: part.text });
    }
  }

  return {
    content,
    stop_reason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    raw: parts, // replayed unchanged next turn (thought signatures)
  };
};

const callModel = (messages) => (getProvider() === 'gemini' ? callGemini(messages) : callClaude(messages));

// ── Proposal helpers ─────────────────────────────────────────────────────────
const normalizeProposal = (input = {}) => {
  const scheduled = asString(input.scheduled_at);
  const scheduledDate = scheduled ? new Date(scheduled) : null;
  return {
    caption: asString(input.caption).slice(0, 5000),
    media_urls: asArray(input.media_urls).map(asString).filter(Boolean).slice(0, 10),
    suggested_account_ids: asArray(input.suggested_account_ids).map(asString).filter(Boolean),
    suggested_page_ids: asArray(input.suggested_page_ids).map(asString).filter(Boolean),
    scheduled_at: scheduledDate && !Number.isNaN(scheduledDate.getTime()) ? scheduledDate.toISOString() : null,
    youtube_title: asString(input.youtube_title).slice(0, 100),
    youtube_tags: asArray(input.youtube_tags).map(asString).filter(Boolean).slice(0, 20),
    youtube_privacy: ['public', 'unlisted', 'private'].includes(input.youtube_privacy) ? input.youtube_privacy : 'public',
    notes: asString(input.notes).slice(0, 500),
  };
};

// ── The agent loop ───────────────────────────────────────────────────────────
const runLoop = async (session, ctx) => {
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callModel(await buildApiMessages(session.messages));
    const content = asArray(response.content);
    session.messages.push({ role: 'assistant', content, ...(response.raw ? { _raw: response.raw } : {}) });

    const text = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (text) pushDisplay(session, { type: 'assistant', text });

    if (response.stop_reason !== 'tool_use') return;

    const results = [];
    let proposal = null;
    for (const toolUse of content.filter(b => b.type === 'tool_use')) {
      if (toolUse.name === 'propose_post') {
        if (proposal) {
          results.push(toolResult(toolUse.id, 'Only one post can be proposed at a time. Propose this one again after the user answers the first.', true));
        } else {
          proposal = toolUse;
        }
        continue;
      }
      results.push(await executeTool(toolUse, session, ctx));
    }

    if (proposal) {
      pushDisplay(session, { type: 'proposal', toolUseId: proposal.id, data: normalizeProposal(proposal.input), status: 'pending' });
      session.pending = { toolUseId: proposal.id, results };
      return; // wait for the user to pick channels and confirm
    }

    appendUserContent(session, results);
  }

  pushDisplay(session, { type: 'assistant', text: 'I paused here so this doesn’t run too long. Tell me how you’d like to continue.' });
};

// If something failed mid-turn, close any open tool calls so the chat can continue
const repairAfterError = (session, message) => {
  const last = session.messages[session.messages.length - 1];
  if (last?.role === 'assistant' && Array.isArray(last.content) && !session.pending) {
    const open = last.content.filter(b => b.type === 'tool_use');
    if (open.length) appendUserContent(session, open.map(t => toolResult(t.id, `Error: ${message}`, true)));
  }
  pushDisplay(session, { type: 'error', text: message });
};

const updateProposalDisplay = (session, toolUseId, patch) => {
  const index = session.display.findIndex(d => d.type === 'proposal' && d.toolUseId === toolUseId);
  if (index !== -1) session.display[index] = { ...session.display[index], ...patch };
};

// ── Public: send a chat message ──────────────────────────────────────────────
// attachments: [{ url, kind: 'image' | 'video', name }]
const sendMessage = async (session, ctx, { message, attachments = [] }) => {
  consumeAgentTurn(ctx.userId);

  const text = asString(message).slice(0, 6000);
  const files = [];
  for (const a of asArray(attachments).slice(0, 6)) {
    const { filename } = images.resolveLocalUpload(a.url);
    const kind = images.isImageFile(filename) ? 'image' : images.isVideoFile(filename) ? 'video' : null;
    if (!kind) continue;
    files.push({ url: fileUrl(ctx, filename), kind, name: asString(a.name).slice(0, 120) || filename, filename });
  }
  if (!text && !files.length) throw fail('Write a message or attach a file.');

  const blocks = [];

  // A new message while a post card is open means the user skipped that card
  if (session.pending) {
    blocks.push(...session.pending.results, toolResult(
      session.pending.toolUseId,
      'The user did not confirm this post. Nothing was published. They wrote a new message instead (below).'
    ));
    updateProposalDisplay(session, session.pending.toolUseId, { status: 'dismissed' });
    session.pending = null;
  }

  for (const f of files) {
    if (f.kind === 'image') {
      blocks.push({ type: 'text', text: `Attached photo "${f.name}": ${f.url}` });
      blocks.push(localImageBlock(f.filename, f.url));
    } else {
      blocks.push({ type: 'text', text: `Attached video "${f.name}": ${f.url}` });
    }
  }
  if (text) blocks.push({ type: 'text', text });

  appendUserContent(session, blocks);
  pushDisplay(session, { type: 'user', text, attachments: files.map(({ url, kind, name }) => ({ url, kind, name })) });

  if (session.title === 'New chat' && text) session.title = text.slice(0, 60);

  try {
    await runLoop(session, ctx);
  } catch (error) {
    repairAfterError(session, error.message);
  }
};

// ── Public: the user confirmed (or cancelled) a post card ────────────────────
const guessFormat = (url, platforms) => {
  const video = images.isVideoFile(url);
  if (video && platforms.includes('youtube')) return 'youtube';
  if (platforms.includes('instagram')) return video ? 'instagram_reel' : 'instagram_feed';
  if (platforms.includes('twitter')) return 'twitter';
  if (platforms.includes('linkedin')) return 'linkedin';
  return 'facebook';
};

const summarizePost = (post) => ({
  post_id: post.id,
  status: post.status,
  scheduled_at: post.scheduledAt || null,
  results: asArray(post.platformResults).map(r => ({
    platform: r.platform,
    status: r.status,
    error: r.error || null,
    pages: asArray(r.pages).map(p => ({ page: p.pageName, status: p.status, error: p.error || null })),
  })),
});

const createPost = async (ctx, decision) => {
  const accountIds = [...new Set(asArray(decision.accountIds).map(asString).filter(Boolean))];
  if (!accountIds.length) throw fail('Pick at least one channel.');

  const accounts = await SocialAccount.find({ id: { $in: accountIds }, userId: ctx.userId }).select('id platform pages.pageId accountName');
  if (accounts.length !== accountIds.length) throw fail('One of the selected channels was not found. Refresh the page and try again.');

  const selectedPages = {};
  for (const acc of accounts) {
    const chosen = asArray(decision.selectedPages?.[acc.id]).map(asString)
      .filter(id => (acc.pages || []).some(p => p.pageId === id));
    if (acc.platform === 'facebook' && acc.pages?.length) {
      if (!chosen.length) throw fail(`Pick at least one Facebook page for ${acc.accountName || 'your Facebook account'}.`);
      selectedPages[acc.id] = chosen;
    }
  }

  const platforms = accounts.map(a => a.platform);
  const mediaUrls = asArray(decision.mediaUrls).map(asString).filter(Boolean).slice(0, 10)
    .map(url => fileUrl(ctx, images.resolveLocalUpload(url).filename));
  const content = asString(decision.content);
  if (!content) throw fail('The caption is empty.');

  if (platforms.includes('instagram') && !mediaUrls.length) throw fail('Instagram needs an image or a video.');
  if (platforms.includes('twitter') && content.length > 280) throw fail(`X/Twitter allows 280 characters; this caption has ${content.length}.`);
  const hasYoutube = platforms.includes('youtube');
  if (hasYoutube && !mediaUrls.some(images.isVideoFile)) throw fail('YouTube needs a video.');
  if (hasYoutube && !asString(decision.youtubeTitle)) throw fail('YouTube needs a title.');

  let scheduledAt = null;
  if (decision.action === 'schedule') {
    const when = new Date(decision.scheduledAt);
    if (Number.isNaN(when.getTime())) throw fail('Pick a date and time to schedule.');
    if (when.getTime() < Date.now() + 60 * 1000) throw fail('The scheduled time must be in the future.');
    scheduledAt = when.toISOString();
  }

  const body = {
    content,
    accountIds,
    selectedPages,
    mediaUrls,
    mediaFormats: Object.fromEntries(mediaUrls.map(url => [url, guessFormat(url, platforms)])),
    status: scheduledAt ? 'scheduled' : 'published',
    scheduledAt,
    ...(hasYoutube ? {
      youtubeTitle: asString(decision.youtubeTitle).slice(0, 100),
      youtubeTags: asArray(decision.youtubeTags).map(asString).filter(Boolean),
      youtubeCategory: '22',
      youtubePrivacy: ['public', 'unlisted', 'private'].includes(decision.youtubePrivacy) ? decision.youtubePrivacy : 'public',
      youtubeMadeForKids: false,
    } : {}),
  };

  // Same endpoint the composer uses → same publisher, scheduler and validation
  try {
    const res = await axios.post(`${ctx.internalBaseUrl}/api/posts`, body, {
      headers: { Authorization: ctx.authHeader, 'Content-Type': 'application/json' },
      timeout: 20 * 60 * 1000, // video uploads can take a while
      maxBodyLength: Infinity,
    });
    return res.data;
  } catch (error) {
    throw fail(error.response?.data?.detail || error.message || 'Failed to create the post', error.response?.status || 502);
  }
};

const confirmProposal = async (session, ctx, decision) => {
  const pending = session.pending;
  if (!pending || pending.toolUseId !== decision.toolUseId) {
    throw fail('This post card is no longer active.', 409);
  }

  let resultForClaude;
  let isError = false;

  if (decision.action === 'cancel') {
    resultForClaude = 'The user cancelled this post. Nothing was published or scheduled.';
    updateProposalDisplay(session, pending.toolUseId, { status: 'cancelled' });
  } else {
    if (!['post', 'schedule'].includes(decision.action)) throw fail('Unknown action.');
    let post;
    try {
      post = await createPost(ctx, decision);
    } catch (error) {
      // Validation problems are shown on the card; the card stays open so the user can fix them
      if (error.status && error.status < 500 && error.status !== 409) throw error;
      isError = true;
      resultForClaude = `Publishing failed: ${error.message}`;
      updateProposalDisplay(session, pending.toolUseId, { status: 'failed', error: error.message });
    }

    if (post) {
      const summary = summarizePost(post);
      const anyFailed = summary.results.some(r => r.status === 'failed' || r.pages.some(p => p.status === 'failed'));
      resultForClaude = { ...summary, user_choice: decision.action === 'schedule' ? 'scheduled' : 'post now' };
      updateProposalDisplay(session, pending.toolUseId, {
        status: post.status === 'failed' ? 'failed' : decision.action === 'schedule' ? 'scheduled' : (anyFailed ? 'partial' : 'posted'),
        result: summary,
        final: {
          caption: asString(decision.content),
          accountIds: decision.accountIds,
          scheduledAt: summary.scheduled_at,
          mediaUrls: decision.mediaUrls,
        },
      });
    }
  }

  consumeAgentTurn(ctx.userId);
  session.pending = null;
  appendUserContent(session, [...pending.results, toolResult(pending.toolUseId, resultForClaude, isError)]);

  try {
    await runLoop(session, ctx);
  } catch (error) {
    repairAfterError(session, error.message);
  }
};

module.exports = {
  getStatus,
  sendMessage,
  confirmProposal,
};
