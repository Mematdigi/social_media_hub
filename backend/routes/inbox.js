const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Message = require('../models/Message');
const SocialAccount = require('../models/SocialAccount');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Mock message types and content
const MESSAGE_TYPES = ['dm', 'comment', 'mention', 'reply'];
const MOCK_NAMES = ['Alex Johnson', 'Sarah Smith', 'Mike Chen', 'Emily Davis', 'Chris Wilson'];
const MOCK_CONTENTS = [
  'Love your content! Keep it up! 🔥',
  'Great post, very insightful!',
  'Could you share more about this topic?',
  'Amazing work as always!',
  'This is exactly what I needed to see today!',
  'Can you do a follow-up on this?',
  'Shared this with my team!',
  'Your content is always so helpful 🙏'
];

// Fetch mock messages from platform
const fetchPlatformMessages = async (platform, accessToken, accountId) => {
  logger.info('📨', `Fetching messages from ${platform}...`);
  
  const messages = [];
  const count = Math.floor(Math.random() * 4); // 0-3 messages
  
  for (let i = 0; i < count; i++) {
    const msgType = MESSAGE_TYPES[Math.floor(Math.random() * MESSAGE_TYPES.length)];
    const name = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
    
    messages.push({
      platform,
      type: msgType,
      externalId: `${platform}_${uuidv4().substring(0, 12)}`,
      senderName: name,
      senderHandle: `@${name.toLowerCase().replace(' ', '_')}`,
      senderAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
      content: MOCK_CONTENTS[Math.floor(Math.random() * MOCK_CONTENTS.length)],
      postId: msgType === 'comment' || msgType === 'reply' ? `post_${uuidv4().substring(0, 8)}` : null,
      postPreview: msgType === 'comment' || msgType === 'reply' ? 'Your recent post about social media...' : null,
      receivedAt: new Date(Date.now() - Math.floor(Math.random() * 1440) * 60000)
    });
  }
  
  return messages;
};

// GET /api/inbox
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { platform, type, isRead, page = 1 } = req.query;
    
    const query = { userId: req.user.id };
    if (platform) query.platform = platform;
    if (type) query.type = type;
    if (isRead !== undefined) query.isRead = isRead === 'true';
    
    const skip = (parseInt(page) - 1) * 30;
    const messages = await Message.find(query)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(30)
      .select('-_id -__v');
    
    const total = await Message.countDocuments(query);
    const unreadCount = await Message.countDocuments({ userId: req.user.id, isRead: false });
    
    // Enrich with account info
    const result = [];
    for (const msg of messages) {
      const account = await SocialAccount.findOne({ id: msg.accountId })
        .select('-accessToken -refreshToken -_id -__v');
      result.push({
        ...msg.toObject(),
        account: account ? {
          id: account.id,
          accountName: account.accountName,
          platform: account.platform,
          profilePicture: account.profilePicture
        } : null
      });
    }
    
    res.json({ messages: result, total, page: parseInt(page), unreadCount });
  } catch (error) {
    logger.error('Failed to get inbox', error);
    res.status(500).json({ detail: 'Failed to get inbox' });
  }
});

// GET /api/inbox/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const total = await Message.countDocuments({ userId: req.user.id, isRead: false });
    
    const byPlatform = await Message.aggregate([
      { $match: { userId: req.user.id, isRead: false } },
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ]);
    
    const byPlatformObj = {};
    byPlatform.forEach(item => {
      byPlatformObj[item._id] = item.count;
    });
    
    res.json({ total, byPlatform: byPlatformObj });
  } catch (error) {
    logger.error('Failed to get unread count', error);
    res.status(500).json({ detail: 'Failed to get unread count' });
  }
});

// PUT /api/inbox/:messageId/read
router.put('/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const result = await Message.updateOne(
      { id: req.params.messageId, userId: req.user.id },
      { isRead: true }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: 'Message not found' });
    }
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    logger.error('Failed to mark as read', error);
    res.status(500).json({ detail: 'Failed to mark as read' });
  }
});

// PUT /api/inbox/read-all
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const query = { userId: req.user.id, isRead: false };
    if (req.query.platform) query.platform = req.query.platform;
    
    const result = await Message.updateMany(query, { isRead: true });
    res.json({ message: `Marked ${result.modifiedCount} messages as read` });
  } catch (error) {
    logger.error('Failed to mark all as read', error);
    res.status(500).json({ detail: 'Failed to mark all as read' });
  }
});

// POST /api/inbox/:messageId/reply
router.post('/:messageId/reply', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    const message = await Message.findOne({ id: req.params.messageId, userId: req.user.id });
    if (!message) {
      return res.status(404).json({ detail: 'Message not found' });
    }
    
    // Mock reply (in production, send via platform API)
    logger.info('💬', `Replying on ${message.platform}...`);
    
    await Message.updateOne(
      { id: req.params.messageId },
      {
        isReplied: true,
        repliedAt: new Date(),
        replyContent: content
      }
    );
    
    logger.info('💬', `Reply sent on ${message.platform}`);
    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    logger.error('Failed to send reply', error);
    res.status(500).json({ detail: 'Failed to send reply' });
  }
});

// POST /api/inbox/sync
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ userId: req.user.id, isActive: true });
    let newMessages = 0;
    
    for (const account of accounts) {
      try {
        const messages = await fetchPlatformMessages(account.platform, '', account.accountId);
        
        for (const msg of messages) {
          const existing = await Message.findOne({
            externalId: msg.externalId,
            platform: msg.platform
          });
          
          if (!existing) {
            const newMsg = new Message({
              id: uuidv4(),
              userId: req.user.id,
              accountId: account.id,
              ...msg,
              isRead: false,
              isReplied: false
            });
            await newMsg.save();
            newMessages++;
          }
        }
        
        logger.success(`Synced inbox: ${account.platform}`);
      } catch (error) {
        logger.error(`Inbox sync failed for ${account.platform}`, error);
      }
    }
    
    res.json({ synced: accounts.length, newMessages });
  } catch (error) {
    logger.error('Failed to sync inbox', error);
    res.status(500).json({ detail: 'Failed to sync inbox' });
  }
});

module.exports = router;
