const mongoose = require('mongoose');

// ─── Per-page result (Facebook pages, LinkedIn pages, etc.) ──────────────────
const pageResultSchema = new mongoose.Schema({
  pageId:       { type: String },
  pageName:     { type: String },
  postId:       { type: String, default: null },       // platformPostId for this specific page
  status:       { type: String, default: 'published' },
  error:        { type: String, default: null },
  permalinkUrl: { type: String, default: null },        // direct link to post on Facebook
  likes:        { type: Number, default: 0 },           // synced from platform
  comments:     { type: Number, default: 0 },           // synced from platform
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
  pages:          { type: [pageResultSchema], default: [] },  // ← Facebook page breakdown
}, { _id: false });

// ─── Post ─────────────────────────────────────────────────────────────────────
const postSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  userId:   { type: String, required: true, index: true },
  content:  { type: String, required: true },
  mediaUrls:  [{ type: String }],
  accountIds: [{ type: String }],
  platforms:  [{ type: String }],
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'],
    default: 'draft'
  },
  scheduledAt:        { type: Date },
  publishedAt:        { type: Date },
  syncedFromPlatform: { type: Boolean, default: false },  // true = pulled from FB/etc, not created here
  platformResults:    { type: [platformResultSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
postSchema.index({ status: 1, scheduledAt: 1 });                      // existing — keep
postSchema.index({ userId: 1, createdAt: -1 });                       // fast list queries
postSchema.index({ 'platformResults.platformPostId': 1 });            // sync deduplication

module.exports = mongoose.model('Post', postSchema);