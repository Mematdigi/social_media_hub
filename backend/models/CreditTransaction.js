// models/CreditTransaction.js — every change to a user's AI credits (the ledger)
const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  userId:    { type: String, required: true, index: true },
  type:      { type: String, enum: ['signup', 'plan', 'topup', 'grant', 'usage', 'refund'], required: true },
  kind:      { type: String, enum: ['post', 'image', 'video'], required: true },
  amount:    { type: Number, required: true },          // + added, − used
  balanceAfter: { type: Number, default: null },
  action:    { type: String, default: null },           // e.g. write_with_ai, agent_post, generate_image
  model:     { type: String, default: null },           // AI model used (for your cost reports)
  note:      { type: String, default: '' },
  adminId:   { type: String, default: null },           // who granted
  requestId: { type: String, default: null },           // upgrade request that added it
  createdAt: { type: Date, default: Date.now, index: true },
});

creditTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);
