// services/mediaGenService.js
// ─────────────────────────────────────────────────────────────────────────────
// "Generate with AI" in Create post (web + app):
//   writePrompt()   → turns the post caption into a detailed image/video prompt
//                     (cheapest light model, cached 24 h — no credit)
//   createImage()   → image model ("image" tier)  — 1 AI image credit (charged in routes/ai.js)
//   createVideo()   → video model ("video" tier)  — 1 AI video credit, takes 1–6 minutes
// ─────────────────────────────────────────────────────────────────────────────
const ai     = require('./aiService');
const images = require('./imageService');
const videos = require('./videoService');
const cache  = require('./cacheService');

const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

const IMAGE_RATIOS = ['1:1', '4:5', '9:16', '16:9'];
const VIDEO_RATIOS = ['9:16', '16:9'];

const writePrompt = async ({ caption, kind = 'image', aspectRatio = '1:1' }) => {
  const text = clean(caption, 2000);
  if (!text) {
    const err = new Error('Write the post text first, or type what you want in the box.');
    err.status = 400;
    throw err;
  }
  const isVideo = kind === 'video';
  return cache.wrap(`media-prompt:${cache.hash({ text, isVideo, aspectRatio })}`, 24 * 60 * 60, async () => {
    const json = await ai.askJson({
      maxTokens: 1500,
      system: 'You write prompts for AI image and video generators for Indian social media brands. Reply with JSON only.',
      prompt: `Post text: ${text}

Write ONE ${isVideo ? 'short video (about 8 seconds, with sound)' : 'image'} prompt that fits this post, ${aspectRatio} format.
Describe the subject, setting, ${isVideo ? 'action, camera movement, sound, ' : ''}lighting, colours and style.
If text should appear, give max 5 words in double quotes. No logos of other brands, no real celebrities.
Return {"prompt":"..."}`,
    });
    const prompt = clean(json?.prompt, 1500);
    if (!prompt) throw new Error('The AI could not write a prompt. Try again.');
    return prompt;
  });
};

const createImage = async ({ prompt, aspectRatio = '1:1' }) => {
  const ratio = IMAGE_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  const result = await images.generateImage({
    prompt: `${clean(prompt, 3000)}\n\nSocial media post image, ${ratio}. High quality, sharp, vivid, professional. No watermark.`,
    aspectRatio: ratio,
  });
  return { filename: result.filename, kind: 'image', model: result.model, aspectRatio: ratio };
};

const createVideo = async ({ prompt, aspectRatio = '9:16' }) => {
  const ratio = VIDEO_RATIOS.includes(aspectRatio) ? aspectRatio : '9:16';
  const result = await videos.generateVideo({ prompt: clean(prompt, 3000), aspectRatio: ratio });
  return { filename: result.filename, kind: 'video', model: result.model, aspectRatio: ratio };
};

module.exports = { IMAGE_RATIOS, VIDEO_RATIOS, writePrompt, createImage, createVideo, videoStatus: videos.getStatus };
