// config/aiModels.js
// ─────────────────────────────────────────────────────────────────────────────
// ONE place that decides which Google AI model does which job.
// Cheap / free models for light work, stronger (paid) models only where needed.
//
//   Tier     Used for                                   Default model                 Approx. cost
//   light    "Write with AI" captions, hashtags,         gemini-3.1-flash-lite         ~₹0.3 per request
//            trending ideas, festival ideas
//   agent    AI Agent chat (plans, writes, calls tools)  gemini-3-flash-preview        ~₹2 per message
//   image    AI images + AI photo enhance                gemini-3.1-flash-image (1K)   ~₹6 per image
//   video    AI videos (short clip with sound)           gemini-omni-1.1-flash (720p)  ~₹70 per 8-second video
//
// Override any of them in backend/.env (no code change needed):
//   AI_MODEL_LIGHT=gemini-3.1-flash-lite
//   AI_MODEL_AGENT=gemini-3-flash-preview
//   AI_MODEL_IMAGE=gemini-3.1-flash-image
//   AI_MODEL_VIDEO=gemini-omni-1.1-flash
//   VIDEO_RESOLUTION=720p            360p (cheapest) | 720p | 1080p
//
// If a model name stops working (Google retires models), the "fallbacks" below
// are tried automatically, so the feature keeps working.
// ─────────────────────────────────────────────────────────────────────────────

const env = (...names) => {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
};

const unique = (list) => [...new Set(list.filter(Boolean))];

const TIERS = {
  light: {
    // AI_MODEL is the old setting name, still honoured as a fallback
    primary: () => env('AI_MODEL_LIGHT') || 'gemini-3.1-flash-lite',
    fallbacks: () => [env('AI_MODEL'), 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'],
  },
  agent: {
    primary: () => env('AI_MODEL_AGENT') || 'gemini-3-flash-preview',
    fallbacks: () => [env('AGENT_MODEL'), 'gemini-3.5-flash', 'gemini-2.5-flash'],
  },
  image: {
    primary: () => env('AI_MODEL_IMAGE', 'IMAGE_MODEL') || 'gemini-3.1-flash-image',
    fallbacks: () => ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'],
  },
  video: {
    primary: () => env('AI_MODEL_VIDEO', 'VIDEO_MODEL') || 'gemini-omni-1.1-flash',
    fallbacks: () => [],
  },
};

// Ordered list of Gemini model names to try for a tier
const modelsFor = (tier) => {
  const t = TIERS[tier];
  if (!t) throw new Error(`Unknown AI tier "${tier}"`);
  return unique([t.primary(), ...t.fallbacks()]).filter(m => /^(gemini|imagen|veo)/i.test(m));
};

const modelFor = (tier) => modelsFor(tier)[0];

// Errors that mean "this model name is not available" → try the next one
const isModelMissing = (error) => {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error?.message || error?.message || '');
  return status === 404
    || /models\/\S+ is not found|not found for API version|is not supported for (generateContent|predict)|model\b.*\b(not found|no longer available|deprecated|shut down|retired)/i.test(message);
};

module.exports = { modelsFor, modelFor, isModelMissing };
