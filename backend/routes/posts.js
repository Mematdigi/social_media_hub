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
const sharp = require('sharp');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Function to generate a safe and short filename ───
function getSafeShortFilename(originalname) {
  // 1. Extract the file extension (e.g., .mp4)
  const ext = path.extname(originalname);
  
  // 2. Extract the base filename without the extension
  let baseName = path.basename(originalname, ext);

  // 3. Allow only safe characters (English, Hindi, and Numbers)
  baseName = baseName.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_');

  // 4. CRITICAL: Strictly limit the base name to 20 characters
  // This prevents exceeding the Linux 255-byte filename limit
  if (baseName.length > 20) {
    baseName = baseName.substring(0, 20);
  }

  // 5. Add a unique timestamp to prevent duplicate filenames
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  console.log("name unuquwe",`${uniqueSuffix}-${baseName}${ext}`)

  return `${uniqueSuffix}-${baseName}${ext}`;
}

// ─── Multer Storage Config ───
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Using our new safe filename function here
    const finalSafeName = getSafeShortFilename(file.originalname);
    cb(null, finalSafeName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: function (req, file, cb) {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/webm', 'video/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Throw an error if the file type is invalid
      cb(new Error('Invalid file type'), false);
    }
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/posts/upload - File Upload Endpoint
// ════════════════════════════════════════════════════════════
router.post('/upload', authMiddleware, (req, res) => {
  // Define the upload handler (ensure your frontend sends the field name as 'file')
  const uploadHandler = upload.single('file');

  // Execute the handler manually inside the route
  uploadHandler(req, res, function (err) {
    // 1. Catch Multer-specific errors (e.g., File too large)
    if (err instanceof multer.MulterError) {
      logger.error('Multer upload error:', err);
      return res.status(400).json({ detail: `Upload Error: ${err.message}` });
    } 
    // 2. Catch custom errors from our fileFilter (e.g., Invalid file type)
    else if (err) {
      logger.error('File filter error:', err);
      return res.status(400).json({ detail: err.message });
    }

    // 3. Catch empty files
    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    // 4. If we reach here, the file was safely saved to disk
    try {
      // Using req.protocol makes this work dynamically for both local (http) and production (https)
      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
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
      logger.error('Failed to construct file response', error);
      res.status(500).json({ detail: 'Failed to process file metadata' });
    }
  });
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
  createdAt: post.createdAt?.toISOString ? post.createdAt.toISOString() : post.createdAt,
  updatedAt: post.updatedAt?.toISOString ? post.updatedAt.toISOString() : post.updatedAt,
  accounts,
  youtubeTitle:       post.youtubeTitle || '',
  youtubeTags:        Array.isArray(post.youtubeTags) ? post.youtubeTags : [],
  youtubeCategory:    post.youtubeCategory || '22',
  youtubePrivacy:     post.youtubePrivacy || 'public',
  youtubeMadeForKids: post.youtubeMadeForKids || false,
  youtubeThumbnail:   post.youtubeThumbnail || null
});

const getAccountsForPublish = async (accountIds, selectedPageIds = {}) => {
  const accounts = [];
  for (const accId of accountIds) {
    const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
    if (!acc) continue;
    if (selectedPageIds[accId] && acc.pages?.length) {
      const chosenIds = selectedPageIds[accId];
      acc.pages = acc.pages.map(p => ({
        ...p.toObject(),
        isSelected: chosenIds.includes(p.pageId)
      }));
    }
    accounts.push(acc);
  }
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

setInterval(processScheduledPosts, 500000);

// ════════════════════════════════════════════════════════════
// GET /api/posts - Get All Posts (With Pagination & 5-Post Sync Limit)
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id };

    if (req.query.status && typeof req.query.status === 'string' && req.query.status.trim() !== '') {
      query.status = req.query.status;
    }

    const page  = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip  = (page - 1) * limit;

    const allAccounts = await SocialAccount.find({ userId: req.user.id, isActive: true });
    
    const fbAccounts = allAccounts.filter(a => a.platform === 'facebook');
    const igAccounts = allAccounts.filter(a => a.platform === 'instagram');
    const ytAccounts = allAccounts.filter(a => a.platform === 'youtube');

    // ── 1. Fetch Facebook Data (Limited to Latest 5) ───────────
    const fbPostMetaMap = {};
    for (const account of fbAccounts) {
      for (const page of account.pages || []) {
        if (!page.pageAccessToken) continue;
        try {
          const pageToken = decrypt(page.pageAccessToken);
          const fbRes = await axios.get(
            `https://graph.facebook.com/v19.0/${page.pageId}/feed`,
            {
              params: {
                fields: 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)',
                limit: 5, // 📊 STRICT CORES REFRESH LIMIT FIXED HERE
                access_token: pageToken,
              },
            }
          );
          for (const fbPost of fbRes.data?.data || []) {
            fbPostMetaMap[fbPost.id] = {
              accountId:    account.id,
              accountName:  account.accountName,
              pageId:       page.pageId,
              pageName:     page.pageName,
              content:      fbPost.message || fbPost.story || '',
              mediaUrls:    fbPost.full_picture ? [fbPost.full_picture] : [],
              createdTime:  fbPost.created_time,
              permalinkUrl: fbPost.permalink_url || null,
              likes:        fbPost.likes?.summary?.total_count    || 0,
              comments:     fbPost.comments?.summary?.total_count || 0,
            };
          }
        } catch (err) {
          logger.info(`FB page fetch failed: ${err.message}`);
        }
      }
    }

    // ── 2. Fetch Instagram Data (Limited to Latest 5) ──────────
    const igPostMetaMap = {};
    for (const account of igAccounts) {
      const page = (account.pages || [])[0];
      if (!page?.pageAccessToken) continue;
      try {
        const pageToken = decrypt(page.pageAccessToken);
        const igAccountId = account.accountId;
        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          {
            params: {
              fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
              limit: 5, // 📊 STRICT CORES REFRESH LIMIT FIXED HERE
              access_token: pageToken,
            },
          }
        );
        for (const igPost of igRes.data?.data || []) {
          igPostMetaMap[igPost.id] = {
            accountId:    account.id,
            accountName:  account.accountName,
            igUsername:   account.igUsername || '',
            pageId:       page.pageId,
            pageName:     page.pageName,
            content:      igPost.caption    || '',
            mediaType:    igPost.media_type || 'IMAGE',
            mediaUrls:    igPost.media_url  ? [igPost.media_url] : [],
            thumbnailUrl: igPost.thumbnail_url || null,
            createdTime:  igPost.timestamp,
            permalinkUrl: igPost.permalink  || null,
            likes:        igPost.like_count     || 0,
            comments:     igPost.comments_count || 0,
          };
        }
      } catch (err) {
        logger.info(`IG fetch failed: ${err.message}`);
      }
    }

    // ── 3. Fetch YouTube Data (Limited to Latest 5) ────────────
    const ytPostMetaMap = {};
    if (ytAccounts.length > 0) {
      const { google } = require('googleapis');
      
      for (const account of ytAccounts) {
        try {
          const oauth2Client = new google.auth.OAuth2(
            process.env.YOUTUBE_CLIENT_ID,
            process.env.YOUTUBE_CLIENT_SECRET
          );
          
          oauth2Client.setCredentials({
            access_token: decrypt(account.accessToken),
            refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined
          });

          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

          const searchRes = await youtube.search.list({
            part: 'snippet',
            forMine: true,
            type: 'video',
            order: 'date'
          });

          const videoIds = searchRes.data.items.map(item => item.id.videoId).filter(Boolean);

          if (videoIds.length > 0) {
            const videoRes = await youtube.videos.list({
              part: 'snippet,statistics',
              id: videoIds.join(',')
            });

            for (const ytPost of videoRes.data.items || []) {
              ytPostMetaMap[ytPost.id] = {
                accountId:    account.id,
                accountName:  account.name || account.accountName,
                youtubeTitle: ytPost.snippet.title,
                content:      ytPost.snippet.description || '',
                mediaUrls:    ytPost.snippet.thumbnails?.high?.url ? [ytPost.snippet.thumbnails.high.url] : [],
                mediaType:    'VIDEO',
                createdTime:  ytPost.snippet.publishedAt,
                permalinkUrl: `https://www.youtube.com/watch?v=${ytPost.id}`,
                likes:        Number(ytPost.statistics?.likeCount) || 0,
                comments:     Number(ytPost.statistics?.commentCount) || 0,
                views:        Number(ytPost.statistics?.viewCount) || 0
              };
            }
          }
        } catch (err) {
          logger.info(`YouTube fetch failed for ${account.name || account.accountName}: ${err.message}`);
        }
      }
    }

    // ── 4. Sync New Posts to Database ──────────────────────────
    const distinctPlatformPostIds = await Post.distinct('platformResults.platformPostId', { userId: req.user.id });
    const dbPlatformPostIds = new Set(distinctPlatformPostIds);

    // Sync Facebook
    for (const [fbPostId, meta] of Object.entries(fbPostMetaMap)) {
      if (dbPlatformPostIds.has(fbPostId)) continue;
      if (!meta.content.trim()) continue;

      const postId = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newPost = new Post({
        id: postId, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls,
        accountIds: [meta.accountId], platforms: ['facebook'], status: 'published', publishedAt: postTime, syncedFromPlatform: true,
        platformResults: [{ platform: 'facebook', accountId: meta.accountId, platformPostId: fbPostId, status: 'published', publishedAt: postTime, pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: fbPostId, status: 'published', error: null }] }],
        createdAt: postTime, updatedAt: new Date(),
      });

      try { await newPost.save(); dbPlatformPostIds.add(fbPostId); } catch (err) {}
    }

    // Sync Instagram
    for (const [igPostId, meta] of Object.entries(igPostMetaMap)) {
      if (dbPlatformPostIds.has(igPostId)) continue;
      if (!meta.content.trim() && !meta.mediaUrls.length) continue;

      const postId = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newIGPost = new Post({
        id: postId, userId: req.user.id, content: meta.content, mediaUrls: meta.mediaUrls, mediaType: meta.mediaType,
        accountIds: [meta.accountId], platforms: ['instagram'], status: 'published', publishedAt: postTime, syncedFromPlatform: true,
        platformResults: [{ platform: 'instagram', accountId: meta.accountId, platformPostId: igPostId, status: 'published', publishedAt: postTime, pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: igPostId, status: 'published', error: null }] }],
        createdAt: postTime, updatedAt: new Date(),
      });

      try { await newIGPost.save(); dbPlatformPostIds.add(igPostId); } catch (err) {}
    }

    // Sync YouTube
    for (const [ytPostId, meta] of Object.entries(ytPostMetaMap)) {
      if (dbPlatformPostIds.has(ytPostId)) continue;

      const postId = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newYTPost = new Post({
        id: postId, 
        userId: req.user.id, 
        content: meta.content, 
        youtubeTitle: meta.youtubeTitle,
        mediaUrls: meta.mediaUrls, 
        mediaType: 'VIDEO',
        accountIds: [meta.accountId], 
        platforms: ['youtube'], 
        status: 'published', 
        publishedAt: postTime, 
        syncedFromPlatform: true,
        platformResults: [{ 
          platform: 'youtube', 
          accountId: meta.accountId, 
          platformPostId: ytPostId, 
          status: 'published', 
          publishedAt: postTime, 
          pages: [] 
        }],
        createdAt: postTime, 
        updatedAt: new Date(),
      });

      try { await newYTPost.save(); dbPlatformPostIds.add(ytPostId); } catch (err) {}
    }

    // ── 5. Assemble and Return Final Paginated Results ─────────
    const totalPosts = await Post.countDocuments(query);

    const paginatedPosts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-_id -__v');

    const postsResult = [];

    for (const post of paginatedPosts) {
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id: accId });
        if (acc) accounts.push(safeAccount(acc));
      }

      const enrichedResults = (post.platformResults || []).map(r => {
        const fbMeta = r.platformPostId ? (fbPostMetaMap[r.platformPostId] || null) : null;
        const igMeta = r.platformPostId ? (igPostMetaMap[r.platformPostId] || null) : null;
        const ytMeta = r.platformPostId ? (ytPostMetaMap[r.platformPostId] || null) : null;
        
        const meta = fbMeta || igMeta || ytMeta;

        return {
          platform:       r.platform,
          accountId:      r.accountId,
          platformPostId: r.platformPostId || null,
          status:         r.status,
          error:          r.error          || null,
          publishedAt:    r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
          pageName:       meta?.pageName     || null,
          pageId:         meta?.pageId       || null,
          permalinkUrl:   meta?.permalinkUrl || (r.platform === 'twitter' ? `https://x.com/i/status/${r.platformPostId}` : null),         
          likes:          meta?.likes        ?? null,
          comments:       meta?.comments     ?? null,
          views:          meta?.views        ?? null, 
          mediaType:      meta?.mediaType    || null,
          thumbnailUrl:   meta?.thumbnailUrl || null,
          igUsername:     igMeta?.igUsername   || null,
          pages: (r.pages || []).map(p => ({
            pageId:   p.pageId,
            pageName: p.pageName,
            postId:   p.postId || null,
            status:   p.status,
            error:    p.error  || null,
          })),
        };
      });

      postsResult.push({
        ...formatPost(post, accounts),
        platformResults: enrichedResults,
      });
    }

    res.json({
      posts: postsResult,
      pagination: {
        total: totalPosts,
        page,
        limit,
        totalPages: Math.ceil(totalPosts / limit)
      }
    });

  } catch (error) {
    logger.error('Failed to get posts', error);
    res.status(500).json({ detail: 'Failed to get posts' });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/posts/:postId - Fetch a Particular Post By ID
// ════════════════════════════════════════════════════════════
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id }).select('-_id -__v');
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const accounts = [];
    for (const accId of post.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
      if (acc) accounts.push(safeAccount(acc));
    }

    const baseFormattedPost = formatPost(post, accounts);
    const isYoutubePost = post.platforms?.includes('youtube');
    const dynamicThumbnail = post.youtubeThumbnail || (isYoutubePost ? post.mediaUrls?.[0] : null);

    res.json({
      ...baseFormattedPost,
      youtubeTitle:       post.youtubeTitle || '',
      youtubeTags:        Array.isArray(post.youtubeTags) ? post.youtubeTags : [], 
      youtubeCategory:    post.youtubeCategory || '22',
      youtubePrivacy:     post.youtubePrivacy || 'public',
      youtubeMadeForKids: post.youtubeMadeForKids || false,
      youtubeThumbnail:   dynamicThumbnail
    });

  } catch (error) {
    logger.error('Failed to get post', error);
    res.status(500).json({ detail: 'Failed to get post' });
  }
});

// ════════════════════════════════════════════════════════════
// POST /api/posts - Create Post with Scheduling
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
      youtubeTitle,
      youtubeTags        = [],
      youtubeCategory    = '22',
      youtubePrivacy     = 'public',
      youtubeMadeForKids = false,
      youtubeThumbnail,
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ detail: 'Content is required' });
    }
    if (!accountIds || accountIds.length === 0) {
      return res.status(400).json({ detail: 'At least one account must be selected' });
    }

    const platforms = [];
    for (const accId of accountIds) {
      const acc = await SocialAccount.findOne({ id: accId }).select('platform');
      if (acc) platforms.push(acc.platform);
    }

    const hasYoutube = platforms.includes('youtube');
    if (hasYoutube && (!youtubeTitle || !youtubeTitle.trim())) {
      return res.status(400).json({ detail: 'YouTube video title is required' });
    }
    if (hasYoutube && !['public', 'unlisted', 'private'].includes(youtubePrivacy)) {
      return res.status(400).json({ detail: 'Invalid YouTube privacy value' });
    }

    const postId        = uuidv4();
    const now           = new Date();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    let postStatus = status;
    if (scheduledDate && scheduledDate > now) {
      postStatus = 'scheduled';
    } else if (status === 'published' || (scheduledDate && scheduledDate <= now)) {
      postStatus = 'publishing';
    }

    const post = new Post({
      id:           postId,
      userId:       req.user.id,
      content,
      mediaUrls,
      mediaFormats,
      accountIds,
      platforms,
      selectedPages, // ✅ ADD THIS EXACT LINE HERE
      status:       postStatus,
      scheduledAt:  scheduledDate,
      platformResults: [],
      createdAt:    now,
      updatedAt:    now,
      youtubeTitle:        youtubeTitle       || null,
      youtubeTags:         Array.isArray(youtubeTags) ? youtubeTags : [],
      youtubeCategory:     youtubeCategory    || '22',
      youtubePrivacy:      youtubePrivacy     || 'public',
      youtubeMadeForKids:  Boolean(youtubeMadeForKids),
      youtubeThumbnail:    youtubeThumbnail   || null,
    });

    await post.save();

    if (postStatus === 'publishing') {
      const accountsFull = await getAccountsForPublish(accountIds, selectedPages);
      const result = await publishPostToPlatforms(post, accountsFull);

      post.status          = result.status;
      post.platformResults = result.platformResults;
      post.publishedAt     = new Date();

      await Post.updateOne({ id: postId }, {
        status:          result.status,
        platformResults: result.platformResults,
        publishedAt:     post.publishedAt,
      });
    }

    res.status(201).json(formatPost(post, []));
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

          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) continue;
            await axios.delete(`https://graph.facebook.com/v19.0/${result.platformPostId}`, { 
              params: { access_token: pageToken } 
            });
          }

          if (result.platform === 'instagram') {
            const businessId = account.businessId || '2488876801380718'; 
            const assetId = account.pageId || '364011614307982';
            const metaBusinessLink = `https://business.facebook.com/latest/posts/published_posts/?business_id=${businessId}&asset_id=${assetId}`;

            platformErrors.push({ 
              platform: 'instagram', 
              error: 'Meta does not allow apps to delete Instagram posts automatically.',
              actionRequired: 'manual_delete',
              actionLink: metaBusinessLink
            });
            continue; 
          }
          
          if (result.platform === 'youtube') {
            const { google } = require('googleapis');
            const oauth2Client = new google.auth.OAuth2(
              process.env.YOUTUBE_CLIENT_ID,
              process.env.YOUTUBE_CLIENT_SECRET
            );

            oauth2Client.setCredentials({
              access_token: decrypt(account.accessToken),
              refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined
            });

            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            await youtube.videos.delete({ id: result.platformPostId });
            continue;
          }

        } catch (err) {
          platformErrors.push({ platform: result.platform, error: err.message });
        }
      }
    }

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
      youtubeThumbnail,
      scheduledAt, // ✅ ADDED: Capture new scheduled date
      status       // ✅ ADDED: Capture status changes
    } = req.body;

    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    // Store history to prevent overwriting existing platform IDs on edit
    const historicalMap = {};
    if (post.platformResults && post.platformResults.length > 0) {
      post.platformResults.forEach(r => {
        historicalMap[r.platform.toLowerCase()] = {
          platformPostId: r.platformPostId,
          publishedAt: r.publishedAt,
          permalinkUrl: r.permalinkUrl,
          pages: r.pages || []
        };
      });
    }

    // ✅ UPDATE BASIC FIELDS
    post.content       = content ?? post.content;
    post.mediaUrls     = mediaUrls ?? post.mediaUrls;
    post.mediaFormats  = mediaFormats ?? post.mediaFormats;
    post.accountIds    = accountIds ?? post.accountIds;
    post.selectedPages = selectedPages ?? post.selectedPages; // ✅ FIXED: Was missing in original code

    // ✅ UPDATE SCHEDULED DATE
    if (scheduledAt !== undefined) {
      post.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    }

    // ✅ UPDATE STATUS & CHECK IF WE NEED TO PUBLISH NOW
    const now = new Date();
    let targetStatus = status ?? post.status;

    if (targetStatus === 'scheduled' && post.scheduledAt && post.scheduledAt > now) {
      post.status = 'scheduled';
    } 
    else if (targetStatus === 'published' || (targetStatus === 'scheduled' && post.scheduledAt && post.scheduledAt <= now)) {
      // If the post has no previous platform results, it has never been published. Send to 'publishing' queue.
      if (!post.platformResults || post.platformResults.length === 0) {
        post.status = 'publishing';
      } else {
        post.status = 'published'; // It's an edit of an already published post
      }
    } 
    else {
      post.status = targetStatus;
    }

    // ✅ UPDATE YOUTUBE METADATA
    if (youtubeTitle !== undefined)       post.youtubeTitle = youtubeTitle;
    if (youtubeTags !== undefined)        post.youtubeTags = Array.isArray(youtubeTags) ? youtubeTags : [];
    if (youtubeCategory !== undefined)    post.youtubeCategory = youtubeCategory;
    if (youtubePrivacy !== undefined)     post.youtubePrivacy = youtubePrivacy;
    if (youtubeMadeForKids !== undefined) post.youtubeMadeForKids = youtubeMadeForKids;
    if (youtubeThumbnail !== undefined)   post.youtubeThumbnail = youtubeThumbnail;

    post.updatedAt = new Date();
    await post.save();

    // ──────────────────────────────────────────────────────────
    // SCENARIO 1: First-time publish (Scheduled time arrived during edit)
    // ──────────────────────────────────────────────────────────
    if (post.status === 'publishing') {
      const accountsFull = [];
      for (const id of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id, userId: req.user.id, isActive: true }).select('-_id -__v');
        if (acc) {
          let accObj = acc.toObject ? acc.toObject() : acc;
          if (post.selectedPages && post.selectedPages[id] && accObj.pages) {
            accObj.pages = accObj.pages.map(p => ({
              ...p,
              isSelected: post.selectedPages[id].includes(p.pageId)
            }));
          }
          accountsFull.push(accObj);
        }
      }

      const result = await publishPostToPlatforms(post, accountsFull);
      
      post.status = result.status;
      post.platformResults = result.platformResults;
      post.publishedAt = new Date();
      await post.save();
    }
    // ──────────────────────────────────────────────────────────
    // SCENARIO 2: Re-syncing an ALREADY published post (Edit mode)
    // ──────────────────────────────────────────────────────────
    else if (post.status === 'published' && post.platformResults.length > 0) {
      const accounts = [];
      for (const id of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id, userId: req.user.id, isActive: true });
        if (acc) {
          if (selectedPages && selectedPages[id] && acc.pages) {
            acc.pages = acc.pages.map(p => ({
              ...p,
              isSelected: selectedPages[id].includes(p.pageId)
            }));
          }
          accounts.push(acc);
        }
      }

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

    await Post.updateOne({ id: req.params.postId }, { status: 'publishing' });
    const result = await publishPostToPlatforms(post, accountsFull);

    await Post.updateOne({ id: req.params.postId }, {
      status:          result.status,
      platformResults: result.platformResults,
      publishedAt:     new Date()
    });

    res.json({
      message: 'Post published',
      status: result.status,
      platformResults: result.platformResults
    });
  } catch (error) {
    res.status(500).json({ detail: 'Failed to publish post' });
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
    const fileIdentifier = fileId || uploadId;

    if (!req.file) {
      return res.status(400).json({ success: false, detail: 'No chunk uploaded' });
    }
    if (!fileIdentifier || chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({ success: false, detail: 'Missing required chunk fields' });
    }

    const chunksDir = path.join(__dirname, '../uploads/chunks');
    const sessionDir = path.join(chunksDir, fileIdentifier);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    logger.info(`[CHUNK] Saved chunk ${chunkIndex}/${totalChunks} for file ${fileIdentifier}`);

    const uploadedChunks = fs.readdirSync(sessionDir).filter(f => f.startsWith('chunk_'));
    const allChunksUploaded = uploadedChunks.length === parseInt(totalChunks);

    if (!allChunksUploaded) {
      return res.status(200).json({
        success: true,
        message: `Chunk ${chunkIndex} uploaded`,
        progress: Math.round((uploadedChunks.length / totalChunks) * 100)
      });
    }

    logger.info(`[CHUNK] All chunks received for ${fileIdentifier}, assembling...`);

    const sortedChunks = uploadedChunks
      .sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]))
      .map(f => fs.readFileSync(path.join(sessionDir, f)));

    const fileBuffer = Buffer.concat(sortedChunks);

    const isVideo = mimeType?.startsWith('video');
    const timestamp = Date.now();
  let cleanName = path.parse(originalName).name.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '_');
    if (cleanName.length > 20) {
      cleanName = cleanName.substring(0, 20);
    }
    if (isVideo) {
      const filename = `${timestamp}-${cleanName}.mp4`;
      const filepath = path.join(__dirname, '../uploads', filename);

      fs.writeFileSync(filepath, fileBuffer);
      const fileUrl = `https://${req.get('host')}/uploads/${filename}`;
      const stats = fs.statSync(filepath);

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
      const filename = `${timestamp}-${cleanName}.jpg`;
      const filepath = path.join(__dirname, '../uploads', filename);

      try {
        await sharp(fileBuffer)
          .rotate()
          .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: false, mozjpeg: true, density: 72 })
          .toFile(filepath);

        const stats = fs.statSync(filepath);
        const fileUrl = `https://${req.get('host')}/uploads/${filename}`;

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
        return res.status(500).json({ success: false, detail: `Image processing failed: ${sharpError.message}` });
      }
    }
  } catch (error) {
    logger.error(`[CHUNK] Error: ${error.message}`);
    res.status(500).json({ success: false, detail: error.message || 'Failed to upload chunk' });
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