// services/publishService.js
const { decrypt } = require('../utils/encryption');
const logger      = require('../utils/logger');
const { google }  = require('googleapis');
const fs          = require('fs');
const path        = require('path');
const axios       = require('axios'); // ✨ THIS IS THE MISSING LINE!

// ═══════════════════════════════════════════════════════════════
// PLATFORM PUBLISHERS
// ═══════════════════════════════════════════════════════════════

const publishers = {

  // ─── Facebook ────────────────────────────────────────────────
facebook: async ({ pageToken, pageId, content, mediaUrls, mediaType }) => {
    try {
      // 1. TEXT-ONLY POST
      if (!mediaUrls || mediaUrls.length === 0) {
        logger.info('📝', `Facebook: Publishing text-only post to page ${pageId}`);
        const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
          message: content || '',
          access_token: pageToken
        });
        return { postId: res.data.id };
      }

      const mediaUrl = mediaUrls[0];
      const isVideo = mediaType === 'video' || /\.(mp4|mov|webm|avi|mkv)/i.test(mediaUrl);

      // 2. BULLETPROOF NATIVE VIDEO UPLOAD (Resumable Chunked API)
      if (isVideo) {
        logger.info('▶️', `Facebook: Starting bulletproof video upload for page ${pageId}`);
        
        let filePathToUpload = null;
        let isTempFile = false;

        const filename = mediaUrl.split('/').pop();
        const decodedFilename = decodeURIComponent(filename);
        const localFilePath = path.join(__dirname, '../uploads', decodedFilename);

        if (fs.existsSync(localFilePath)) {
          logger.info('🎬', `Using existing local file for upload: ${decodedFilename}`);
          filePathToUpload = localFilePath;
        } else {
          // Download to local disk buffer first
          const tempFilename = `temp_fb_${Date.now()}.mp4`;
          filePathToUpload = path.join(__dirname, '../uploads', tempFilename);
          isTempFile = true;

          logger.info('🎬', `Downloading remote video to local disk buffer...`);
          const response = await withRetry(() => axios({
            url: mediaUrl,
            method: 'GET',
            responseType: 'stream'
          }));

          const writer = fs.createWriteStream(filePathToUpload);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
        }

        try {
          const fileSize = fs.statSync(filePathToUpload).size;
          logger.info('🎬', `Ready for Resumable Upload. Exact size: ${fileSize} bytes.`);

          // PHASE 1: START
          const startRes = await withRetry(() => axios.post(`https://graph-video.facebook.com/v19.0/${pageId}/videos`, null, {
            params: {
              access_token: pageToken,
              upload_phase: 'start',
              file_size: fileSize
            }
          }));

          const sessionId = startRes.data.upload_session_id;
          const videoId = startRes.data.video_id;
          let startOffset = parseInt(startRes.data.start_offset, 10);

          logger.info('🎬', `Session initialized. Video ID: ${videoId}`);

          // PHASE 2: TRANSFER
          const FormData = require('form-data');
          
          // 🛡️ THE FIX: Hardcode a safe max chunk size (10MB) to prevent 413 Payload Too Large
          const MAX_CHUNK_SIZE = 10 * 1024 * 1024; 

          while (startOffset < fileSize) {
            // Calculate a safe end offset for this specific chunk
            let currentEndOffset = startOffset + MAX_CHUNK_SIZE;
            if (currentEndOffset > fileSize) {
              currentEndOffset = fileSize; // Ensure we don't overshoot the file size
            }

            logger.info('🎬', `Uploading chunk: bytes ${startOffset} to ${currentEndOffset}...`);
            
            const transferRes = await withRetry(async () => {
              const chunkStream = fs.createReadStream(filePathToUpload, {
                start: startOffset,
                end: currentEndOffset - 1 // createReadStream end is inclusive
              });

              const chunkForm = new FormData();
              chunkForm.append('access_token', pageToken);
              chunkForm.append('upload_phase', 'transfer');
              chunkForm.append('upload_session_id', sessionId);
              chunkForm.append('start_offset', startOffset.toString());
              chunkForm.append('video_file_chunk', chunkStream, { filename: 'chunk.mp4' });

              return await axios.post(
                `https://graph-video.facebook.com/v19.0/${pageId}/videos`, 
                chunkForm,
                {
                  headers: chunkForm.getHeaders(),
                  maxBodyLength: Infinity,
                  maxContentLength: Infinity
                }
              );
            });

            // Facebook tells us where to start the next chunk. 
            // Fallback to our manual calculation just in case FB returns undefined
            const nextStart = parseInt(transferRes.data.start_offset, 10);
            startOffset = isNaN(nextStart) ? currentEndOffset : nextStart;
          }

          // PHASE 3: FINISH
          logger.info('🎬', `All chunks uploaded. Finalizing and publishing...`);
          
          await withRetry(() => axios.post(`https://graph-video.facebook.com/v19.0/${pageId}/videos`, null, {
            params: {
              access_token: pageToken,
              upload_phase: 'finish',
              upload_session_id: sessionId,
              description: content || '' 
            }
          }));

          logger.info('✅', `Massive Facebook video published successfully! ID: ${videoId}`);
          return { postId: videoId };

        } finally {
          // Clean up ONLY if we generated a temporary file for download
          if (isTempFile && filePathToUpload && fs.existsSync(filePathToUpload)) {
            fs.unlinkSync(filePathToUpload);
            logger.info('🎬', `Cleaned up temporary disk buffer file.`);
          }
        }
      } 
      
      // 3. NATIVE PHOTO UPLOAD
      else {
        logger.info('🖼️', `Facebook: Uploading native photo to page ${pageId}`);
        const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
          caption: content || '',
          url: encodeURI(mediaUrl),
          access_token: pageToken
        });
        
        logger.info('✅', `Facebook photo published successfully! ID: ${res.data.id || res.data.post_id}`);
        return { postId: res.data.id || res.data.post_id };
      }
      
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error('❌', `Facebook Error Details: ${JSON.stringify(error.response?.data || error.message)}`);
      throw new Error(`Facebook API Error: ${errorMsg}`);
    }
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
  youtube: async ({
    account,
    content,
    mediaUrls,
    platformPostId, 
    youtubeTitle,
    youtubeTags        = [],
    youtubeCategory    = '22',   
    youtubePrivacy     = 'public',
    youtubeMadeForKids = false,
    youtubeThumbnailUrl 
  }) => {
    // 1. Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );

    const decryptedRefresh = account.refreshToken ? decrypt(account.refreshToken) : null;

    if (decryptedRefresh) {
      logger.info('▶️', 'YouTube: Refresh token found! Fetching a brand new access token from Google...');
      oauth2Client.setCredentials({ refresh_token: decryptedRefresh });

      try {
        await oauth2Client.getAccessToken();
        logger.info('▶️', '✅ YouTube token successfully auto-refreshed in the background!');
      } catch (tokenErr) {
        throw new Error(`Google rejected the refresh token. You must reconnect YouTube on the dashboard. Details: ${tokenErr.message}`);
      }
    } else {
      logger.info('▶️', 'YouTube: No refresh token found, using standard access token.');
      oauth2Client.setCredentials({
        access_token: decrypt(account.accessToken),
      });
    }

    const youtubeApi = google.youtube({ version: 'v3', auth: oauth2Client });
    const tagsArray  = Array.isArray(youtubeTags) ? youtubeTags : [];

    // ✨ THE FIX: Safely truncate titles to YouTube's strict 100-character limit
    let safeTitle = (youtubeTitle || 'New Video').trim();
    if (safeTitle.length > 100) {
      safeTitle = safeTitle.substring(0, 97) + '...';
      logger.info('▶️', 'YouTube title exceeded 100 characters. Automatically truncated to fit API limits.');
    }

    // ─────────────────────────────────────────────────────────────
    // MODE A: UPDATE EXISTING METADATA (PREVENTS DUPLICATE VIDEO)
    // ─────────────────────────────────────────────────────────────
    if (platformPostId) {
      logger.info('▶️', `YouTube running in EDIT mode for Video ID: ${platformPostId}`);
      try {
        await youtubeApi.videos.update({
          part: 'snippet,status',
          requestBody: {
            id: platformPostId,
            snippet: {
              title:       safeTitle, // <-- Applied safe title
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
        return { postId: platformPostId };
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

    const videoUrl = mediaUrls[0].trim(); 
    const hasValidExtension = /\.(mp4|mov|webm|avi|mkv)/i.test(videoUrl);

    if (!hasValidExtension) {
      throw new Error('YouTube requires a valid video format (mp4, mov, webm, avi, mkv).');
    }

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
            title:       safeTitle, // <-- Applied safe title
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

      // ─── 🔄 DYNAMIC FORMAT THUMBNAIL STREAMER ───────────────────────
      if (youtubeThumbnailUrl) {
        try {
          logger.info('▶️', `Setting custom thumbnail for Video ID: ${videoId}`);

          const isPng = youtubeThumbnailUrl.toLowerCase().split('?')[0].endsWith('.png');
          const calculatedMimeType = isPng ? 'image/png' : 'image/jpeg';

          let thumbnailStream;

          if (youtubeThumbnailUrl.startsWith('http')) {
            const imageRes = await axios.get(youtubeThumbnailUrl, { responseType: 'stream' });
            thumbnailStream = imageRes.data;
          } else {
            const thumbFilename = youtubeThumbnailUrl.split('/').pop();
            const localThumbPath = path.join(__dirname, '../uploads', thumbFilename);

            if (fs.existsSync(localThumbPath)) {
              thumbnailStream = fs.createReadStream(localThumbPath);
            } else {
              throw new Error(`Local file path not found: ${localThumbPath}`);
            }
          }

          await youtubeApi.thumbnails.set({
            videoId: videoId,
            media: {
              mimeType: calculatedMimeType,
              body: thumbnailStream,
            },
          });

          logger.info('▶️', `✅ Custom thumbnail successfully pushed to YouTube!`);
        } catch (thumbErr) {
          const apiError = thumbErr.response?.data?.error?.message || thumbErr.message;
          
          // ✨ THE FIX: Suppress the permissions error so it doesn't look like a crash.
    if (apiError.toLowerCase().includes('permissions')) {
            console.warn(`⚠️ Thumbnail skipped: YouTube Channel is not verified for custom thumbnails yet. Video published with default thumbnail!`);
          } else {
            console.warn(`⚠️ Thumbnail skipped due to API error: ${apiError}`);
          }
        }
      }
      
      // We always return success here because the video uploaded perfectly
      return { postId: videoId };

    } catch (error) {
      logger.error('▶️', `YouTube upload error: ${error.message}`);
      throw new Error(`YouTube API Error: ${error.message}`);
    }
  },
};

// Add this near the top of your file, outside your exports
const withRetry = async (fn, maxRetries = 3, delayMs = 2000) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error; // Give up after max retries
      console.warn(`⚠️ Network request failed. Retrying... (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs)); // Wait before retrying
    }
  }
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
    
    // 🕵️ DEBUG TRAP: See exactly what the publisher receives
    logger.info('🕵️', `Publisher received ${selectedPages.length} selected pages for account ${account.accountId}`);
    
    if (!selectedPages.length) {
      // Print the available pages so we can see why it didn't match
      const availablePages = (account.pages || []).map(p => p.pageId).join(', ');
      throw new Error(`Facebook: no pages selected for posting! Available pages in memory: [${availablePages}]`);
    }

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
    youtubeMadeForKids: post.youtubeMadeForKids,
    youtubeThumbnailUrl: post.youtubeThumbnail // ✨ THE FIX: Hand the image to the publisher!
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