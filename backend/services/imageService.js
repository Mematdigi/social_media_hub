// services/imageService.js
// ─────────────────────────────────────────────────────────────────────────────
// AI image generation and photo enhancement for the AI Agent.
//
// .env options:
//   IMAGE_PROVIDER=gemini            gemini (default when GEMINI_API_KEY is set) | openai
//   IMAGE_MODEL=gemini-3.1-flash-image   fast & cheap   (or gemini-3-pro-image for the best quality)
//                                         for openai: gpt-image-1
//   IMAGE_SIZE=2K                    optional, Gemini Pro image models only (1K | 2K | 4K)
//   IMAGE_BASE_URL=                  optional, OpenAI-compatible base URL for images
//
// Every image is saved as a JPEG in backend/uploads (Instagram only accepts JPEG)
// so it can be attached to posts exactly like a file uploaded from the composer,
// and the normal media-cleanup rules apply to it.
// ─────────────────────────────────────────────────────────────────────────────
const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const sharp  = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ASPECT_RATIOS = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9'];

// ── Provider plumbing ────────────────────────────────────────────────────────
const getProvider = () => {
  const explicit = String(process.env.IMAGE_PROVIDER || '').toLowerCase().trim();
  if (explicit) return explicit;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return '';
};

const getModel = () => {
  if (process.env.IMAGE_MODEL) return process.env.IMAGE_MODEL;
  return getProvider() === 'openai' ? 'gpt-image-1' : 'gemini-3.1-flash-image';
};

const getStatus = () => {
  const provider = getProvider();
  if (!provider) {
    return { configured: false, provider: null, model: null, canEdit: false, reason: 'Add GEMINI_API_KEY (or OPENAI_API_KEY) to backend/.env to generate images.' };
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    return { configured: false, provider, model: null, canEdit: false, reason: 'IMAGE_PROVIDER is "gemini" but GEMINI_API_KEY is empty.' };
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return { configured: false, provider, model: null, canEdit: false, reason: 'IMAGE_PROVIDER is "openai" but OPENAI_API_KEY is empty.' };
  }
  if (!['gemini', 'openai'].includes(provider)) {
    return { configured: false, provider, model: null, canEdit: false, reason: `IMAGE_PROVIDER "${provider}" is not supported. Use gemini or openai.` };
  }
  // AI photo enhancement (image editing) is done with Gemini; openai falls back to the basic enhancer
  return { configured: true, provider, model: getModel(), canEdit: provider === 'gemini', reason: null };
};

const fail = (message, status = 502) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const apiError = (error, label) => {
  const data = error.response?.data;
  const message = data?.error?.message || (typeof data === 'string' ? data.slice(0, 300) : '') || error.message;
  return fail(`${label}: ${message}`, error.response?.status === 429 ? 429 : 502);
};

// ── Gemini (generation + editing) ────────────────────────────────────────────
const geminiImage = async ({ prompt, aspectRatio, inputImages = [] }) => {
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  const imageConfig = {};
  if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
  if (process.env.IMAGE_SIZE) imageConfig.imageSize = process.env.IMAGE_SIZE;
  if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;

  const parts = [
    ...inputImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
    { text: prompt },
  ];

  let res;
  try {
    res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent`,
      { contents: [{ role: 'user', parts }], generationConfig },
      {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        timeout: 240000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
  } catch (error) {
    throw apiError(error, 'Image model error');
  }

  const candidate = res.data?.candidates?.[0];
  const outParts = candidate?.content?.parts || [];
  // Gemini 3 image models "think" and may return draft images first — keep the final one
  const imageParts = outParts.filter(p => (p.inlineData || p.inline_data) && !p.thought);
  const finalPart = imageParts[imageParts.length - 1];

  if (!finalPart) {
    const text = outParts.filter(p => p.text && !p.thought).map(p => p.text).join(' ').trim();
    const blocked = res.data?.promptFeedback?.blockReason;
    if (blocked) throw fail(`The image model refused this prompt (${blocked}). Try describing it differently.`, 422);
    throw fail(text
      ? `The image model did not return an image: ${text.slice(0, 300)}`
      : `The image model returned no image${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`, 422);
  }

  const data = finalPart.inlineData || finalPart.inline_data;
  return Buffer.from(data.data, 'base64');
};

// ── OpenAI (generation only) ─────────────────────────────────────────────────
const openaiImage = async ({ prompt, aspectRatio }) => {
  const [w, h] = String(aspectRatio || '1:1').split(':').map(Number);
  const size = w === h ? '1024x1024' : w < h ? '1024x1536' : '1536x1024';
  const baseUrl = (process.env.IMAGE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

  let res;
  try {
    res = await axios.post(
      `${baseUrl}/images/generations`,
      { model: getModel(), prompt, size, quality: process.env.IMAGE_QUALITY || 'high', n: 1 },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 240000, maxContentLength: Infinity }
    );
  } catch (error) {
    throw apiError(error, 'Image model error');
  }

  const b64 = res.data?.data?.[0]?.b64_json;
  if (!b64) throw fail('The image model returned no image.', 422);
  return Buffer.from(b64, 'base64');
};

// ── File helpers ─────────────────────────────────────────────────────────────
const parseRatio = (aspectRatio) => {
  const [w, h] = String(aspectRatio || '').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : null;
};

const closestAspectRatio = (width, height) => {
  const ratio = width / height;
  return ASPECT_RATIOS.reduce((best, r) =>
    Math.abs(parseRatio(r) - ratio) < Math.abs(parseRatio(best) - ratio) ? r : best, '1:1');
};

// Crops to the exact ratio (if needed) and saves as a high-quality JPEG in /uploads
const saveAsJpeg = async (buffer, { ratio = null, prefix = 'ai', minWidth = 0 } = {}) => {
  let image = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(image).metadata();
  let pipeline = sharp(image);

  if (ratio) {
    const current = meta.width / meta.height;
    if (Math.abs(current - ratio) / ratio > 0.02) {
      const width  = current > ratio ? Math.round(meta.height * ratio) : meta.width;
      const height = current > ratio ? meta.height : Math.round(meta.width / ratio);
      pipeline = pipeline.resize(width, height, { fit: 'cover', position: sharp.strategy.attention });
      image = await pipeline.toBuffer();
      pipeline = sharp(image);
    }
  }

  if (minWidth) {
    const { width } = await sharp(image).metadata();
    if (width < minWidth) pipeline = pipeline.resize({ width: minWidth, kernel: 'lanczos3' });
  }

  const out = await pipeline
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), out);
  return filename;
};

// Only files that live in our own /uploads folder can be used (no arbitrary URLs → no SSRF)
const resolveLocalUpload = (urlOrPath) => {
  let pathname = String(urlOrPath || '').trim();
  try {
    if (/^https?:\/\//i.test(pathname)) pathname = new URL(pathname).pathname;
  } catch (_) { /* keep raw value */ }

  if (!pathname.startsWith('/uploads/')) {
    throw fail('Only images uploaded to SocialHub (or generated here) can be used.', 400);
  }
  const filename = path.basename(decodeURIComponent(pathname));
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(filePath)) {
    throw fail('That image is no longer on the server. Please upload it again.', 404);
  }
  return { filename, filePath };
};

const isImageFile = (filename) => /\.(jpe?g|png|webp|gif)$/i.test(filename);
const isVideoFile = (filename) => /\.(mp4|mov|avi|mkv|webm|ogg)$/i.test(filename);

// Small JPEG copy for the vision model (Claude) to look at
const readForVision = async (filename) => {
  const filePath = path.join(UPLOAD_DIR, path.basename(filename));
  if (!fs.existsSync(filePath) || !isImageFile(filePath)) return null;
  const buffer = await sharp(filePath, { animated: false })
    .rotate()
    .resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mediaType: 'image/jpeg', base64: buffer.toString('base64') };
};

// Input image for the image model
const loadInputImage = async (filePath) => {
  const buffer = await sharp(filePath, { animated: false })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { mimeType: 'image/jpeg', base64: buffer.toString('base64') };
};

// ── Public API ───────────────────────────────────────────────────────────────
const generateImage = async ({ prompt, aspectRatio = '1:1', referenceFiles = [] }) => {
  const status = getStatus();
  if (!status.configured) throw fail(status.reason, 503);

  const ratio = ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '1:1';
  let buffer;

  if (status.provider === 'gemini') {
    const inputImages = await Promise.all(referenceFiles.slice(0, 4).map(loadInputImage));
    buffer = await geminiImage({ prompt, aspectRatio: ratio, inputImages });
  } else {
    buffer = await openaiImage({ prompt, aspectRatio: ratio });
  }

  const filename = await saveAsJpeg(buffer, { ratio: parseRatio(ratio), prefix: 'ai-image', minWidth: 1080 });
  return { filename, aspectRatio: ratio, provider: status.provider, model: status.model };
};

const BASE_ENHANCE_PROMPT =
  'Enhance this photo so it looks professionally shot for social media. Improve lighting, exposure, ' +
  'white balance, colour vibrancy, contrast, sharpness and clarity, and remove noise and blur. ' +
  'Keep the subject, composition, framing, people, faces, products, logos and any text EXACTLY the same. ' +
  'Do not add, remove or move anything. Do not crop. Return only the enhanced photo.';

// Free, instant, runs on this server — no AI quota used
const basicEnhance = async (filePath) => {
  const meta = await sharp(filePath).metadata();
  let pipeline = sharp(filePath, { animated: false }).rotate();
  if ((meta.width || 0) < 1080) pipeline = pipeline.resize({ width: 1080, kernel: 'lanczos3' });

  const buffer = await pipeline
    .normalise({ lower: 1, upper: 99 })
    .modulate({ brightness: 1.02, saturation: 1.12 })
    .sharpen({ sigma: 0.9, m1: 0.6, m2: 2 })
    .toBuffer();

  return saveAsJpeg(buffer, { prefix: 'enhanced' });
};

const enhanceImage = async ({ filePath, mode = 'auto', instructions = '' }) => {
  if (!isImageFile(filePath)) throw fail('Only photos can be enhanced (jpg, png, webp).', 400);

  const status = getStatus();
  const useAi = mode === 'ai' || (mode === 'auto' && status.configured && status.canEdit);

  if (!useAi) {
    const filename = await basicEnhance(filePath);
    return { filename, mode: 'basic', note: mode === 'ai' && !status.canEdit ? 'AI enhancement needs IMAGE_PROVIDER=gemini, so the basic enhancer was used.' : null };
  }

  if (!status.configured) throw fail(status.reason, 503);
  if (!status.canEdit) {
    const filename = await basicEnhance(filePath);
    return { filename, mode: 'basic', note: 'AI enhancement needs IMAGE_PROVIDER=gemini, so the basic enhancer was used.' };
  }

  const meta = await sharp(filePath).rotate().metadata();
  // .rotate() metadata keeps the stored orientation; swap when EXIF says the photo is turned
  const turned = [5, 6, 7, 8].includes(meta.orientation);
  const width  = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;

  const prompt = instructions
    ? `${BASE_ENHANCE_PROMPT}\n\nAlso apply these requested changes: ${instructions}`
    : BASE_ENHANCE_PROMPT;

  const buffer = await geminiImage({
    prompt,
    aspectRatio: closestAspectRatio(width, height),
    inputImages: [await loadInputImage(filePath)],
  });

  const filename = await saveAsJpeg(buffer, { ratio: width / height, prefix: 'enhanced', minWidth: Math.min(width, 2048) });
  return { filename, mode: 'ai', note: null };
};

module.exports = {
  ASPECT_RATIOS,
  UPLOAD_DIR,
  getStatus,
  generateImage,
  enhanceImage,
  resolveLocalUpload,
  readForVision,
  isImageFile,
  isVideoFile,
};
