// models/Payment.js — one Razorpay order (plan or top-up bought on the website)
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  userId:    { type: String, required: true, index: true },
  userName:  { type: String, default: '' },
  userEmail: { type: String, default: '' },
  packId:    { type: String, required: true },
  packName:  { type: String, default: '' },
  packKind:  { type: String, enum: ['plan', 'topup'], default: 'plan' },
  price:     { type: Number, default: 0 },              // plan price in rupees (as shown)
  gstPercent:{ type: Number, default: 0 },              // GST added on top (0 = price already includes it)
  amount:    { type: Number, required: true },          // what the customer pays, in paise
  currency:  { type: String, default: 'INR' },
  credits: {
    post:  { type: Number, default: 0 },
    image: { type: Number, default: 0 },
    video: { type: Number, default: 0 },
  },
  gateway:   { type: String, enum: ['razorpay', 'dummy'], default: 'razorpay', index: true }, // 🆕 dummy = test payment, no money
  razorpayOrderId:   { type: String, required: true, unique: true },   // for dummy: dummy_order_…
  razorpayPaymentId: { type: String, default: null },
  method:    { type: String, default: null },           // upi, card, netbanking…
  status:    { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
  paidVia:   { type: String, default: null },           // checkout | webhook
  error:     { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
  paidAt:    { type: Date, default: null },
});

module.exports = mongoose.model('Payment', paymentSchema);
