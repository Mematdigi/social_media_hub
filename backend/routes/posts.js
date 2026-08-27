const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const { publishPostToPlatforms } = require('../services/publishService');
const { encrypt, decrypt } = require('../utils/encryption');
const axios = require('axios');

const router = express.Router();
const User = require('../models/User');

const sharp = require('sharp');


// ════════════════════════════════════════════════════════════
// Configure Multer for File Uploads
// ════════════════════════════════════════════════════════════
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const upload = multer({
  storage: storage,
  limits: {     fileSize: 1024 * 1024 * 1024  }, // 100MB
  fileFilter: function (req, file, cb) {
    const allowedMimes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/webm', 'video/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/posts/upload - File Upload Endpoint
// ════════════════════════════════════════════════════════════
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    // ✅ CORRECT - hardcoded https
    const fileUrl = `https://${req.get('host')}/uploads/${req.file.filename}`;
    const isVideo = req.file.mimetype.startsWith('video');
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

    res.json({
      url: fileUrl,
      filename: req.file.filename,
      mediaType: mediaType,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    logger.error('Failed to upload file', error);
    res.status(500).json({ detail: 'Failed to upload file' });
  }
});

// ════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════

const formatPost = (post, accounts = []) => ({
  id: post.id,
  userId: post.userId,
  content: post.content,
  mediaUrls: post.mediaUrls || [],
  mediaFormats: post.mediaFormats || {},
  selectedPages: post.selectedPages || {}, // <--- ADD THIS LINE HERE
  accountIds: post.accountIds || [],
  platforms: post.platforms || [],
  status: post.status,
  scheduledAt: post.scheduledAt?.toISOString() || null,
  publishedAt: post.publishedAt?.toISOString() || null,
  platformResults: (post.platformResults || []).map(r => ({
    platform:       r.platform,
    accountId:      r.accountId,
    platformPostId: r.platformPostId || null,
    status:         r.status,
    error:          r.error || null,
    publishedAt:    r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
    pages: (r.pages || []).map(p => ({
      pageId:   p.pageId,
      pageName: p.pageName,
      postId:   p.postId || null,
      status:   p.status,
      error:    p.error || null
    }))
  })),
  // Safe date conversion handling if Mongo returns raw ISO strings on lean/aggregate operations
  createdAt: post.createdAt?.toISOString ? post.createdAt.toISOString() : post.createdAt,
  updatedAt: post.updatedAt?.toISOString ? post.updatedAt.toISOString() : post.updatedAt,
  accounts,

  // ─── 🆕 YOUTUBE METADATA PASSTHROUGH ───────────────────────────
  // This guarantees these properties survive formatting filtering!
  youtubeTitle:       post.youtubeTitle || '',
  youtubeTags:        Array.isArray(post.youtubeTags) ? post.youtubeTags : [],
  youtubeCategory:    post.youtubeCategory || '22',
  youtubePrivacy:     post.youtubePrivacy || 'public',
  youtubeMadeForKids: post.youtubeMadeForKids || false,
  youtubeThumbnail:   post.youtubeThumbnail || null
});

const getAccountsForPublish = async (accountIds, selectedPageIds = {}) => {
  const accounts = [];
  
  const safeSelectedPages = selectedPageIds instanceof Map 
    ? Object.fromEntries(selectedPageIds) 
    : (selectedPageIds?.toObject ? selectedPageIds.toObject() : selectedPageIds);

  for (const accId of accountIds) {
    // 🔥 THE FIX: Removed the "db." prefix here. It is now just SocialAccount.findOne
    const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
    if (!acc) continue;
    
    let accObj = acc.toObject ? acc.toObject() : acc;
    
    if (accObj.platform === 'facebook' && accObj.pages?.length) {
      const chosenIds = safeSelectedPages[accId] || [];
      accObj.pages = accObj.pages.map(p => ({ 
        ...p, 
        isSelected: chosenIds.includes(p.pageId) 
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
  id: acc.id,
  accountId: acc.accountId,
  accountName: acc.accountName,
  profilePicture: acc.profilePicture,
  platform: acc.platform,
  pages: (acc.pages || []).map(p => ({
    pageId:     p.pageId,
    pageName:   p.pageName,
    category:   p.category,
    isSelected: p.isSelected
  }))
});

const getPageTokenForPost = (account, platformPostId) => {
  const pageId = platformPostId?.split('_')[0];
  if (!pageId) return null;
  const page = (account.pages || []).find(p => p.pageId === pageId);
  if (!page?.pageAccessToken) return null;
  return decrypt(page.pageAccessToken);
};


const withAttemptTimestamp = (platformResults = []) => {
  const now = new Date();
  return platformResults.map(r => ({ ...r, attemptedAt: r.attemptedAt || now }));
};

// ════════════════════════════════════════════════════════════
// Check and Process Scheduled Posts
// ════════════════════════════════════════════════════════════
const processScheduledPosts = async () => {
  try {
    const now = new Date();
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });

    console.log("posting from post.js file")
    for (const post of scheduledPosts) {
      const accountsFull = await getAccountsForPublish(post.accountIds || []);
      const result = await publishPostToPlatforms(post, accountsFull);

      await Post.updateOne({ id: post.id }, {
        status:          result.status,
        platformResults: result.platformResults,
        publishedAt:     new Date()
      });
    }
  } catch (error) {
    logger.error('Error processing scheduled posts', error);
  }
};


// // Run scheduled posts processor every minute
//  setInterval(processScheduledPosts, 60000);

// GET /api/posts - Get All Posts (Ultra-Fast 2-Pass Paginated)
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const skipLive = req.query.skipLive === 'true';
    
    // ── 1. Build Query & Pagination ──
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
    const currentUser = await User.findOne({ id: req.user.id }).select('name email');
    const publisherInfo = { name: currentUser?.name || req.user.name, email: currentUser?.email || req.user.email };

    // 🚀 PASS 1: FAST LOCAL FETCH (Skip Live) 
    if (skipLive) {
      const totalPosts = await Post.countDocuments(query);
      const paginatedPosts = await Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-_id -__v');
      
      const fastResult = [];
      for (const post of paginatedPosts) {
        const accounts = [];
        for (const accId of post.accountIds || []) {
          const acc = allAccounts.find(a => a.id === accId);
          if (acc) accounts.push(safeAccount(acc));
        }
        fastResult.push({ ...formatPost(post, accounts, publisherInfo), platformResults: post.platformResults || [] });
      }
      
      // Return instantly in the exact shape React wants
      return res.json({ posts: fastResult, pagination: { total: totalPosts, page, limit, totalPages: Math.ceil(totalPosts / limit) } });
    }

    // 🤫 PASS 2: SILENT LIVE FETCH
    const fbAccounts = allAccounts.filter(a => a.platform === 'facebook');
    const igAccounts = allAccounts.filter(a => a.platform === 'instagram');
    const ytAccounts = allAccounts.filter(a => a.platform === 'youtube');

    const fbPostMetaMap = {};
    const igPostMetaMap = {};
    const ytPostMetaMap = {};

    // Only run heavy social media syncing on Page 1
    if (page === 1 && !req.query.search) {
      // -- Facebook Sync --
      for (const account of fbAccounts) {
        for (const page of account.pages || []) {
          if (!page.pageAccessToken) continue;
          try {
            const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${page.pageId}/feed`, {
              params: { fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)', limit: 10, access_token: decrypt(page.pageAccessToken) }
            });
            for (const fbPost of fbRes.data?.data || []) {
              fbPostMetaMap[fbPost.id] = { accountId: account.id, pageId: page.pageId, pageName: page.pageName, content: fbPost.message || fbPost.story || '', mediaUrls: fbPost.full_picture ? [fbPost.full_picture] : [], createdTime: fbPost.created_time, permalinkUrl: fbPost.permalink_url, likes: fbPost.likes?.summary?.total_count || 0, comments: fbPost.comments?.summary?.total_count || 0 };
            }
          } catch (err) {}
        }
      }

      // -- Instagram Sync --
      for (const account of igAccounts) {
        const page = (account.pages || [])[0];
        if (!page?.pageAccessToken) continue;
        try {
          const igRes = await axios.get(`https://graph.facebook.com/v19.0/${account.accountId}/media`, {
            params: { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count', limit: 10, access_token: decrypt(page.pageAccessToken) }
          });
          for (const igPost of igRes.data?.data || []) {
            igPostMetaMap[igPost.id] = { accountId: account.id, pageId: page.pageId, pageName: page.pageName, content: igPost.caption || '', mediaType: igPost.media_type || 'IMAGE', mediaUrls: igPost.media_url ? [igPost.media_url] : [], thumbnailUrl: igPost.thumbnail_url, createdTime: igPost.timestamp, permalinkUrl: igPost.permalink, likes: igPost.like_count || 0, comments: igPost.comments_count || 0 };
          }
        } catch (err) {}
      }

      // -- YouTube Sync (Bypass Quota Limit!) --
      if (ytAccounts.length > 0) {
        const { google } = require('googleapis');
        for (const account of ytAccounts) {
          try {
            const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
            oauth2Client.setCredentials({ access_token: decrypt(account.accessToken), refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined });
            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            
            const channelRes = await youtube.channels.list({ part: 'contentDetails', mine: true });
            const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

            if (uploadsPlaylistId) {
              const playlistRes = await youtube.playlistItems.list({ part: 'snippet', playlistId: uploadsPlaylistId, maxResults: 10 });
              const videoIds = playlistRes.data.items.map(item => item.snippet.resourceId.videoId).filter(Boolean);

              if (videoIds.length > 0) {
                const videoRes = await youtube.videos.list({ part: 'snippet,statistics', id: videoIds.join(',') });
                for (const ytPost of videoRes.data.items || []) {
                  ytPostMetaMap[ytPost.id] = { accountId: account.id, youtubeTitle: ytPost.snippet.title, content: ytPost.snippet.description || '', mediaUrls: ytPost.snippet.thumbnails?.high?.url ? [ytPost.snippet.thumbnails.high.url] : [], mediaType: 'VIDEO', createdTime: ytPost.snippet.publishedAt, permalinkUrl: `https://www.youtube.com/watch?v=${ytPost.id}`, likes: Number(ytPost.statistics?.likeCount) || 0, comments: Number(ytPost.statistics?.commentCount) || 0, views: Number(ytPost.statistics?.viewCount) || 0 };
                }
              }
            }
          } catch (err) {}
        }
      }

      // -- Save New Live Posts to DB --
      const distinctDbIds = await Post.distinct('platformResults.platformPostId', { userId: req.user.id });
      const dbPlatformPostIds = new Set(distinctDbIds);

      const createSyncPost = async (meta, platform, postIdStr, type) => {
        if (dbPlatformPostIds.has(postIdStr)) return;
        const postTime = new Date(meta.createdTime);
        const newPost = new Post({
          id: uuidv4(), userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaType: type, youtubeTitle: meta.youtubeTitle || null, accountIds: [meta.accountId], platforms: [platform], status: 'published', publishedAt: postTime, syncedFromPlatform: true,
          platformResults: [{ platform, accountId: meta.accountId, platformPostId: postIdStr, status: 'published', publishedAt: postTime, pages: meta.pageId ? [{ pageId: meta.pageId, pageName: meta.pageName, postId: postIdStr, status: 'published' }] : [] }],
          createdAt: postTime, updatedAt: new Date()
        });
        try { await newPost.save(); dbPlatformPostIds.add(postIdStr); } catch (err) {}
      };

      for (const [id, meta] of Object.entries(fbPostMetaMap)) if (meta.content.trim()) await createSyncPost(meta, 'facebook', id, null);
      for (const [id, meta] of Object.entries(igPostMetaMap)) if (meta.content.trim() || meta.mediaUrls.length) await createSyncPost(meta, 'instagram', id, meta.mediaType);
      for (const [id, meta] of Object.entries(ytPostMetaMap)) await createSyncPost(meta, 'youtube', id, 'VIDEO');
    }

    // ── 5. FETCH STRICTLY PAGINATED POSTS FROM DB ──
    // This is the bug fix that stops the lag! It only pulls 10 posts!
    const finalTotalPosts = await Post.countDocuments(query);
    const paginatedLivePosts = await Post.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-_id -__v');
    
    const result = [];
    for (const post of paginatedLivePosts) {
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = allAccounts.find(a => a.id === accId);
        if (acc) accounts.push(safeAccount(acc));
      }

      const enrichedResults = (post.platformResults || []).map(r => {
        const meta = (r.platformPostId ? fbPostMetaMap[r.platformPostId] : null) || (r.platformPostId ? igPostMetaMap[r.platformPostId] : null) || (r.platformPostId ? ytPostMetaMap[r.platformPostId] : null);
        return {
          platform: r.platform, accountId: r.accountId, platformPostId: r.platformPostId || null, status: r.status, error: r.error || null, publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
          pageName: meta?.pageName || null, permalinkUrl: meta?.permalinkUrl || null, likes: meta?.likes ?? null, comments: meta?.comments ?? null, views: meta?.views ?? null, thumbnailUrl: meta?.thumbnailUrl || null,
          pages: (r.pages || []).map(p => ({ pageId: p.pageId, pageName: p.pageName, postId: p.postId || null, status: p.status, error: p.error || null }))
        };
      });

      result.push({ ...formatPost(post, accounts, publisherInfo), platformResults: enrichedResults });
    }

    // Return the perfectly formatted JSON object so React doesn't blank out!
    res.json({ posts: result, pagination: { total: finalTotalPosts, page, limit, totalPages: Math.ceil(finalTotalPosts / limit) } });
    
  } catch (error) {
    logger.error('Failed to get posts', error);
    res.status(500).json({ detail: 'Failed to get posts' });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/posts/:postId
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id })
      .select('-_id -__v');
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const accounts = [];
    for (const accId of post.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId })
        .select('-accessToken -refreshToken -_id -__v');
      if (acc) accounts.push(safeAccount(acc));
    }

    // 1. Get the sanitized base post configuration
    const baseFormattedPost = formatPost(post, accounts);

    // 2. Determine the correct thumbnail source
    // ✅ FALLBACK FIX: If a custom uploaded thumbnail does not exist, 
    // but the post belongs to YouTube, extract the synced cover from mediaUrls[0]!
    const isYoutubePost = post.platforms?.includes('youtube');
    const dynamicThumbnail = post.youtubeThumbnail || (isYoutubePost ? post.mediaUrls?.[0] : null);

    // 3. Explicitly blend in parameters to push to the client interface
    const finalEnrichedPost = {
      ...baseFormattedPost,
      youtubeTitle:       post.youtubeTitle || '',
      youtubeTags:        Array.isArray(post.youtubeTags) ? post.youtubeTags : [], 
      youtubeCategory:    post.youtubeCategory || '22',
      youtubePrivacy:     post.youtubePrivacy || 'public',
      youtubeMadeForKids: post.youtubeMadeForKids || false,
      youtubeThumbnail:   dynamicThumbnail // 👈 Hands the valid image path straight to the UI card template
    };

    // 4. Return the complete metadata package to the client
    res.json(finalEnrichedPost);

  } catch (error) {
    logger.error('Failed to get post', error);
    res.status(500).json({ detail: 'Failed to get post' });
  }
});
// ════════════════════════════════════════════════════════════
// POST /api/posts - Create Post
// ════════════════════════════════════════════════════════════
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      content,
      accountIds,
      mediaUrls    = [],
      mediaFormats = {},
      status       = 'draft',
      scheduledAt,
      selectedPages = {},
      // ── YouTube fields ──────────────────────────────────────
      youtubeTitle,
      youtubeTags        = [],
      youtubeCategory    = '22',
      youtubePrivacy     = 'public',
      youtubeMadeForKids = false,
      youtubeThumbnail, // 🆕 Extracted custom thumbnail URL from frontend body
    } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!content || !content.trim()) {
      return res.status(400).json({ detail: 'Content is required' });
    }
    if (!accountIds || accountIds.length === 0) {
      return res.status(400).json({ detail: 'At least one account must be selected' });
    }

    // ── Resolve platforms ────────────────────────────────────
    const platforms = [];
    for (const accId of accountIds) {
      const acc = await SocialAccount.findOne({ id: accId }).select('platform');
      if (acc) platforms.push(acc.platform);
    }

    // ── Validate YouTube-specific fields when YT is selected ─
    const hasYoutube = platforms.includes('youtube');
    if (hasYoutube && (!youtubeTitle || !youtubeTitle.trim())) {
      return res.status(400).json({ detail: 'YouTube video title is required' });
    }
    if (hasYoutube && !['public', 'unlisted', 'private'].includes(youtubePrivacy)) {
      return res.status(400).json({ detail: 'Invalid YouTube privacy value' });
    }

    // ── Determine post status ────────────────────────────────
    const postId        = uuidv4();
    const now           = new Date();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    let postStatus = status;
    if (scheduledDate && scheduledDate > now) {
      postStatus = 'scheduled';
    } else if (status === 'published' || (scheduledDate && scheduledDate <= now)) {
      postStatus = 'publishing';
    }

    // ── Create & save post ───────────────────────────────────
    const post = new Post({
      id:           postId,
      userId:       req.user.id,
      content,
      mediaUrls,
      mediaFormats,
      accountIds,
      platforms,
      selectedPages: selectedPages, // ✨ THE FIX: I accidentally removed this earlier! This caused the scheduler to forget pages!
      status:       postStatus,
      scheduledAt:  scheduledDate,
      platformResults: [],
      createdAt:    now,
      updatedAt:    now,
      // YouTube fields — stored regardless of platform so drafts retain them
      youtubeTitle:        youtubeTitle       || null,
      youtubeTags:         Array.isArray(youtubeTags) ? youtubeTags : [],
      youtubeCategory:     youtubeCategory    || '22',
      youtubePrivacy:      youtubePrivacy     || 'public',
      youtubeMadeForKids:  Boolean(youtubeMadeForKids),
      youtubeThumbnail:    youtubeThumbnail   || null, // 🆕 Persisted safely into your Post Schema
    });

    await post.save();

   // ── Publish immediately if status is 'publishing' ────────
    if (postStatus === 'publishing') {
      try {
        const accountsFull = await getAccountsForPublish(accountIds, selectedPages);
        // ✨ THE FIX: We 'await' the publisher directly so the API blocks until it finishes
        const result = await publishPostToPlatforms(post, accountsFull);
        
        post.status = result.status; // This will now be 'published' or 'failed'
        post.platformResults = withAttemptTimestamp(result.platformResults);
        post.publishedAt = new Date();

        await Post.updateOne({ id: postId }, { 
          status: post.status, 
          platformResults: post.platformResults, 
          publishedAt: post.publishedAt 
        });
      } catch (publishError) {
        logger.error(`Publish failed:`, publishError);
        post.status = 'failed';
        await Post.updateOne({ id: postId }, { status: 'failed' });
      }
    }
    
    const currentUser = await User.findOne({ id: req.user.id });
    const publisherInfo = { name: currentUser?.name || req.user.name, email: currentUser?.email || req.user.email };
    
    // The JSON response will now contain the final status instead of 'publishing'
    return res.status(201).json(formatPost(post, [], publisherInfo));
    
  } catch (error) {
    logger.error('Failed to create post', error);
    res.status(500).json({ detail: 'Failed to create post' });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /api/posts/:postId
// ════════════════════════════════════════════════════════════
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

          // ✅ FACEBOOK: API Deletion is supported
          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) continue;
            await axios.delete(`https://graph.facebook.com/v19.0/${result.platformPostId}`, { 
              params: { access_token: pageToken } 
            });
          }

          // ❌ INSTAGRAM: Pass the Meta Business Suite link to the frontend
          if (result.platform === 'instagram') {
            
            // NOTE: Replace these with how you store the business/page IDs in your DB
            const businessId = account.businessId || '2488876801380718'; 
            const assetId = account.pageId || '364011614307982';
            
            const metaBusinessLink = `https://business.facebook.com/latest/posts/published_posts/?business_id=${businessId}&asset_id=${assetId}`;

            platformErrors.push({ 
              platform: 'instagram', 
              error: 'Meta does not allow apps to delete Instagram posts automatically.',
              actionRequired: 'manual_delete',
              actionLink: metaBusinessLink // Passing the link to the frontend!
            });
            continue; 
          }
          
          // ✅ YOUTUBE: API Deletion is supported
          if (result.platform === 'youtube') {
            const { google } = require('googleapis');
            
            // Recreate the OAuth Client
            const oauth2Client = new google.auth.OAuth2(
              process.env.YOUTUBE_CLIENT_ID,
              process.env.YOUTUBE_CLIENT_SECRET
            );

            // Give it the decrypted tokens from the database
            oauth2Client.setCredentials({
              access_token: decrypt(account.accessToken),
              refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined
            });

            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            
            // Call the YouTube API to delete the specific video ID
            await youtube.videos.delete({
              id: result.platformPostId
            });
            
            continue;
          }

        } catch (err) {
          platformErrors.push({ platform: result.platform, error: err.message });
        }
      }
    }

    // Always delete from your local database
    await Post.deleteOne({ id: req.params.postId, userId: req.user.id });
    
    res.json({
      message: 'Post deleted from your dashboard.',
      platformErrors: platformErrors.length > 0 ? platformErrors : undefined,
    });
  } catch (error) {
    logger.error('Failed to delete post', error);
    res.status(500).json({ detail: 'Failed to delete post' });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /api/posts/:postId - Update Post
// ════════════════════════════════════════════════════════════
router.put('/:postId', authMiddleware, async (req, res) => {
  try {
    const { 
      content, 
      mediaUrls, 
      mediaFormats, 
      accountIds, 
      selectedPages,
      youtubeTitle,
      youtubeTags,
      youtubeCategory,
      youtubePrivacy,
      youtubeMadeForKids,
      youtubeThumbnail
    } = req.body;

    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    // 🆕 1. Preserve historical platform results and nested page arrays
    const historicalMap = {};
    if (post.platformResults && post.platformResults.length > 0) {
      post.platformResults.forEach(r => {
        historicalMap[r.platform.toLowerCase()] = {
          platformPostId: r.platformPostId,
          publishedAt: r.publishedAt,
          permalinkUrl: r.permalinkUrl,
          pages: r.pages || [] // Keeps Facebook page arrays safe!
        };
      });
    }

    // 2. Update properties locally
    post.content      = content ?? post.content;
    post.mediaUrls    = mediaUrls ?? post.mediaUrls;
    post.mediaFormats = mediaFormats ?? post.mediaFormats;
    post.accountIds   = accountIds ?? post.accountIds;

    if (selectedPages !== undefined) {
      post.selectedPages = selectedPages;
      post.markModified('selectedPages'); 
    }

    if (scheduledAt !== undefined) {
      post.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    }
Sa

    if (youtubeTitle !== undefined)       post.youtubeTitle = youtubeTitle;
    if (youtubeTags !== undefined)        post.youtubeTags = Array.isArray(youtubeTags) ? youtubeTags : [];
    if (youtubeCategory !== undefined)    post.youtubeCategory = youtubeCategory;
    if (youtubePrivacy !== undefined)     post.youtubePrivacy = youtubePrivacy;
    if (youtubeMadeForKids !== undefined) post.youtubeMadeForKids = youtubeMadeForKids;
    if (youtubeThumbnail !== undefined) post.youtubeThumbnail = youtubeThumbnail;
    

    post.updatedAt = new Date();
    await post.save();

    // 3. Re-Sync Live Posts if already published
    if (post.status === 'published') {
      const accounts = [];
      for (const id of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id, userId: req.user.id, isActive: true });
        if (acc) {
          // If editing custom checkmarked pages, map selections
          if (selectedPages && selectedPages[id] && acc.pages) {
            acc.pages = acc.pages.map(p => ({
              ...p,
              isSelected: selectedPages[id].includes(p.pageId)
            }));
          }
          accounts.push(acc);
        }
      }

      // Re-inject historical arrays back into document state before running the sync engine
      post.platformResults = (post.platformResults || []).map(r => {
        const history = historicalMap[r.platform.toLowerCase()];
        if (history) {
          r.platformPostId = history.platformPostId;
          r.pages = history.pages;
          r.status = 'published';
        }
        return r;
      });

      const syncResult = await publishPostToPlatforms(post, accounts);
      
      // 🆕 4. Safely reconstruct the database schema response
      post.platformResults = syncResult.platformResults.map(newRes => {
        const history = historicalMap[newRes.platform.toLowerCase()];
        return {
          platform:       newRes.platform,
          accountId:      newRes.accountId,
          platformPostId: newRes.platformPostId || history?.platformPostId || null,
          status:         newRes.status,
          error:          newRes.error || null,
          publishedAt:    newRes.publishedAt || history?.publishedAt || new Date(),
          permalinkUrl:   newRes.permalinkUrl || history?.permalinkUrl || null,
          pages:          newRes.pages && newRes.pages.length > 0 ? newRes.pages : (history?.pages || [])
        };
      });

      await post.save();
    }

    res.json(post);
  } catch (error) {
    logger.error('Failed to update post', error);
    res.status(500).json({ detail: 'Failed to update post' });
  }
});
// ════════════════════════════════════════════════════════════
// POST /api/posts/:postId/publish
// ════════════════════════════════════════════════════════════
router.post('/:postId/publish', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });
    const { selectedPages = {} } = req.body;

    const accountsFull = await getAccountsForPublish(post.accountIds || [], selectedPages);
    await Post.updateOne({ id: req.params.postId }, { status: 'publishing', updatedAt: new Date() });

    try {
      // ✨ THE FIX: Block the API until the platforms finish
      const result = await publishPostToPlatforms(post, accountsFull);
      const timestampedResults = withAttemptTimestamp(result.platformResults);
      
      await Post.updateOne({ id: req.params.postId }, {
        status: result.status, platformResults: timestampedResults, publishedAt: new Date()
      });
      
      // Respond strictly with the final result
      return res.json({ message: 'Post published', status: result.status, platformResults: timestampedResults });
    } catch (publishError) {
      await Post.updateOne({ id: req.params.postId }, { status: 'failed' });
      return res.status(500).json({ detail: 'Failed to publish post' });
    }
  } catch (error) { 
    res.status(500).json({ detail: 'Failed to trigger publish' }); 
  }
});
// ════════════════════════════════════════════════════════════════
// POST /upload-chunk - Chunked upload for large files
// ════════════════════════════════════════════════════════════════

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
});

router.post('/upload-chunk', authMiddleware, chunkUpload.single('file'), async (req, res) => {

  try {
    const { chunkIndex, totalChunks, uploadId, fileId, originalName, mimeType } = req.body;
    
    // Accept either uploadId or fileId
    const fileIdentifier = fileId || uploadId;

    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        detail: 'No chunk uploaded' 
      });
    }

    if (!fileIdentifier || chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({ 
        success: false,
        detail: 'Missing fileId/uploadId, chunkIndex, or totalChunks' 
      });
    }

    const chunksDir = path.join(__dirname, '../uploads/chunks');
    const sessionDir = path.join(chunksDir, fileIdentifier);

    // Create folder if needed
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Save chunk
    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    logger.info(`[CHUNK] Saved chunk ${chunkIndex}/${totalChunks} for file ${fileIdentifier}`);

    // Check if all chunks are uploaded
    const uploadedChunks = fs.readdirSync(sessionDir).filter(f => f.startsWith('chunk_'));
    const allChunksUploaded = uploadedChunks.length === parseInt(totalChunks);

    if (!allChunksUploaded) {
      return res.status(200).json({
        success: true,
        message: `Chunk ${chunkIndex} uploaded`,
        progress: Math.round((uploadedChunks.length / totalChunks) * 100)
      });
    }

    // ✅ ALL CHUNKS RECEIVED - Assemble and process
    logger.info(`[CHUNK] All chunks received for ${fileIdentifier}, assembling...`);

    // Sort and concatenate chunks
    const sortedChunks = uploadedChunks
      .sort((a, b) => {
        const aNum = parseInt(a.split('_')[1]);
        const bNum = parseInt(b.split('_')[1]);
        return aNum - bNum;
      })
      .map(f => fs.readFileSync(path.join(sessionDir, f)));

    const fileBuffer = Buffer.concat(sortedChunks);
    const isVideo = mimeType?.startsWith('video');
    const timestamp = Date.now();
    const cleanName = path.parse(originalName).name;

    if (isVideo) {
      // VIDEO: Save as-is
      const filename = `${timestamp}-${cleanName}.mp4`;
      const filepath = path.join(__dirname, '../uploads', filename);

      fs.writeFileSync(filepath, fileBuffer);

      const fileUrl = `https://${req.get('host')}/uploads/${filename}`;
      const stats = fs.statSync(filepath);

      // Clean up chunks
      fs.rmSync(sessionDir, { recursive: true });

      logger.info(`[UPLOAD] Video assembled: ${filename} (${stats.size} bytes)`);

      return res.status(200).json({
        success: true,
        url: fileUrl,
        filename: filename,
        mediaType: 'VIDEO',
        mimetype: 'video/mp4',
        size: stats.size
      });
    } else {
      // IMAGE: Convert to baseline JPEG
      const filename = `${timestamp}-${cleanName}.jpg`;
      const filepath = path.join(__dirname, '../uploads', filename);

      try {
        await sharp(fileBuffer)
          .rotate()
          .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
          .jpeg({
            quality: 85,
            progressive: false,
            mozjpeg: true,
            density: 72
          })
          .toFile(filepath);

        const stats = fs.statSync(filepath);
        const fileUrl = `https://${req.get('host')}/uploads/${filename}`;

        // Clean up chunks
        fs.rmSync(sessionDir, { recursive: true });

        logger.info(`[UPLOAD] Image assembled: ${filename} (${stats.size} bytes)`);

        return res.status(200).json({
          success: true,
          url: fileUrl,
          filename: filename,
          mediaType: 'IMAGE',
          mimetype: 'image/jpeg',
          size: stats.size
        });
} catch (sharpError) {
        logger.error(`[UPLOAD] Sharp error: ${sharpError.message}`);
        fs.rmSync(sessionDir, { recursive: true });
        return res.status(500).json({
          success: false,
          detail: `Image processing failed: ${sharpError.message}`
        });
      }
    } // <-- Closes the if/else (isVideo) block

  } catch (error) { // <-- Closes the main 'try' block for the route
    logger.error(`[CHUNK] Error: ${error.message}`);
    res.status(500).json({
      success: false,
      detail: error.message || 'Failed to upload chunk'
    });
  }
}); 
// ════════════════════════════════════════════════════════════════
// DELETE /upload-chunk/:fileId - Cancel chunked upload
// ════════════════════════════════════════════════════════════════
router.delete('/upload-chunk/:fileId', authMiddleware, (req, res) => {
  try {
    const fileId = req.params.fileId;
    const chunksDir = path.join(__dirname, '../uploads/chunks');
    const sessionDir = path.join(chunksDir, fileId);

    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true });
      logger.info(`[CHUNK] Cancelled upload: ${fileId}`);
    }

    res.status(200).json({ success: true, message: 'Upload cancelled' });
  } catch (error) {
    logger.error(`[CHUNK] Cancel error: ${error.message}`);
    res.status(500).json({ success: false, detail: error.message });
  }
});

module.exports = router;