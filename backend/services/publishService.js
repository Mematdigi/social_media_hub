// services/publishService.js
const { decrypt } = require('../utils/encryption');
const logger      = require('../utils/logger');

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
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type:   'REELS',
            video_url:    urls[0],
            caption:      content,
            access_token: pageToken
          })
        }
      );
      const containerData = await containerRes.json();
      if (containerData.error) throw new Error(`Instagram reel container: ${containerData.error.message}`);

      // Reels need processing time — poll status before publishing
      await waitForIGContainer(igAccountId, containerData.id, pageToken);

      return await publishIGContainer(igAccountId, containerData.id, pageToken);
    }

    // ── IMAGE (single photo) ─────────────────────────────────
    if (postType === 'IMAGE') {
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igAccountId}/media`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url:    urls[0],
            caption:      content,
            access_token: pageToken
          })
        }
      );
      const containerData = await containerRes.json();
      if (containerData.error) throw new Error(`Instagram image container: ${containerData.error.message}`);

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
  youtube:   async () => { throw new Error('YouTube publisher not implemented yet'); },
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
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`Instagram publish: ${publishData.error.message}`);

  logger.info('📷', `✅ Instagram published — postId: ${publishData.id}`);
  return { postId: publishData.id };
};

// Poll container status (needed for Reels — they need encoding time)
const waitForIGContainer = async (igAccountId, creationId, pageToken, maxWaitMs = 60000) => {
  const start    = Date.now();
  const interval = 5000; // poll every 5s

  while (Date.now() - start < maxWaitMs) {
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${creationId}` +
      `?fields=status_code,status&access_token=${pageToken}`
    );
    const statusData = await statusRes.json();

    logger.info('📷', `IG container status: ${statusData.status_code}`);

    if (statusData.status_code === 'FINISHED') return;
    if (statusData.status_code === 'ERROR')
      throw new Error(`Instagram container processing failed: ${statusData.status}`);

    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error('Instagram container processing timed out after 60s');
};


// ═══════════════════════════════════════════════════════════════
// CORE: publish one account
// ═══════════════════════════════════════════════════════════════

const publishToAccount = async (account, content, mediaUrls, mediaType) => {
  const platform  = account.platform.toLowerCase();
  const publisher = publishers[platform];

  if (!publisher) throw new Error(`No publisher for platform: ${platform}`);

  const accessToken = decrypt(account.accessToken);

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
  return await publisher({ accessToken, accountId: account.accountId, content, mediaUrls });
};


// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

const publishPostToPlatforms = async (post, accounts) => {
  const platformResults = [];

  for (const account of accounts) {
    try {
      const result = await publishToAccount(
        account,
        post.content,
        post.mediaUrls,
        post.mediaType  // optional field on post doc
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