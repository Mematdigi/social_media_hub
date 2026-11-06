// models/ContentReport.js — AI content reported by users (Google Play AI-generated content policy).
// View reports in MongoDB, collection "contentreports".
const mongoose = require('mongoose');

const contentReportSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  userId:    { type: String, required: true, index: true },
  sessionId: { type: String, default: null },
  itemId:    { type: String, default: null },
  itemType:  { type: String, default: null },  // assistant (text) | image
  content:   { type: String, default: '' },    // copy of the reported text or image URL
  reason:    { type: String, default: 'other' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ContentReport', contentReportSchema);
