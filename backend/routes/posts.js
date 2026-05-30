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
  limits: {     fileSize: 500 * 1024 * 1024  }, // 100MB
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
  createdAt: post.createdAt.toISOString(),
  updatedAt: post.updatedAt.toISOString(),
  accounts
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

// Run scheduled posts processor every minute
setInterval(processScheduledPosts, 60000);

// ════════════════════════════════════════════════════════════
// GET /api/posts - Get All Posts
// ════════════════════════════════════════════════════════════
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.status) query.status = req.query.status;

    const dbPosts = await Post.find(query).sort({ createdAt: -1 }).select('-_id -__v');
    const allAccounts = await SocialAccount.find({ userId: req.user.id, isActive: true });
    const fbAccounts = allAccounts.filter(a => a.platform === 'facebook');
    const igAccounts = allAccounts.filter(a => a.platform === 'instagram');

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
                limit: 100,
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
              limit: 100,
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

    const dbPlatformPostIds = new Set();
    for (const post of dbPosts) {
      for (const r of post.platformResults || []) {
        if (r.platformPostId) dbPlatformPostIds.add(r.platformPostId);
      }
    }

    const newPosts = [];
    for (const [fbPostId, meta] of Object.entries(fbPostMetaMap)) {
      if (dbPlatformPostIds.has(fbPostId)) continue;
      if (!meta.content.trim()) continue;

      const postId = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newPost = new Post({
        id: postId,
        userId: req.user.id,
        content: meta.content,
        mediaUrls: meta.mediaUrls,
        accountIds: [meta.accountId],
        platforms: ['facebook'],
        status: 'published',
        publishedAt: postTime,
        syncedFromPlatform: true,
        platformResults: [{
          platform: 'facebook',
          accountId: meta.accountId,
          platformPostId: fbPostId,
          status: 'published',
          publishedAt: postTime,
          pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: fbPostId, status: 'published', error: null }],
        }],
        createdAt: postTime,
        updatedAt: new Date(),
      });

      try {
        await newPost.save();
        dbPlatformPostIds.add(fbPostId);
        newPosts.push(newPost);
      } catch (err) {}
    }

    for (const [igPostId, meta] of Object.entries(igPostMetaMap)) {
      if (dbPlatformPostIds.has(igPostId)) continue;
      if (!meta.content.trim() && !meta.mediaUrls.length) continue;

      const postId = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newIGPost = new Post({
        id: postId,
        userId: req.user.id,
        content: meta.content,
        mediaUrls: meta.mediaUrls,
        mediaType: meta.mediaType,
        accountIds: [meta.accountId],
        platforms: ['instagram'],
        status: 'published',
        publishedAt: postTime,
        syncedFromPlatform: true,
        platformResults: [{
          platform: 'instagram',
          accountId: meta.accountId,
          platformPostId: igPostId,
          status: 'published',
          publishedAt: postTime,
          pages: [{ pageId: meta.pageId, pageName: meta.pageName, postId: igPostId, status: 'published', error: null }],
        }],
        createdAt: postTime,
        updatedAt: new Date(),
      });

      try {
        await newIGPost.save();
        dbPlatformPostIds.add(igPostId);
      } catch (err) {}
    }

    const allPosts = await Post.find(query).sort({ createdAt: -1 }).select('-_id -__v');
    const result = [];

    for (const post of allPosts) {
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id: accId });
        if (acc) accounts.push(safeAccount(acc));
      }

      const enrichedResults = (post.platformResults || []).map(r => {
        const fbMeta = r.platformPostId ? (fbPostMetaMap[r.platformPostId] || null) : null;
        const igMeta = r.platformPostId ? (igPostMetaMap[r.platformPostId] || null) : null;
        const meta = fbMeta || igMeta;

        return {
          platform:       r.platform,
          accountId:      r.accountId,
          platformPostId: r.platformPostId || null,
          status:         r.status,
          error:          r.error          || null,
          publishedAt:    r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
          pageName:       meta?.pageName     || null,
          pageId:         meta?.pageId       || null,
          permalinkUrl:   meta?.permalinkUrl || null,
          likes:          meta?.likes        ?? null,
          comments:       meta?.comments     ?? null,
          mediaType:      igMeta?.mediaType    || null,
          thumbnailUrl:   igMeta?.thumbnailUrl || null,
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

      result.push({
        ...formatPost(post, accounts),
        platformResults: enrichedResults,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('Failed to get posts', error);
    res.status(500).json({ detail: 'Failed to get posts' });
  }
});

// ════════════════════════════════════════════════════════════
// GET /api/posts/:postId
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

    res.json(formatPost(post, accounts));
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
      youtubeTitle, // 🆕 Extract YouTube Title from the request
      accountIds,
      mediaUrls = [],
      mediaFormats = {}, 
      status = 'draft',
      scheduledAt,
      selectedPages = {}
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

    const postId = uuidv4();
    const now = new Date();
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;

    let postStatus = status;
    if (scheduledDate && scheduledDate > now) {
      postStatus = 'scheduled';
    } else if (status === 'published' || (scheduledDate && scheduledDate <= now)) {
      postStatus = 'publishing';
    }

    const post = new Post({
      id: postId,
      userId: req.user.id,
      content,
      youtubeTitle, // 🆕 Save the YouTube title to the database
      mediaUrls,
      mediaFormats, 
      accountIds,
      platforms,
      status: postStatus,
      scheduledAt: scheduledDate,
      platformResults: [],
      createdAt: now,
      updatedAt: now
    });

    await post.save();

    if (postStatus === 'publishing') {
      const accountsFull = await getAccountsForPublish(accountIds, selectedPages);
      // publishPostToPlatforms will now have access to post.youtubeTitle!
      const result = await publishPostToPlatforms(post, accountsFull);

      post.status = result.status;
      post.platformResults = result.platformResults;
      post.publishedAt = new Date();

      await Post.updateOne({ id: postId }, {
        status: result.status,
        platformResults: result.platformResults,
        publishedAt: post.publishedAt
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
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const {
      content, accountIds, mediaUrls, mediaFormats, mediaType, status, scheduledAt, syncToPlatform = true
    } = req.body;

    const updateData = { updatedAt: new Date() };

    if (content !== undefined) updateData.content = content;
    if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;
    if (mediaFormats !== undefined) updateData.mediaFormats = mediaFormats;
    if (mediaType !== undefined) updateData.mediaType = mediaType;

    if (accountIds !== undefined) {
      updateData.accountIds = accountIds;
      const platforms = [];
      for (const accId of accountIds) {
        const acc = await SocialAccount.findOne({ id: accId }).select('platform');
        if (acc) platforms.push(acc.platform);
      }
      updateData.platforms = platforms;
    }

    if (scheduledAt !== undefined) {
      updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      if (scheduledAt && new Date(scheduledAt) > new Date()) {
        updateData.status = 'scheduled';
      }
    }

    if (status !== undefined) updateData.status = status;

    if (content !== undefined && content !== post.content && post.status === 'published') {
      for (const result of post.platformResults || []) {
        if (result.status !== 'published' || !result.platformPostId) continue;
        try {
          const account = await SocialAccount.findOne({ accountId: result.accountId });
          if (!account) continue;

          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) continue;
            await axios.post(`https://graph.facebook.com/v19.0/${result.platformPostId}`, { message: content, access_token: pageToken });
          }

          if (result.platform === 'instagram') {
            const page = (account.pages || [])[0];
            if (!page?.pageAccessToken) continue;
            const pageToken = decrypt(page.pageAccessToken);
            await axios.post(`https://graph.facebook.com/v19.0/${result.platformPostId}`, null, {
              params: { caption: content, comment_enabled: true, access_token: pageToken }
            });
          }
        } catch (err) {}
      }
    }

    await Post.updateOne({ id: req.params.postId }, updateData);
    const updatedPost = await Post.findOne({ id: req.params.postId }).select('-_id -__v');

    const accounts = [];
    for (const accId of updatedPost.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
      if (acc) accounts.push(safeAccount(acc));
    }

    res.json(formatPost(updatedPost, accounts));
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
    }
  } catch (error) {
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