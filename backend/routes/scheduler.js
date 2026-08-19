const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const User = require('../models/User'); // ✨ ADDED: User Schema to fetch publisher info
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const { publishPostToPlatforms } = require('../services/publishService');
const { encrypt, decrypt } = require('../utils/encryption');
const axios = require('axios');
const sharp = require('sharp');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function getSafeShortFilename(originalname) {
  // ✨ FIX: Strip Windows "C:\fakepath\" backslashes before processing the filename
  const normalizedName = originalname.replace(/\\/g, '/').split('/').pop();
  const ext = path.extname(normalizedName);
  let baseName = path.basename(normalizedName, ext);
  baseName = baseName.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_');
  if (baseName.length > 20) baseName = baseName.substring(0, 20);
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  return `${uniqueSuffix}-${baseName}${ext}`;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadDir); },
  filename: function (req, file, cb) { cb(null, getSafeShortFilename(file.originalname)); }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/webm', 'video/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'), false);
  }
});

router.post('/upload', authMiddleware, (req, res) => {
  const uploadHandler = upload.single('file');
  uploadHandler(req, res, function (err) {
    if (err instanceof multer.MulterError) return res.status(400).json({ detail: `Upload Error: ${err.message}` });
    else if (err) return res.status(400).json({ detail: err.message });
    if (!req.file) return res.status(400).json({ detail: 'No file uploaded' });

    try {
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      const isVideo = req.file.mimetype.startsWith('video');
      res.json({
        url: fileUrl, filename: req.file.filename, mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        mimetype: req.file.mimetype, size: req.file.size
      });
    } catch (error) {
      res.status(500).json({ detail: 'Failed to process file metadata' });
    }
  });
});

// ✨ FORMAT POST: Now accepts dynamic publisherInfo from the DB
const formatPost = (post, accounts = [], publisherInfo = null) => ({
  id: post.id, userId: post.userId, content: post.content, mediaUrls: post.mediaUrls || [],
  mediaFormats: post.mediaFormats || {}, accountIds: post.accountIds || [], platforms: post.platforms || [],
  selectedPages: post.selectedPages || {}, // <--- ADD THIS LINE HERE
  status: post.status, scheduledAt: post.scheduledAt?.toISOString() || null, publishedAt: post.publishedAt?.toISOString() || null,
  
  publisherInfo: publisherInfo, // ✨ Attached publisher data from User schema
  
  notSaved: post.notSaved || false, 
  platformResults: (post.platformResults || []).map(r => ({
    platform: r.platform, accountId: r.accountId, platformPostId: r.platformPostId || null, status: r.status, error: r.error || null,
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    attemptedAt: r.attemptedAt ? new Date(r.attemptedAt).toISOString() : null, 
    likes: r.likes || null, comments: r.comments || null, views: r.views || null, 
    pageName: r.pageName || null,
    pages: (r.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, postId: p.postId || null, status: p.status, error: p.error || null }))
  })),
  createdAt: post.createdAt?.toISOString ? post.createdAt.toISOString() : post.createdAt,
  updatedAt: post.updatedAt?.toISOString ? post.updatedAt.toISOString() : post.updatedAt,
  accounts, youtubeTitle: post.youtubeTitle || '', youtubeTags: Array.isArray(post.youtubeTags) ? post.youtubeTags : [],
  youtubeCategory: post.youtubeCategory || '22', youtubePrivacy: post.youtubePrivacy || 'public',
  youtubeMadeForKids: post.youtubeMadeForKids || false, youtubeThumbnail: post.youtubeThumbnail || null
});

const getAccountsForPublish = async (accountIds, selectedPageIds = {}) => {
  const accounts = [];
  
  // Make sure we have a clean object
  const safeSelectedPages = selectedPageIds instanceof Map 
    ? Object.fromEntries(selectedPageIds) 
    : (selectedPageIds?.toObject ? selectedPageIds.toObject() : selectedPageIds);

  for (const accId of accountIds) {
    const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
    if (!acc) continue;
    
    let accObj = acc.toObject ? acc.toObject() : acc;
    
    if (accObj.platform === 'facebook' && accObj.pages?.length) {
      // Force accId to string to guarantee we find the array
      const chosenIds = safeSelectedPages[String(accId)] || [];
      
      accObj.pages = accObj.pages.map(p => ({ 
        ...p, 
        // ✨ THE FIX: Force both IDs to Strings so they match perfectly!
        isSelected: chosenIds.some(id => String(id) === String(p.pageId))
      }));
    } else if (accObj.pages?.length) {
      accObj.pages = accObj.pages.map(p => ({ ...p, isSelected: true }));
    }
    
    accounts.push(accObj);
  }
  
  accounts.sort((a, b) => {
    if (a.platform === 'twitter' && b.platform !== 'twitter') return 1;  
    if (a.platform !== 'twitter' && b.platform === 'twitter') return -1; 
    return 0; 
  });

  return accounts;
};

const safeAccount = (acc) => ({
  id: acc.id, accountId: acc.accountId, accountName: acc.accountName, profilePicture: acc.profilePicture, platform: acc.platform,
  pages: (acc.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, category: p.category, isSelected: p.isSelected }))
});

const getPageTokenForPost = (account, platformPostId) => {
  const pageId = platformPostId?.split('_')[0];
  if (!pageId) return null;
  const page = (account.pages || []).find(p => p.pageId === pageId);
  return page?.pageAccessToken ? decrypt(page.pageAccessToken) : null;
};

const withAttemptTimestamp = (platformResults = []) => {
  const now = new Date();
  return platformResults.map(r => ({ ...r, attemptedAt: r.attemptedAt || now }));
};

// ✨ THE CRON GUARD: Prevents the 1-minute timer from overlapping itself!
 let isCronRunning = false; 

const processScheduledPosts = async () => {
  // If the server is still busy uploading a heavy video, skip this minute entirely.

  if (isCronRunning) return; 
  
  isCronRunning = true; // Lock the gate
  
  try {
    const now = new Date();
    
    while (true) {
      // 🔒 ATOMIC LOCK: Instantly change to 'published' so no other system can touch it
      const postDoc = await Post.findOneAndUpdate(
        { status: 'scheduled', scheduledAt: { $lte: now } },
        { $set: { status: 'published', updatedAt: new Date() } },
        { new: true } 
      );

      // If no more scheduled posts are found, break the loop
      if (!postDoc) break; 

      try {
        // Strip Mongoose wrappers so it behaves perfectly for the publisher
        const post = postDoc.toObject();

        let safeSelectedPages = {};
        if (post.selectedPages && post.selectedPages instanceof Map) {
          safeSelectedPages = Object.fromEntries(post.selectedPages);
        } else if (post.selectedPages) {
          safeSelectedPages = JSON.parse(JSON.stringify(post.selectedPages));
        }

        // Pass the perfectly cleaned universal object down to the accounts function
        const accountsFull = await getAccountsForPublish(post.accountIds || [], safeSelectedPages);
        const result = await publishPostToPlatforms(post, accountsFull);
        
        // Update the database with the final platform metadata (links, timestamps)
        await Post.updateOne({ id: post.id }, { 
          status:          result.status, // Remains 'published', or updates to 'failed' if all platforms crashed
          platformResults: withAttemptTimestamp(result.platformResults),
          publishedAt:     new Date()
        });
        
      } catch (uploadError) {
        logger.error(`Scheduled upload failed for post ${postDoc.id}:`, uploadError);
        // Rollback to 'failed' if a catastrophic crash happens during upload
        await Post.updateOne({ id: postDoc.id }, { 
          status: 'failed', 
          error:  uploadError.message || 'Scheduled publish failed'
        });
      }
    }
  } catch (error) {
    logger.error('Error processing scheduled posts', error);
  } finally {
    // ✨ UNLOCK THE GATE: The uploads are 100% finished, the next minute can run normally
    isCronRunning = false;
  }
};

// Run scheduled posts processor every minute
// setInterval(processScheduledPosts, 60000);

const STALE_PUBLISHING_MINUTES = 10;
const recoverStuckPosts = async () => {
  try {
    const staleCutoff = new Date(Date.now() - STALE_PUBLISHING_MINUTES * 60000);
    const stuckPosts = await Post.find({ status: 'publishing', updatedAt: { $lte: staleCutoff } });
    for (const post of stuckPosts) {
      await Post.updateOne({ id: post.id }, { status: 'failed' });
    }
  } catch (error) {
    logger.error('Error recovering stuck posts', error);
  }
};
setInterval(recoverStuckPosts, 5 * 60000);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id };
    const conditions = [];

    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    if (req.query.platform && req.query.platform !== 'all') query.platforms = req.query.platform;
    if (req.query.channel && req.query.channel !== 'all') {
      conditions.push({ $or: [{ accountIds: req.query.channel }, { 'platformResults.pageId': req.query.channel }, { 'platformResults.accountId': req.query.channel }] });
    }
    if (req.query.search && req.query.search.trim() !== '') {
      const searchRegex = new RegExp(req.query.search, 'i');
      conditions.push({ $or: [{ content: searchRegex }, { youtubeTitle: searchRegex }, { 'platformResults.pageName': searchRegex }] });
    }
    if (conditions.length > 0) query.$and = conditions;

    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const allAccounts = await SocialAccount.find({ userId: req.user.id, isActive: true });
    
    // ✨ FIX: Lookup the user from the database to attach their info to the posts
    const currentUser = await User.findOne({ id: req.user.id }).select('name email');
    const publisherInfo = {
      name: currentUser ? currentUser.name : req.user.name,
      email: currentUser ? currentUser.email : req.user.email
    };

    let livePlatformPosts = [];

    if (page === 1 && !req.query.search) {
      let fbAccounts = allAccounts.filter(a => a.platform === 'facebook');
      let igAccounts = allAccounts.filter(a => a.platform === 'instagram');
      let ytAccounts = allAccounts.filter(a => a.platform === 'youtube');
      let twAccounts = allAccounts.filter(a => a.platform === 'twitter'); 

      const reqPlatform = req.query.platform;
      const reqChannel = req.query.channel;

      if (reqPlatform && reqPlatform !== 'all') {
        if (reqPlatform !== 'facebook') fbAccounts = [];
        if (reqPlatform !== 'instagram') igAccounts = [];
        if (reqPlatform !== 'youtube') ytAccounts = [];
        if (reqPlatform !== 'twitter') twAccounts = []; 
      }
      if (reqChannel && reqChannel !== 'all') {
        fbAccounts = fbAccounts.filter(a => a.id === reqChannel || a.accountId === reqChannel || a.pages?.some(p => p.pageId === reqChannel));
        igAccounts = igAccounts.filter(a => a.id === reqChannel || a.accountId === reqChannel || a.pages?.some(p => p.pageId === reqChannel));
        ytAccounts = ytAccounts.filter(a => a.id === reqChannel || a.accountId === reqChannel);
        twAccounts = twAccounts.filter(a => a.id === reqChannel || a.accountId === reqChannel); 
      }

      const fbPostMetaMap = {};
      for (const account of fbAccounts) {
        for (const page of account.pages || []) {
          if (!page.pageAccessToken) continue;
          try {
            const pageToken = decrypt(page.pageAccessToken);
            const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${page.pageId}/feed`, { params: { fields: 'id,message,story,created_time,full_picture,permalink_url', limit: 5, access_token: pageToken } });
            for (const fbPost of fbRes.data?.data || []) { fbPostMetaMap[fbPost.id] = { accountId: account.id, accountName: account.accountName, pageId: page.pageId, pageName: page.pageName, content: fbPost.message || fbPost.story || '', mediaUrls: fbPost.full_picture ? [fbPost.full_picture] : [], createdTime: fbPost.created_time, permalinkUrl: fbPost.permalink_url || null }; }
          } catch (err) {}
        }
      }

      const igPostMetaMap = {};
      for (const account of igAccounts) {
        const page = (account.pages || [])[0];
        if (!page?.pageAccessToken) continue;
        try {
          const pageToken = decrypt(page.pageAccessToken);
          const igRes = await axios.get(`https://graph.facebook.com/v19.0/${account.accountId}/media`, { params: { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: 5, access_token: pageToken } });
          for (const igPost of igRes.data?.data || []) { igPostMetaMap[igPost.id] = { accountId: account.id, accountName: account.accountName, igUsername: account.igUsername || '', pageId: page.pageId, pageName: page.pageName, content: igPost.caption || '', mediaType: igPost.media_type || 'IMAGE', mediaUrls: igPost.media_url ? [igPost.media_url] : [], thumbnailUrl: igPost.thumbnail_url || null, createdTime: igPost.timestamp, permalinkUrl: igPost.permalink || null }; }
        } catch (err) {}
      }

      const ytPostMetaMap = {};
      if (ytAccounts.length > 0) {
        const { google } = require('googleapis');
        for (const account of ytAccounts) {
          try {
            const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
            oauth2Client.setCredentials({ access_token: decrypt(account.accessToken), refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined });
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const searchRes = await youtube.search.list({ part: 'snippet', forMine: true, type: 'video', order: 'date' });
            const videoIds = searchRes.data.items.map(item => item.id.videoId).filter(Boolean);
            if (videoIds.length > 0) {
              const videoRes = await youtube.videos.list({ part: 'snippet', id: videoIds.join(',') });
              for (const ytPost of videoRes.data.items || []) { ytPostMetaMap[ytPost.id] = { accountId: account.id, accountName: account.name || account.accountName, youtubeTitle: ytPost.snippet.title, content: ytPost.snippet.description || '', mediaUrls: ytPost.snippet.thumbnails?.high?.url ? [ytPost.snippet.thumbnails.high.url] : [], mediaType: 'VIDEO', createdTime: ytPost.snippet.publishedAt, permalinkUrl: `https://www.youtube.com/watch?v=${ytPost.id}` }; }
            }
          } catch (err) {}
        }
      }

      const twPostMetaMap = {};
      for (const account of twAccounts) {
        try {
          const accessToken = decrypt(account.accessToken);
          const twRes = await axios.get(`https://api.x.com/2/users/${account.accountId}/tweets`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { max_results: 5, 'tweet.fields': 'created_at,public_metrics,attachments', expansions: 'attachments.media_keys', 'media.fields': 'url,preview_image_url,type' },
            timeout: 15000
          });
          const mediaMap = {};
          (twRes.data?.includes?.media || []).forEach(m => { mediaMap[m.media_key] = m; });
          for (const tweet of twRes.data?.data || []) {
            const mediaUrls = (tweet.attachments?.media_keys || []).map(k => mediaMap[k]?.url || mediaMap[k]?.preview_image_url).filter(Boolean);
            twPostMetaMap[tweet.id] = { accountId: account.id, accountName: account.accountName, content: tweet.text || '', mediaUrls, createdTime: tweet.created_at, permalinkUrl: `https://x.com/i/status/${tweet.id}`, likes: tweet.public_metrics?.like_count ?? 0, comments: tweet.public_metrics?.reply_count ?? 0, views: tweet.public_metrics?.impression_count ?? 0 };
          }
        } catch (err) {}
      }

      const distinctPlatformPostIds = await Post.distinct('platformResults.platformPostId', { userId: req.user.id });
      const dbPlatformPostIds = new Set(distinctPlatformPostIds);

      const statusFilterAllowsLive = !req.query.status || req.query.status === 'all' || req.query.status === 'published';

      if (statusFilterAllowsLive) {
        for (const [fbPostId, meta] of Object.entries(fbPostMetaMap)) {
          if (dbPlatformPostIds.has(fbPostId) || !meta.content.trim()) continue;
          const postTimeIso = new Date(meta.createdTime).toISOString();
          livePlatformPosts.push({
            id: `live-facebook-${fbPostId}`, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaFormats: {},
            accountIds: [meta.accountId], platforms: ['facebook'], status: 'published', scheduledAt: null, publishedAt: postTimeIso,
            notSaved: true, publisherInfo,
            platformResults: [{
              platform: 'facebook', accountId: meta.accountId, platformPostId: fbPostId, status: 'published', error: null,
              publishedAt: postTimeIso, attemptedAt: postTimeIso, pageName: meta.pageName, permalinkUrl: meta.permalinkUrl,
              likes: null, comments: null, views: null, pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: fbPostId, status: 'published', error: null }]
            }],
            createdAt: postTimeIso, updatedAt: postTimeIso, accounts: [{ id: meta.accountId, accountName: meta.accountName, platform: 'facebook', pages: [{ pageId: meta.pageId, pageName: meta.pageName }] }]
          });
        }
        for (const [igPostId, meta] of Object.entries(igPostMetaMap)) {
          if (dbPlatformPostIds.has(igPostId) || (!meta.content.trim() && !meta.mediaUrls.length)) continue;
          const postTimeIso = new Date(meta.createdTime).toISOString();
          livePlatformPosts.push({
            id: `live-instagram-${igPostId}`, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaFormats: {},
            accountIds: [meta.accountId], platforms: ['instagram'], status: 'published', scheduledAt: null, publishedAt: postTimeIso,
            notSaved: true, publisherInfo,
            platformResults: [{
              platform: 'instagram', accountId: meta.accountId, platformPostId: igPostId, status: 'published', error: null,
              publishedAt: postTimeIso, attemptedAt: postTimeIso, pageName: meta.pageName, permalinkUrl: meta.permalinkUrl,
              likes: null, comments: null, views: null, pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: igPostId, status: 'published', error: null }]
            }],
            createdAt: postTimeIso, updatedAt: postTimeIso, accounts: [{ id: meta.accountId, accountName: meta.accountName, platform: 'instagram', pages: [{ pageId: meta.pageId, pageName: meta.pageName }] }]
          });
        }
        for (const [ytPostId, meta] of Object.entries(ytPostMetaMap)) {
          if (dbPlatformPostIds.has(ytPostId)) continue;
          const postTimeIso = new Date(meta.createdTime).toISOString();
          livePlatformPosts.push({
            id: `live-youtube-${ytPostId}`, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaFormats: {},
            accountIds: [meta.accountId], platforms: ['youtube'], status: 'published', scheduledAt: null, publishedAt: postTimeIso,
            notSaved: true, publisherInfo,
            platformResults: [{
              platform: 'youtube', accountId: meta.accountId, platformPostId: ytPostId, status: 'published', error: null,
              publishedAt: postTimeIso, attemptedAt: postTimeIso, pageName: meta.accountName, permalinkUrl: meta.permalinkUrl,
              likes: null, comments: null, views: null, pages: []
            }],
            createdAt: postTimeIso, updatedAt: postTimeIso, accounts: [{ id: meta.accountId, accountName: meta.accountName, platform: 'youtube', pages: [] }],
            youtubeTitle: meta.youtubeTitle || ''
          });
        }
        for (const [twPostId, meta] of Object.entries(twPostMetaMap)) {
          if (dbPlatformPostIds.has(twPostId) || (!meta.content.trim() && !meta.mediaUrls.length)) continue;
          const postTimeIso = new Date(meta.createdTime).toISOString();
          livePlatformPosts.push({
            id: `live-twitter-${twPostId}`, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaFormats: {},
            accountIds: [meta.accountId], platforms: ['twitter'], status: 'published', scheduledAt: null, publishedAt: postTimeIso,
            notSaved: true, publisherInfo,
            platformResults: [{
              platform: 'twitter', accountId: meta.accountId, platformPostId: twPostId, status: 'published', error: null,
              publishedAt: postTimeIso, attemptedAt: postTimeIso, pageName: meta.accountName, permalinkUrl: meta.permalinkUrl,
              likes: meta.likes, comments: meta.comments, views: meta.views, pages: []
            }],
            createdAt: postTimeIso, updatedAt: postTimeIso, accounts: [{ id: meta.accountId, accountName: meta.accountName, platform: 'twitter', pages: [] }]
          });
        }
      }

      livePlatformPosts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    }

    const totalPosts = await Post.countDocuments(query);
    const paginatedPosts = await Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-_id -__v');

    const liveStatsMap = {};
    const statPromises = [];
    const ytBatchIds = [];
    let ytClientAccount = null;

    for (const post of paginatedPosts) {
      for (const r of post.platformResults || []) {
        if (!r.platformPostId || r.status !== 'published') continue;
        const account = allAccounts.find(a => a.id === r.accountId);
        if (!account) continue;

        if (r.platform === 'facebook') {
          const pageToken = getPageTokenForPost(account, r.platformPostId);
          if (pageToken) statPromises.push(axios.get(`https://graph.facebook.com/v19.0/${r.platformPostId}?fields=likes.summary(true),comments.summary(true)&access_token=${pageToken}`).then(res => { liveStatsMap[r.platformPostId] = { likes: res.data.likes?.summary?.total_count || 0, comments: res.data.comments?.summary?.total_count || 0 }; }).catch(() => {}));
        } else if (r.platform === 'instagram') {
          const pageToken = getPageTokenForPost(account, r.platformPostId) || (account.pages?.[0]?.pageAccessToken ? decrypt(account.pages[0].pageAccessToken) : null);
          if (pageToken) statPromises.push(axios.get(`https://graph.facebook.com/v19.0/${r.platformPostId}?fields=like_count,comments_count&access_token=${pageToken}`).then(res => { liveStatsMap[r.platformPostId] = { likes: res.data.like_count || 0, comments: res.data.comments_count || 0 }; }).catch(() => {}));
        } else if (r.platform === 'youtube') {
          ytBatchIds.push(r.platformPostId);
          ytClientAccount = ytClientAccount || account;
        } else if (r.platform === 'twitter') {
          try {
            const accessToken = decrypt(account.accessToken);
            statPromises.push(axios.get(`https://api.x.com/2/tweets/${r.platformPostId}`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { 'tweet.fields': 'public_metrics' }, timeout: 15000 }).then(res => { const m = res.data?.data?.public_metrics; if (m) liveStatsMap[r.platformPostId] = { likes: m.like_count || 0, comments: m.reply_count || 0, views: m.impression_count || 0 }; }).catch(() => {}));
          } catch (err) {}
        }
      }
    }

    if (ytBatchIds.length > 0 && ytClientAccount) {
      try {
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
        oauth2Client.setCredentials({ access_token: decrypt(ytClientAccount.accessToken), refresh_token: ytClientAccount.refreshToken ? decrypt(ytClientAccount.refreshToken) : undefined });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        statPromises.push(youtube.videos.list({ part: 'statistics', id: ytBatchIds.join(',') }).then(res => { for (const item of res.data.items || []) { liveStatsMap[item.id] = { likes: Number(item.statistics?.likeCount) || 0, comments: Number(item.statistics?.commentCount) || 0, views: Number(item.statistics?.viewCount) || 0 }; } }).catch(() => {}));
      } catch (err) {}
    }

    await Promise.all(statPromises);

    const postsResult = [];
    for (const post of paginatedPosts) {
      let dbModified = false;
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = allAccounts.find(a => a.id === accId);
        if (acc) accounts.push(safeAccount(acc));
      }

      const enrichedResults = (post.platformResults || []).map(r => {
        const liveStats = liveStatsMap[r.platformPostId];
        if (liveStats) { r.likes = liveStats.likes; r.comments = liveStats.comments; if (liveStats.views !== undefined) r.views = liveStats.views; dbModified = true; }
        const account = allAccounts.find(a => a.id === r.accountId);
        const pageName = r.pages?.[0]?.pageName || r.pageName || account?.accountName || null;
        return { platform: r.platform, accountId: r.accountId, platformPostId: r.platformPostId || null, status: r.status, error: r.error || null, publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null, attemptedAt: r.attemptedAt ? new Date(r.attemptedAt).toISOString() : null, pageName: pageName, permalinkUrl: r.permalinkUrl || (r.platform === 'twitter' ? `https://x.com/i/status/${r.platformPostId}` : null), likes: r.likes ?? null, comments: r.comments ?? null, views: r.views ?? null, pages: (r.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, postId: p.postId || null, status: p.status, error: p.error || null })) };
      });

      if (dbModified) Post.updateOne({ id: post.id }, { platformResults: post.platformResults }).catch(()=>{});
      
      // ✨ FIX: Map the publisher info straight into the formatted result
      postsResult.push({ ...formatPost(post, accounts, publisherInfo), platformResults: enrichedResults });
    }

    const finalPosts = (page === 1 && !req.query.search) ? [...postsResult, ...livePlatformPosts] : postsResult;
    res.json({ posts: finalPosts, pagination: { total: totalPosts, page, limit, totalPages: Math.ceil(totalPosts / limit) } });
  } catch (error) { res.status(500).json({ detail: 'Failed to get posts' }); }
});

router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id }).select('-_id -__v');
    if (!post) return res.status(404).json({ detail: 'Post not found' });
    const accounts = [];
    for (const accId of post.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
      if (acc) accounts.push(safeAccount(acc));
    }
    const currentUser = await User.findOne({ id: req.user.id });
    const publisherInfo = { name: currentUser?.name || req.user.name, email: currentUser?.email || req.user.email };
    const baseFormattedPost = formatPost(post, accounts, publisherInfo);
    const isYoutubePost = post.platforms?.includes('youtube');
    const dynamicThumbnail = post.youtubeThumbnail || (isYoutubePost ? post.mediaUrls?.[0] : null);
    res.json({ ...baseFormattedPost, youtubeTitle: post.youtubeTitle || '', youtubeTags: Array.isArray(post.youtubeTags) ? post.youtubeTags : [], youtubeCategory: post.youtubeCategory || '22', youtubePrivacy: post.youtubePrivacy || 'public', youtubeMadeForKids: post.youtubeMadeForKids || false, youtubeThumbnail: dynamicThumbnail });
  } catch (error) { res.status(500).json({ detail: 'Failed to get post' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content, accountIds, mediaUrls = [], mediaFormats = {}, status = 'draft', scheduledAt, selectedPages = {}, youtubeTitle, youtubeTags = [], youtubeCategory = '22', youtubePrivacy = 'public', youtubeMadeForKids = false, youtubeThumbnail } = req.body;
    
    if (!content && !youtubeTitle) return res.status(400).json({ detail: 'Content or Title is required' });
    if (!accountIds || accountIds.length === 0) return res.status(400).json({ detail: 'At least one account must be selected' });

    const tenSecondsAgo = new Date(Date.now() - 10000);
    const duplicatePost = await Post.findOne({ userId: req.user.id, content: content?.trim(), createdAt: { $gte: tenSecondsAgo } });

    if (duplicatePost) return res.status(409).json({ detail: 'Duplicate post detected. Please wait a moment before posting again.' });

    const platforms = [];
    for (const accId of accountIds) {
      const acc = await SocialAccount.findOne({ id: accId }).select('platform');
      if (acc) platforms.push(acc.platform);
    }

    const hasYoutube = platforms.includes('youtube');
    if (hasYoutube && (!youtubeTitle || !youtubeTitle.trim())) return res.status(400).json({ detail: 'YouTube video title is required' });
    if (hasYoutube && !['public', 'unlisted', 'private'].includes(youtubePrivacy)) return res.status(400).json({ detail: 'Invalid YouTube privacy value' });

    const postId = uuidv4();
    const now = new Date();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    let postStatus = status;
    if (scheduledDate && scheduledDate > now) postStatus = 'scheduled';
    else if (status === 'published' || (scheduledDate && scheduledDate <= now)) postStatus = 'publishing';

    const post = new Post({
      id: postId, userId: req.user.id, content, mediaUrls, mediaFormats, accountIds, platforms, selectedPages, status: postStatus,
      scheduledAt: scheduledDate, platformResults: [], createdAt: now, updatedAt: now,
      youtubeTitle: youtubeTitle || null, youtubeTags: Array.isArray(youtubeTags) ? youtubeTags : [], youtubeCategory: youtubeCategory || '22',
      youtubePrivacy: youtubePrivacy || 'public', youtubeMadeForKids: Boolean(youtubeMadeForKids), youtubeThumbnail: youtubeThumbnail || null
    });
    await post.save();

    if (postStatus === 'publishing') {
      try {
        const accountsFull = await getAccountsForPublish(accountIds, selectedPages);
        console.log("accountsFull",accountsFull)
        const result = await publishPostToPlatforms(post, accountsFull);
        post.status = result.status;
        post.platformResults = withAttemptTimestamp(result.platformResults);
        post.publishedAt = new Date();
        await Post.updateOne({ id: postId }, { status: result.status, platformResults: post.platformResults, publishedAt: post.publishedAt });
      } catch (publishError) {
        post.status = 'failed';
        await Post.updateOne({ id: postId }, { status: 'failed' });
      }
    }
    
    const currentUser = await User.findOne({ id: req.user.id });
    const publisherInfo = { name: currentUser?.name || req.user.name, email: currentUser?.email || req.user.email };
    res.status(201).json(formatPost(post, [], publisherInfo));
  } catch (error) { res.status(500).json({ detail: 'Failed to create post' }); }
});

router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });
    const deleteFromPlatform = req.query.deleteFromPlatform !== 'false';
    const platformErrors = [];
    if (deleteFromPlatform && post.status === 'published') {
      for (const result of post.platformResults || []) {
        if (result.status !== 'published' || !result.platformPostId) continue;
        try {
          const account = await SocialAccount.findOne({ id: result.accountId });
          if (!account) continue;
          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) continue;
            await axios.delete(`https://graph.facebook.com/v19.0/${result.platformPostId}`, { params: { access_token: pageToken } });
          }
          if (result.platform === 'instagram') {
            platformErrors.push({ platform: 'instagram', error: 'Meta does not allow apps to delete Instagram posts automatically.' });
            continue; 
          }
          if (result.platform === 'youtube') {
            const { google } = require('googleapis');
            const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
            oauth2Client.setCredentials({ access_token: decrypt(account.accessToken), refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined });
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            await youtube.videos.delete({ id: result.platformPostId });
            continue;
          }
        } catch (err) { platformErrors.push({ platform: result.platform, error: err.message }); }
      }
    }
    await Post.deleteOne({ id: req.params.postId, userId: req.user.id });
    res.json({ message: 'Post deleted from your dashboard.', platformErrors: platformErrors.length > 0 ? platformErrors : undefined });
  } catch (error) { res.status(500).json({ detail: 'Failed to delete post' }); }
});

router.put('/:postId', authMiddleware, async (req, res) => {
  try {
    const { content, mediaUrls, mediaFormats, accountIds, selectedPages, youtubeTitle, youtubeTags, youtubeCategory, youtubePrivacy, youtubeMadeForKids, youtubeThumbnail, scheduledAt, status } = req.body;
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const historicalMap = {};
    if (post.platformResults && post.platformResults.length > 0) {
      post.platformResults.forEach(r => { historicalMap[r.platform.toLowerCase()] = { platformPostId: r.platformPostId, publishedAt: r.publishedAt, permalinkUrl: r.permalinkUrl, pages: r.pages || [] }; });
    }

    post.content = content ?? post.content; post.mediaUrls = mediaUrls ?? post.mediaUrls; post.mediaFormats = mediaFormats ?? post.mediaFormats; post.accountIds = accountIds ?? post.accountIds; post.selectedPages = selectedPages ?? post.selectedPages;
    if (scheduledAt !== undefined) post.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    const now = new Date();
    let targetStatus = status ?? post.status;
    if (targetStatus === 'scheduled' && post.scheduledAt && post.scheduledAt > now) { post.status = 'scheduled'; } 
    else if (targetStatus === 'published' || (targetStatus === 'scheduled' && post.scheduledAt && post.scheduledAt <= now)) {
      if (!post.platformResults || post.platformResults.length === 0) post.status = 'publishing'; else post.status = 'published';
    } else { post.status = targetStatus; }

    if (youtubeTitle !== undefined) post.youtubeTitle = youtubeTitle; if (youtubeTags !== undefined) post.youtubeTags = Array.isArray(youtubeTags) ? youtubeTags : []; if (youtubeCategory !== undefined) post.youtubeCategory = youtubeCategory; if (youtubePrivacy !== undefined) post.youtubePrivacy = youtubePrivacy; if (youtubeMadeForKids !== undefined) post.youtubeMadeForKids = youtubeMadeForKids; if (youtubeThumbnail !== undefined) post.youtubeThumbnail = youtubeThumbnail;
    post.updatedAt = new Date();
    await post.save();

    if (post.status === 'publishing') {
      try {
        const accountsFull = await getAccountsForPublish(post.accountIds || [], post.selectedPages || {});
        const result = await publishPostToPlatforms(post, accountsFull);
        post.status = result.status; post.platformResults = withAttemptTimestamp(result.platformResults);
        post.publishedAt = new Date();
        await post.save();
      } catch (publishError) {
        post.status = 'failed'; await post.save();
      }
    }
    else if (post.status === 'published' && post.platformResults.length > 0) {
      try {
        const accounts = await getAccountsForPublish(post.accountIds || [], post.selectedPages || {});
        post.platformResults = (post.platformResults || []).map(r => { const history = historicalMap[r.platform.toLowerCase()]; if (history) { r.platformPostId = history.platformPostId; r.pages = history.pages; r.status = 'published'; } return r; });
        const syncResult = await publishPostToPlatforms(post, accounts);
        post.platformResults = withAttemptTimestamp(syncResult.platformResults).map(newRes => {
          const history = historicalMap[newRes.platform.toLowerCase()];
          return { platform: newRes.platform, accountId: newRes.accountId, platformPostId: newRes.platformPostId || history?.platformPostId || null, status: newRes.status, error: newRes.error || null, publishedAt: newRes.publishedAt || history?.publishedAt || new Date(), attemptedAt: newRes.attemptedAt, permalinkUrl: newRes.permalinkUrl || history?.permalinkUrl || null, pages: newRes.pages && newRes.pages.length > 0 ? newRes.pages : (history?.pages || []) };
        });
        await post.save();
      } catch (syncError) { await post.save(); }
    }
    res.json(post);
  } catch (error) { res.status(500).json({ detail: 'Failed to update post' }); }
});

router.post('/:postId/publish', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });
    const { selectedPages = {} } = req.body;

    const accountsFull = await getAccountsForPublish(post.accountIds || [], selectedPages);
    await Post.updateOne({ id: req.params.postId }, { status: 'publishing', updatedAt: new Date() });

    try {
      const result = await publishPostToPlatforms(post, accountsFull);
      await Post.updateOne({ id: req.params.postId }, {
        status: result.status, platformResults: withAttemptTimestamp(result.platformResults), publishedAt: new Date()
      });
      res.json({ message: 'Post published', status: result.status, platformResults: result.platformResults });
    } catch (publishError) {
      await Post.updateOne({ id: req.params.postId }, { status: 'failed' });
      res.status(500).json({ detail: 'Failed to publish post' });
    }
  } catch (error) { res.status(500).json({ detail: 'Failed to publish post' }); }
});

router.post('/:postId/retry-failed', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const failedResults = (post.platformResults || []).filter(r => r.status === 'failed');
    if (failedResults.length === 0) return res.status(400).json({ detail: 'No failed platforms to retry' });

    const failedAccountIds = [...new Set(failedResults.map(r => r.accountId))];
    await Post.updateOne({ id: post.id }, { status: 'publishing', updatedAt: new Date() });

    try {
      const accountsFull = await getAccountsForPublish(failedAccountIds, post.selectedPages || {});
      const retryPostShape = { ...(post.toObject ? post.toObject() : post), accountIds: failedAccountIds };
      const result = await publishPostToPlatforms(retryPostShape, accountsFull);

      const resultMap = {};
      withAttemptTimestamp(result.platformResults).forEach(r => { resultMap[`${r.platform}:${r.accountId}`] = r; });

      const mergedResults = (post.platformResults || []).map(r => {
        const key = `${r.platform}:${r.accountId}`;
        return resultMap[key] || r; 
      });

      const overallStatus = mergedResults.some(r => r.status === 'failed') ? 'failed' : 'published';

      await Post.updateOne({ id: post.id }, {
        status: overallStatus, platformResults: mergedResults, publishedAt: new Date()
      });
      res.json({ message: 'Retry complete', status: overallStatus, platformResults: mergedResults });
    } catch (retryError) {
      await Post.updateOne({ id: post.id }, { status: 'failed' });
      res.status(500).json({ detail: 'Retry failed' });
    }
  } catch (error) { res.status(500).json({ detail: 'Failed to retry post' }); }
});

const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
router.post('/upload-chunk', authMiddleware, chunkUpload.single('file'), async (req, res) => {
  try {
    const { chunkIndex, totalChunks, uploadId, fileId, originalName, mimeType } = req.body;
    const fileIdentifier = fileId || uploadId;
    if (!req.file) return res.status(400).json({ success: false, detail: 'No chunk uploaded' });
    if (!fileIdentifier || chunkIndex === undefined || totalChunks === undefined) return res.status(400).json({ success: false, detail: 'Missing required chunk fields' });

    const chunksDir = path.join(__dirname, '../uploads/chunks');
    const sessionDir = path.join(chunksDir, fileIdentifier);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    const uploadedChunks = fs.readdirSync(sessionDir).filter(f => f.startsWith('chunk_'));
    const allChunksUploaded = uploadedChunks.length === parseInt(totalChunks);

    if (!allChunksUploaded) {
      return res.status(200).json({ success: true, message: `Chunk ${chunkIndex} uploaded`, progress: Math.round((uploadedChunks.length / totalChunks) * 100) });
    }

    const sortedChunks = uploadedChunks.sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1])).map(f => fs.readFileSync(path.join(sessionDir, f)));
    const fileBuffer = Buffer.concat(sortedChunks);

    const isVideo = mimeType?.startsWith('video');
    const timestamp = Date.now();
    
    // ✨ FIX: Strip Windows backslashes in chunk upload as well
    const normalizedOriginalName = originalName.replace(/\\/g, '/').split('/').pop();
    let cleanName = path.parse(normalizedOriginalName).name.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_');
    if (cleanName.length > 20) cleanName = cleanName.substring(0, 20);

    if (isVideo) {
      const filename = `${timestamp}-${cleanName}.mp4`;
      const filepath = path.join(__dirname, '../uploads', filename);
      fs.writeFileSync(filepath, fileBuffer);
      const stats = fs.statSync(filepath);
      fs.rmSync(sessionDir, { recursive: true });
      return res.status(200).json({ success: true, url: `https://${req.get('host')}/uploads/${filename}`, filename: filename, mediaType: 'VIDEO', mimetype: 'video/mp4', size: stats.size });
    } else {
      const filename = `${timestamp}-${cleanName}.jpg`;
      const filepath = path.join(__dirname, '../uploads', filename);
      try {
        await sharp(fileBuffer).rotate().resize(1080, 1080, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, progressive: false, mozjpeg: true, density: 72 }).toFile(filepath);
        const stats = fs.statSync(filepath);
        fs.rmSync(sessionDir, { recursive: true });
        return res.status(200).json({ success: true, url: `https://${req.get('host')}/uploads/${filename}`, filename: filename, mediaType: 'IMAGE', mimetype: 'image/jpeg', size: stats.size });
      } catch (sharpError) {
        fs.rmSync(sessionDir, { recursive: true });
        return res.status(500).json({ success: false, detail: `Image processing failed: ${sharpError.message}` });
      }
    }
  } catch (error) { res.status(500).json({ success: false, detail: error.message || 'Failed to upload chunk' }); }
});

router.delete('/upload-chunk/:fileId', authMiddleware, (req, res) => {
  try {
    const sessionDir = path.join(__dirname, '../uploads/chunks', req.params.fileId);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
    res.status(200).json({ success: true, message: 'Upload cancelled' });
  } catch (error) { res.status(500).json({ success: false, detail: error.message }); }
});

module.exports = router;