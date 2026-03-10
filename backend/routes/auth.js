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
    
    const token = jwt.sign({ user_id: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
    
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

module.exports = router;
