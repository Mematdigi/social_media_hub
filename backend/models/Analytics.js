const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  accountId: { type: String, required: true },
  platform: { type: String, required: true },
  date: { type: String, required: true },
  followers: { type: Number, default: 0 },
  followersGrowth: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  profileViews: { type: Number, default: 0 },
  postsCount: { type: Number, default: 0 }
});

analyticsSchema.index({ accountId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Analytics', analyticsSchema);
