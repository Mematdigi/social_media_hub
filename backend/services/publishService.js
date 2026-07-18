const { decrypt, encrypt } = require('../utils/encryption'); // ✅ ADDED encryptconst logger      = require('../utils/logger');
const { google }  = require('googleapis');
const axios       = require('axios'); // ✅ FIXED: Added missing axios package import
const fs          = require('fs');
const path        = require('path');
const logger = require('../utils/logger')

const SocialAccount = require('../models/SocialAccount'); // ✅ Added

// ═══════════════════════════════════════════════════════════════
// AUTO-REFRESH YOUTUBE CLIENT
// ═══════════════════════════════════════════════════════════════
const getAuthenticatedYouTubeClient = async (account) => {
  if (!account.refreshToken) {
    throw new Error('No refresh token found. Please re-connect YouTube in your dashboard.');
  }

  // Initialize the OAuth2 client using the correct environment variables
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  );

  const decryptedAccessToken = decrypt(account.accessToken);
  const decryptedRefreshToken = decrypt(account.refreshToken);

  // Set initial credentials
  oauth2Client.setCredentials({
    access_token: decryptedAccessToken,
    refresh_token: decryptedRefreshToken,
    expiry_date: account.tokenExpiry ? new Date(account.tokenExpiry).getTime() : 1
  });

  // ─── CRITICAL SEAMLESS REFRESH EVENT LISTENER ───
  oauth2Client.on('tokens', async (tokens) => {
    try {
      const updateData = {};
      
      if (tokens.access_token) {
        updateData.accessToken = encrypt(tokens.access_token);
        logger.info('▶️', `Auto-refreshed and encrypted new access token for account: ${account.accountName || account.id}`);
      }
      
      if (tokens.expiry_date) {
        // ✅ FIX 1: Use tokenExpiry and convert to Date object for Mongoose
        updateData.tokenExpiry = new Date(tokens.expiry_date);
      }

      if (Object.keys(updateData).length > 0) {
        await SocialAccount.findOneAndUpdate(
          { id: account.id },
          { $set: updateData }
        );
        logger.info('💾', `Updated refreshed token details in MongoDB for ${account.accountName || account.id}`);
      }
    } catch (dbError) {
      logger.error('❌', `Failed to persist auto-refreshed token to DB: ${dbError.message}`);
    }
  });

  try {
    // Force validation/refresh check before returning the client
    const tokenInfo = await oauth2Client.getAccessToken();
    
    // Manual fallback persistence check
    if (tokenInfo.token && tokenInfo.token !== decryptedAccessToken) {
      logger.info('▶️', `Token verified as changed. Manually updating access token in DB for ${account.accountName || account.id}`);
      
      await SocialAccount.findOneAndUpdate(
        { id: account.id },
        { 
          accessToken: encrypt(tokenInfo.token),
          // ✅ FIX 2: Use tokenExpiry and convert to Date object
          tokenExpiry: oauth2Client.credentials.expiry_date ? new Date(oauth2Client.credentials.expiry_date) : new Date(Date.now() + 3500000) 
        }
      );
    }

    return google.youtube({ version: 'v3', auth: oauth2Client });

  } catch (error) {
    logger.error('❌', `Failed to authenticate YouTube client for account ${account.id}: ${error.message}`);
    throw new Error('YouTube authentication failed. Please re-authenticate your channel in the dashboard.');
  }
};

// ═══════════════════════════════════════════════════════════════
// PLATFORM PUBLISHERS
// ═══════════════════════════════════════════════════════════════


const publishers = {

  // ─── Facebook (LOCAL DISK BUFFER FOR MASSIVE FILES) ──────────
  // ─── Facebook (LOCAL DISK BUFFER FOR MASSIVE FILES) ──────────
// ─── Facebook (LOCAL DISK BUFFER + FORCED CONTENT-LENGTH) ──────────
// ─── Facebook (RESUMABLE CHUNKED UPLOAD API) ──────────
  facebook: async ({ pageToken, pageId, content, mediaUrls, mediaType }) => {
    const isVideo = mediaType === 'video' || (mediaUrls?.[0] && /\.(mp4|mov|avi|mkv)/i.test(mediaUrls[0]));

    if (isVideo) {
      logger.info('🎬', `Facebook Resumable Video upload for page: ${pageId}`);
      let tempFilePath = null;

      try {
        const videoUrl = mediaUrls[0];
        const filename = `temp_fb_${Date.now()}.mp4`;
        tempFilePath = path.join(__dirname, '../uploads', filename);

        logger.info('🎬', `Downloading 183MB+ video to local disk buffer...`);

        // 1. Download the file to the hard drive
        const response = await axios({
          url: videoUrl,
          method: 'GET',
          responseType: 'stream'
        });

        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        const fileSize = fs.statSync(tempFilePath).size;
        logger.info('🎬', `Download complete. Exact size: ${fileSize} bytes. Starting Resumable Upload...`);

        // ══════════════════════════════════════════════════════════
        // PHASE 1: START (Initialize the upload session)
        // ══════════════════════════════════════════════════════════
        const startRes = await axios.post(`https://graph-video.facebook.com/v19.0/${pageId}/videos`, null, {
          params: {
            access_token: pageToken,
            upload_phase: 'start',
            file_size: fileSize
          }
        });

        const sessionId = startRes.data.upload_session_id;
        const videoId = startRes.data.video_id;
        let startOffset = parseInt(startRes.data.start_offset, 10);
        let endOffset = parseInt(startRes.data.end_offset, 10);

        logger.info('🎬', `Session initialized. Video ID: ${videoId}`);

        // ══════════════════════════════════════════════════════════
        // PHASE 2: TRANSFER (Upload in chunks)
        // ══════════════════════════════════════════════════════════
        const FormData = require('form-data');

        while (startOffset < fileSize) {
          logger.info('🎬', `Uploading chunk: bytes ${startOffset} to ${endOffset}...`);
          
          // Slice the file exactly as Facebook requests
          // Note: createReadStream 'end' is inclusive, so we do endOffset - 1
          const chunkStream = fs.createReadStream(tempFilePath, {
            start: startOffset,
            end: endOffset - 1 
          });

          const chunkForm = new FormData();
          chunkForm.append('access_token', pageToken);
          chunkForm.append('upload_phase', 'transfer');
          chunkForm.append('upload_session_id', sessionId);
          chunkForm.append('start_offset', startOffset.toString());
          chunkForm.append('video_file_chunk', chunkStream, { filename: 'chunk.mp4' });

          const transferRes = await axios.post(
            `https://graph-video.facebook.com/v19.0/${pageId}/videos`, 
            chunkForm,
            {
              headers: chunkForm.getHeaders(),
              maxBodyLength: Infinity,
              maxContentLength: Infinity
            }
          );

          // Update offsets for the next loop based on Facebook's response
          startOffset = parseInt(transferRes.data.start_offset, 10);
          endOffset = parseInt(transferRes.data.end_offset, 10);
        }

        // ══════════════════════════════════════════════════════════
        // PHASE 3: FINISH (Publish the video with content)
        // ══════════════════════════════════════════════════════════
        logger.info('🎬', `All chunks uploaded. Finalizing and publishing...`);
        
        await axios.post(`https://graph-video.facebook.com/v19.0/${pageId}/videos`, null, {
          params: {
            access_token: pageToken,
            upload_phase: 'finish',
            upload_session_id: sessionId,
            description: content || '' // Attach your text content here!
          }
        });

        logger.info('🎬', `✅ Massive Facebook video published successfully! ID: ${videoId}`);
        return { postId: videoId };

      } catch (error) {
        const fbError = error.response?.data?.error?.message || error.message;
        logger.error('🎬', `Facebook Error Details: ${JSON.stringify(error.response?.data || error.message)}`);
        throw new Error(`Facebook Chunked Upload Failed: ${fbError}`);
      } finally {
        // ALWAYS clean up the temporary file
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          logger.info('🎬', `Cleaned up temporary disk buffer file.`);
        }
      }

    } else {
      // ── Standard Text/Link/Image Feed Post ──
      const params = new URLSearchParams();
      params.append('message', content || '');
      params.append('access_token', pageToken);
      
      if (mediaUrls?.length) {
        params.append('link', mediaUrls[0]);
      }

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: 'POST',
        body: params,
      });
      
      const data = await res.json();
      
      if (data.error) throw new Error(`Facebook Feed: ${data.error.message}`);
      return { postId: data.id };
    }
  }
  ,

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
      const safeUrl = encodeURI(urls[0]);
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
// ─── Twitter (X) Publisher 🐦 ─────────────────────────────────
  twitter: async ({ account, content, mediaUrls }) => {
    const accessToken = decrypt(account.accessToken);
    const mediaIds = [];

    // 1. Handle Media Pre-Uploading (Images or Videos) if attached
    if (mediaUrls && mediaUrls.length > 0) {
      for (const url of mediaUrls) {
        try {
          logger.info('🐦', `Downloading asset for Twitter media stream: ${url}`);
          
          // Download the file stream over the network via Axios
          const mediaRes = await axios.get(url, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(mediaRes.data);
          const filename = url.split('/').pop() || 'upload.jpg';

          // Wrap into native multipart form binary blocks
          const formData = new FormData();
          formData.append('media', new Blob([buffer]), filename);

          // Upload directly to X's media ingestion endpoint
          const uploadRes = await fetch('https://api.twitter.com/2/media/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData
          });

          const uploadData = await uploadRes.json();
          
          if (uploadData.media_id_string) {
            mediaIds.push(uploadData.media_id_string);
            logger.info('🐦', `✅ Media attached to X successfully. ID: ${uploadData.media_id_string}`);
          } else {
            logger.error('🐦', `X media cluster rejection: ${JSON.stringify(uploadData)}`);
          }
        } catch (mediaErr) {
          logger.error('🐦', `Skipping media attachment due to error: ${mediaErr.message}`);
        }
      }
    }

    // 2. Build the structural Tweet request body payload
    const tweetPayload = {
      text: content
    };

    // Nest upload tracking IDs if array references are active
    if (mediaIds.length > 0) {
      tweetPayload.media = {
        media_ids: mediaIds
      };
    }

    // 3. Post the compilation live to Twitter / X
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tweetPayload)
    });

    const data = await res.json();

    // Check for API rejection schemas or error payloads
    if (data.errors || data.detail) {
      const errMsg = data.errors?.[0]?.message || data.detail || 'Authentication or scope error';
      throw new Error(`Twitter (X) API Error: ${errMsg}`);
    }

    const tweetId = data.data.id;
    logger.info('🐦', `✅ Tweet successfully published! ID: ${tweetId}`);
    
    return { postId: tweetId };
  },  
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
    
    // 🚀 USE THE NEW AUTO-REFRESH HELPER
    const youtubeApi = await getAuthenticatedYouTubeClient(account);

    
    // Convert proxies to clean JS primitives to prevent serialization errors
    const tagsArray          = Array.isArray(youtubeTags) ? [...youtubeTags] : [];
    const vanillaDescription = String(content || '');
    const vanillaTitle       = String(youtubeTitle || '');
    
    let targetVideoId = platformPostId;

    // ─────────────────────────────────────────────────────────────
    // MODE A: UPDATE EXISTING METADATA
    // ─────────────────────────────────────────────────────────────
    if (platformPostId) {
      logger.info('▶️', `YouTube running in EDIT mode for Video ID: ${platformPostId}`);
      try {
        await youtubeApi.videos.update({
          part: 'snippet,status',
          requestBody: {
            id: platformPostId, 
            snippet: {
              title:       vanillaTitle || 'Updated Video Title',
              description: vanillaDescription,
              tags:        tagsArray,
              categoryId:  String(youtubeCategory),
            },
            status: {
              privacyStatus:           youtubePrivacy,
              selfDeclaredMadeForKids: Boolean(youtubeMadeForKids),
            },
          },
        });
        logger.info('▶️', `✅ YouTube Video metadata updated successfully!`);
      } catch (error) {
        logger.error('▶️', `YouTube video update error: ${error.message}`);
        throw new Error(`YouTube Update Error: ${error.message}`);
      }
    } 
    // ─────────────────────────────────────────────────────────────
    // MODE B: FRESH UPLOAD
    // ─────────────────────────────────────────────────────────────
    else {
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
              title:       vanillaTitle || 'New Video',
              description: vanillaDescription,
              tags:        tagsArray,
              categoryId:  String(youtubeCategory),
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

        targetVideoId = uploadRes.data.id;
        logger.info('▶️', `✅ YouTube upload complete — Video ID: ${targetVideoId}`);
      } catch (error) {
        logger.error('▶️', `YouTube upload error: ${error.message}`);
        throw new Error(`YouTube API Error: ${error.message}`);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // ✅ SHARED DYNAMIC FORMAT THUMBNAIL ENGINE (RUNS FOR BOTH EDITS AND FRESH UPLOADS)
    // ─────────────────────────────────────────────────────────────
    if (youtubeThumbnailUrl && targetVideoId) {
      try {
        logger.info('▶️', `Setting custom thumbnail for Video ID: ${targetVideoId}`);
        
        const isPng = youtubeThumbnailUrl.toLowerCase().split('?')[0].endsWith('.png');
        const calculatedMimeType = isPng ? 'image/png' : 'image/jpeg';
        
        logger.info('▶️', `Detected thumbnail format: ${calculatedMimeType}`);

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
            throw new Error(`Local thumbnail file path not found: ${localThumbPath}`);
          }
        }

        await youtubeApi.thumbnails.set({
          videoId: targetVideoId,
          media: {
            mimeType: calculatedMimeType,
            body: thumbnailStream,
          },
        });
        
        logger.info('▶️', `✅ Custom thumbnail successfully pushed to YouTube!`);
      } catch (thumbErr) {
        const apiError = thumbErr.response?.data?.error?.message || thumbErr.message;
        logger.error('▶️', `❌ YouTube Thumbnail upload failed: ${apiError}`);
      }
    }

    return { postId: targetVideoId };
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

  const existingResult = post.platformResults?.find(
    r => r.platform.toLowerCase() === platform
  );
  const platformPostId = existingResult?.platformPostId || null;

 // ─── Facebook Routine (Updated) ───────────────────────────────
                              if (platform === 'facebook') {
                                const selectedPages = (account.pages || []).filter(p => p.isSelected);
                                if (!selectedPages.length) throw new Error('Facebook: no pages selected for posting');

                                const results = [];
                                for (const page of selectedPages) {
                                  try {
                                    const pageToken = decrypt(page.pageAccessToken);
                                    // 🌟 ADDED 'mediaType' to the arguments here
                                    const result    = await publisher({ 
                                      accessToken, 
                                      pageToken, 
                                      accountId: account.accountId, 
                                      pageId: page.pageId, 
                                      content, 
                                      mediaUrls,
                                      mediaType // <--- Pass this through
                                    });
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
  return await publisher({ 
    account, 
    accessToken, 
    accountId: account.accountId, 
    content,
    mediaUrls,
    platformPostId, 
    youtubeTitle:        post.youtubeTitle,
    youtubeTags:         post.youtubeTags,
    youtubeCategory:     post.youtubeCategory,
    youtubePrivacy:      post.youtubePrivacy,
    youtubeMadeForKids:  post.youtubeMadeForKids,
    youtubeThumbnailUrl: post.youtubeThumbnail // 🚀 FIXED: Added parameter forward routing!
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