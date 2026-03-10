const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SocialAccount = require('../models/SocialAccount');
const PLATFORMS = require('../config/platforms');
const authMiddleware = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

const router = express.Router();

// Helper to format account
const formatAccount = (acc) => ({
  id: acc.id,
  userId: acc.userId,
  platform: acc.platform,
  accountName: acc.accountName,
  accountId: acc.accountId,
  profilePicture: acc.profilePicture,
  isActive: acc.isActive,
  followers: acc.followers,
  connectedAt: acc.connectedAt.toISOString()
});

// GET /api/accounts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ userId: req.user.id })
      .select('-accessToken -refreshToken -_id -__v');
    res.json(accounts.map(formatAccount));
  } catch (error) {
    logger.error('Failed to get accounts', error);
    res.status(500).json({ detail: 'Failed to get accounts' });
  }
});

// GET /api/accounts/platforms
router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    const userAccounts = await SocialAccount.find({ userId: req.user.id })
      .select('-accessToken -refreshToken -_id -__v');
    
    const accountsByPlatform = {};
    userAccounts.forEach(acc => {
      accountsByPlatform[acc.platform] = formatAccount(acc);
    });
    
    const result = PLATFORMS.map(platform => ({
      platform: platform.platform,
      name: platform.name,
      color: platform.color,
      oauthSupported: platform.oauthSupported,
      connected: !!accountsByPlatform[platform.platform],
      account: accountsByPlatform[platform.platform] || null
    }));
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to get platforms', error);
    res.status(500).json({ detail: 'Failed to get platforms' });
  }
});

// GET /api/accounts/oauth/:platform/callback
router.get('/oauth/:platform/callback', async (req, res) => {
  try {
    const { platform } = req.params;
    const { user_id } = req.query;
    
    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig) {
      return res.status(404).json({ detail: 'Platform not found' });
    }
    
    // Check if already connected
    const existing = await SocialAccount.findOne({ userId: user_id, platform });
    if (existing) {
      return res.json({ message: 'Already connected', platform });
    }
    
    // Create mock account
    const accountId = uuidv4();
    const account = new SocialAccount({
      id: accountId,
      userId: user_id,
      platform,
      accountName: `Demo ${platformConfig.name} Account`,
      accountId: `demo_${platform}_${user_id.substring(0, 8)}`,
      profilePicture: `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`,
      accessToken: encrypt(`demo_access_token_${platform}`),
      refreshToken: encrypt(`demo_refresh_token_${platform}`),
      tokenExpiry: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive: true,
      followers: 1000 + Math.abs(platform.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 9000,
      connectedAt: new Date()
    });
    
    await account.save();
    logger.info('🔗', `${platform} connected for user ${user_id}`);
    
    res.json({ message: 'Connected successfully', platform });
  } catch (error) {
    logger.error('OAuth callback failed', error);
    res.status(500).json({ detail: 'OAuth callback failed' });
  }
});

// DELETE /api/accounts/:accountId
router.delete('/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await SocialAccount.deleteOne({
      id: req.params.accountId,
      userId: req.user.id
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: 'Account not found' });
    }
    
    logger.info('🔗', `Account ${req.params.accountId} disconnected`);
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    logger.error('Failed to disconnect account', error);
    res.status(500).json({ detail: 'Failed to disconnect account' });
  }
});

module.exports = router;
