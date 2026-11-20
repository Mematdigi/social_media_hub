// models/CreditWallet.js — a user's AI credits (one document per user)
//   post  = AI-written posts (Write with AI, AI Agent post cards)
//   image = AI images and AI photo enhancements
//   video = AI-generated videos
const mongoose = require('mongoose');

const creditWalletSchema = new mongoose.Schema({
  userId:  { type: String, required: true, unique: true, index: true },
  post:    { type: Number, default: 0, min: 0 },
  image:   { type: Number, default: 0, min: 0 },
  video:   { type: Number, default: 0, min: 0 },
  used: {
    post:  { type: Number, default: 0 },
    image: { type: Number, default: 0 },
    video: { type: Number, default: 0 },
  },
  plan:            { type: String, default: 'free' },   // last plan approved (free | starter | growth | pro)
  company:         { type: Boolean, default: false },   // 🆕 your own team: unlimited AI, no charge, usage still tracked
  companyNote:     { type: String, default: '' },
  planActivatedAt: { type: Date, default: null },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
});

module.exports = mongoose.model('CreditWallet', creditWalletSchema);
