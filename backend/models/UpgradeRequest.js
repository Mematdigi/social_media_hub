// models/UpgradeRequest.js — a customer asked for a plan or a top-up.
// You take the payment (UPI / bank / link), then approve it in Admin → credits are added.
const mongoose = require('mongoose');

const upgradeRequestSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  userId:    { type: String, required: true, index: true },
  userName:  { type: String, default: '' },
  userEmail: { type: String, default: '' },
  planId:    { type: String, required: true },
  planName:  { type: String, default: '' },
  price:     { type: Number, default: 0 },              // rupees
  credits: {
    post:  { type: Number, default: 0 },
    image: { type: Number, default: 0 },
    video: { type: Number, default: 0 },
  },
  note:      { type: String, default: '' },             // from the customer (e.g. UPI transaction id, phone)
  source:    { type: String, default: 'web' },          // web | app
  status:    { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  adminNote: { type: String, default: '' },
  handledBy: { type: String, default: null },
  handledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('UpgradeRequest', upgradeRequestSchema);
