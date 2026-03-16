// routes/accounts.js
// CHANGES FROM ORIGINAL:
// 1. formatAccount() now includes pages[] with pageId, pageName, category
// 2. saveFacebookAccount() already saves pages — no change needed
// 3. NEW route: GET /api/accounts/:accountId/pages  → list pages for an account
// 4. NEW route: POST /api/accounts/:accountId/pages/:pageId/post → post to a specific page
// Everything else is IDENTICAL to your original

const express       = require('express');
const { v4: uuidv4 }= require('uuid');
const axios         = require('axios');
const SocialAccount = require('../models/SocialAccount');
const PLATFORMS     = require('../config/platforms');
const authMiddleware= require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');
const logger        = require('../utils/logger');
const { buildAuthUrl } = require('../config/oauth');
const jwt           = require('jsonwebtoken');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// OAuth credentials from .env
// ─────────────────────────────────────────────────────────────
const OAUTH_CREDENTIALS = {
  facebook:  { clientId: process.env.FB_CLIENT_ID,      clientSecret: process.env.FB_CLIENT_SECRET },
  instagram: { clientId: process.env.IG_CLIENT_ID,      clientSecret: process.env.IG_CLIENT_SECRET },
  twitter:   { clientId: process.env.TW_CLIENT_ID,      clientSecret: process.env.TW_CLIENT_SECRET },
  linkedin:  { clientId: process.env.LI_CLIENT_ID,      clientSecret: process.env.LI_CLIENT_SECRET },
  tiktok:    { clientId: process.env.TT_CLIENT_ID,      clientSecret: process.env.TT_CLIENT_SECRET },
  youtube:   { clientId: process.env.GOOGLE_CLIENT_ID,  clientSecret: process.env.GOOGLE_CLIENT_SECRET },
  pinterest: { clientId: process.env.PIN_CLIENT_ID,     clientSecret: process.env.PIN_CLIENT_SECRET },
  discord:   { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET },
  twitch:    { clientId: process.env.TWITCH_CLIENT_ID,  clientSecret: process.env.TWITCH_CLIENT_SECRET },
  medium:    { clientId: process.env.MEDIUM_CLIENT_ID,  clientSecret: process.env.MEDIUM_CLIENT_SECRET },
  reddit:    { clientId: process.env.REDDIT_CLIENT_ID,  clientSecret: process.env.REDDIT_CLIENT_SECRET },
  github:    { clientId: process.env.GITHUB_CLIENT_ID,  clientSecret: process.env.GITHUB_CLIENT_SECRET },
};

const getBaseUrl    = () => process.env.FRONTEND_URL || 'http://localhost:3000';
const getBackendUrl = () => process.env.API_URL       || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────
// formatAccount — UPDATED to include pages[]
// ─────────────────────────────────────────────────────────────
const formatAccount = (acc) => ({
  id:             acc.id,
  userId:         acc.userId,
  platform:       acc.platform,
  accountName:    acc.accountName,
  accountId:      acc.accountId,
  profilePicture: acc.profilePicture,
  isActive:       acc.isActive,
  followers:      acc.followers,
  connectedAt:    acc.connectedAt.toISOString(),
  // ── NEW: pages list (token excluded for security) ──
  pages: (acc.pages || []).map(p => ({
    pageId:     p.pageId,
    pageName:   p.pageName,
    category:   p.category,
    isSelected: p.isSelected
    // pageAccessToken intentionally excluded from response
  }))
});

// ─────────────────────────────────────────────────────────────
// Facebook helpers — same as before
// ─────────────────────────────────────────────────────────────
const exchangeForLongLivedToken = async (shortLivedToken) => {
  const res = await axios.get('https://graph.facebook.com/oauth/access_token', {
    params: {
      grant_type:        'fb_exchange_token',
      client_id:         process.env.FB_CLIENT_ID,
      client_secret:     process.env.FB_CLIENT_SECRET,
      fb_exchange_token: shortLivedToken
    }
  });
  return res.data.access_token;
};

const saveFacebookAccount = async (userId, accessToken) => {
  const longLivedToken = await exchangeForLongLivedToken(accessToken);

  const profileRes = await axios.get('https://graph.facebook.com/me', {
    params: { fields: 'id,name,picture.width(200)', access_token: longLivedToken }
  });
  const profile = profileRes.data;

  const pagesRes = await axios.get('https://graph.facebook.com/me/accounts', {
    params: { access_token: longLivedToken }
  });
  const pages = pagesRes.data.data || [];

  let followers = 0;
  if (pages.length > 0) {
    try {
      const pageDetails = await axios.get(
        `https://graph.facebook.com/${pages[0].id}`,
        { params: { fields: 'fan_count', access_token: pages[0].access_token } }
      );
      followers = pageDetails.data.fan_count || 0;
    } catch (_) {}
  }

  const saved = await SocialAccount.findOneAndUpdate(
    { userId, platform: 'facebook' },
    {
      id:             uuidv4(),
      userId,
      platform:       'facebook',
      accountName:    profile.name,
      accountId:      profile.id,
      profilePicture: profile.picture?.data?.url,
      accessToken:    encrypt(longLivedToken),
      tokenExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive:       true,
      followers,
      // ── Save each page with its encrypted token ──
      pages: pages.map(p => ({
        pageId:          p.id,
        pageName:        p.name,
        pageAccessToken: encrypt(p.access_token),
        category:        p.category || '',
        isSelected:      true
      })),
      connectedAt: new Date()
    },
    { upsert: true, new: true }
  );

  logger.info('🔗', `Facebook saved for user ${userId} — ${pages.length} pages found`);
  return saved;
};


// ═════════════════════════════════════════════════════════════
// EXISTING ROUTES — all unchanged
// ═════════════════════════════════════════════════════════════

router.get('/', authMiddleware, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ userId: req.user.id });
    res.json(accounts.map(formatAccount));
  } catch (error) {
    logger.error('Failed to get accounts', error);
    res.status(500).json({ detail: 'Failed to get accounts' });
  }
});

router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    const userAccounts = await SocialAccount.find({ userId: req.user.id })
      .select('-accessToken -refreshToken -__v');

    const accountsByPlatform = {};
    userAccounts.forEach(acc => {
      accountsByPlatform[acc.platform] = formatAccount(acc);
    });

    const result = PLATFORMS.map(platform => ({
      platform:       platform.platform,
      name:           platform.name,
      color:          platform.color,
      oauthSupported: platform.oauthSupported,
      connected:      !!accountsByPlatform[platform.platform],
      account:        accountsByPlatform[platform.platform] || null
    }));

    res.json(result);
  } catch (error) {
    logger.error('Failed to get platforms', error);
    res.status(500).json({ detail: 'Failed to get platforms' });
  }
});

router.post('/connect/facebook/token', async (req, res) => {
  try {
    const { accessToken } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    let userId;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.user_id;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired — please login again' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'accessToken is required' });
    }

    try {
      await axios.get('https://graph.facebook.com/me', {
        params: { access_token: accessToken, fields: 'id' }
      });
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired Facebook token' });
    }

    const saved = await saveFacebookAccount(userId, accessToken);

    res.json({
      success:     true,
      message:     'Facebook connected successfully',
      accountName: saved.accountName,
      pages: (saved.pages || []).map(p => ({
        pageId:   p.pageId,
        pageName: p.pageName,
        category: p.category
      }))
    });

  } catch (err) {
    logger.error('Facebook token connect failed', err.response?.data || err.message);
    const fbCode = err.response?.data?.error?.code;
    if (fbCode === 190) return res.status(400).json({ success: false, message: 'Token invalid or expired' });
    if (fbCode === 200) return res.status(400).json({ success: false, message: 'Missing permissions' });
    res.status(500).json({ success: false, message: 'Failed to connect Facebook account' });
  }
});

router.get('/oauth/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { user_id }  = req.query;

    if (!user_id) return res.redirect(`${getBaseUrl()}/accounts?error=no_user`);
    if (platform === 'facebook') return res.redirect(`${getBaseUrl()}/accounts?error=use_token_method`);

    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig || !platformConfig.oauthSupported) {
      return res.redirect(`${getBaseUrl()}/accounts?error=unsupported_platform`);
    }

    const existing = await SocialAccount.findOne({ userId: user_id, platform });
    if (existing) return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}&error=already_connected`);

    const credentials = OAUTH_CREDENTIALS[platform];
    if (!credentials?.clientId) {
      logger.info(`🔗 Demo mode for ${platform}`);
      return res.redirect(`${getBackendUrl()}/api/accounts/oauth/${platform}/callback?user_id=${user_id}&demo=true`);
    }

    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;
    const state       = Buffer.from(JSON.stringify({ user_id, platform })).toString('base64');
    const authUrl     = buildAuthUrl(platform, credentials.clientId, redirectUri, state);

    if (!authUrl) return res.redirect(`${getBaseUrl()}/accounts?error=oauth_config_error`);

    return res.redirect(authUrl);
  } catch (error) {
    logger.error('OAuth initiation failed', error);
    return res.redirect(`${getBaseUrl()}/accounts?error=oauth_init_failed`);
  }
});

router.get('/oauth/:platform/callback', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state, user_id: directUserId, demo, error } = req.query;

    if (error) return res.redirect(`${getBaseUrl()}/accounts?error=${platform}_denied`);

    let userId = directUserId;
    if (state && !userId) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = decoded.user_id;
      } catch {
        return res.redirect(`${getBaseUrl()}/accounts?error=invalid_state`);
      }
    }

    if (!userId) return res.redirect(`${getBaseUrl()}/accounts?error=no_user`);

    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig) return res.redirect(`${getBaseUrl()}/accounts?error=invalid_platform`);

    const existing = await SocialAccount.findOne({ userId, platform });
    if (existing) return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}`);

    if (demo === 'true' || !code) {
      const account = new SocialAccount({
        id:             uuidv4(),
        userId,
        platform,
        accountName:    `Demo ${platformConfig.name} Account`,
        accountId:      `demo_${platform}_${userId.substring(0, 8)}`,
        profilePicture: `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`,
        accessToken:    encrypt(`demo_access_token_${platform}`),
        refreshToken:   encrypt(`demo_refresh_token_${platform}`),
        tokenExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        isActive:       true,
        followers:      1000 + Math.abs(platform.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 9000,
        connectedAt:    new Date(),
        pages:          []
      });
      await account.save();
      logger.info('🔗', `${platform} connected (demo) for user ${userId}`);
      return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}`);
    }

    logger.info('🔗', `${platform} real OAuth callback — code received for user ${userId}`);
    return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}`);

  } catch (error) {
    logger.error('OAuth callback failed', error);
    return res.redirect(`${getBaseUrl()}/accounts?error=oauth_failed`);
  }
});

router.delete('/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await SocialAccount.deleteOne({
      id:     req.params.accountId,
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

// ═════════════════════════════════════════════════════════════
// NEW ROUTES — Pages support
// ═════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// GET /api/accounts/:accountId/pages
// Returns all Facebook pages for a connected account
// ─────────────────────────────────────────────────────────────
router.get('/:accountId/pages', authMiddleware, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    if (account.platform !== 'facebook') {
      return res.status(400).json({ message: 'Pages are only available for Facebook accounts' });
    }

    // Return pages without tokens
    const pages = (account.pages || []).map(p => ({
      pageId:     p.pageId,
      pageName:   p.pageName,
      category:   p.category,
      isSelected: p.isSelected
    }));

    res.json({ pages });
  } catch (error) {
    logger.error('Failed to get pages', error);
    res.status(500).json({ message: 'Failed to get pages' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/accounts/:accountId/pages/:pageId/post
// Post a message to a specific Facebook Page
// Body: { message: "your text here" }
// ─────────────────────────────────────────────────────────────
router.post('/:accountId/pages/:pageId/post', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Find the account
    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Find the specific page inside the account
    const page = (account.pages || []).find(p => p.pageId === req.params.pageId);

    if (!page) {
      return res.status(404).json({ message: 'Page not found on this account' });
    }

    // Decrypt the page access token
    const pageAccessToken = decrypt(page.pageAccessToken);

    // Post to Facebook Page via Graph API
    const fbResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${page.pageId}/feed`,
      {
        message:      message.trim(),
        access_token: pageAccessToken
      }
    );

    logger.info('📘', `Posted to Facebook page ${page.pageName} — post ID: ${fbResponse.data.id}`);

    res.json({
      success:    true,
      message:    'Posted to Facebook page successfully',
      pageName:   page.pageName,
      pageId:     page.pageId,
      fbPostId:   fbResponse.data.id   // e.g. "364011614307982_123456789"
    });

  } catch (error) {
    const fbError = error.response?.data?.error?.message || error.message;
    logger.error('Failed to post to Facebook page', fbError);
    res.status(500).json({ message: 'Failed to post to Facebook page', error: fbError });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/accounts/:accountId/pages/:pageId/select
// Toggle which page is selected as default for posting
// ─────────────────────────────────────────────────────────────
router.put('/:accountId/pages/:pageId/select', authMiddleware, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });

    if (!account) return res.status(404).json({ message: 'Account not found' });

    // Toggle isSelected for the target page
    account.pages = (account.pages || []).map(p => ({
      ...p.toObject(),
      isSelected: p.pageId === req.params.pageId ? !p.isSelected : p.isSelected
    }));

    await account.save();

    res.json({
      success: true,
      pages: account.pages.map(p => ({
        pageId:     p.pageId,
        pageName:   p.pageName,
        isSelected: p.isSelected
      }))
    });
  } catch (error) {
    logger.error('Failed to update page selection', error);
    res.status(500).json({ message: 'Failed to update page selection' });
  }
});

module.exports = router;