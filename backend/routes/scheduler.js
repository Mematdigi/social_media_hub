const express = require('express');
const cron = require('node-cron');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const { publishPostToPlatforms } = require('../services/publishService');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ════════════════════════════════════════════════════════════
// GET /api/scheduler/calendar 
// ════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════
// BACKGROUND WORKER: Automatically publish scheduled posts
// ════════════════════════════════════════════════════════════

// ✅ PREVENT PM2 DOUBLE EXECUTION: Only run the cron job on Instance 0
if (process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE) {
  
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      
      // ✅ PREVENT TIME-OVERLAP: Use a while loop with an Atomic Lock.
      // This guarantees that even if a YouTube upload takes 30 minutes, 
      // no other cron tick will EVER pick up this same post.
      while (true) {
        
        // 1 & 2. Find ONE post and lock it INSTANTLY
        const post = await Post.findOneAndUpdate(
          { 
            status: 'scheduled', 
            scheduledAt: { $lte: now } 
          },
          { 
            $set: { status: 'publishing' } 
          },
          { 
            new: true, // Returns the locked document
            sort: { scheduledAt: 1 } // Process oldest first
          }
        );

        // If no more scheduled posts are found, break out of the loop
        if (!post) break;

        logger.info('🚀', `Locked and processing scheduled post: ${post.id}`);

        try {
          // 3. Fetch full account details and FILTER by selected pages
          const accountsFull = [];
          const selectedPageIds = post.selectedPages || {}; 
          console.log("Selected pages for post:", post.selectedPages);

          for (const accId of post.accountIds || []) {
            const accDoc = await SocialAccount.findOne({ id: accId }).select('-_id -__v');
            if (!accDoc) continue;

            let acc = accDoc.toObject ? accDoc.toObject() : accDoc;

            if (selectedPageIds[accId] && acc.pages?.length) {
              const chosenIds = selectedPageIds[accId];
              acc.pages = acc.pages.map(p => ({
                ...p,
                isSelected: chosenIds.includes(p.pageId)
              }));
            } else if (acc.pages) {
              acc.pages = acc.pages.map(p => ({ ...p, isSelected: false }));
            }

            accountsFull.push(acc);
          }

          if (!accountsFull.length) {
            throw new Error('No connected accounts found for this post.');
          }
          
          // 4. Fire your existing publish service (This may take minutes for YouTube!)
          const result = await publishPostToPlatforms(post, accountsFull);

          // 5. Update the database with the final results
          await Post.updateOne({ id: post.id }, {
            status: result.status,
            platformResults: result.platformResults,
            publishedAt: new Date()
          });

          logger.info('✅', `Scheduled post ${post.id} completed with status: ${result.status}`);

        } catch (error) {
          logger.error('❌', `Failed to process scheduled post ${post.id}: ${error.message}`);
          await Post.updateOne({ id: post.id }, { 
            status: 'failed',
            error: error.message 
          });
        }
      } // End of While Loop
      
    } catch (error) {
      logger.error('❌ Error in scheduler cron job', error);
    }
  });

} else {
  console.log(`[Instance ${process.env.NODE_APP_INSTANCE}] Skipping cron job initialization to prevent duplicate posts.`);
}

module.exports = router;