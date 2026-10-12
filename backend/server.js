require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const postRoutes = require('./routes/posts');
const schedulerRoutes = require('./routes/scheduler');
const inboxRoutes = require('./routes/inbox');
const analyticsRoutes = require('./routes/analytics');

// Import models and services for cron jobs
const Post = require('./models/Post');
const SocialAccount = require('./models/SocialAccount');
const Message = require('./models/Message');
const Analytics = require('./models/Analytics');
const User = require('./models/User');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const { startScheduler } = require('./routes/scheduler'); // Add this import

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ detail: 'Internal server error' });
});

// Platform publish service (mock)
const publishToPlatform = async (platform, content) => {
  return {
    postId: `${platform.substring(0, 2)}_${uuidv4().substring(0, 12)}`,
    status: 'published'
  };
};



// // Auto-publish scheduled posts (every minute)
// cron.schedule('* * * * *', async () => {
//   logger.info('⏰', 'Scheduler: checking due posts...');
  
//   try {
//     const now = new Date();
//     const posts = await Post.find({
//       status: 'scheduled',
//       scheduledAt: { $lte: now }
//     });
    
//     for (const post of posts) {
//       try {
//         const accounts = await SocialAccount.find({ id: { $in: post.accountIds } });
        
//         await Post.updateOne({ id: post.id }, { status: 'publishing' });
        
//         const platformResults = [];
//         for (const account of accounts) {
//           try {
//             const result = await publishToPlatform(account.platform, post.content);
//             platformResults.push({
//               platform: account.platform,
//               accountId: account.id,
//               platformPostId: result.postId,
//               status: result.status,
//               publishedAt: new Date()
//             });
//           } catch (error) {
//             platformResults.push({
//               platform: account.platform,
//               accountId: account.id,
//               status: 'failed',
//               error: error.message
//             });
//           }
//         }
        
//         const failedCount = platformResults.filter(r => r.status === 'failed').length;
//         const finalStatus = failedCount === platformResults.length ? 'failed' : 'published';
        
//         await Post.updateOne({ id: post.id }, {
//           status: finalStatus,
//           platformResults,
//           publishedAt: new Date()
//         });
        
//         logger.success(`Auto-published post ${post.id}`);
//       } catch (error) {
//         logger.error(`Failed to auto-publish post ${post.id}`, error);
//         await Post.updateOne({ id: post.id }, { status: 'failed' });
//       }
//     }
//   } catch (error) {
//     logger.error('Auto-publish cron failed', error);
//   }
// });

// // Auto-sync inbox (every 15 minutes)
// cron.schedule('*/15 * * * *', async () => {
//   logger.info('📨', 'Auto inbox sync running...');
  
//   try {
//     const users = await User.find({}, 'id');
    
//     for (const user of users) {
//       const accounts = await SocialAccount.find({ userId: user.id, isActive: true });
      
//       for (const account of accounts) {
//         // Generate 0-2 mock messages
//         const count = Math.floor(Math.random() * 3);
//         const types = ['dm', 'comment', 'mention', 'reply'];
//         const names = ['Alex Johnson', 'Sarah Smith', 'Mike Chen'];
//         const contents = ['Love your content!', 'Great post!', 'Thanks for sharing!'];
        
//         for (let i = 0; i < count; i++) {
//           const externalId = `${account.platform}_${uuidv4().substring(0, 12)}`;
//           const existing = await Message.findOne({ externalId, platform: account.platform });
          
//           if (!existing) {
//             const name = names[Math.floor(Math.random() * names.length)];
//             await new Message({
//               id: uuidv4(),
//               userId: user.id,
//               accountId: account.id,
//               platform: account.platform,
//               type: types[Math.floor(Math.random() * types.length)],
//               externalId,
//               senderName: name,
//               senderHandle: `@${name.toLowerCase().replace(' ', '_')}`,
//               senderAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
//               content: contents[Math.floor(Math.random() * contents.length)],
//               isRead: false,
//               isReplied: false,
//               receivedAt: new Date()
//             }).save();
//           }
//         }
//       }
//     }
    
//     logger.success('Auto inbox sync completed');
//   } catch (error) {
//     logger.error('Auto inbox sync failed', error);
//   }
// });

// // Daily analytics sync (at 2 AM)
// cron.schedule('0 2 * * *', async () => {
//   logger.info('📊', 'Daily analytics sync running...');
  
//   try {
//     const users = await User.find({}, 'id');
//     const today = new Date().toISOString().substring(0, 10);
    
//     for (const user of users) {
//       const accounts = await SocialAccount.find({ userId: user.id, isActive: true });
      
//       for (const account of accounts) {
//         const baseFollowers = Math.floor(Math.random() * 49000) + 1000;
//         const data = {
//           followers: baseFollowers,
//           followersGrowth: Math.floor(Math.random() * 250) - 50,
//           reach: Math.floor(Math.random() * baseFollowers * 9) + baseFollowers,
//           impressions: Math.floor(Math.random() * baseFollowers * 13) + baseFollowers * 2,
//           engagement: Math.floor(Math.random() * 4900) + 100,
//           engagementRate: parseFloat((Math.random() * 7 + 1).toFixed(2)),
//           likes: Math.floor(Math.random() * 2950) + 50,
//           comments: Math.floor(Math.random() * 490) + 10,
//           shares: Math.floor(Math.random() * 295) + 5,
//           clicks: Math.floor(Math.random() * 980) + 20,
//           profileViews: Math.floor(Math.random() * 1900) + 100,
//           postsCount: Math.floor(Math.random() * 19) + 1
//         };
        
//         await Analytics.findOneAndUpdate(
//           { accountId: account.id, date: today },
//           {
//             id: uuidv4(),
//             userId: user.id,
//             accountId: account.id,
//             platform: account.platform,
//             date: today,
//             ...data
//           },
//           { upsert: true }
//         );
        
//         await SocialAccount.updateOne({ id: account.id }, { followers: data.followers });
//       }
//     }
    
//     logger.success('Daily analytics sync completed');
//   } catch (error) {
//     logger.error('Daily analytics sync failed', error);
//   }
// });

// Connect to MongoDB and start server
const MONGO_URL = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'SM_Tool';

mongoose.connect(`${MONGO_URL}/${DB_NAME}`)
  .then(() => {
    logger.info('🚀', 'Connected to MongoDB');
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('🚀', `SocialHub API started on port ${PORT}`);
      logger.info('⏰', 'Scheduler started with 3 cron jobs:');
      logger.info('  ', '- Auto-publish: every minute');
      logger.info('  ', '- Inbox sync: every 15 minutes');
      logger.info('  ', '- Analytics sync: daily at 2 AM');
    });
  })
  .catch(err => {
    logger.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('🚀', 'Shutting down...');
  mongoose.connection.close();
  process.exit(0);
});

// Code for deleting the post from the uploaded folder like images and files
const fs = require('fs').promises;
const path = require('path');
// Import your Post model (adjust path to your project)

const UPLOADS_DIR = '/var/www/social_media_hub/backend/uploads/';
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // Check every 24 hours

const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.webm', '.jpg', '.jpeg', '.png', '.webp'
]);

async function startCleanupLoop() {
  console.log('🔄 Checking for expired published media (images & videos)...');

  try {
    const cutoffDate = new Date(Date.now() - MAX_AGE_MS);

    // 1. Fetch only posts that are published and older than 3 days
    // Scheduled and failed posts will NEVER be returned here
    const eligiblePosts = await Post.find({
      status: 'published',
      publishedAt: { $lt: cutoffDate },
      mediaDeleted: { $ne: true }
    });

    for (const post of eligiblePosts) {
      if (!post.mediaFile) continue;

      const ext = path.extname(post.mediaFile).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      // 2. Safety check: make sure no pending or failed post shares this file
      const isUsedElsewhere = await Post.exists({
        _id: { $ne: post._id },
        mediaFile: post.mediaFile,
        status: { $in: ['scheduled', 'failed', 'draft', 'stuck'] }
      });

      if (isUsedElsewhere) {
        console.log(`⚠️ Skipping ${post.mediaFile}: still needed by another scheduled/failed post.`);
        continue;
      }

      // 3. Remove file from disk
      const filePath = path.join(UPLOADS_DIR, post.mediaFile);
      try {
        await fs.unlink(filePath);
        console.log(`🗑️ Deleted published media: ${post.mediaFile}`);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Error deleting ${post.mediaFile}:`, err);
        }
      }

      // 4. Mark in database so it is not queried again
      post.mediaDeleted = true;
      await post.save();
    }
  } catch (error) {
    console.error('❌ Media cleanup encountered an error:', error);
  } finally {
    setTimeout(startCleanupLoop, CHECK_INTERVAL_MS);
  }
}

// Start background loop
startCleanupLoop();