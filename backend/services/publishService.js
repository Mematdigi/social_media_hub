// services/publishService.js
const { decrypt } = require('../utils/encryption');
const logger      = require('../utils/logger');
const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');

// ═══════════════════════════════════════════════════════════════
// PLATFORM PUBLISHERS
// ═══════════════════════════════════════════════════════════════

const publishers = {

  // ─── Facebook ────────────────────────────────────────────────
  facebook: async ({ pageToken, pageId, content, mediaUrls }) => {
    const body = { message: content, access_token: pageToken };
    if (mediaUrls?.length) body.link = mediaUrls[0];

    const res  = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Facebook: ${data.error.message}`);
    return { postId: data.id };
  },

  // ─── Instagram ───────────────────────────────────────────────
  instagram: async ({ pageToken, igAccountId, content, mediaUrls, mediaType }) => {
    const urls     = (mediaUrls || []).filter(u => u?.trim());
    const postType = mediaType || detectIGMediaType(urls);

    logger.info('📷', `Instagram publish — type: ${postType}, igId: ${igAccountId}`);

    if (postType === 'CAROUSEL') {
      const itemIds = [];
      for (const url of urls) {
        const itemRes  = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image_url: url, is_carousel_item: true, access_token: pageToken }),
        });
        const itemData = await itemRes.json();
        if (itemData.error) throw new Error(`Instagram carousel item: ${itemData.error.message}`);
        itemIds.push(itemData.id);
      }

      const carouselRes  = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ media_type: 'CAROUSEL', children: itemIds.join(','), caption: content, access_token: pageToken }),
      });
      const carouselData = await carouselRes.json();
      if (carouselData.error) throw new Error(`Instagram carousel container: ${carouselData.error.message}`);
      return await publishIGContainer(igAccountId, carouselData.id, pageToken);
    }

    if (postType === 'REELS') {
      const safeUrl      = encodeURI(urls[0]);
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ media_type: 'REELS', video_url: safeUrl, caption: content, access_token: pageToken }),
      });
      const containerData = await containerRes.json();
      if (containerData.error) throw new Error(`Instagram reel container: ${containerData.error.message}`);
      if (!containerData.id)   throw new Error(`Instagram reel: No container ID. Response: ${JSON.stringify(containerData)}`);

      await waitForMediaProcessing(containerData.id, pageToken);
      return await publishIGContainer(igAccountId, containerData.id, pageToken);
    }

    if (postType === 'IMAGE') {
      const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_url: urls[0], caption: content, access_token: pageToken }),
      });
      const containerData = await containerRes.json();
      if (containerData.error) throw new Error(`Instagram image container: ${containerData.error.message}`);
      return await publishIGContainer(igAccountId, containerData.id, pageToken);
    }

    throw new Error(
      'Instagram requires at least one image or video URL. ' +
      'Text-only posts are not supported by the Instagram API.'
    );
  },

  // ─── Stubs ────────────────────────────────────────────────────
  twitter:   async () => { throw new Error('Twitter publisher not implemented yet'); },
  linkedin:  async () => { throw new Error('LinkedIn publisher not implemented yet'); },
  tiktok:    async () => { throw new Error('TikTok publisher not implemented yet'); },
  pinterest: async () => { throw new Error('Pinterest publisher not implemented yet'); },
  reddit:    async () => { throw new Error('Reddit publisher not implemented yet'); },
  discord:   async () => { throw new Error('Discord publisher not implemented yet'); },
  telegram:  async () => { throw new Error('Telegram publisher not implemented yet'); },

  // ─── YouTube ──────────────────────────────────────────────────
  // Now accepts the full set of metadata fields from the post document.
  // Fields: youtubeTitle, youtubeTags, youtubeCategory, youtubePrivacy, youtubeMadeForKids
      // ─── YouTube ──────────────────────────────────────────────────
  // ─── YouTube Publisher (Handles Fresh Uploads & Metadata Edits) ───
  youtube: async ({
    account,
    content,
    mediaUrls,
    platformPostId, // 🆕 Passed automatically during an edit execution
    youtubeTitle,
    youtubeTags        = [],
    youtubeCategory    = '22',   
    youtubePrivacy     = 'public',
    youtubeMadeForKids = false,
    youtubeThumbnailUrl // 🆕 Incoming property
  }) => {
    // 1. Initialize OAuth client using your SocialAccount schema fields
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token:  decrypt(account.accessToken),
      refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined,
    });

    const youtubeApi = google.youtube({ version: 'v3', auth: oauth2Client });
    const tagsArray  = Array.isArray(youtubeTags) ? youtubeTags : [];

    // ─────────────────────────────────────────────────────────────
    // 🆕 MODE A: UPDATE EXISTING METADATA (PREVENTS DUPLICATE VIDEO)
    // ─────────────────────────────────────────────────────────────
    if (platformPostId) {
      logger.info('▶️', `YouTube running in EDIT mode for Video ID: ${platformPostId}`);
      try {
        await youtubeApi.videos.update({
          part: 'snippet,status',
          requestBody: {
            id: platformPostId, // Tells YouTube exactly which video to change
            snippet: {
              title:       youtubeTitle || 'Updated Video Title',
              description: content      || '',
              tags:        tagsArray,
              categoryId:  youtubeCategory,
            },
            status: {
              privacyStatus:           youtubePrivacy,
              selfDeclaredMadeForKids: Boolean(youtubeMadeForKids),
            },
          },
        });

        logger.info('▶️', `✅ YouTube Video metadata updated successfully!`);
        return { postId: platformPostId }; // Returns same ID back to keep database clean
      } catch (error) {
        logger.error('▶️', `YouTube video update error: ${error.message}`);
        throw new Error(`YouTube Update Error: ${error.message}`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // MODE B: FRESH UPLOAD (ONLY RUNS ON FIRST PUBLISH)
    // ─────────────────────────────────────────────────────────────
if (!mediaUrls || mediaUrls.length === 0) {
      throw new Error('YouTube requires a video file.');
    }

    // 🆕 1. Trim any accidental trailing hidden whitespaces from the string
    const videoUrl = mediaUrls[0].trim(); 
    
    // 🆕 2. Use a resilient match that isolates the extension even if spaces/parameters follow it
    const hasValidExtension = /\.(mp4|mov|webm|avi|mkv)/i.test(videoUrl);
    if (!hasValidExtension) {
      throw new Error('YouTube requires a valid video format (mp4, mov, webm, avi, mkv).');
    }

    // 🆕 3. Use decodeURIComponent so files with both encoded "%20" and raw " " spaces resolve correctly on disk
    const filename      = videoUrl.split('/').pop();
    const localFilePath = path.join(__dirname, '../uploads', decodeURIComponent(filename));

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Video file not found on server: ${decodeURIComponent(filename)}`);
    }

    const fileSize = fs.statSync(localFilePath).size;
    logger.info('▶️', `Starting fresh YouTube upload — file: ${decodeURIComponent(filename)} (${fileSize} bytes)`);

    try {
      const uploadRes = await youtubeApi.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title:       youtubeTitle || 'New Video',
            description: content      || '',
            tags:        tagsArray,
            categoryId:  youtubeCategory,
          },
          status: {
            privacyStatus:           youtubePrivacy,
            selfDeclaredMadeForKids: Boolean(youtubeMadeForKids),
          },
        },
        media: {
          body: fs.createReadStream(localFilePath),
        },
      });

      const videoId = uploadRes.data.id;
      logger.info('▶️', `✅ YouTube upload complete — Video ID: ${videoId}`);

      // 🆕 Core Helper Routine: Upload Custom Thumbnail Asset to Google
  // ─── 🔄 DYNAMIC FORMAT THUMBNAIL STREAMER ───────────────────────
          if (youtubeThumbnailUrl) {
            try {
              logger.info('▶️', `Setting custom thumbnail for Video ID: ${platformPostId || videoId}`);
              
              // 🆕 Fix: Dynamically match the exact mimeType to the file extension
              const isPng = youtubeThumbnailUrl.toLowerCase().split('?')[0].endsWith('.png');
              const calculatedMimeType = isPng ? 'image/png' : 'image/jpeg';
              
              logger.info('▶️', `Detected format: ${calculatedMimeType} for file`);

              let thumbnailStream;

              if (youtubeThumbnailUrl.startsWith('http')) {
                // Fetch the image via network stream
                const imageRes = await axios.get(youtubeThumbnailUrl, { responseType: 'stream' });
                thumbnailStream = imageRes.data;
              } else {
                // Fallback to local disk file
                const thumbFilename = youtubeThumbnailUrl.split('/').pop();
                const localThumbPath = path.join(__dirname, '../uploads', thumbFilename);
                
                if (fs.existsSync(localThumbPath)) {
                  thumbnailStream = fs.createReadStream(localThumbPath);
                } else {
                  throw new Error(`Local file path not found: ${localThumbPath}`);
                }
              }

              // Send the stream to Google's API servers with matching headers
              await youtubeApi.thumbnails.set({
                videoId: platformPostId || videoId,
                media: {
                  mimeType: calculatedMimeType, // ✅ FIXED: Dynamically passes image/png or image/jpeg
                  body: thumbnailStream,
                },
              });
              
              logger.info('▶️', `✅ Custom thumbnail successfully pushed to YouTube!`);
            } catch (thumbErr) {
              const apiError = thumbErr.response?.data?.error?.message || thumbErr.message;
              logger.error('▶️', `❌ YouTube Thumbnail upload failed: ${apiError}`);
            }
          }
          return { postId: videoId };



    } catch (error) {
      logger.error('▶️', `YouTube upload error: ${error.message}`);
      throw new Error(`YouTube API Error: ${error.message}`);
    }
  },
};


// ═══════════════════════════════════════════════════════════════
// INSTAGRAM HELPERS
// ═══════════════════════════════════════════════════════════════

const detectIGMediaType = (urls) => {
  if (!urls?.length) return 'TEXT';
  if (urls.length > 1) return 'CAROUSEL';
  const url = urls[0].toLowerCase();
  if (url.includes('.mp4') || url.includes('.mov') || url.includes('video')) return 'REELS';
  return 'IMAGE';
};

const publishIGContainer = async (igAccountId, creationId, pageToken) => {
  logger.info('📷', `Publishing container ${creationId}...`);

  const publishRes  = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: creationId, access_token: pageToken }),
  });
  const publishData = await publishRes.json();

  if (publishData.error) throw new Error(`Instagram publish: ${publishData.error.message}`);
  if (!publishData.id)   throw new Error(`Instagram publish failed: ${JSON.stringify(publishData)}`);

  logger.info('📷', `✅ Instagram published — postId: ${publishData.id}`);
  return { postId: publishData.id };
};

async function waitForMediaProcessing(containerId, accessToken, maxAttempts = 30) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < maxAttempts; i++) {
    await delay(10000);

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
      if (data.error.message.includes('Authorization')) {
        throw new Error('Meta API Outage: Instagram is currently unable to process Reels. Please try again later.');
      }
      throw new Error(`Instagram API Error: ${data.error.message}`);
    }

    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR')    throw new Error('Instagram failed to process the video.');

    logger.info('📷', `Reel processing: ${JSON.stringify(data)} — attempt ${i + 1}/${maxAttempts}`);
  }

  throw new Error('Timeout: Instagram took too long to process the video container.');
}

// ═══════════════════════════════════════════════════════════════
// CORE: publish one account
// ═══════════════════════════════════════════════════════════════

const publishToAccount = async (account, post) => {
  const platform  = account.platform.toLowerCase();
  const publisher = publishers[platform];

  if (!publisher) throw new Error(`No publisher for platform: ${platform}`);

  const accessToken = decrypt(account.accessToken);
  const content     = post.content;
  const mediaUrls   = post.mediaUrls;
  const mediaType   = post.mediaType;

  // 🆕 Look for any existing post ID saved in your platformResults schema array
  const existingResult = post.platformResults?.find(
    r => r.platform.toLowerCase() === platform
  );
  const platformPostId = existingResult?.platformPostId || null;

  // ── Facebook Routine ───────────────────────────────────────
  if (platform === 'facebook') {
    const selectedPages = (account.pages || []).filter(p => p.isSelected);
    if (!selectedPages.length) throw new Error('Facebook: no pages selected for posting');

    const results = [];
    for (const page of selectedPages) {
      try {
        const pageToken = decrypt(page.pageAccessToken);
        const result    = await publisher({ accessToken, pageToken, accountId: account.accountId, pageId: page.pageId, content, mediaUrls });
        results.push({ pageId: page.pageId, pageName: page.pageName, postId: result.postId, status: 'published' });
      } catch (err) {
        results.push({ pageId: page.pageId, pageName: page.pageName, status: 'failed', error: err.message });
      }
    }
    const firstSuccess = results.find(r => r.status === 'published');
    if (!firstSuccess) throw new Error(results.map(r => r.error).join(', '));
    return { postId: firstSuccess.postId, status: 'published', pages: results };
  }

  // ── Instagram Routine ──────────────────────────────────────
  if (platform === 'instagram') {
    const page = (account.pages || [])[0];
    if (!page?.pageAccessToken) throw new Error('Instagram: page access token not found');

    const result = await publisher({
      accessToken,
      pageToken: decrypt(page.pageAccessToken),
      igAccountId: account.accountId,
      content,
      mediaUrls,
      mediaType
    });

    return {
      postId: result.postId,
      status: 'published',
      pages:  [{ pageId: page.pageId, pageName: page.pageName, postId: result.postId, status: 'published' }]
    };
  }

  // ── YouTube & Other Generic Platforms ──────────────────────
  // 🆕 Forwards the video ID alongside all the extended fields from your Post schema
  return await publisher({ 
    account, 
    accessToken, 
    accountId: account.accountId, 
    content,
    mediaUrls,
    platformPostId, // 👈 CRUCIAL: Enables metadata updating!
    youtubeTitle:       post.youtubeTitle,
    youtubeTags:        post.youtubeTags,
    youtubeCategory:    post.youtubeCategory,
    youtubePrivacy:     post.youtubePrivacy,
    youtubeMadeForKids: post.youtubeMadeForKids
  });
};

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

const publishPostToPlatforms = async (post, accounts) => {
  const platformResults = [];

  for (const account of accounts) {
    try {
      const result = await publishToAccount(account, post);
      platformResults.push({
        platform:       account.platform,
        accountId:      account.accountId,
        platformPostId: result.postId,
        status:         'published',
        publishedAt:    new Date(),
        pages:          result.pages || [],
      });
    } catch (error) {
      logger.error(`❌ Failed to publish to ${account.platform}`, error.message);
      platformResults.push({
        platform:  account.platform,
        accountId: account.accountId,
        status:    'failed',
        error:     error.message,
      });
    }
  }

  const allFailed   = platformResults.every(r => r.status === 'failed');
  const finalStatus = allFailed ? 'failed' : 'published';
  return { status: finalStatus, platformResults };
};

const registerPublisher = (platform, handler) => {
  publishers[platform.toLowerCase()] = handler;
  logger.info(`📌 Publisher registered for: ${platform}`);
};

module.exports = { publishPostToPlatforms, registerPublisher };