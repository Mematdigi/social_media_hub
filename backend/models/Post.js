const mongoose = require('mongoose');

// ─── Per-page result (Facebook pages, LinkedIn pages, etc.) ──────────────────
const pageResultSchema = new mongoose.Schema({
  pageId:       { type: String },
  pageName:     { type: String },
  postId:       { type: String, default: null },
  status:       { type: String, default: 'published' },
  error:        { type: String, default: null },
  permalinkUrl: { type: String, default: null },
  likes:        { type: Number, default: 0 },
  comments:     { type: Number, default: 0 },
}, { _id: false });

// ─── Per-platform publish result ──────────────────────────────────────────────
const platformResultSchema = new mongoose.Schema({
  platform:       { type: String },
  accountId:      { type: String },
  platformPostId: { type: String, default: null },
  status:         { type: String, default: 'pending' },
  error:          { type: String, default: null },
  publishedAt:    { type: Date,   default: null },
  permalinkUrl:   { type: String, default: null },
  pages:          { type: [pageResultSchema], default: [] },
}, { _id: false });

// ─── Post ─────────────────────────────────────────────────────────────────────
const postSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  userId:   { type: String, required: true, index: true },
  content:  { type: String, required: true },

  mediaUrls:    [{ type: String }],
  mediaFormats: { type: mongoose.Schema.Types.Mixed, default: {} }, // { url: 'facebook' | 'instagram_reel' | ... }
  mediaType:    { type: String, default: null },                     // optional override for IG media type

  accountIds: [{ type: String }],
  platforms:  [{ type: String }],

  // ✅ ADDED: Required for the scheduler to know which specific pages to post to
  selectedPages: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── YouTube-specific metadata ──────────────────────────────────────────────
  youtubeTitle: { type: String, default: null },
  youtubeTags:  { type: [String], default: [] },
  youtubeCategory: { type: String, default: '22' },   // '22' = People & Blogs
  youtubePrivacy: {
    type:    String,
    enum:    ['public', 'unlisted', 'private'],
    default: 'public',
  },
  youtubeMadeForKids: { type: Boolean, default: false },
  youtubeThumbnail:   { type: String, default: null },

  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'],
    default: 'draft',
  },

  scheduledAt:        { type: Date },
  publishedAt:        { type: Date },
  syncedFromPlatform: { type: Boolean, default: false },

  platformResults: { type: [platformResultSchema], default: [] },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
postSchema.index({ status: 1, scheduledAt: 1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ 'platformResults.platformPostId': 1 });

module.exports = mongoose.model('Post', postSchema);