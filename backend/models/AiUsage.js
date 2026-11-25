// models/AiUsage.js — one row for EVERY call to an AI model (text, image, video, agent)
// Stores the exact token counts Google returned + the cost worked out from the admin price list.
const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  // Who / where
  userId:   { type: String, default: null, index: true },
  email:    { type: String, default: null },
  feature:  { type: String, default: 'other', index: true }, // "AI video", "Write with AI", "AI Agent chat"…
  route:    { type: String, default: null },                  // /api/ai/media/video
  kind:     { type: String, enum: ['text', 'image', 'video', 'embedding', 'agent'], default: 'text', index: true },
  draftId:  { type: String, default: null, index: true },     // composer / agent session → linked to postId after saving
  postId:   { type: String, default: null, index: true },
  mediaUrl: { type: String, default: null, index: true },     // image / video file it produced

  // Which model
  provider: { type: String, default: 'gemini' },
  model:    { type: String, required: true, index: true },
  status:   { type: String, enum: ['ok', 'error'], default: 'ok' },
  error:    { type: String, default: null },
  durationMs: { type: Number, default: 0 },
  promptPreview: { type: String, default: '' },              // first 200 characters, for the call log

  // Exact usage from Google's response
  inputTokens:       { type: Number, default: 0 }, // text + image + video input (excl. cached)
  cachedTokens:      { type: Number, default: 0 },
  thoughtTokens:     { type: Number, default: 0 }, // "thinking" — billed at the text-output price
  outputTextTokens:  { type: Number, default: 0 },
  outputImageTokens: { type: Number, default: 0 },
  outputVideoTokens: { type: Number, default: 0 },
  videoSeconds:      { type: Number, default: 0 }, // Veo is billed per second
  images:            { type: Number, default: 0 }, // images produced
  totalTokens:       { type: Number, default: 0 },
  estimated:         { type: Boolean, default: false }, // true = Google sent no usage, we estimated it

  // Cost (worked out when the call happened, with the prices valid then)
  costUsd: { type: Number, default: 0 },
  costInr: { type: Number, default: 0 },
  costParts: { type: mongoose.Schema.Types.Mixed, default: {} }, // { input, cached, thought, outputText, outputImage, outputVideo, perSecond } in USD
  priceFound: { type: Boolean, default: true },     // false = model not in the price list (cost 0 — add it in Admin)

  createdAt: { type: Date, default: Date.now, index: true },
});

aiUsageSchema.index({ createdAt: -1, model: 1 });
aiUsageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AiUsage', aiUsageSchema);
