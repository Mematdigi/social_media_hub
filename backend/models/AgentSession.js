// models/AgentSession.js
// One AI Agent conversation.
//   messages → the conversation in Claude's format (sent back to Claude each turn)
//   display  → what the chat page shows (messages, images, post cards, results)
//   pending  → a post card waiting for the user to pick channels and confirm
const mongoose = require('mongoose');

const agentSessionSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  userId:    { type: String, required: true, index: true },
  title:     { type: String, default: 'New chat' },
  messages:  { type: Array, default: [] },
  display:   { type: Array, default: [] },
  pending:   { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { minimize: false });

agentSessionSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('AgentSession', agentSessionSchema);
