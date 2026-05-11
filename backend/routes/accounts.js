
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


  router.get('/oauth/threads', (req, res) => {
    let { user_id } = req.query;

    const user = SocialAccount.find({ userId: user_id, platform: 'facebook' });
    console.log(user);
  user_id = user.accountId
    if (!user_id) {
      return res.redirect(`${getBaseUrl()}/accounts?error=no_user`);
    }
  
    // No credentials — use demo mode
    if (!process.env.THREADS_APP_ID) {
      logger.info('🔗 No Threads credentials — using demo mode');
      return res.redirect(
        `${getBackendUrl()}/api/accounts/oauth/threads/callback?user_id=${user_id}&demo=true`
      );
    }
  
    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/threads/callback`;
  
    const url =
      `https://threads.net/oauth/authorize?` +
      `client_id=${process.env.THREADS_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=threads_basic,threads_content_publish` +
      `&response_type=code` +
      `&state=${user_id}`;
  
    logger.info('🔗', `Redirecting to Threads OAuth for user ${user_id}`);
    res.redirect(url);
  });
  
  // ── STEP 2: Threads OAuth Callback ───────────────────────────
  // ✅ Returns HTML that sends postMessage to parent (popup style)
  // Matches Facebook/Instagram popup behavior
  router.get('/oauth/threads/callback', async (req, res) => {
    const { code, state: userId, error, demo } = req.query;
    const FRONTEND_URL = getBaseUrl();
  
    // ── Helper: send postMessage to parent popup and close ──────
    const sendPopupMessage = (success, message = '') => {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connecting Threads...</title></head>
          <body>
            <script>
              try {
                if (window.opener) {
                  // ✅ Send result to parent window (like FB SDK)
                  window.opener.postMessage(
                    {
                      platform: 'threads',
                      success:  ${success},
                      message:  '${message}'
                    },
                    '${FRONTEND_URL}'
                  );
                  window.close();
                } else {
                  // Fallback: no opener — do a redirect instead
                  window.location.href = '${FRONTEND_URL}/accounts?${success ? 'connected=threads' : 'error=threads_failed'}';
                }
              } catch (e) {
                window.location.href = '${FRONTEND_URL}/accounts?${success ? 'connected=threads' : 'error=threads_failed'}';
              }
            </script>
            <p style="font-family:sans-serif;text-align:center;margin-top:40px">
              ${success ? 'Threads connected! Closing...' : 'Connection failed. Closing...'}
            </p>
          </body>
        </html>
      `);
    };
  
    // ── User denied ──────────────────────────────────────────────
    if (error) {
      logger.error('Threads OAuth denied', error);
      return sendPopupMessage(false, 'Login was denied');
    }
  
    // ── Demo mode ────────────────────────────────────────────────
    if (demo === 'true' || !code) {
      try {
        await SocialAccount.findOneAndUpdate(
          { userId, platform: 'threads' },
          {
            id:             uuidv4(),
            userId,
            platform:       'threads',
            accountName:    'Demo Threads Account',
            accountId:      `demo_threads_${userId.substring(0, 8)}`,
            profilePicture: `https://api.dicebear.com/7.x/initials/svg?seed=threads`,
            accessToken:    encrypt('demo_threads_token'),
            tokenExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            isActive:       true,
            followers:      0,
            connectedAt:    new Date()
          },
          { upsert: true, new: true }
        );
        logger.info('🔗', `Threads connected (demo) for user ${userId}`);
        return sendPopupMessage(true);
      } catch (err) {
        logger.error('Threads demo save failed', err.message);
        return sendPopupMessage(false, 'Demo connection failed');
      }
    }
  
    // ── Real OAuth ───────────────────────────────────────────────
    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/threads/callback`;
  
    try {
      // 1. Exchange code for short-lived token
      const tokenRes = await axios.post(
        'https://graph.threads.net/oauth/access_token',
        new URLSearchParams({
          client_id:     process.env.THREADS_APP_ID,
          client_secret: process.env.THREADS_APP_SECRET,
          code,
          grant_type:    'authorization_code',
          redirect_uri:  redirectUri
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
  
      const shortLivedToken = tokenRes.data.access_token;
      const threadsUserId   = tokenRes.data.user_id;
  
      // 2. Exchange for long-lived token (60 days)
      const longLivedRes = await axios.get(
        'https://graph.threads.net/access_token',
        {
          params: {
            grant_type:    'th_exchange_token',
            client_secret: process.env.THREADS_APP_SECRET,
            access_token:  shortLivedToken
          }
        }
      );
  
      const longLivedToken = longLivedRes.data.access_token;
  
      // 3. Get Threads profile
      const profileRes = await axios.get(
        `https://graph.threads.net/v1.0/${threadsUserId}`,
        {
          params: {
            fields:       'id,username,threads_profile_picture_url,threads_biography',
            access_token: longLivedToken
          }
        }
      );
  
      const profile = profileRes.data;
  
      // 4. Save to MongoDB
      await SocialAccount.findOneAndUpdate(
        { userId, platform: 'threads' },
        {
          id:             uuidv4(),
          userId,
          platform:       'threads',
          accountName:    profile.username,
          accountId:      profile.id,
          profilePicture: profile.threads_profile_picture_url || '',
          accessToken:    encrypt(longLivedToken),
          tokenExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          isActive:       true,
          followers:      0,
          connectedAt:    new Date()
        },
        { upsert: true, new: true }
      );
  
      logger.info('🔗', `Threads connected for user ${userId} (@${profile.username})`);
  
      // ✅ Send success to popup — closes it like FB SDK
      return sendPopupMessage(true);
  
    } catch (err) {
      logger.error('Threads OAuth callback failed', err.response?.data || err.message);
      return sendPopupMessage(false, 'Connection failed. Please try again.');
    }
  });

// ─────────────────────────────────────────────────────────────
// GET /api/accounts/oauth/threads/popup-url
// Returns the Threads OAuth popup URL — frontend just opens it
// ─────────────────────────────────────────────────────────────
router.get('/oauth/threads/popup-url', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from JWT middleware — correct user_id
const user = await SocialAccount.findOne({ userId, platform: 'facebook' });
console.log(user.accountId);
    if (!process.env.THREADS_APP_ID) {
      // Demo mode — return demo callback URL
      return res.json({
        success:  true,
        popupUrl: `${getBackendUrl()}/api/accounts/oauth/threads/callback?user_id=${userId}&demo=true`,
        demo:     true
      });
    }

    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/threads/callback`;

    const popupUrl =
      `https://threads.net/oauth/authorize?` +
      `client_id=${process.env.THREADS_APP_ID}` +
      `&redirect_uri= https://socialsizzle.herokuapp.com/auth/` +
      `&scope=threads_basic,threads_content_publish` +
      `&response_type=code` +
      `&state=${user.accountId}`;  // ✅ uses real user_id from JWT

    res.json({
      success:  true,
      popupUrl,
      demo:     false
    });

  } catch (err) {
    logger.error('Failed to generate Threads popup URL', err.message);
    res.status(500).json({ success: false, message: 'Failed to generate popup URL' });
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

// ─────────────────────────────────────────────────────────────
// Instagram helpers — mirrors saveFacebookAccount exactly
// ─────────────────────────────────────────────────────────────
const saveInstagramAccount = async (userId, accessToken) => {

  // ── Step 1: Exchange for long-lived token (reuse same FB function) ──────
  const longLivedToken = await exchangeForLongLivedToken(accessToken);

  // ── Step 2: Get all FB Pages + their linked IG Business accounts ─────────
  const pagesRes = await axios.get('https://graph.facebook.com/me/accounts', {
    params: {
      fields:       'id,name,access_token,instagram_business_account,category',
      access_token: longLivedToken
    }
  });
  const pages = pagesRes.data.data || [];

  // ── Step 3: Find pages that have a linked Instagram Business account ──────
  const pagesWithIG = pages.filter(p => p.instagram_business_account?.id);

  if (pagesWithIG.length === 0) {
    throw new Error(
      'No Instagram Business or Creator account found. ' +
      'Please link your Instagram to a Facebook Page in Meta Business Suite first.'
    );
  }

  // ── Step 4: Use first linked IG account ───────────────────────────────────
  const page            = pagesWithIG[0];
  const igId            = page.instagram_business_account.id;
  const pageAccessToken = page.access_token;

  // ── Step 5: Fetch full IG profile ─────────────────────────────────────────
  const igRes = await axios.get(`https://graph.facebook.com/${igId}`, {
    params: {
      fields:       'id,username,name,biography,followers_count,media_count,profile_picture_url,website',
      access_token: pageAccessToken
    }
  });
  const ig = igRes.data;

  // ── Step 6: Upsert — same shape as Facebook document ─────────────────────
  const saved = await SocialAccount.findOneAndUpdate(
    { userId, platform: 'instagram' },
    {
      id:             uuidv4(),
      userId,
      platform:       'instagram',
      accountName:    ig.name || ig.username,
      accountId:      ig.id,
      profilePicture: ig.profile_picture_url || '',
      accessToken:    encrypt(longLivedToken),
      tokenExpiry:    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive:       true,
      followers:      ig.followers_count || 0,
      // ── pages array — same shape as Facebook, stores the linked FB page ──
      pages: [{
        pageId:          page.id,
        pageName:        page.name,
        pageAccessToken: encrypt(pageAccessToken),   // used for all IG Graph API calls
        category:        page.category || '',
        isSelected:      true
      }],
      connectedAt: new Date()
    },
    { upsert: true, new: true }
  );

  logger.info('🔗', `Instagram saved for user ${userId} — @${ig.username} via page "${page.name}"`);
  return saved;
};
// ─────────────────────────────────────────────────────────────
// POST /api/accounts/connect/instagram/token
// ─────────────────────────────────────────────────────────────
router.post('/connect/instagram/token', async (req, res) => {
  try {
    const { accessToken } = req.body;

    // ── Auth: same JWT extraction as Facebook route ───────────────────────
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

    // ── Validate the FB access token is real ──────────────────────────────
    try {
      await axios.get('https://graph.facebook.com/me', {
        params: { access_token: accessToken, fields: 'id' }
      });
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired Facebook token' });
    }

    // ── Save Instagram account ────────────────────────────────────────────
    const saved = await saveInstagramAccount(userId, accessToken);

    // ── Response — same shape as Facebook response ────────────────────────
    res.json({
      success:     true,
      message:     'Instagram connected successfully',
      accountName: saved.accountName,
      pages: (saved.pages || []).map(p => ({
        pageId:   p.pageId,
        pageName: p.pageName,
        category: p.category
      }))
    });

  } catch (err) {
    // ── Handle the "no IG account linked" error cleanly ───────────────────
    if (err.message?.includes('No Instagram Business')) {
      return res.status(400).json({ success: false, message: err.message });
    }

    logger.error('Instagram token connect failed', err.response?.data || err.message);

    const fbCode = err.response?.data?.error?.code;
    if (fbCode === 190) return res.status(400).json({ success: false, message: 'Token invalid or expired' });
    if (fbCode === 200) return res.status(400).json({ success: false, message: 'Missing permissions' });

    res.status(500).json({ success: false, message: 'Failed to connect Instagram account' });
  }
});


// ── DELETE /api/accounts/disconnect/instagram/:accountId ──────────────────
router.delete('/disconnect/instagram/:accountId', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId        = req.user._id;

    const account = await SocialAccount.findOneAndDelete({
      _id:      accountId,
      userId:   userId,
      platform: 'instagram',
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Instagram account not found' });
    }

    return res.json({ success: true, message: 'Instagram disconnected successfully' });

  } catch (err) {
    console.error('Instagram disconnect error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// ─────────────────────────────────────────────────────────────
// THREADS — Complete OAuth Flow
// Threads is separate from Facebook — uses threads.net OAuth
// Add these routes to your accounts.js
// ─────────────────────────────────────────────────────────────

// ── Helper: extract userId from JWT (reuse across routes) ────
const getUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.user_id;
  } catch {
    return null;
  }
};



module.exports = router;