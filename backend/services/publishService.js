// services/publishService.js
const { decrypt } = require('../utils/encryption');
const logger      = require('../utils/logger');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
      body:    JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(`Facebook: ${data.error.message}`);
    return { postId: data.id };
  },

  // ─── Instagram ───────────────────────────────────────────────
  // Uses Page Access Token (stored in pages[0].pageAccessToken)
  // Flow:
  //   IMAGE  → create container (image_url) → publish
  //   REELS  → create container (video_url, media_type=REELS) → publish
  //   CAROUSEL → create N item containers → create carousel container → publish
  //   TEXT   → caption-only IMAGE container with no media (not officially supported,
  //             so we post as a text-only caption with a blank placeholder approach)
  // ─────────────────────────────────────────────────────────────
  instagram: async ({ pageToken, igAccountId, content, mediaUrls, mediaType }) => {

    // Detect what kind of post this is
    const urls      = (mediaUrls || []).filter(u => u?.trim());
    const postType  = mediaType || detectIGMediaType(urls);

    logger.info('📷', `Instagram publish — type: ${postType}, igId: ${igAccountId}`);

    // ── CAROUSEL (2+ images) ─────────────────────────────────
    if (postType === 'CAROUSEL') {
      // Step 1: Create individual item containers
      const itemIds = [];
      for (const url of urls) {
        const itemRes = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_url:    url,
              is_carousel_item: true,
              access_token: pageToken
            })
          }
        );
        const itemData = await itemRes.json();
        if (itemData.error) throw new Error(`Instagram carousel item: ${itemData.error.message}`);
        itemIds.push(itemData.id);
        logger.info('📷', `IG carousel item created: ${itemData.id}`);
      }

      // Step 2: Create carousel container
      const carouselRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type:   'CAROUSEL',
            children:     itemIds.join(','),
            caption:      content,
            access_token: pageToken
          })
        }
      );
      const carouselData = await carouselRes.json();
      if (carouselData.error) throw new Error(`Instagram carousel container: ${carouselData.error.message}`);

      // Step 3: Publish
      return await publishIGContainer(igAccountId, carouselData.id, pageToken);
    }

        // ── REELS (video) ────────────────────────────────────────
   if (postType === 'REELS') {
      // NOTE: Ensure your URL is properly encoded if it contains spaces
      const safeUrl = encodeURI(urls[0]); 
      logger.info('📷', `Creating reel container with URL: ${safeUrl}`);
      
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type:       'REELS',
            video_url:        safeUrl, // using the encoded URL
            caption:          content,
            access_token:     pageToken
          })
        }
      );
      const containerData = await containerRes.json();
      
      // ✅ LOG THE FULL RESPONSE
      logger.info('📷', `Reel container response:`, JSON.stringify(containerData, null, 2));
      
      if (containerData.error) {
        logger.error('📷', `Reel container error:`, containerData.error);
        throw new Error(`Instagram reel container: ${containerData.error.message}`);
      }
      
      if (!containerData.id) {
        logger.error('📷', `No container ID returned:`, containerData);
        throw new Error(`Instagram reel: No container ID. Response: ${JSON.stringify(containerData)}`);
      }
      
      logger.info('📷', `Reel container created: ${containerData.id}, waiting for Instagram to process the video...`);
      
      // 👇 NEW: Wait for Instagram to finish processing the video before publishing
      await waitForMediaProcessing(containerData.id, pageToken);
      
      logger.info('📷', `Reel container processed successfully! Publishing now...`);
      return await publishIGContainer(igAccountId, containerData.id, pageToken);
    }

    // ── IMAGE (single photo) ─────────────────────────────────
    // ── IMAGE (single photo) ─────────────────────────────────
    
// ── IMAGE (single photo) ─────────────────────────────────
      if (postType === 'IMAGE') {
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: urls[0],  // ✅ Not image_url
            caption:          content,
            access_token:     pageToken
          })
        }
      );
      const containerData = await containerRes.json();
      if (containerData.error) throw new Error(`Instagram image container: ${containerData.error.message}`);

      // ✅ Images don't need encoding, publish immediately
      logger.info('📷', `Image container created: ${containerData.id}, publishing...`);
      return await publishIGContainer(igAccountId, containerData.id, pageToken);
    }
    // ── TEXT ONLY (caption only — not natively supported by IG Graph API)
    // Instagram requires media. We throw a clear error so the UI can warn the user.
    throw new Error(
      'Instagram requires at least one image or video URL. ' +
      'Text-only posts are not supported by the Instagram API.'
    );
  },

  // ─── Other platforms (stubs unchanged) ───────────────────────
  twitter:   async () => { throw new Error('Twitter publisher not implemented yet'); },
  linkedin:  async () => { throw new Error('LinkedIn publisher not implemented yet'); },
  tiktok:    async () => { throw new Error('TikTok publisher not implemented yet'); },

// ─── YouTube ──────────────────────────────────────────────────
  youtube: async ({ account, content, mediaUrls, youtubeTitle }) => {
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new Error('YouTube requires a video file.');
    }

    const videoUrl = mediaUrls[0];
    if (!videoUrl.match(/\.(mp4|mov|webm|ogg)$/i)) {
      throw new Error('YouTube requires a valid video format (mp4, mov, webm).');
    }

    // 1. Recreate the OAuth Client using the stored tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );

    // We must decrypt the tokens before giving them to Google
    oauth2Client.setCredentials({
      access_token: decrypt(account.accessToken),
      refresh_token: account.refreshToken ? decrypt(account.refreshToken) : undefined
    });

    const youtubeApi = google.youtube({ version: 'v3', auth: oauth2Client });

    // 2. We need a readable stream for the video. 
    // Since mediaUrls stores a full URL (e.g., https://media.mematdigi.com/uploads/video.mp4),
    // we extract the filename and read it directly from the local disk for speed and reliability.
    const filename = videoUrl.split('/').pop();
    const localFilePath = path.join(__dirname, '../uploads', filename);

    if (!fs.existsSync(localFilePath)) {
      throw new Error('Video file not found on server.');
    }

    const fileSize = fs.statSync(localFilePath).size;

    logger.info('▶️', `Starting YouTube upload for file: ${filename} (${fileSize} bytes)`);

    try {
      // 3. Upload to YouTube
      const uploadRes = await youtubeApi.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: youtubeTitle || 'New Video', // Fallback if no title is provided
            description: content || '',
            // Optional: You could add tags or categoryId here
          },
          status: {
            privacyStatus: 'public', // Or 'private' / 'unlisted' if you want a draft state
            selfDeclaredMadeForKids: false
          }
        },
        media: {
          body: fs.createReadStream(localFilePath),
        }
      });

      const videoId = uploadRes.data.id;
      logger.info('▶️', `✅ YouTube upload complete! Video ID: ${videoId}`);

      return { postId: videoId };

    } catch (error) {
      logger.error('▶️', `YouTube upload error: ${error.message}`);
      throw new Error(`YouTube API Error: ${error.message}`);
    }
  },
  
  pinterest: async () => { throw new Error('Pinterest publisher not implemented yet'); },
  reddit:    async () => { throw new Error('Reddit publisher not implemented yet'); },
  discord:   async () => { throw new Error('Discord publisher not implemented yet'); },
  telegram:  async () => { throw new Error('Telegram publisher not implemented yet'); },
};


// ═══════════════════════════════════════════════════════════════
// INSTAGRAM HELPERS
// ═══════════════════════════════════════════════════════════════

// Detect media type from URLs
const detectIGMediaType = (urls) => {
  if (!urls?.length) return 'TEXT';
  if (urls.length > 1) return 'CAROUSEL';
  const url = urls[0].toLowerCase();
  if (url.includes('.mp4') || url.includes('.mov') || url.includes('video')) return 'REELS';
  return 'IMAGE';
};

// Publish a ready container
const publishIGContainer = async (igAccountId, creationId, pageToken) => {
  logger.info('📷', `Publishing container ${creationId}...`);
  
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id:  creationId,
        access_token: pageToken
      })
    }
  );

  // ✅ Log response status
  logger.info('📷', `Response status: ${publishRes.status}`);

  const publishData = await publishRes.json();
  
  // ✅ LOG THE RAW RESPONSE
  logger.info('📷', `Raw publish response:`, JSON.stringify(publishData));
  logger.info('📷', `Response keys:`, Object.keys(publishData));

  if (publishData.error) {
    logger.error('📷', `Full error object:`, JSON.stringify(publishData.error));
    throw new Error(`Instagram publish: ${publishData.error.message || JSON.stringify(publishData.error)}`);
  }

  if (!publishData.id) {
    logger.error('📷', `No ID in response. Full response:`, JSON.stringify(publishData));
    throw new Error(`Instagram publish failed: ${JSON.stringify(publishData)}`);
  }

  logger.info('📷', `✅ Instagram published — postId: ${publishData.id}`);
  return { postId: publishData.id };
    };

const waitForIGContainer = async (igAccountId, creationId, pageToken, maxWaitMs = 300000) => {
  const start    = Date.now();
  const interval = 10000; // poll every 10s
  let pollCount  = 0;

  while (Date.now() - start < maxWaitMs) {
    try {
      pollCount++;
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status&access_token=${pageToken}`
      );
      const statusData = await statusRes.json();

      // ✅ LOG THE FULL RESPONSE
      logger.info('📷', `Poll #${pollCount} - Full response:`, JSON.stringify(statusData, null, 2));

      if (statusData.error) {
        logger.error('📷', `Status check error:`, statusData.error);
        throw new Error(`Status check failed: ${statusData.error.message}`);
      }

      // Check different possible status fields
      const status = statusData.status || statusData.status_code || 'unknown';
      logger.info('📷', `Detected status: ${status}`);

      if (status === 'FINISHED') {
        logger.info('📷', `✅ Container ready after ${pollCount} polls`);
        return;
      }
      
      if (status === 'ERROR') {
        throw new Error(`Instagram container error`);
      }

      // If no status, maybe it's already ready?
      if (status === 'unknown') {
        logger.info('📷', `No status field found, assuming ready and publishing...`);
        return; // ✅ Assume it's ready
      }

    } catch (err) {
      logger.error('📷', `Poll error: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error(`Timeout after ${Math.round(maxWaitMs / 1000)}s`);
};

// Helper function to poll Instagram for video processing status
// Updated: Catches hidden API errors during the polling phase
async function waitForMediaProcessing(containerId, accessToken, maxAttempts = 30) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < maxAttempts; i++) {
    await delay(10000); 

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await response.json();

    if (data.error) {
      logger.error('📷', `Instagram API Error during polling:`, JSON.stringify(data.error, null, 2));
      
      // Check for the specific Meta outage signature
      if (data.error.message.includes('Authorization')) {
         throw new Error('Meta API Outage: Instagram is currently unable to process Reels. Please try again later.');
      }
      
      throw new Error(`Instagram API Error: ${data.error.message}`);
    }

    if (data.status_code === 'FINISHED') {
      return true; // Video is ready!
    } else if (data.status_code === 'ERROR') {
      throw new Error('Instagram failed to process the video. The format may be invalid.');
    }
    
    // 👇 NEW: Log the FULL response data to see exactly what Meta is sending back
    logger.info('📷', `Reel processing raw data: ${JSON.stringify(data)}. Attempt ${i + 1} of ${maxAttempts}...`);
  }

  throw new Error('Timeout: Instagram took too long to process the video container.');
}
// ═══════════════════════════════════════════════════════════════
// CORE: publish one account
// ═══════════════════════════════════════════════════════════════

const publishToAccount = async (account, post) => {
  const platform  = account.platform.toLowerCase();
  const publisher = publishers[platform];

  // (The rest of the setup stays the same...)
  if (!publisher) throw new Error(`No publisher for platform: ${platform}`);
  const accessToken = decrypt(account.accessToken);
  const content = post.content;
  const mediaUrls = post.mediaUrls;
  const mediaType = post.mediaType;

  if (!publisher) throw new Error(`No publisher for platform: ${platform}`);


  // ── Facebook: loop over selected pages ───────────────────────
  if (platform === 'facebook') {
    const selectedPages = (account.pages || []).filter(p => p.isSelected);
    if (!selectedPages.length) throw new Error('Facebook: no pages selected for posting');

    const results = [];
    for (const page of selectedPages) {
      try {
        const pageToken = decrypt(page.pageAccessToken);
        const result    = await publisher({ accessToken, pageToken, accountId: account.accountId, pageId: page.pageId, content, mediaUrls });

        logger.info('📘', `✅ Facebook: posted to "${page.pageName}" — ID: ${result.postId}`);
        results.push({ pageId: page.pageId, pageName: page.pageName, postId: result.postId, status: 'published' });
      } catch (err) {
        logger.error(`❌ Facebook page "${page.pageName}": ${err.message}`);
        results.push({ pageId: page.pageId, pageName: page.pageName, status: 'failed', error: err.message });
      }
    }

    const firstSuccess = results.find(r => r.status === 'published');
    if (!firstSuccess) throw new Error(results.map(r => r.error).join(', '));

    return { postId: firstSuccess.postId, status: 'published', pages: results };
  }

  // ── Instagram: uses pages[0].pageAccessToken + accountId ─────
  // The IG Business account ID is stored as account.accountId
  // The page access token is stored in pages[0].pageAccessToken
  if (platform === 'instagram') {
    const page = (account.pages || [])[0];
    if (!page?.pageAccessToken) throw new Error('Instagram: page access token not found');

    const pageToken   = decrypt(page.pageAccessToken);
    const igAccountId = account.accountId; // IG Business account ID

    const result = await publisher({
      accessToken,    // long-lived user token
      pageToken,      // FB page token (used for IG Graph API calls)
      igAccountId,    // IG Business account ID
      content,
      mediaUrls,
      mediaType       // optional override: 'IMAGE' | 'REELS' | 'CAROUSEL'
    });




    logger.info('📷', `✅ Instagram published — @${account.igUsername}`);

    return {
      postId: result.postId,
      status: 'published',
      pages:  [{
        pageId:   page.pageId,
        pageName: page.pageName,
        postId:   result.postId,
        status:   'published'
      }]
    };
  }

  // ── All other platforms ───────────────────────────────────────
// ── All other platforms (Including YouTube) ───────────────────
  return await publisher({ 
    account, // Pass the whole account object so YouTube has access to refreshToken
    accessToken, 
    accountId: account.accountId, 
    content,
    mediaUrls,
    youtubeTitle: post.youtubeTitle // 🆕 Pass the title from the post document!
  });
};


// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

const publishPostToPlatforms = async (post, accounts) => {
  const platformResults = [];

  for (const account of accounts) {
    try {
      // CHANGE THIS BLOCK:
      const result = await publishToAccount(
        account,
        post // ✅ Just pass the whole post object!
      );

      
      platformResults.push({
        platform:       account.platform,
        accountId:      account.accountId,
        platformPostId: result.postId,
        status:         'published',
        publishedAt:    new Date(),
        pages:          result.pages || []
      });

    } catch (error) {
      logger.error(`❌ Failed to publish to ${account.platform}`, error.message);
      platformResults.push({
        platform:  account.platform,
        accountId: account.accountId,
        status:    'failed',
        error:     error.message
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