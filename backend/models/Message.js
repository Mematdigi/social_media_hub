const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  accountId: { type: String, required: true },
  platform: { type: String, required: true },
  type: { type: String, enum: ['dm', 'comment', 'mention', 'reply'], required: true },
  externalId: { type: String },
  senderName: { type: String, required: true },
  senderHandle: { type: String },
  senderAvatar: { type: String },
  content: { type: String, required: true },
  postId: { type: String },
  postPreview: { type: String },
  threadId: { type: String },
  isRead: { type: Boolean, default: false },
  isReplied: { type: Boolean, default: false },
  receivedAt: { type: Date, default: Date.now },
  repliedAt: { type: Date },
  replyContent: { type: String }
});

messageSchema.index({ userId: 1, isRead: 1, receivedAt: -1 });
messageSchema.index({ externalId: 1, platform: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Message', messageSchema);
