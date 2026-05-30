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
  instagram: { clientId: process.env.IG_CLIENT_ID || process.env.FB_CLIENT_ID, clientSecret: process.env.IG_CLIENT_SECRET || process.env.FB_CLIENT_SECRET },
  twitter:   { clientId: process.env.TW_CLIENT_ID,      clientSecret: process.env.TW_CLIENT_SECRET },
  linkedin:  { clientId: process.env.LI_CLIENT_ID,      clientSecret: process.env.LI_CLIENT_SECRET },
  tiktok:    { clientId: process.env.TT_CLIENT_ID,      clientSecret: process.env.TT_CLIENT_SECRET },
  youtube:   { clientId: process.env.YOUTUBE_CLIENT_ID,  clientSecret: process.env.YOUTUBE_CLIENT_SECRET },
  pinterest: { clientId: process.env.PIN_CLIENT_ID,     clientSecret: process.env.PIN_CLIENT_SECRET },
  discord:   { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET },
  twitch:    { clientId: process.env.TWITCH_CLIENT_ID,  clientSecret: process.env.TWITCH_CLIENT_SECRET },
  medium:    { clientId: process.env.MEDIUM_CLIENT_ID,  clientSecret: process.env.MEDIUM_CLIENT_SECRET },
  reddit:    { clientId: process.env.REDDIT_CLIENT_ID,  clientSecret: process.env.REDDIT_CLIENT_SECRET },
  github:    { clientId: process.env.GITHUB_CLIENT_ID,  clientSecret: process.env.GITHUB_CLIENT_SECRET },
};

const getBaseUrl    = () => process.env.FRONTEND_URL
const getBackendUrl = () => process.env.FRONTEND_URL  

// ─────────────────────────────────────────────────────────────
// formatAccount — includes pages[]
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
  pages: (acc.pages || []).map(p => ({
    pageId:     p.pageId,
    pageName:   p.pageName,
    category:   p.category,
    isSelected: p.isSelected
  }))
});

// ─────────────────────────────────────────────────────────────
// Facebook helpers
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

// ─────────────────────────────────────────────────────────────
// Instagram helper
// ─────────────────────────────────────────────────────────────
const saveInstagramAccount = async (userId, accessToken) => {
  const longLivedToken = await exchangeForLongLivedToken(accessToken);

  const pagesRes = await axios.get('https://graph.facebook.com/me/accounts', {
    params: {
      fields:       'id,name,access_token,instagram_business_account,category',
      access_token: longLivedToken
    }
  });
  const pages = pagesRes.data.data || [];

  const pagesWithIG = pages.filter(p => p.instagram_business_account?.id);
  if (pagesWithIG.length === 0) {
    throw new Error(
      'No Instagram Business or Creator account found. ' +
      'Please link your Instagram to a Facebook Page in Meta Business Suite first.'
    );
  }

  const page            = pagesWithIG[0];
  const igId            = page.instagram_business_account.id;
  const pageAccessToken = page.access_token;

  const igRes = await axios.get(`https://graph.facebook.com/${igId}`, {
    params: {
      fields:       'id,username,name,biography,followers_count,media_count,profile_picture_url,website',
      access_token: pageAccessToken
    }
  });
  const ig = igRes.data;

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
      pages: [{
        pageId:          page.id,
        pageName:        page.name,
        pageAccessToken: encrypt(pageAccessToken),
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
// 🆕 POPUP HTML — postMessage's the opener and closes window
// ─────────────────────────────────────────────────────────────
const sendPopupMessage = (res, platform, success, message = '') => {
  const FRONTEND_URL = getBaseUrl();
  const safeMsg = String(message).replace(/'/g, "\\'").replace(/\n/g, ' ');
  const redirectUrl = success 
    ? `${FRONTEND_URL}/accounts?connected=${platform}`
    : `${FRONTEND_URL}/accounts?error=${platform}_failed&msg=${encodeURIComponent(safeMsg)}`;

  return res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Connecting ${platform}...</title></head>
      <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;">
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;">
          <div style="font-size:48px;margin-bottom:16px;">${success ? '✅' : '❌'}</div>
          <p style="color:#475569;font-size:16px;text-align:center;padding:0 20px;">
            ${success ? 'Success! Returning to dashboard...' : 'Connection failed. Closing...'}
          </p>
        </div>
        <script>
          // Wait 1.5 seconds so the user sees the checkmark
          setTimeout(() => {
            if (window.opener && !window.opener.closed) {
              // Tell the main window what happened
              window.opener.postMessage(
                {
                  source: 'socialhub_oauth', // Unique tag so frontend knows it's from us
                  platform: '${platform}',
                  success: ${success},
                  message: '${safeMsg}'
                },
                '*'
              );
              window.close(); // Close this popup window
            } else {
              // Fallback if they didn't use a popup
              window.location.href = '${redirectUrl}';
            }
          }, 1500);
        </script>
      </body>
    </html>
  `);
};

const { google } = require('googleapis');
// const { encrypt } = require('../utils/encryption'); // Make sure your encrypt utility is imported!

const saveYouTubeAccount= async(userId, tokens)=>{
  // Set up the client with the tokens we just got
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(tokens);

  // Fetch the user's YouTube Channel details
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelRes = await youtube.channels.list({ 
    part: 'snippet', 
    mine: true 
  });

  if (!channelRes.data.items || channelRes.data.items.length === 0) {
    throw new Error('No YouTube channel found for this Google account.');
  }

  const channel = channelRes.data.items[0];
  const channelId = channel.id;
  const channelName = channel.snippet.title;
  const channelPic = channel.snippet.thumbnails.default.url;

  // Preserve the refresh token and check for existing custom ID
  const existingAccount = await SocialAccount.findOne({ 
    userId, 
    platform: 'youtube', 
    accountId: channelId 
  });

  let finalRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  if (!finalRefreshToken && existingAccount && existingAccount.refreshToken) {
    finalRefreshToken = existingAccount.refreshToken; 
  }

  // 👈 If the account exists, keep its ID. If it's new, generate a new UUID!
  const customId = existingAccount && existingAccount.id ? existingAccount.id : uuidv4();

  // Save to Database
  await SocialAccount.findOneAndUpdate(
    { userId, platform: 'youtube', accountId: channelId },
    {
      id: customId, // 👈 SAVE THE CUSTOM ID HERE
      userId,
      platform: 'youtube',
      accountId: channelId,
      name: channelName,
      avatarUrl: channelPic,
      accessToken: encrypt(tokens.access_token),
      refreshToken: finalRefreshToken,
      status: 'connected',
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );
}

// ═════════════════════════════════════════════════════════════
// EXISTING ROUTES
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

// ── Legacy FB SDK token route — kept for backward compatibility ──
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


// ═════════════════════════════════════════════════════════════
// 🆕 OAUTH START — /api/accounts/oauth/:platform
// For facebook + instagram: builds the FB OAuth URL inline so
// it works regardless of buildAuthUrl. For others: falls back
// to buildAuthUrl as before.
// ═════════════════════════════════════════════════════════════
router.get('/oauth/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { user_id }  = req.query;

    if (!user_id) return res.redirect(`${getBaseUrl()}/accounts?error=no_user`);

    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig) {
      return res.redirect(`${getBaseUrl()}/accounts?error=invalid_platform`);
    }

    const existing = await SocialAccount.findOne({ userId: user_id, platform });
    if (existing) return res.redirect(`${getBaseUrl()}/accounts?connected=${platform}&error=already_connected`);

    const credentials = OAUTH_CREDENTIALS[platform];
    if (!credentials?.clientId) {
      logger.info(`🔗 Demo mode for ${platform} (missing client_id env var)`);
      return res.redirect(`${getBackendUrl()}/api/accounts/oauth/${platform}/callback?user_id=${user_id}&demo=true`);
    }

    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;
    const state       = Buffer.from(JSON.stringify({ user_id, platform })).toString('base64');

    // 🆕 INLINE FB / IG OAUTH URL
    if (platform === 'facebook' || platform === 'instagram') {
      const scope = platform === 'facebook'
        ? 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts'
        : 'public_profile,pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,business_management';

      const authUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${credentials.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        `&response_type=code` +
        `&auth_type=rerequest`;

      logger.info('🔗', `Redirecting popup to ${platform} OAuth for user ${user_id}`);
      return res.redirect(authUrl);
    }

    // 🆕 YOUTUBE OAUTH URL
    if (platform === 'youtube') {
      const scope = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' ');

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${credentials.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        `&response_type=code` +
        `&access_type=offline` +  // CRITICAL: Gets the refresh token
        `&prompt=consent`;        // CRITICAL: Forces consent screen to ensure refresh token is sent

      logger.info('🔗', `Redirecting to YouTube OAuth for user ${user_id}`);
      return res.redirect(authUrl);
    }

    // ── Other platforms: use buildAuthUrl as before ─────────
    const authUrl = buildAuthUrl(platform, credentials.clientId, redirectUri, state);
    if (!authUrl) return res.redirect(`${getBaseUrl()}/accounts?error=oauth_config_error`);

    logger.info('🔗', `Redirecting to ${platform} OAuth for user ${user_id}`);
    return res.redirect(authUrl);
  } catch (error) {
    logger.error('OAuth initiation failed', error);
    return res.redirect(`${getBaseUrl()}/accounts?error=oauth_init_failed`);
  }
});

// ═════════════════════════════════════════════════════════════
// 🆕 OAUTH CALLBACK — exchanges code for token, saves account,
// returns HTML that postMessage's the opener and closes popup.
// ═════════════════════════════════════════════════════════════
// Find this in backend/routes/accounts.js and replace the callback route

router.get('/oauth/:platform/callback', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state, user_id: directUserId, demo, error } = req.query;

    if (error) {
      return sendPopupMessage(res, platform, false, 'Authorization was denied');
    }

    let userId = directUserId;
    if (state && !userId) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = decoded.user_id;
      } catch {
        return sendPopupMessage(res, platform, false, 'Invalid state');
      }
    }

    if (!userId) {
      return sendPopupMessage(res, platform, false, 'Missing user_id');
    }

    const platformConfig = PLATFORMS.find(p => p.platform === platform);
    if (!platformConfig) {
      return sendPopupMessage(res, platform, false, 'Invalid platform');
    }

    // ── Already connected? ──────────────────────────────────
    const existing = await SocialAccount.findOne({ userId, platform });
    if (existing) {
      return sendPopupMessage(res, platform, true, 'Already connected');
    }

    // ── Demo mode ───────────────────────────────────────────
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
      return sendPopupMessage(res, platform, true);
    }

    // ── 🆕 REAL OAUTH — Facebook / Instagram code exchange ───
    if (platform === 'facebook' || platform === 'instagram') {
      const credentials = OAUTH_CREDENTIALS[platform];
      const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;

      // 1. Exchange code for short-lived token
      const tokenRes = await axios.get(
        'https://graph.facebook.com/v19.0/oauth/access_token',
        {
          params: {
            client_id:     credentials.clientId,
            client_secret: credentials.clientSecret,
            redirect_uri:  redirectUri,
            code
          }
        }
      );

      const shortLivedToken = tokenRes.data.access_token;

      // 2. Save via existing helpers
      try {
        if (platform === 'facebook') {
          await saveFacebookAccount(userId, shortLivedToken);
        } else {
          await saveInstagramAccount(userId, shortLivedToken);
        }
        logger.info('🔗', `${platform} connected via OAuth popup for user ${userId}`);
        return sendPopupMessage(res, platform, true);
      } catch (saveErr) {
        logger.error(`Save ${platform} failed`, saveErr.message);
        return sendPopupMessage(res, platform, false, saveErr.message);
      }
    }

    if (platform === 'youtube') {
      const { google } = require('googleapis');
      const credentials = OAUTH_CREDENTIALS[platform];
      const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;

      try {
        // 1. Initialize OAuth client
        const oauth2Client = new google.auth.OAuth2(
          credentials.clientId,
          credentials.clientSecret,
          redirectUri
        );

        // 2. Exchange code for tokens (access_token & refresh_token)
        const { tokens } = await oauth2Client.getToken(code);

        // 3. Save via helper function
        await saveYouTubeAccount(userId, tokens);

        logger.info('🔗', `youtube connected via OAuth popup for user ${userId}`);
        return sendPopupMessage(res, platform, true);
        
      } catch (saveErr) {
        logger.error(`Save ${platform} failed`, saveErr.message);
        return sendPopupMessage(res, platform, false, saveErr.message);
      }
    }

    // ── Other platforms: log code, redirect (you can extend) ──
    logger.info('🔗', `${platform} OAuth callback — code received for user ${userId}`);
    return sendPopupMessage(res, platform, true);

  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message || 'OAuth failed';
    logger.error(`OAuth callback failed for ${req.params.platform}`, errMsg);
    return sendPopupMessage(res, req.params.platform, false, errMsg);
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
// Pages routes (unchanged)
// ═════════════════════════════════════════════════════════════

router.get('/:accountId/pages', authMiddleware, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });

    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (account.platform !== 'facebook') {
      return res.status(400).json({ message: 'Pages are only available for Facebook accounts' });
    }

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

router.post('/:accountId/pages/:pageId/post', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const page = (account.pages || []).find(p => p.pageId === req.params.pageId);
    if (!page) return res.status(404).json({ message: 'Page not found on this account' });

    const pageAccessToken = decrypt(page.pageAccessToken);

    const fbResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${page.pageId}/feed`,
      { message: message.trim(), access_token: pageAccessToken }
    );

    logger.info('📘', `Posted to Facebook page ${page.pageName} — post ID: ${fbResponse.data.id}`);

    res.json({
      success:  true,
      message:  'Posted to Facebook page successfully',
      pageName: page.pageName,
      pageId:   page.pageId,
      fbPostId: fbResponse.data.id
    });

  } catch (error) {
    const fbError = error.response?.data?.error?.message || error.message;
    logger.error('Failed to post to Facebook page', fbError);
    res.status(500).json({ message: 'Failed to post to Facebook page', error: fbError });
  }
});

router.put('/:accountId/pages/:pageId/select', authMiddleware, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      id:     req.params.accountId,
      userId: req.user.id
    });

    if (!account) return res.status(404).json({ message: 'Account not found' });

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

// ── Legacy Instagram token route (kept for backward compat) ───
router.post('/connect/instagram/token', async (req, res) => {
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

    const saved = await saveInstagramAccount(userId, accessToken);

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

module.exports = router;