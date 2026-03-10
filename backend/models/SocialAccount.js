const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  platform: { 
    type: String, 
    required: true,
    enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube',
           'pinterest', 'snapchat', 'reddit', 'tumblr', 'telegram', 'whatsapp_business',
           'discord', 'twitch', 'medium', 'quora', 'vk', 'weibo', 'threads', 'mastodon',
           'bluesky', 'behance', 'dribbble', 'github', 'producthunt']
  },
  accountName: { type: String, default: '' },
  accountId: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  accessToken: { type: String, default: '' },
  refreshToken: { type: String, default: '' },
  tokenExpiry: { type: Date },
  isActive: { type: Boolean, default: true },
  followers: { type: Number, default: 0 },
  connectedAt: { type: Date, default: Date.now }
});

socialAccountSchema.index({ userId: 1, platform: 1 });

module.exports = mongoose.model('SocialAccount', socialAccountSchema);
