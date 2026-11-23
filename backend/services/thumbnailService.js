// services/thumbnailService.js
// ─────────────────────────────────────────────────────────────────────────────
// YouTube thumbnails with AI.
//   suggestIdeas()      → 3 thumbnail ideas from the video title + description
//                         (cheapest "light" model, cached 24 h — no credit used)
//   generateThumbnail() → a 1280×720 JPEG made by the image model ("image" tier)
//                         — paid users only, 1 AI image credit (charged in routes/ai.js)
// ─────────────────────────────────────────────────────────────────────────────
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const sharp  = require('sharp');
const ai     = require('./aiService');
const images = require('./imageService');
const cache  = require('./cacheService');

const UPLOAD_DIR = path.join(__dirname, '../uploads');
const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

const SYSTEM = `You are a YouTube thumbnail designer for Indian creators and brands.
Thumbnails must be readable on a phone: one clear subject, high contrast, max 5 big words of text,
bold emotion or curiosity, no clutter, no small text, no fake YouTube UI, no copyrighted characters or logos.
Reply with JSON only.`;

const suggestIdeas = async ({ title, description = '', tags = [] }) => {
  const t = clean(title, 150);
  const d = clean(description, 1500);
  if (!t && !d) {
    const err = new Error('Add a video title or description first.');
    err.status = 400;
    throw err;
  }
  const tagList = (Array.isArray(tags) ? tags : []).map(x => clean(x, 40)).filter(Boolean).slice(0, 15);

  return cache.wrap(`thumb-ideas:${cache.hash({ t, d, tagList })}`, 24 * 60 * 60, async () => {
    const json = await ai.askJson({
      system: SYSTEM,
      maxTokens: 2500,
      prompt: `Video title: ${t || '(none)'}
Description: ${d || '(none)'}
Tags: ${tagList.join(', ') || '(none)'}

Suggest 3 different YouTube thumbnail ideas for this video.
Return: {"ideas":[{"headline":"max 5 words shown big on the thumbnail (same language as the title)",
"concept":"one sentence: what the viewer sees",
"style":"one of: bold-text, face-reaction, product-hero, before-after, minimal",
"colors":"2-3 main colours",
"prompt":"a detailed image-generation prompt (16:9) describing the scene, subject, lighting, composition, and the exact headline text in double quotes, placed large and readable"}]}`,
    });
    const ideas = (Array.isArray(json?.ideas) ? json.ideas : []).slice(0, 3).map((i, n) => ({
      id: `idea${n + 1}`,
      headline: clean(i.headline, 60),
      concept: clean(i.concept, 240),
      style: clean(i.style, 30),
      colors: clean(i.colors, 60),
      prompt: clean(i.prompt, 2000),
    })).filter(i => i.prompt || i.concept);
    if (!ideas.length) throw new Error('The AI could not suggest thumbnails. Try again.');
    return ideas;
  });
};

// idea: one of the suggested ideas (or { headline, concept }) — referenceFile: optional local image (face / product)
const generateThumbnail = async ({ title, description = '', idea = {}, referenceFile = null }) => {
  const headline = clean(idea.headline, 60);
  const prompt = clean(idea.prompt, 2000) || `YouTube thumbnail for a video titled "${clean(title, 150)}". ${clean(idea.concept, 240)} ${clean(description, 300)}`;
  const finalPrompt = `${prompt}

Format: YouTube thumbnail, 16:9 landscape, 1280x720. ${headline ? `Big bold readable text: "${headline}".` : 'Little or no text.'}
High contrast, vivid, sharp focus, one clear subject, readable on a small phone screen. No watermark, no YouTube logo or play button.`;

  const result = await images.generateImage({
    prompt: finalPrompt,
    aspectRatio: '16:9',
    referenceFiles: referenceFile ? [referenceFile] : [],
  });

  // Exactly 1280×720 JPEG under 2 MB (YouTube's limit)
  const source = path.join(UPLOAD_DIR, result.filename);
  const filename = `yt-thumb-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  let quality = 88;
  let buffer = await sharp(source).resize(1280, 720, { fit: 'cover', position: 'attention' }).jpeg({ quality }).toBuffer();
  while (buffer.length > 1.9 * 1024 * 1024 && quality > 50) {
    quality -= 10;
    buffer = await sharp(source).resize(1280, 720, { fit: 'cover' }).jpeg({ quality }).toBuffer();
  }
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  fs.promises.unlink(source).catch(() => {});
  return { filename, model: result.model || images.getStatus().model };
};

module.exports = { suggestIdeas, generateThumbnail };
