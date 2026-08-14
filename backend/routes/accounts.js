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

const getBaseUrl    = () => process.env.FRONTEND_URL;
const getBackendUrl = () => process.env.BACKEND_URL || process.env.FRONTEND_URL; 

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
  connectedAt:    acc.connectedAt ? acc.connectedAt.toISOString() : new Date().toISOString(),
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
    params: { fields: 'id,name,access_token,instagram_business_account,category', access_token: longLivedToken }
  });
  
  const pages = pagesRes.data.data || [];
  logger.info('DEBUG: Meta returned these accounts:', JSON.stringify(pages));

  const pagesWithIG = pages.filter(p => p.instagram_business_account?.id);
  
  if (pagesWithIG.length === 0) {
    throw new Error('No Instagram Business account found.');
  }

  for (const page of pagesWithIG) {
    const igId = page.instagram_business_account.id;
    const pageAccessToken = page.access_token;

    const igRes = await axios.get(`https://graph.facebook.com/${igId}`, {
      params: { fields: 'id,username,name,profile_picture_url,followers_count', access_token: pageAccessToken }
    });
    const ig = igRes.data;

    await SocialAccount.findOneAndUpdate(
      { userId, platform: 'instagram', accountId: ig.id },
      {
        id: uuidv4(),
        userId,
        platform: 'instagram',
        accountName: ig.name || ig.username,
        accountId: ig.id,
        profilePicture: ig.profile_picture_url || '',
        accessToken: encrypt(longLivedToken),
        isActive: true,
        followers: ig.followers_count || 0,
        pages: [{
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: encrypt(pageAccessToken),
          category: page.category || '',
          isSelected: true
        }],
        connectedAt: new Date()
      },
      { upsert: true, new: true }
    );
  }

  logger.info('🔗', `Processed ${pagesWithIG.length} Instagram accounts for user ${userId}`);
};

// ─────────────────────────────────────────────────────────────
// POPUP HTML Handler
// ─────────────────────────────────────────────────────────────
const sendPopupMessage = (res, platform, success, message = '') => {
  const FRONTEND_URL = getBaseUrl();
  const safeMsg = String(message).replace(/[^a-zA-Z0-9 _-]/g, ''); 
  const redirectUrl = `${FRONTEND_URL}/accounts?error=${platform}_failed`;

  return res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Authentication Complete</title></head>
      <body>
        <script>
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              {
                source: 'socialhub_oauth',
                platform: '${platform}',
                success: ${success},
                message: '${safeMsg}'
              },
              '*'
            );
            window.close();
          } else {
            window.location.href = '${redirectUrl}';
          }
        </script>
      </body>
    </html>
  `);
};

const { google } = require('googleapis');

const saveYouTubeAccount = async (userId, tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // 1. Fetch all channels including Brand Accounts
  let channelRes = await youtube.channels.list({ 
    part: 'snippet,contentDetails', 
    mine: true
  });

  // Fallback if managedByMe returns empty structural blocks
  if (!channelRes.data.items || channelRes.data.items.length === 0) {
    channelRes = await youtube.channels.list({ 
      part: 'snippet,contentDetails', 
      mine: true
    });
  }

  console.log('DEBUG: YouTube API returned channels:', JSON.stringify(channelRes.data.items, null, 2));

  if (!channelRes.data.items || channelRes.data.items.length === 0) {
    throw new Error('No YouTube channel found for this Google account.');
  }

  // 2. Iterate through every channel returned in the array safely
  const savedResults = [];
  for (const channel of channelRes.data.items) {
    try {
      const channelId = channel.id;
      const channelName = channel.snippet.title;
      const channelPic = channel.snippet.thumbnails.default.url;

      const existingAccount = await SocialAccount.findOne({ 
        userId, 
        platform: 'youtube', 
        accountId: channelId 
      });

      let finalRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
      if (!finalRefreshToken && existingAccount && existingAccount.refreshToken) {
        finalRefreshToken = existingAccount.refreshToken; 
      }

      const customId = existingAccount && existingAccount.id ? existingAccount.id : uuidv4();

      // 3. Save/Update each channel as a separate document
      const saved = await SocialAccount.findOneAndUpdate(
        { userId, platform: 'youtube', accountId: channelId },
        {
          $set: {
            id: customId,
            userId,
            platform: 'youtube',
            accountId: channelId,
            accountName: channelName, 
            profilePicture: channelPic, 
            accessToken: encrypt(tokens.access_token),
            refreshToken: finalRefreshToken,
            // ✅ CRITICAL FIX: Replaced "undefined" with the 1-hour fallback (3.5M milliseconds)
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3500000), 
            isActive: true,
            updatedAt: new Date()
          },
          $setOnInsert: {
            connectedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      savedResults.push(saved);
    } catch (loopError) {
      logger.error(`Error saving individual YouTube channel: ${channel.snippet?.title}`, loopError);
    }
  }

  logger.info('🔗', `YouTube: Successfully synced ${savedResults.length} channel(s) for user ${userId}`);
  return savedResults;
};

// ═════════════════════════════════════════════════════════════
// ROUTES
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
    const userAccounts = await SocialAccount.find({ userId: req.user.id });

    const result = PLATFORMS.map(platform => {
      const matchingAccounts = userAccounts
        .filter(acc => acc.platform === platform.platform)
        .map(formatAccount);

      return {
        platform:       platform.platform,
        name:           platform.name,
        color:          platform.color,
        oauthSupported: platform.oauthSupported,
        connected:      matchingAccounts.length > 0,
        account:        matchingAccounts[0] || null, 
        accounts:       matchingAccounts 
      };
    });

    res.json(result);
  } catch (error) {
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
      return res.status(401).json({ success: false, message: 'Invalid or expired session token' });
    }

    const saved = await saveFacebookAccount(userId, accessToken);
    res.json({
      success:     true,
      message:     'Facebook connected successfully',
      accountName: saved.accountName,
      pages: (saved.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, category: p.category }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to connect account' });
  }
});

// ═════════════════════════════════════════════════════════════
// OAUTH INITIATOR
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

    const credentials = OAUTH_CREDENTIALS[platform];

    if (!credentials?.clientId) {
      logger.info(`🔗 Demo mode for ${platform}`);
      return res.redirect(`${getBackendUrl()}/api/accounts/oauth/${platform}/callback?user_id=${user_id}&demo=true`);
    }

    const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;
    const state       = Buffer.from(JSON.stringify({ user_id, platform })).toString('base64');

    if (platform === 'facebook' || platform === 'instagram') {
      const scope = platform === 'facebook'
        ? 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts'
        // ✨ THE FIX: Added pages_manage_posts to the Instagram scope so the token isn't Read-Only!
        : 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management';

      const authUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${credentials.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        `&response_type=code` +
        `&auth_type=rerequest`;

      return res.redirect(authUrl);
    }

    if (platform === 'youtube') {
      const scope = [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' ');

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${credentials.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        `&response_type=code` +
        `&access_type=offline` +  
        `&prompt=consent select_account`; 

      return res.redirect(authUrl);
    }

    if (platform === 'twitter' || platform === 'x') {
      const scope = ['tweet.read', 'tweet.write', 'users.read', 'offline.access','media.write'].join(' ');

      const authUrl =
        `https://x.com/i/oauth2/authorize?` + 
        `client_id=${credentials.clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${state}` +
        `&response_type=code` +
        `&code_challenge=${state}` +       
        `&code_challenge_method=plain`;    

      logger.info('🔗', `Redirecting popup to clean X.com OAuth gateway for user ${user_id}`);
      return res.redirect(authUrl);
    }

    const authUrl = buildAuthUrl(platform, credentials.clientId, redirectUri, state);
    if (!authUrl) return res.redirect(`${getBaseUrl()}/accounts?error=oauth_config_error`);
    return res.redirect(authUrl);
  } catch (error) {
    console.log(" account error",error);
    return res.redirect(`${getBaseUrl()}/accounts?error=oauth_init_failed`);
  }
});

// ═════════════════════════════════════════════════════════════
// OAUTH CALLBACK ROUTE
// ═════════════════════════════════════════════════════════════
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

    if (!userId) return sendPopupMessage(res, platform, false, 'Missing user_id');

    if (demo === 'true' || !code) {
      const account = new SocialAccount({
        id:             uuidv4(),
        userId,
        platform,
        accountName:    `Demo Account`,
        accountId:      `demo_${platform}_${userId.substring(0, 8)}`,
        profilePicture: `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`,
        accessToken:    encrypt(`demo_token`),
        isActive:       true,
        followers:      5000,
        connectedAt:    new Date()
      });
      await account.save();
      return sendPopupMessage(res, platform, true);
    }

    if (platform === 'facebook' || platform === 'instagram') {
      const credentials = OAUTH_CREDENTIALS[platform];
      const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;

      const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
        params: { client_id: credentials.clientId, client_secret: credentials.clientSecret, redirect_uri: redirectUri, code }
      });

      if (platform === 'facebook') {
        await saveFacebookAccount(userId, tokenRes.data.access_token);
      } else {
        await saveInstagramAccount(userId, tokenRes.data.access_token);
      }
      return sendPopupMessage(res, platform, true);
    }

    if (platform === 'youtube') {
      const credentials = OAUTH_CREDENTIALS[platform];
      const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;

      const oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        redirectUri
      );

      const { tokens } = await oauth2Client.getToken(code);
      
      await saveYouTubeAccount(userId, tokens);
      
      return sendPopupMessage(res, platform, true);
    }

    if (platform === 'twitter' || platform === 'x') {
      const credentials = OAUTH_CREDENTIALS.twitter; 
      const redirectUri = `${getBackendUrl()}/api/accounts/oauth/${platform}/callback`;

      const basicAuthHeader = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

      const tokenRes = await axios.post(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code_verifier: state 
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuthHeader}`
          }
        }
      );

      const { access_token, refresh_token } = tokenRes.data;

      const userRes = await axios.get('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { 'user.fields': 'profile_image_url,public_metrics' }
      });

      const twitterUser = userRes.data?.data;
      if (!twitterUser) throw new Error('Could not pull user identity stats from Twitter.');

      await SocialAccount.findOneAndUpdate(
        { userId, platform: 'twitter', accountId: twitterUser.id },
        {
          id:             uuidv4(),
          userId,
          platform:       'twitter',
          accountName:    twitterUser.name || twitterUser.username,
          accountId:      twitterUser.id,
          profilePicture: twitterUser.profile_image_url || '',
          followers:      twitterUser.public_metrics?.followers_count || 0,
          accessToken:    encrypt(access_token),
          refreshToken:   refresh_token ? encrypt(refresh_token) : undefined,
          isActive:       true,
          connectedAt:    new Date()
        },
        { upsert: true, new: true }
      );

      return sendPopupMessage(res, platform, true);
    }

    logger.info('🔗', `${platform} OAuth callback code unhandled falling back`);
    return sendPopupMessage(res, platform, true);

  } catch (err) {
    const errMsg = err.response?.data?.error_description || err.response?.data?.error?.message || err.message || 'OAuth failed';
    logger.error(`OAuth callback wrapper failure:`, errMsg);
    return sendPopupMessage(res, req.params.platform, false, errMsg);
  }
});

router.delete('/:accountId', authMiddleware, async (req, res) => {
  try {
    const result = await SocialAccount.deleteOne({ id: req.params.accountId, userId: req.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ detail: 'Account not found' });
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to disconnect account' });
  }
});

router.get('/:accountId/pages', authMiddleware, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ id: req.params.accountId, userId: req.user.id });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const pages = (account.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, category: p.category, isSelected: p.isSelected }));
    res.json({ pages });
  } catch (error) { res.status(500).json({ message: 'Failed to get pages' }); }
});

module.exports = router;