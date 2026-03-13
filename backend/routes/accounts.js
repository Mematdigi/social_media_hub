const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SocialAccount = require('../models/SocialAccount');
const PLATFORMS = require('../config/platforms');
const authMiddleware = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const { getOAuthConfig, buildAuthUrl } = require('../config/oauth');

const router = express.Router();

// OAuth credentials - in production, these should be environment variables
const OAUTH_CREDENTIALS = {
  facebook: { clientId: process.env.FB_CLIENT_ID || 'your_facebook_app_id', clientSecret: process.env.FB_CLIENT_SECRET || 'your_facebook_app_secret' },
  instagram: { clientId: process.env.IG_CLIENT_ID || 'your_instagram_app_id', clientSecret: process.env.IG_CLIENT_SECRET || 'your_instagram_app_secret' },
  twitter: { clientId: process.env.TW_CLIENT_ID || 'your_twitter_client_id', clientSecret: process.env.TW_CLIENT_SECRET || 'your_twitter_client_secret' },
  linkedin: { clientId: process.env.LI_CLIENT_ID || 'your_linkedin_client_id', clientSecret: process.env.LI_CLIENT_SECRET || 'your_linkedin_client_secret' },
  tiktok: { clientId: process.env.TT_CLIENT_ID || 'your_tiktok_client_id', clientSecret: process.env.TT_CLIENT_SECRET || 'your_tiktok_client_secret' },
  youtube: { clientId: process.env.GOOGLE_CLIENT_ID || 'your_google_client_id', clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your_google_client_secret' },
  pinterest: { clientId: process.env.PIN_CLIENT_ID || 'your_pinterest_client_id', clientSecret: process.env.PIN_CLIENT_SECRET || 'your_pinterest_client_secret' },
  discord: { clientId: process.env.DISCORD_CLIENT_ID || 'your_discord_client_id', clientSecret: process.env.DISCORD_CLIENT_SECRET || 'your_discord_client_secret' },
  twitch: { clientId: process.env.TWITCH_CLIENT_ID || 'your_twitch_client_id', clientSecret: process.env.TWITCH_CLIENT_SECRET || 'your_twitch_client_secret' },
  medium: { clientId: process.env.MEDIUM_CLIENT_ID || 'your_medium_client_id', clientSecret: process.env.MEDIUM_CLIENT_SECRET || 'your_medium_client_secret' },
  reddit: { clientId: process.env.REDDIT_CLIENT_ID || 'your_reddit_client_id', clientSecret: process.env.REDDIT_CLIENT_SECRET || 'your_reddit_client_secret' },
  github: { clientId: process.env.GITHUB_CLIENT_ID || 'your_github_client_id', clientSecret: process.env.GITHUB_CLIENT_SECRET || 'your_github_client_secret' },
  mastodon: { clientId: process.env.MASTODON_CLIENT_ID || 'your_mastodon_client_id', clientSecret: process.env.MASTODON_CLIENT_SECRET || 'your_mastodon_client_secret' },
  behance: { clientId: process.env.BEHANCE_CLIENT_ID || 'your_behance_client_id', clientSecret: process.env.BEHANCE_CLIENT_SECRET || 'your_behance_client_secret' },
  dribbble: { clientId: process.env.DRIBBBLE_CLIENT_ID || 'your_dribbble_client_id', clientSecret: process.env.DRIBBBLE_CLIENT_SECRET || 'your_dribbble_client_secret' },
  vk: { clientId: process.env.VK_CLIENT_ID || 'your_vk_client_id', clientSecret: process.env.VK_CLIENT_SECRET || 'your_vk_client_secret' },
  producthunt: { clientId: process.env.PH_CLIENT_ID || 'your_producthunt_client_id', clientSecret: process.env.PH_CLIENT_SECRET || 'your_producthunt_client_secret' },
};

const getBaseUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:3000';
};

const getBackendUrl = () => {
  return process.env.API_URL || 'http://localhost:8001';
};

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

// GET /api/accounts/oauth/:platform - Initiate OAuth flow
router.get('/oauth/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.redirect(`${getBaseUrl()}/accounts?error=no_user`);
    }
    
    // Check if platform is supported
    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig || !platformConfig.oauthSupported) {
      return res.redirect(`${getBaseUrl()}/accounts?error=unsupported_platform`);
    }
    
    // Check if already connected
    const existing = await SocialAccount.findOne({ userId: user_id, platform });
    if (existing) {
      return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}&error=already_connected`);
    }
    
    // Get OAuth credentials
    const credentials = OAUTH_CREDENTIALS[platform];
    if (!credentials || credentials.clientId === `your_${platform}_client_id`) {
      // No real credentials, use demo mode
      logger.info(`🔗 Using demo mode for ${platform} (no OAuth credentials configured)`);
      return res.redirect(`${getBaseUrl()}/api/accounts/oauth/${platform}/callback?user_id=${user_id}&demo=true`);
    }
    
    // Build OAuth authorization URL
    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;
    const state = Buffer.from(JSON.stringify({ user_id, platform })).toString('base64');
    
    const authUrl = buildAuthUrl(platform, credentials.clientId, redirectUri, state);
    
    if (!authUrl) {
      logger.error(`Failed to build auth URL for ${platform}`);
      return res.redirect(`${getBaseUrl()}/accounts?error=oauth_config_error`);
    }
    
    // Redirect to the platform's OAuth page
    logger.info(`🔗 Redirecting to ${platform} OAuth for user ${user_id}`);
    return res.redirect(authUrl);
    
  } catch (error) {
    logger.error('OAuth initiation failed', error);
    return res.redirect(`${getBaseUrl()}/accounts?error=oauth_init_failed`);
  }
});

// GET /api/accounts/oauth/:platform/callback
router.get('/oauth/:platform/callback', async (req, res) => {
  try {
    const { platform } = req.params;
    const { user_id } = req.query;
    
    if (!user_id) {
      // Redirect to frontend with error
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/accounts?error=no_user`);
    }
    
    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig) {
      // Redirect to frontend with error
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/accounts?error=invalid_platform`);
    }
    
    // Check if already connected
    const existing = await SocialAccount.findOne({ userId: user_id, platform });
    if (existing) {
      // Redirect back to frontend with already connected message
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/accounts?connected=${platform}`);
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
    
    // Redirect back to frontend with success
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/accounts?connected=${platform}`);
  } catch (error) {
    logger.error('OAuth callback failed', error);
    // Redirect to frontend with error
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/accounts?error=oauth_failed`);
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
