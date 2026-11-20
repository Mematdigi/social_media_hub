// services/videoService.js
// ─────────────────────────────────────────────────────────────────────────────
// AI video generation for the AI Agent (the highest model tier — costs the most).
//
// .env (all optional):
//   VIDEO_PROVIDER=omni             omni (default) = Gemini Omni Flash via the Interactions API
//                                   veo            = Veo via predictLongRunning (fallback option)
//   AI_MODEL_VIDEO=gemini-omni-1.1-flash      for veo use e.g. veo-3.0-fast-generate-001
//   VIDEO_RESOLUTION=720p           360p (cheapest) | 720p | 1080p — cost goes up with resolution
//   VIDEO_TIMEOUT_SECONDS=540       give up after this long (generation usually takes 1–6 minutes)
//
// Uses the same GEMINI_API_KEY (billing must be enabled — there is no free tier for video).
// The finished MP4 is saved in backend/uploads like any uploaded video, so it can be
// posted to Instagram Reels, YouTube Shorts, Facebook etc. and the media-cleanup rules apply.
//
// IMPORTANT for long requests: nginx must allow ~10 minutes for /api/agent/
// (proxy_read_timeout 600s;) or the browser/app gets a 504 while the video is still being made.
// ─────────────────────────────────────────────────────────────────────────────
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const axios    = require('axios');
const sharp    = require('sharp');
const aiModels = require('../config/aiModels');
const logger   = require('../utils/logger');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ASPECT_RATIOS = ['9:16', '16:9'];
const RESOLUTIONS = ['360p', '720p', '1080p'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const headers = () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' });

const fail = (message, status = 502) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const apiMessage = (error) => {
  const data = error.response?.data;
  return data?.error?.message || (typeof data === 'string' ? data.slice(0, 300) : '') || error.message;
};

const getProvider = () => (String(process.env.VIDEO_PROVIDER || 'omni').toLowerCase().trim() === 'veo' ? 'veo' : 'omni');
const getModel = () => {
  const model = aiModels.modelFor('video');
  if (getProvider() === 'veo' && !/^veo/i.test(model)) return 'veo-3.0-fast-generate-001';
  return model;
};
const getResolution = () => (RESOLUTIONS.includes(process.env.VIDEO_RESOLUTION) ? process.env.VIDEO_RESOLUTION : '720p');
const timeoutMs = () => (Number(process.env.VIDEO_TIMEOUT_SECONDS) || 540) * 1000;

const getStatus = () => {
  if (!process.env.GEMINI_API_KEY) {
    return { configured: false, provider: null, model: null, reason: 'Add GEMINI_API_KEY to backend/.env to generate videos.' };
  }
  if (String(process.env.VIDEO_ENABLED || 'true').toLowerCase() === 'false') {
    return { configured: false, provider: getProvider(), model: getModel(), reason: 'AI video generation is switched off (VIDEO_ENABLED=false).' };
  }
  return { configured: true, provider: getProvider(), model: getModel(), resolution: getResolution(), reason: null };
};

const newFilename = () => `ai-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`;

const saveVideo = async (buffer) => {
  if (!buffer || buffer.length < 1000) throw fail('The video model returned an empty file. Please try again.');
  const filename = newFilename();
  await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
};

// Small JPEG of a reference image (product, logo…) for image-to-video
const loadImage = async (filePath) => {
  const buffer = await sharp(filePath, { animated: false })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { mimeType: 'image/jpeg', base64: buffer.toString('base64') };
};

const download = async (url) => {
  const res = await axios.get(url, {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    responseType: 'arraybuffer',
    timeout: 5 * 60 * 1000,
    maxContentLength: Infinity,
    maxRedirects: 5,
  });
  return Buffer.from(res.data);
};

// ── Gemini Omni Flash (Interactions API) ────────────────────────────────────
// Finds the first { type: 'video', data | uri } anywhere in the response
const findVideo = (node, depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (node.type === 'video' && (node.data || node.uri)) return node;
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findVideo(value, depth + 1);
    if (found) return found;
  }
  return null;
};

const downloadOmniVideo = async (video) => {
  if (video.data) return Buffer.from(video.data, 'base64');
  const uri = String(video.uri);
  const fileId = uri.match(/files\/([A-Za-z0-9_-]+)/)?.[1];
  if (fileId && /generativelanguage\.googleapis\.com|^files\//.test(uri)) {
    // Big videos come back as a Files API entry: wait until it is ACTIVE, then download it
    const started = Date.now();
    for (;;) {
      const { data } = await axios.get(`${BASE}/files/${fileId}`, { headers: headers(), timeout: 30000 });
      if (data?.state === 'FAILED') throw fail('Google could not prepare the video file. Please try again.');
      if (!data?.state || data.state === 'ACTIVE') break;
      if (Date.now() - started > 3 * 60 * 1000) throw fail('The video file took too long to become available.');
      await sleep(4000);
    }
    return download(`${BASE}/files/${fileId}:download?alt=media`);
  }
  return download(uri);
};

let omniResponseFormat = true; // switched off automatically if the API rejects it

const omniGenerate = async ({ prompt, aspectRatio, image }) => {
  const model = getModel();
  const shape = aspectRatio === '16:9' ? 'horizontal 16:9 (landscape)' : 'vertical 9:16 (portrait, for Reels/Shorts/Stories)';
  const text = `${prompt}\n\nFormat: ${shape} video.`;

  const input = [
    ...(image ? [{ type: 'image', data: image.base64, mime_type: image.mimeType }] : []),
    { type: 'text', text },
  ];

  const body = () => ({
    model,
    input,
    ...(omniResponseFormat ? { response_format: { type: 'video', aspect_ratio: aspectRatio, resolution: getResolution() } } : {}),
    generation_config: { video_config: { task: image ? 'image_to_video' : 'text_to_video' } },
    background: true,
    store: true,
  });

  let interaction;
  try {
    ({ data: interaction } = await axios.post(`${BASE}/interactions`, body(), { headers: headers(), timeout: 120000, maxBodyLength: Infinity }));
  } catch (error) {
    const message = apiMessage(error);
    if (error.response?.status === 400 && omniResponseFormat && /response_format|aspect_ratio|resolution/i.test(message)) {
      logger.info('🎬', 'Video API rejected response_format — retrying with the format in the prompt only');
      omniResponseFormat = false;
      return omniGenerate({ prompt, aspectRatio, image });
    }
    throw error;
  }

  const started = Date.now();
  while (!['completed', 'failed', 'cancelled', 'incomplete'].includes(interaction?.status) && !findVideo(interaction)) {
    if (Date.now() - started > timeoutMs()) throw fail('The video is taking too long. Please try again in a few minutes.', 504);
    await sleep(8000);
    ({ data: interaction } = await axios.get(`${BASE}/interactions/${encodeURIComponent(interaction.id)}`, { headers: headers(), timeout: 60000, maxContentLength: Infinity }));
  }

  if (interaction.status === 'failed' || interaction.status === 'cancelled') {
    const reason = interaction.errors?.[0]?.message || interaction.error?.message || 'unknown reason';
    throw fail(`The video model could not create this video (${reason}). Try describing it differently.`, 422);
  }
  const video = findVideo(interaction);
  if (!video) throw fail('The video model finished but returned no video. Try a different description.', 422);
  return downloadOmniVideo(video);
};

// ── Veo (predictLongRunning) — set VIDEO_PROVIDER=veo to use it ─────────────
const veoGenerate = async ({ prompt, aspectRatio }) => {
  const model = getModel();
  const { data: op } = await axios.post(
    `${BASE}/models/${model}:predictLongRunning`,
    { instances: [{ prompt }], parameters: { aspectRatio, ...(getResolution() === '1080p' ? { resolution: '1080p' } : {}) } },
    { headers: headers(), timeout: 120000 }
  );

  let operation = op;
  const started = Date.now();
  while (!operation?.done) {
    if (Date.now() - started > timeoutMs()) throw fail('The video is taking too long. Please try again in a few minutes.', 504);
    await sleep(10000);
    ({ data: operation } = await axios.get(`${BASE}/${operation.name}`, { headers: headers(), timeout: 60000 }));
  }
  if (operation.error) throw fail(`The video model could not create this video (${operation.error.message}).`, 422);

  const response = operation.response?.generateVideoResponse || operation.response || {};
  const uri = response.generatedSamples?.[0]?.video?.uri || response.generatedVideos?.[0]?.video?.uri;
  if (!uri) {
    const filtered = response.raiMediaFilteredReasons?.[0];
    throw fail(filtered ? `The video was blocked by Google's safety filter: ${filtered}` : 'The video model returned no video.', 422);
  }
  return download(uri);
};

// ── Public ───────────────────────────────────────────────────────────────────
// referenceFile: optional local image path (product photo / logo) to animate
const generateVideo = async ({ prompt, aspectRatio = '9:16', referenceFile = null }) => {
  const status = getStatus();
  if (!status.configured) throw fail(status.reason, 503);

  const ratio = ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '9:16';
  const startedAt = Date.now();
  let buffer;
  try {
    if (status.provider === 'veo') {
      buffer = await veoGenerate({ prompt, aspectRatio: ratio });
    } else {
      const image = referenceFile ? await loadImage(referenceFile) : null;
      buffer = await omniGenerate({ prompt, aspectRatio: ratio, image });
    }
  } catch (error) {
    if (error.status && !error.response) throw error; // our own readable errors
    const code = error.response?.status;
    const message = apiMessage(error);
    logger.error('AI video generation failed', message);
    if (code === 429) throw fail('Google video limit reached. Wait a few minutes and try again.', 429);
    if (code === 403 || /billing|FAILED_PRECONDITION/i.test(message)) {
      throw fail('Video generation needs billing enabled on your Google AI Studio key.', 502);
    }
    throw fail(`Video model error: ${message}`, 502);
  }

  const filename = await saveVideo(buffer);
  logger.success(`AI video ready in ${Math.round((Date.now() - startedAt) / 1000)}s: ${filename} (${status.model})`);
  return { filename, aspectRatio: ratio, model: status.model, resolution: status.resolution };
};

module.exports = { ASPECT_RATIOS, getStatus, generateVideo };
