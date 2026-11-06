const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'socialhub_super_secret_jwt_key_2024';
const JWT_EXPIRATION = '7d';

// Helper to format user response
const formatUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar || '',
  role: user.role || 'admin',
  createdAt: user.createdAt.toISOString()
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    logger.info('🔐', `Registration attempt for ${email}`);
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ detail: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const userId = uuidv4();
    const user = new User({
      id: userId,
      name,
      email,
      password: hashedPassword,
      avatar: '',
      role: 'admin',
      createdAt: new Date()
    });
    
    await user.save();
    
    // Generate token
    const token = jwt.sign({ user_id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
    
    logger.success(`User registered: ${email}`);
    
    res.status(201).json({
      token,
      user: formatUser(user)
    });
  } catch (error) {
    logger.error('Registration failed', error);
    res.status(500).json({ detail: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    logger.info('🔐', `Login attempt for ${email}`);
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }
    
const token = jwt.sign({ user_id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    logger.success(`User logged in: ${email}`);
    
    res.json({
      token,
      user: formatUser(user)
    });
  } catch (error) {
    logger.error('Login failed', error);
    res.status(500).json({ detail: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json(formatUser(req.user));
});

// ── Google Play: account deletion ───────────────────────────────────────────
// POST /api/auth/delete-account  { password }
// Permanently deletes the user and everything stored for them.
router.post('/delete-account', authMiddleware, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const Post = require('../models/Post');
    const SocialAccount = require('../models/SocialAccount');
    const Message = require('../models/Message');
    const Analytics = require('../models/Analytics');
    const AgentSession = require('../models/AgentSession');
    const ContentReport = require('../models/ContentReport');
    const { getLocalUploadName } = require('../services/mediaCleanupService');

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ id: req.user.id });
    // 400 (not 401) so the apps don't sign the user out on a typo
    if (!password || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ detail: 'That password is wrong.' });
    }
    const userId = user.id;

    // This user's uploaded files (posts + AI Agent images/attachments)
    const files = new Set();
    const addUrl = (url) => { const name = getLocalUploadName(url); if (name) files.add(name); };
    const posts = await Post.find({ userId }).select('mediaUrls youtubeThumbnail').lean();
    posts.forEach(p => { (p.mediaUrls || []).forEach(addUrl); addUrl(p.youtubeThumbnail); });
    const sessions = await AgentSession.find({ userId }).select('display').lean();
    sessions.forEach(s => (s.display || []).forEach(d => {
      addUrl(d.url); addUrl(d.beforeUrl);
      (d.attachments || []).forEach(a => addUrl(a.url));
      (d.data?.media_urls || []).forEach(addUrl);
    }));

    await Promise.all([
      Post.deleteMany({ userId }),
      SocialAccount.deleteMany({ userId }),
      Message.deleteMany({ userId }),
      Analytics.deleteMany({ userId }),
      AgentSession.deleteMany({ userId }),
      ContentReport.deleteMany({ userId }),
    ]);
    await User.deleteOne({ id: userId });

    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'));
    for (const name of files) {
      const full = path.join(uploadsDir, name);
      if (full.startsWith(uploadsDir + path.sep)) await fs.promises.unlink(full).catch(() => {});
    }

    logger.info('🗑️', `Account deleted: ${userId}`);
    res.json({ ok: true });
  } catch (error) {
    logger.error('Delete account failed', error.message);
    res.status(500).json({ detail: 'Could not delete the account. Please try again.' });
  }
});

module.exports = router;