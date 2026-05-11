const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const { publishPostToPlatforms } = require('../services/publishService');
const { encrypt, decrypt } = require('../utils/encryption');
const axios = require('axios');


const router = express.Router();

// ─── Helper: format post for response ────────────────────────────────────────
const formatPost = (post, accounts = []) => ({
  id: post.id,
  userId: post.userId,
  content: post.content,
  mediaUrls: post.mediaUrls || [],
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
    // Per-page breakdown (Facebook, LinkedIn pages, etc.)
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

// ─── Helper: fetch full account docs (with pages[]) for publishing ────────────
// selectedPageIds: optional map { accountId → [pageId, ...] } to override isSelected
const getAccountsForPublish = async (accountIds, selectedPageIds = {}) => {
  const accounts = [];

  for (const accId of accountIds) {
    const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
    if (!acc) continue;

    // If caller specified which pages to post to, override isSelected
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

// ─── Helper: safe account summary (no tokens) for GET responses ───────────────
const safeAccount = (acc) => ({
  id: acc.id,
  accountId: acc.accountId,
  accountName: acc.accountName,
  profilePicture: acc.profilePicture,
  platform: acc.platform,
  // Include pages summary (no tokens)
  pages: (acc.pages || []).map(p => ({
    pageId:     p.pageId,
    pageName:   p.pageName,
    category:   p.category,
    isSelected: p.isSelected
  }))
});

// ─── GET /api/posts ───────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.status) query.status = req.query.status;

    // ── Step 1: DB posts ───────────────────────────────────────────────────
    const dbPosts = await Post.find(query).sort({ createdAt: -1 }).select('-_id -__v');

    // ── Step 2: all connected accounts for this user ───────────────────────
    const allAccounts = await SocialAccount.find({
      userId:   req.user.id,
      isActive: true,
    });

    const fbAccounts = allAccounts.filter(a => a.platform === 'facebook');
    const igAccounts = allAccounts.filter(a => a.platform === 'instagram'); // ← NEW

    // ── Step 3a: fetch live posts from every Facebook page ─────────────────
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
                fields:       'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)',
                limit:        100,
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

          logger.info('🔄', `Fetched ${fbRes.data?.data?.length || 0} posts from FB page "${page.pageName}"`);
        } catch (err) {
          logger.info(`FB page "${page.pageName}" fetch failed: ${err.response?.data?.error?.message || err.message}`);
        }
      }
    }

    // ── Step 3b: fetch live posts from every Instagram account ────────────
    const igPostMetaMap = {};

    for (const account of igAccounts) {
      const page = (account.pages || [])[0]; // IG always has one linked FB page
      if (!page?.pageAccessToken) continue;

      try {
        const pageToken   = decrypt(page.pageAccessToken);
        const igAccountId = account.accountId; // IG Business account ID

        const igRes = await axios.get(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`,
          {
            params: {
              fields:       'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
              limit:        100,
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
            mediaType:    igPost.media_type || 'IMAGE',   // IMAGE | VIDEO | CAROUSEL_ALBUM
            mediaUrls:    igPost.media_url  ? [igPost.media_url] : [],
            thumbnailUrl: igPost.thumbnail_url || null,   // for VIDEO/REELS
            createdTime:  igPost.timestamp,
            permalinkUrl: igPost.permalink  || null,
            likes:        igPost.like_count     || 0,
            comments:     igPost.comments_count || 0,
          };
        }

        logger.info('🔄', `Fetched ${igRes.data?.data?.length || 0} posts from IG @${account.igUsername}`);
      } catch (err) {
        logger.info(`IG account "@${account.igUsername}" fetch failed: ${err.response?.data?.error?.message || err.message}`);
      }
    }

    // ── Step 4: build set of platformPostIds already in DB ────────────────
    const dbPlatformPostIds = new Set();
    for (const post of dbPosts) {
      for (const r of post.platformResults || []) {
        if (r.platformPostId) dbPlatformPostIds.add(r.platformPostId);
      }
    }

    // ── Step 5a: save new Facebook posts not yet in DB ────────────────────
    const newPosts = [];

    for (const [fbPostId, meta] of Object.entries(fbPostMetaMap)) {
      if (dbPlatformPostIds.has(fbPostId)) continue;
      if (!meta.content.trim()) continue;

      const postId   = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newPost = new Post({
        id:                 postId,
        userId:             req.user.id,
        content:            meta.content,
        mediaUrls:          meta.mediaUrls,
        accountIds:         [meta.accountId],
        platforms:          ['facebook'],
        status:             'published',
        publishedAt:        postTime,
        syncedFromPlatform: true,
        platformResults: [{
          platform:       'facebook',
          accountId:      meta.accountId,
          platformPostId: fbPostId,
          status:         'published',
          publishedAt:    postTime,
          pages: [{
            pageId:   meta.pageId,
            pageName: meta.pageName,
            postId:   fbPostId,
            status:   'published',
            error:    null,
          }],
        }],
        createdAt: postTime,
        updatedAt: new Date(),
      });

      try {
        await newPost.save();
        dbPlatformPostIds.add(fbPostId);
        newPosts.push(newPost);
        logger.info('💾', `Auto-saved FB post ${fbPostId} from page "${meta.pageName}"`);
      } catch (err) {
        if (err.code !== 11000) {
          logger.info(`Could not save FB post ${fbPostId}: ${err.message}`);
        }
      }
    }

    // ── Step 5b: save new Instagram posts not yet in DB ───────────────────
    for (const [igPostId, meta] of Object.entries(igPostMetaMap)) {
      if (dbPlatformPostIds.has(igPostId)) continue;
      // Skip posts with no caption AND no media (completely empty)
      if (!meta.content.trim() && !meta.mediaUrls.length) continue;

      const postId   = uuidv4();
      const postTime = new Date(meta.createdTime);

      const newIGPost = new Post({
        id:                 postId,
        userId:             req.user.id,
        content:            meta.content,
        mediaUrls:          meta.mediaUrls,
        mediaType:          meta.mediaType,      // IMAGE | VIDEO | CAROUSEL_ALBUM
        accountIds:         [meta.accountId],
        platforms:          ['instagram'],
        status:             'published',
        publishedAt:        postTime,
        syncedFromPlatform: true,
        platformResults: [{
          platform:       'instagram',
          accountId:      meta.accountId,
          platformPostId: igPostId,
          status:         'published',
          publishedAt:    postTime,
          pages: [{
            pageId:   meta.pageId,
            pageName: meta.pageName,
            postId:   igPostId,
            status:   'published',
            error:    null,
          }],
        }],
        createdAt: postTime,
        updatedAt: new Date(),
      });

      try {
        await newIGPost.save();
        dbPlatformPostIds.add(igPostId);
        logger.info('💾', `Auto-saved IG post ${igPostId} from @${meta.igUsername}`);
      } catch (err) {
        if (err.code !== 11000) {
          logger.warn(`Could not save IG post ${igPostId}: ${err.message}`);
        }
      }
    }

    // ── Step 6: reload all posts from DB ──────────────────────────────────
    const allPosts = await Post.find(query).sort({ createdAt: -1 }).select('-_id -__v');

    // ── Step 7: build final response — enrich with live FB + IG metadata ──
    const result = [];

    for (const post of allPosts) {
      // Resolve account summaries
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id: accId });
        if (acc) accounts.push(safeAccount(acc));
      }

      // Enrich platformResults — picks FB or IG meta based on which map has the ID
      const enrichedResults = (post.platformResults || []).map(r => {
        const fbMeta = r.platformPostId ? (fbPostMetaMap[r.platformPostId] || null) : null;
        const igMeta = r.platformPostId ? (igPostMetaMap[r.platformPostId] || null) : null;
        const meta   = fbMeta || igMeta; // one will always be null

        return {
          platform:       r.platform,
          accountId:      r.accountId,
          platformPostId: r.platformPostId || null,
          status:         r.status,
          error:          r.error          || null,
          publishedAt:    r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
          // Shared live data
          pageName:       meta?.pageName     || null,
          pageId:         meta?.pageId       || null,
          permalinkUrl:   meta?.permalinkUrl || null,
          likes:          meta?.likes        ?? null,
          comments:       meta?.comments     ?? null,
          // Instagram-only fields (null for Facebook posts)
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

// ─── GET /api/posts/:postId ───────────────────────────────────────────────────
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

                                //  If omitted, posts to all isSelected pages.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      content,
      accountIds,
      mediaUrls = [],
      status = 'draft',
      scheduledAt,
      selectedPages = {}   // { accountId: [pageId, ...] }
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ detail: 'Content is required' });
    }
    if (!accountIds || accountIds.length === 0) {
      return res.status(400).json({ detail: 'At least one account must be selected' });
    }

    // Resolve platforms list
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
      mediaUrls,
      accountIds,
      platforms,
      status: postStatus,
      scheduledAt: scheduledDate,
      platformResults: [],
      createdAt: now,
      updatedAt: now
    });

    await post.save();

    // Publish immediately if needed
    if (postStatus === 'publishing') {
      const accountsFull = await getAccountsForPublish(accountIds, selectedPages);
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

    logger.info('📝', `New post created by ${req.user.name} — Status: ${post.status}`);
    res.status(201).json(formatPost(post, []));
  } catch (error) {
    logger.error('Failed to create post', error);
    res.status(500).json({ detail: 'Failed to create post' });
  }
});


// ─── DELETE /api/posts/:postId ────────────────────────────────────────────────
router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const deleteFromPlatform = req.query.deleteFromPlatform !== 'false';
    const platformErrors     = [];

    if (deleteFromPlatform && post.status === 'published') {
      for (const result of post.platformResults || []) {
        if (result.status !== 'published' || !result.platformPostId) continue;
        try {
          const account = await SocialAccount.findOne({ id: result.accountId });
          if (!account) continue;  
          // ── Facebook delete ──────────────────────────────────────────────
          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) {
              platformErrors.push({ platform: 'facebook', error: 'Page token not found' });
              continue;
            }

            await axios.delete(
              `https://graph.facebook.com/v19.0/${result.platformPostId}`,
              { params: { access_token: pageToken } }
            );
            logger.info('📘', `Deleted FB post ${result.platformPostId}`);
          }

          // ── Instagram delete ─────────────────────────────────────────────
          // IG Graph API: DELETE /{ig-media-id} using page access token
          if (result.platform === 'instagram') {
            const page = (account.pages || [])[0];
            if (!page?.pageAccessToken) {
              platformErrors.push({ platform: 'instagram', error: 'Page token not found' });
              continue;
            }

            const pageToken = decrypt(page.pageAccessToken);

            await axios.delete(
              `https://graph.facebook.com/v19.0/${result.platformPostId}`,
              { params: { access_token: pageToken } }
            );
            logger.info('📷', `Deleted IG post ${result.platformPostId}`);
          }

        } catch (err) {
          const errMsg = err.response?.data?.error?.message || err.message;
          logger.info(`Could not delete from ${result.platform}: ${errMsg}`);
          platformErrors.push({ platform: result.platform, error: errMsg });
        }
      }
    }

    await Post.deleteOne({ id: req.params.postId, userId: req.user.id });
    logger.info('📝', `Post ${req.params.postId} deleted`);

    res.json({
      message:        'Post deleted successfully',
      platformErrors: platformErrors.length > 0 ? platformErrors : undefined,
    });
  } catch (error) {
    logger.error('Failed to delete post', error);
    res.status(500).json({ detail: 'Failed to delete post' });
  }
});


// ─── PUT /api/posts/:postId ───────────────────────────────────────────────────
router.put('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) return res.status(404).json({ detail: 'Post not found' });

    const {
      content,
      accountIds,
      mediaUrls,
      mediaType,                // ← NEW: 'IMAGE' | 'REELS' | 'CAROUSEL'
      status,
      scheduledAt,
      syncToPlatform = true
    } = req.body;

    const updateData = { updatedAt: new Date() };

    if (content   !== undefined) updateData.content   = content;
    if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;
    if (mediaType !== undefined) updateData.mediaType = mediaType; // ← NEW

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
      if (scheduledAt && new Date(scheduledAt) > new Date()) updateData.status = 'scheduled';
    }

    if (status !== undefined) updateData.status = status;

    // ── Sync content edits to live platforms ──────────────────────────────
    if (
      content !== undefined &&
      content !== post.content &&
      post.status === 'published'
    ) {
      for (const result of post.platformResults || []) {
        if (result.status !== 'published' || !result.platformPostId) continue;

        try {
          const account = await SocialAccount.findOne({ accountId: result.accountId });
          if (!account) continue;

          // ── Facebook: update caption via POST /{post-id} ───────────────
          if (result.platform === 'facebook') {
            const pageToken = getPageTokenForPost(account, result.platformPostId);
            if (!pageToken) {
              continue;
            }

            await axios.post(
              `https://graph.facebook.com/v19.0/${result.platformPostId}`,
              { message: content, access_token: pageToken }
            );
            logger.info('📘', `Updated FB post ${result.platformPostId}`);
          }

          // ── Instagram: update caption via POST /{ig-media-id} ──────────
          // IG Graph API only supports caption edits on published media
          // Media itself (image/video) cannot be replaced — caption only
       // ── Instagram: update caption via POST /{ig-media-id} ──────────
// ── Instagram: update caption ────────────────────────────────────
console.log('📷', `Attempting to update IG caption for post ${result.platform}`);
if (result.platform === 'instagram') {
  const page = (account.pages || [])[0];
  if (!page?.pageAccessToken) continue;
  const pageToken = decrypt(page.pageAccessToken);

  // ── BEFORE ───────────────────────────────────────────────────
  const beforeRes = await axios.get(
    `https://graph.facebook.com/v19.0/${result.platformPostId}`,
    { params: { fields: 'id,caption', access_token: pageToken } }
  );
  logger.info('📷', `BEFORE: "${beforeRes.data.caption}"`);
  logger.info('📷', `SENDING: "${content}"`);
  logger.info('📷', `ARE THEY SAME?: ${beforeRes.data.caption === content}`);

  // ── UPDATE ───────────────────────────────────────────────────
  const updateRes = await axios.post(
    `https://graph.facebook.com/v19.0/${result.platformPostId}`,
    null,
    {
      params: {
        caption:         content,
        comment_enabled: true,
        access_token:    pageToken
      }
    }
  );
  logger.info('📷', `UPDATE RESPONSE: ${JSON.stringify(updateRes.data)}`);

  // ── AFTER — wait 3s ──────────────────────────────────────────
  await new Promise(r => setTimeout(r, 3000));

  const afterRes = await axios.get(
    `https://graph.facebook.com/v19.0/${result.platformPostId}`,
    { params: { fields: 'id,caption', access_token: pageToken } }
  );
  logger.info('📷', `AFTER:  "${afterRes.data.caption}"`);

  // ── KEY CHECK ────────────────────────────────────────────────
  logger.info('📷', `PLATFORM POST ID IN DB:   ${result.platformPostId}`);
  logger.info('📷', `PLATFORM POST ID IN API:  ${afterRes.data.id}`);
  logger.info('📷', `IDs MATCH?: ${result.platformPostId === afterRes.data.id}`);

  if (afterRes.data.caption === content) {
    logger.info('📷', `✅ CONFIRMED — caption updated on Instagram`);
  } else {
    logger.info(`⚠️ NOT UPDATED — caption unchanged after API call`);
  }
}
        } catch (err) {
          const errMsg = err.response?.data?.error?.message || err.message;
          // Non-fatal — DB is still updated below
        }
      }
    }

    // await Post.updateOne({ id: req.params.postId }, updateData);
    const updatedPost = await Post.findOne({ id: req.params.postId }).select('-_id -__v');

    const accounts = [];
    for (const accId of updatedPost.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId })
        .select('-accessToken -refreshToken -_id -__v');
      if (acc) accounts.push(safeAccount(acc));
    }

    logger.info('📝', `Post ${req.params.postId} updated`);

    // Verify caption was actually updated


    
    res.json(formatPost(updatedPost, accounts));

  } catch (error) {
    logger.error('Failed to update post', error);
    res.status(500).json({ detail: 'Failed to update post' });
  }
});

// ─── POST /api/posts/:postId/publish ─────────────────────────────────────────
// Body (optional):
//   selectedPages object — { "<accountId>": ["<pageId>", ...] }
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

    logger.info(`✅ Post ${req.params.postId} published — status: ${result.status}`);
    res.json({
      message:         'Post published',
      status:          result.status,
      platformResults: result.platformResults
    });
  } catch (error) {
    logger.error('Failed to publish post', error);
    res.status(500).json({ detail: 'Failed to publish post' });
  }
});

// ─── Helper: get page token for a specific platformPostId ─────────────────────
// platformPostId format: "pageId_postId" — extract pageId to find the right page
const getPageTokenForPost = (account, platformPostId) => {
  // Extract pageId from "364011614307982_1333703848777352"
  const pageId = platformPostId?.split('_')[0];
  if (!pageId) return null;

  const page = (account.pages || []).find(p => p.pageId === pageId);
  if (!page?.pageAccessToken) return null;

  return decrypt(page.pageAccessToken);
};
module.exports = router;