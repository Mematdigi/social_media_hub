const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const authMiddleware = require('../middleware/auth');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

const router = express.Router();

// Platform publish service (mock)
const publishToPlatform = async (platform, accessToken, accountId, content, mediaUrls) => {
  logger.info('📤', `Publishing to ${platform}...`);
  // Mock successful publishing
  return {
    postId: `${platform.substring(0, 2)}_${uuidv4().substring(0, 12)}`,
    status: 'published'
  };
};

// Publish post to all platforms
const publishPostToPlatforms = async (post, accounts) => {
  const platformResults = [];
  
  for (const account of accounts) {
    try {
      const result = await publishToPlatform(
        account.platform,
        decrypt(account.accessToken),
        account.accountId,
        post.content,
        post.mediaUrls
      );
      
      platformResults.push({
        platform: account.platform,
        accountId: account.id,
        platformPostId: result.postId,
        status: result.status,
        publishedAt: new Date()
      });
    } catch (error) {
      logger.error(`Failed to publish to ${account.platform}`, error);
      platformResults.push({
        platform: account.platform,
        accountId: account.id,
        status: 'failed',
        error: error.message
      });
    }
  }
  
  const failedCount = platformResults.filter(r => r.status === 'failed').length;
  const finalStatus = failedCount === platformResults.length ? 'failed' : 'published';
  
  return { status: finalStatus, platformResults };
};

// Helper to format post
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
  platformResults: post.platformResults || [],
  createdAt: post.createdAt.toISOString(),
  updatedAt: post.updatedAt.toISOString(),
  accounts
});

// GET /api/posts
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    const posts = await Post.find(query).sort({ createdAt: -1 }).select('-_id -__v');
    
    const result = [];
    for (const post of posts) {
      const accounts = [];
      for (const accId of post.accountIds || []) {
        const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
        if (acc) {
          accounts.push({
            id: acc.id,
            accountName: acc.accountName,
            profilePicture: acc.profilePicture,
            platform: acc.platform
          });
        }
      }
      result.push(formatPost(post, accounts));
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to get posts', error);
    res.status(500).json({ detail: 'Failed to get posts' });
  }
});

// GET /api/posts/:postId
router.get('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id }).select('-_id -__v');
    if (!post) {
      return res.status(404).json({ detail: 'Post not found' });
    }
    
    const accounts = [];
    for (const accId of post.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
      if (acc) {
        accounts.push({
          id: acc.id,
          accountName: acc.accountName,
          profilePicture: acc.profilePicture,
          platform: acc.platform
        });
      }
    }
    
    res.json(formatPost(post, accounts));
  } catch (error) {
    logger.error('Failed to get post', error);
    res.status(500).json({ detail: 'Failed to get post' });
  }
});

// POST /api/posts
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content, accountIds, mediaUrls = [], status = 'draft', scheduledAt } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ detail: 'Content is required' });
    }
    if (!accountIds || accountIds.length === 0) {
      return res.status(400).json({ detail: 'At least one account must be selected' });
    }
    
    // Get platforms from accounts
    const platforms = [];
    const accountsFull = [];
    for (const accId of accountIds) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
      if (acc) {
        platforms.push(acc.platform);
        accountsFull.push(acc);
      }
    }
    
    const postId = uuidv4();
    const now = new Date();
    
    let postStatus = status;
    let scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    
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
      const result = await publishPostToPlatforms(post, accountsFull);
      post.status = result.status;
      post.platformResults = result.platformResults;
      post.publishedAt = new Date();
      await Post.updateOne({ id: postId }, { 
        status: result.status, 
        platformResults: result.platformResults,
        publishedAt: new Date()
      });
    }
    
    logger.info('📝', `New post created by ${req.user.name} - Status: ${post.status}`);
    res.status(201).json(formatPost(post, []));
  } catch (error) {
    logger.error('Failed to create post', error);
    res.status(500).json({ detail: 'Failed to create post' });
  }
});

// PUT /api/posts/:postId
router.put('/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) {
      return res.status(404).json({ detail: 'Post not found' });
    }
    
    const { content, accountIds, mediaUrls, status, scheduledAt } = req.body;
    const updateData = { updatedAt: new Date() };
    
    if (content !== undefined) updateData.content = content;
    if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;
    
    if (accountIds !== undefined) {
      updateData.accountIds = accountIds;
      const platforms = [];
      for (const accId of accountIds) {
        const acc = await SocialAccount.findOne({ id: accId });
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
    
    await Post.updateOne({ id: req.params.postId }, updateData);
    const updatedPost = await Post.findOne({ id: req.params.postId }).select('-_id -__v');
    
    const accounts = [];
    for (const accId of updatedPost.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-accessToken -refreshToken -_id -__v');
      if (acc) {
        accounts.push({
          id: acc.id,
          accountName: acc.accountName,
          profilePicture: acc.profilePicture,
          platform: acc.platform
        });
      }
    }
    
    logger.info('📝', `Post updated by ${req.user.name}`);
    res.json(formatPost(updatedPost, accounts));
  } catch (error) {
    logger.error('Failed to update post', error);
    res.status(500).json({ detail: 'Failed to update post' });
  }
});

// DELETE /api/posts/:postId
router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const result = await Post.deleteOne({ id: req.params.postId, userId: req.user.id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: 'Post not found' });
    }
    logger.info('📝', 'Post deleted');
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete post', error);
    res.status(500).json({ detail: 'Failed to delete post' });
  }
});

// POST /api/posts/:postId/publish
router.post('/:postId/publish', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findOne({ id: req.params.postId, userId: req.user.id });
    if (!post) {
      return res.status(404).json({ detail: 'Post not found' });
    }
    
    const accounts = [];
    for (const accId of post.accountIds || []) {
      const acc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
      if (acc) accounts.push(acc);
    }
    
    await Post.updateOne({ id: req.params.postId }, { status: 'publishing' });
    
    const result = await publishPostToPlatforms(post, accounts);
    
    await Post.updateOne({ id: req.params.postId }, {
      status: result.status,
      platformResults: result.platformResults,
      publishedAt: new Date()
    });
    
    logger.success(`Post ${req.params.postId} force published`);
    res.json({ message: 'Post published', status: result.status });
  } catch (error) {
    logger.error('Failed to publish post', error);
    res.status(500).json({ detail: 'Failed to publish post' });
  }
});

// Export publish function for scheduler
module.exports = router;
module.exports.publishPostToPlatforms = publishPostToPlatforms;
