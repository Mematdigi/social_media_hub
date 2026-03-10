const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Analytics = require('../models/Analytics');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const PLATFORMS = require('../config/platforms');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Fetch mock analytics from platform
const fetchPlatformAnalytics = async (platform, accessToken, accountId) => {
  logger.info('📊', `Fetching analytics from ${platform}...`);
  
  const baseFollowers = Math.floor(Math.random() * 49000) + 1000;
  return {
    followers: baseFollowers,
    followersGrowth: Math.floor(Math.random() * 250) - 50,
    reach: Math.floor(Math.random() * baseFollowers * 9) + baseFollowers,
    impressions: Math.floor(Math.random() * baseFollowers * 13) + baseFollowers * 2,
    engagement: Math.floor(Math.random() * 4900) + 100,
    engagementRate: parseFloat((Math.random() * 7 + 1).toFixed(2)),
    likes: Math.floor(Math.random() * 2950) + 50,
    comments: Math.floor(Math.random() * 490) + 10,
    shares: Math.floor(Math.random() * 295) + 5,
    clicks: Math.floor(Math.random() * 980) + 20,
    profileViews: Math.floor(Math.random() * 1900) + 100,
    postsCount: Math.floor(Math.random() * 19) + 1
  };
};

// GET /api/analytics/overview
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    
    const accounts = await SocialAccount.find({ userId: req.user.id });
    const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followers || 0), 0);
    
    const analytics = await Analytics.find({
      userId: req.user.id,
      date: { $gte: startDate.substring(0, 10), $lte: endDate.substring(0, 10) }
    });
    
    const totalReach = analytics.reduce((sum, a) => sum + (a.reach || 0), 0);
    const avgEngagementRate = analytics.length > 0 
      ? parseFloat((analytics.reduce((sum, a) => sum + (a.engagementRate || 0), 0) / analytics.length).toFixed(2))
      : 0;
    const followersGrowth = analytics.reduce((sum, a) => sum + (a.followersGrowth || 0), 0);
    
    const postsCount = await Post.countDocuments({ userId: req.user.id, status: 'published' });
    
    // Platform summary
    const platformSummary = accounts.map(acc => {
      const accAnalytics = analytics.filter(a => a.accountId === acc.id);
      const avgRate = accAnalytics.length > 0
        ? parseFloat((accAnalytics.reduce((sum, a) => sum + (a.engagementRate || 0), 0) / accAnalytics.length).toFixed(2))
        : 0;
      return {
        platform: acc.platform,
        accountName: acc.accountName,
        followers: acc.followers || 0,
        engagementRate: avgRate
      };
    });
    
    const topPlatform = platformSummary.length > 0 
      ? platformSummary.reduce((max, p) => p.followers > max.followers ? p : max).platform 
      : null;
    
    const growthPercent = followersGrowth >= 0 
      ? `+${((followersGrowth / Math.max(totalFollowers - followersGrowth, 1)) * 100).toFixed(1)}%`
      : `${((followersGrowth / Math.max(totalFollowers, 1)) * 100).toFixed(1)}%`;
    
    res.json({
      totalFollowers,
      followersGrowth,
      followersGrowthPercent: growthPercent,
      totalReach,
      avgEngagementRate,
      totalPosts: postsCount,
      topPlatform,
      platformSummary
    });
  } catch (error) {
    logger.error('Failed to get analytics overview', error);
    res.status(500).json({ detail: 'Failed to get analytics overview' });
  }
});

// GET /api/analytics/followers
router.get('/followers', authMiddleware, async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    
    const analytics = await Analytics.find({
      userId: req.user.id,
      date: { $gte: startDate.substring(0, 10), $lte: endDate.substring(0, 10) }
    }).sort({ date: 1 });
    
    const platformColors = {};
    PLATFORMS.forEach(p => { platformColors[p.platform] = p.color; });
    
    const platformsData = {};
    const datesSet = new Set();
    
    analytics.forEach(a => {
      const date = a.date;
      datesSet.add(date);
      if (!platformsData[a.platform]) platformsData[a.platform] = {};
      platformsData[a.platform][date] = a.followers;
    });
    
    const dates = Array.from(datesSet).sort();
    const series = Object.entries(platformsData).map(([platform, data]) => ({
      platform,
      color: platformColors[platform] || '#6366F1',
      data: dates.map(d => data[d] || 0)
    }));
    
    res.json({ dates, series });
  } catch (error) {
    logger.error('Failed to get followers chart', error);
    res.status(500).json({ detail: 'Failed to get followers chart' });
  }
});

// GET /api/analytics/engagement
router.get('/engagement', authMiddleware, async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    
    const analytics = await Analytics.find({
      userId: req.user.id,
      date: { $gte: startDate.substring(0, 10), $lte: endDate.substring(0, 10) }
    });
    
    const platformMetrics = {};
    analytics.forEach(a => {
      if (!platformMetrics[a.platform]) {
        platformMetrics[a.platform] = { likes: 0, comments: 0, shares: 0 };
      }
      platformMetrics[a.platform].likes += a.likes || 0;
      platformMetrics[a.platform].comments += a.comments || 0;
      platformMetrics[a.platform].shares += a.shares || 0;
    });
    
    const platforms = Object.keys(platformMetrics);
    res.json({
      platforms,
      metrics: {
        likes: platforms.map(p => platformMetrics[p].likes),
        comments: platforms.map(p => platformMetrics[p].comments),
        shares: platforms.map(p => platformMetrics[p].shares)
      }
    });
  } catch (error) {
    logger.error('Failed to get engagement chart', error);
    res.status(500).json({ detail: 'Failed to get engagement chart' });
  }
});

// GET /api/analytics/posts
router.get('/posts', authMiddleware, async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();
    
    const posts = await Post.find({
      userId: req.user.id,
      status: 'published',
      publishedAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).select('-_id -__v');
    
    const result = posts.map(post => {
      const engagement = Math.floor(Math.random() * 4900) + 100;
      const likes = Math.floor(engagement * 0.7);
      const comments = Math.floor(engagement * 0.2);
      const shares = Math.floor(engagement * 0.1);
      const reach = engagement * (Math.floor(Math.random() * 40) + 10);
      
      return {
        id: post.id,
        content: post.content.length > 60 ? post.content.substring(0, 60) + '...' : post.content,
        platforms: post.platforms,
        publishedAt: post.publishedAt?.toISOString(),
        likes,
        comments,
        shares,
        reach,
        engagementRate: parseFloat(((likes + comments + shares) / Math.max(reach, 1) * 100).toFixed(2))
      };
    });
    
    result.sort((a, b) => b.engagementRate - a.engagementRate);
    res.json(result.slice(0, 20));
  } catch (error) {
    logger.error('Failed to get top posts', error);
    res.status(500).json({ detail: 'Failed to get top posts' });
  }
});

// POST /api/analytics/sync
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ userId: req.user.id, isActive: true });
    const today = new Date().toISOString().substring(0, 10);
    
    for (const account of accounts) {
      try {
        const data = await fetchPlatformAnalytics(account.platform, '', account.accountId);
        
        await Analytics.findOneAndUpdate(
          { accountId: account.id, date: today },
          {
            id: uuidv4(),
            userId: req.user.id,
            accountId: account.id,
            platform: account.platform,
            date: today,
            ...data
          },
          { upsert: true }
        );
        
        await SocialAccount.updateOne({ id: account.id }, { followers: data.followers });
        logger.success(`Analytics synced: ${account.platform}`);
      } catch (error) {
        logger.error(`Analytics sync failed for ${account.platform}`, error);
      }
    }
    
    res.json({ synced: accounts.length });
  } catch (error) {
    logger.error('Failed to sync analytics', error);
    res.status(500).json({ detail: 'Failed to sync analytics' });
  }
});

module.exports = router;
