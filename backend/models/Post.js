const mongoose = require('mongoose');

const platformResultSchema = new mongoose.Schema({
  platform: String,
  accountId: String,
  platformPostId: String,
  status: { type: String, default: 'pending' },
  error: String,
  publishedAt: Date
}, { _id: false });

const postSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  mediaUrls: [{ type: String }],
  accountIds: [{ type: String }],
  platforms: [{ type: String }],
  status: { 
    type: String, 
    enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'], 
    default: 'draft' 
  },
  scheduledAt: { type: Date },
  publishedAt: { type: Date },
  platformResults: [platformResultSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

postSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Post', postSchema);
