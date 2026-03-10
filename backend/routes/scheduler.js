const express = require('express');
const Post = require('../models/Post');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/scheduler/calendar
router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    
    const posts = await Post.find({
      userId: req.user.id,
      $or: [
        { scheduledAt: { $gte: startDate, $lt: endDate } },
        { publishedAt: { $gte: startDate, $lt: endDate } },
        { createdAt: { $gte: startDate, $lt: endDate } }
      ]
    }).select('-_id -__v');
    
    // Group by date
    const calendarData = {};
    for (const post of posts) {
      let dateStr = null;
      if (post.scheduledAt) {
        dateStr = post.scheduledAt.toISOString().substring(0, 10);
      } else if (post.publishedAt) {
        dateStr = post.publishedAt.toISOString().substring(0, 10);
      } else if (post.createdAt) {
        dateStr = post.createdAt.toISOString().substring(0, 10);
      }
      
      if (dateStr) {
        if (!calendarData[dateStr]) {
          calendarData[dateStr] = [];
        }
        calendarData[dateStr].push({
          id: post.id,
          content: post.content.length > 60 ? post.content.substring(0, 60) + '...' : post.content,
          platforms: post.platforms,
          status: post.status,
          scheduledAt: post.scheduledAt?.toISOString() || null,
          publishedAt: post.publishedAt?.toISOString() || null
        });
      }
    }
    
    res.json(calendarData);
  } catch (error) {
    logger.error('Failed to get calendar', error);
    res.status(500).json({ detail: 'Failed to get calendar' });
  }
});

module.exports = router;
