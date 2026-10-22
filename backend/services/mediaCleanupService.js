// services/mediaCleanupService.js
// ─────────────────────────────────────────────────────────────────────────────
// Deletes uploaded media files (videos, images, thumbnails) from the server's
// /uploads folder after a post has been published for a configurable time.
//
// It never touches the live posts on Facebook / Instagram / YouTube / X —
// only the copy of the file stored on this server.
//
// Per-post settings (models/Post.js):
//   mediaRetentionDays  null → server default, 0 → never, n → n days after publish
//   mediaDeleteOn       exact date/time override
//
// .env settings:
//   MEDIA_RETENTION_DAYS=3              default days after publishing
//   MEDIA_CLEANUP_INTERVAL_MINUTES=15   how often the cleanup runs
//   MEDIA_CLEANUP_DRY_RUN=false         true = only log what would be deleted
//   UPLOADS_DIR=                        optional, defaults to backend/uploads
// ─────────────────────────────────────────────────────────────────────────────
const fs     = require('fs').promises;
const path   = require('path');
const Post   = require('../models/Post');
const logger = require('../utils/logger');

const DAY_MS      = 24 * 60 * 60 * 1000;
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));

const POST_FIELDS =
  'id status mediaUrls youtubeThumbnail publishedAt scheduledAt mediaRetentionDays mediaDeleteOn mediaDeleted';

// ── Settings ─────────────────────────────────────────────────────────────────
const getDefaultRetentionDays = () => {
  const n = Number(process.env.MEDIA_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 3;
};

const isDryRun = () => String(process.env.MEDIA_CLEANUP_DRY_RUN || '').toLowerCase() === 'true';

const getIntervalMinutes = () => {
  const n = Number(process.env.MEDIA_CLEANUP_INTERVAL_MINUTES);
  return Number.isFinite(n) && n >= 1 ? n : 15;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Returns the file name inside /uploads for a URL this server hosts,
// or null for external URLs (Facebook CDN, YouTube thumbnails, etc.)
const getLocalUploadName = (url) => {
  if (!url || typeof url !== 'string') return null;

  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch (_) {
    // relative URL like /uploads/abc.mp4 — use as is
  }

  const marker = '/uploads/';
  const idx = pathname.indexOf(marker);
  if (idx === -1) return null;

  let name = pathname.slice(idx + marker.length);
  try { name = decodeURIComponent(name); } catch (_) {}

  // Only top-level files (never the chunks/ folder) and no path tricks
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return null;
  return name;
};

const getLocalMediaFiles = (post) => {
  const urls = [...(post?.mediaUrls || [])];
  if (post?.youtubeThumbnail) urls.push(post.youtubeThumbnail);
  return [...new Set(urls.map(getLocalUploadName).filter(Boolean))];
};

const hasLocalMedia = (post) => getLocalMediaFiles(post).length > 0;

// When will this post's uploaded files be removed? null = never / not applicable.
// Published posts → based on publishedAt. Scheduled posts → projected from scheduledAt.
const getMediaDeleteAt = (post) => {
  if (!post || post.mediaDeleted) return null;
  if (!hasLocalMedia(post)) return null;

  if (post.mediaDeleteOn) return new Date(post.mediaDeleteOn);

  const days =
    post.mediaRetentionDays === null || post.mediaRetentionDays === undefined
      ? getDefaultRetentionDays()
      : Number(post.mediaRetentionDays);

  if (!Number.isFinite(days) || days <= 0) return null; // 0 = keep forever

  let base = null;
  if (post.status === 'published') base = post.publishedAt;
  else if (post.status === 'scheduled') base = post.scheduledAt;
  if (!base) return null;

  return new Date(new Date(base).getTime() + days * DAY_MS);
};

const isDue = (post, now) => {
  if (post.status !== 'published') return false; // drafts, scheduled and failed posts keep their media
  const deleteAt = getMediaDeleteAt(post);
  return Boolean(deleteAt && deleteAt.getTime() <= now);
};

// ── Cleanup job ──────────────────────────────────────────────────────────────
let running = false;

const runMediaCleanup = async () => {
  if (running) return;
  running = true;

  const now    = Date.now();
  const dryRun = isDryRun();
  let deletedFiles = 0;
  let cleanedPosts = 0;

  try {
    // Every post that still references a file in /uploads (any status)
    const posts = await Post.find({
      mediaDeleted: { $ne: true },
      $or: [{ mediaUrls: /\/uploads\// }, { youtubeThumbnail: /\/uploads\// }],
    })
      .select(POST_FIELDS)
      .lean();

    // file name → posts that use it (a file can be shared between posts)
    const usage = new Map();
    for (const p of posts) {
      for (const file of getLocalMediaFiles(p)) {
        if (!usage.has(file)) usage.set(file, []);
        usage.get(file).push(p);
      }
    }

    for (const post of posts) {
      if (!isDue(post, now)) continue;

      let allHandled = true;

      for (const file of getLocalMediaFiles(post)) {
        // Keep the file if another post still needs it (draft, scheduled, failed, or not due yet)
        const stillNeeded = (usage.get(file) || []).some(other => other.id !== post.id && !isDue(other, now));
        if (stillNeeded) {
          allHandled = false;
          continue;
        }

        const fullPath = path.join(UPLOADS_DIR, file);
        if (!fullPath.startsWith(UPLOADS_DIR + path.sep)) continue;

        if (dryRun) {
          logger.info('🧪', `[media cleanup dry run] would delete ${file} (post ${post.id})`);
          continue;
        }

        try {
          await fs.unlink(fullPath);
          deletedFiles++;
          logger.info('🗑️', `Deleted media ${file} (post ${post.id})`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            allHandled = false;
            logger.error(`Failed to delete media ${file}`, err);
          }
        }
      }

      if (!dryRun && allHandled) {
        await Post.updateOne(
          { id: post.id },
          { $set: { mediaDeleted: true, mediaDeletedAt: new Date() } }
        );
        cleanedPosts++;
      }
    }

    if (deletedFiles || cleanedPosts) {
      logger.success(`Media cleanup: ${deletedFiles} file(s) deleted, ${cleanedPosts} post(s) cleaned`);
    }
  } catch (error) {
    logger.error('Media cleanup failed', error);
  } finally {
    running = false;
  }
};

let timer = null;

const startMediaCleanup = () => {
  if (timer) return;
  const minutes = getIntervalMinutes();

  logger.info(
    '🧹',
    `Media cleanup started — default ${getDefaultRetentionDays()} day(s) after publish, ` +
    `runs every ${minutes} min${isDryRun() ? ' (DRY RUN — nothing will be deleted)' : ''}`
  );

  setTimeout(runMediaCleanup, 30 * 1000);              // first run shortly after boot
  timer = setInterval(runMediaCleanup, minutes * 60 * 1000);
};

module.exports = {
  startMediaCleanup,
  runMediaCleanup,
  getMediaDeleteAt,
  getLocalMediaFiles,
  getLocalUploadName,
  hasLocalMedia,
  getDefaultRetentionDays,
  getIntervalMinutes,
  isDryRun,
};
