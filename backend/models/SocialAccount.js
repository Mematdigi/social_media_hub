// models/SocialAccount.js
// ONLY CHANGE: added `pages` array field to store Facebook pages
// Everything else is exactly the same as before

const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  userId:         { type: String, required: true, index: true },
  platform: { 
    type: String, 
    required: true,
    enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'youtube',
           'pinterest', 'snapchat', 'reddit', 'tumblr', 'telegram', 'whatsapp_business',
           'discord', 'twitch', 'medium', 'quora', 'vk', 'weibo', 'threads', 'mastodon',
           'bluesky', 'behance', 'dribbble', 'github', 'producthunt']
  },
  accountName:    { type: String, default: '' },
  accountId:      { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  accessToken:    { type: String, default: '' },
  refreshToken:   { type: String, default: '' },
  tokenExpiry:    { type: Date },
  isActive:       { type: Boolean, default: true },
  followers:      { type: Number, default: 0 },
  connectedAt:    { type: Date, default: Date.now },

  // ── NEW: Facebook Pages this account manages ──────────────
  pages: [{
    pageId:          { type: String, required: true },  // e.g. "364011614307982"
    pageName:        { type: String, default: '' },     // e.g. "MEMAT GO"
    pageAccessToken: { type: String, default: '' },     // encrypted page token
    category:        { type: String, default: '' },     // e.g. "E-commerce website"
    isSelected:      { type: Boolean, default: true }   // which page to post to by default
  }]
  // ─────────────────────────────────────────────────────────
});

module.exports = mongoose.model('SocialAccount', socialAccountSchema);