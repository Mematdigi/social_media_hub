// routes/agent.js
// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/agent/status          → is the agent (and image model) configured?
// GET    /api/agent/sessions        → recent chats
// GET    /api/agent/sessions/:id    → one chat
// DELETE /api/agent/sessions/:id    → delete a chat
// POST   /api/agent/chat            → { sessionId?, message, attachments[] }
// POST   /api/agent/confirm         → { sessionId, toolUseId, action: post|schedule|cancel, ... }
// ─────────────────────────────────────────────────────────────────────────────
const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const AgentSession   = require('../models/AgentSession');
const agent          = require('../services/agentService');
const logger         = require('../utils/logger');

const router = express.Router();

// One request at a time per chat (prevents double-sends and double-posting)
const busy = new Set();

const buildContext = (req) => ({
  userId: req.user.id,
  authHeader: req.headers.authorization,
  baseUrl: (process.env.PUBLIC_BASE_URL || `https://${req.get('host')}`).replace(/\/+$/, ''),
  internalBaseUrl: `http://127.0.0.1:${process.env.PORT || 5000}`,
});

const formatSession = (s) => ({
  id: s.id,
  title: s.title,
  display: s.display || [],
  hasPending: Boolean(s.pending),
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const saveSession = async (session) => {
  session.updatedAt = new Date();
  session.markModified('messages');
  session.markModified('display');
  session.markModified('pending');
  await session.save();
};

const sendError = (res, error, fallback) => {
  const status = error.status || 500;
  if (status >= 500) logger.error(fallback, error.message);
  res.status(status).json({ detail: error.message || fallback });
};

router.get('/status', authMiddleware, (req, res) => {
  res.json(agent.getStatus());
});

router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await AgentSession.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('id title updatedAt');
    res.json(sessions.map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })));
  } catch (error) {
    sendError(res, error, 'Failed to load chats');
  }
});

router.get('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const session = await AgentSession.findOne({ id: String(req.params.id), userId: req.user.id });
    if (!session) return res.status(404).json({ detail: 'Chat not found' });
    res.json(formatSession(session));
  } catch (error) {
    sendError(res, error, 'Failed to load chat');
  }
});

router.delete('/sessions/:id', authMiddleware, async (req, res) => {
  try {
    await AgentSession.deleteOne({ id: req.params.id, userId: req.user.id });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Failed to delete chat');
  }
});

router.post('/chat', authMiddleware, async (req, res) => {
  const status = agent.getStatus();
  if (!status.configured) return res.status(503).json({ detail: status.reason });

  const { sessionId, message = '', attachments = [] } = req.body || {};
  let session;
  try {
    if (sessionId) {
      session = await AgentSession.findOne({ id: String(sessionId), userId: req.user.id });
      if (!session) return res.status(404).json({ detail: 'Chat not found' });
    } else {
      session = new AgentSession({ id: uuidv4(), userId: req.user.id, messages: [], display: [] });
    }
  } catch (error) {
    return sendError(res, error, 'Failed to load chat');
  }

  if (busy.has(session.id)) return res.status(409).json({ detail: 'The agent is still working on your last message.' });
  busy.add(session.id);

  try {
    await agent.sendMessage(session, buildContext(req), { message, attachments });
    await saveSession(session);
    res.json(formatSession(session));
  } catch (error) {
    sendError(res, error, 'The agent could not answer');
  } finally {
    busy.delete(session.id);
  }
});

router.post('/confirm', authMiddleware, async (req, res) => {
  const status = agent.getStatus();
  if (!status.configured) return res.status(503).json({ detail: status.reason });

  const { sessionId, ...decision } = req.body || {};
  let session;
  try {
    session = await AgentSession.findOne({ id: String(sessionId || ''), userId: req.user.id });
  } catch (error) {
    return sendError(res, error, 'Failed to load chat');
  }
  if (!session) return res.status(404).json({ detail: 'Chat not found' });

  if (busy.has(session.id)) return res.status(409).json({ detail: 'This post is already being processed.' });
  busy.add(session.id);

  try {
    await agent.confirmProposal(session, buildContext(req), decision);
    await saveSession(session);
    res.json(formatSession(session));
  } catch (error) {
    sendError(res, error, 'Failed to publish the post');
  } finally {
    busy.delete(session.id);
  }
});

module.exports = router;
