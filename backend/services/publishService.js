// services/publishService.js
// Extensible multi-platform publisher
// To add a new platform: add a function to `publishers` object — that's it

const { decrypt } = require('../utils/encryption');
const logger      = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════
// PLATFORM PUBLISHERS
// Each function receives: { accessToken, pageToken, accountId, pageId, content, mediaUrls }
// Must return: { postId: string }
// Must throw on failure (error is caught by publishToAccount)
// ═══════════════════════════════════════════════════════════════

const publishers = {

  // ─── Facebook ────────────────────────────────────────────────
  facebook: async ({ pageToken, pageId, content, mediaUrls }) => {
    // Uses PAGE token + PAGE ID (not user token)
    // pageToken and pageId come from account.pages[]
    const body = {
      message:      content,
      access_token: pageToken
    };

    if (mediaUrls?.length) {
      body.link = mediaUrls[0]; // attach first URL as link preview
    }

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
  // Requires: instagram_basic, instagram_content_publish permissions
  // Flow: create container → publish container
  instagram: async ({ accessToken, accountId, content, mediaUrls }) => {
    // Step 1: Create media container
    // const containerRes = await fetch(
    //   `https://graph.facebook.com/v19.0/${accountId}/media`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       caption:      content,
    //       image_url:    mediaUrls?.[0],   // required for IMAGE posts
    //       access_token: accessToken
    //     })
    //   }
    // );
    // const { id: creationId } = await containerRes.json();
    //
    // Step 2: Publish container
    // const publishRes = await fetch(
    //   `https://graph.facebook.com/v19.0/${accountId}/media_publish`, {
    //     method: 'POST',
    //     body: JSON.stringify({ creation_id: creationId, access_token: accessToken })
    //   }
    // );
    // const { id } = await publishRes.json();
    // return { postId: id };

    throw new Error('Instagram publisher not implemented yet');
  },

  // ─── Twitter / X ─────────────────────────────────────────────
  // Requires: OAuth 2.0 PKCE, tweet.write scope
  twitter: async ({ accessToken, content, mediaUrls }) => {
    // const res = await fetch('https://api.twitter.com/2/tweets', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type':  'application/json',
    //     'Authorization': `Bearer ${accessToken}`
    //   },
    //   body: JSON.stringify({ text: content })
    // });
    // const data = await res.json();
    // if (data.errors) throw new Error(data.errors[0].message);
    // return { postId: data.data.id };

    throw new Error('Twitter publisher not implemented yet');
  },

  // ─── LinkedIn ─────────────────────────────────────────────────
  // Requires: w_member_social scope
  linkedin: async ({ accessToken, accountId, content, mediaUrls }) => {
    // const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type':  'application/json',
    //     'Authorization': `Bearer ${accessToken}`,
    //     'X-Restli-Protocol-Version': '2.0.0'
    //   },
    //   body: JSON.stringify({
    //     author:             `urn:li:person:${accountId}`,
    //     lifecycleState:     'PUBLISHED',
    //     specificContent: {
    //       'com.linkedin.ugc.ShareContent': {
    //         shareCommentary: { text: content },
    //         shareMediaCategory: 'NONE'
    //       }
    //     },
    //     visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    //   })
    // });
    // const data = await res.json();
    // return { postId: data.id };

    throw new Error('LinkedIn publisher not implemented yet');
  },

  // ─── TikTok ───────────────────────────────────────────────────
  tiktok: async ({ accessToken, content, mediaUrls }) => {
    throw new Error('TikTok publisher not implemented yet');
  },

  // ─── YouTube ──────────────────────────────────────────────────
  youtube: async ({ accessToken, content, mediaUrls }) => {
    throw new Error('YouTube publisher not implemented yet');
  },

  // ─── Pinterest ────────────────────────────────────────────────
  pinterest: async ({ accessToken, accountId, content, mediaUrls }) => {
    throw new Error('Pinterest publisher not implemented yet');
  },

  // ─── Reddit ───────────────────────────────────────────────────
  reddit: async ({ accessToken, accountId, content, mediaUrls }) => {
    throw new Error('Reddit publisher not implemented yet');
  },

  // ─── Discord ──────────────────────────────────────────────────
  discord: async ({ accessToken, accountId, content, mediaUrls }) => {
    throw new Error('Discord publisher not implemented yet');
  },

  // ─── Telegram ─────────────────────────────────────────────────
  telegram: async ({ accessToken, accountId, content, mediaUrls }) => {
    throw new Error('Telegram publisher not implemented yet');
  },
};


// ═══════════════════════════════════════════════════════════════
// CORE: publish one account
// ═══════════════════════════════════════════════════════════════

const publishToAccount = async (account, content, mediaUrls) => {
  const platform  = account.platform.toLowerCase();
  const publisher = publishers[platform];

  if (!publisher) {
    throw new Error(`No publisher registered for platform: ${platform}`);
  }

  // Decrypt user-level access token (used by most platforms)
  const accessToken = decrypt(account.accessToken);

  // ── Facebook special case: use Page token from pages[] ──────
  if (platform === 'facebook') {
    const selectedPages = (account.pages || []).filter(p => p.isSelected);

    if (!selectedPages.length) {
      throw new Error('Facebook: no pages selected for posting');
    }

    const results = [];

    for (const page of selectedPages) {
      try {
        const pageToken = decrypt(page.pageAccessToken);

        const result = await publisher({
          accessToken,          // user token (backup)
          pageToken,            // page token (used for posting)
          accountId: account.accountId,
          pageId:    page.pageId,
          content,
          mediaUrls
        });

        logger.info('📘', `✅ Facebook: posted to "${page.pageName}" — ID: ${result.postId}`);

        results.push({
          pageId:   page.pageId,
          pageName: page.pageName,
          postId:   result.postId,
          status:   'published'
        });
      } catch (err) {
        logger.error(`❌ Facebook: failed for page "${page.pageName}": ${err.message}`);
        results.push({
          pageId:   page.pageId,
          pageName: page.pageName,
          status:   'failed',
          error:    err.message
        });
      }
    }

    // Return combined postId for platformResults (first successful one)
    const firstSuccess = results.find(r => r.status === 'published');
    if (!firstSuccess) throw new Error(results.map(r => r.error).join(', '));

    return {
      postId:   firstSuccess.postId,
      status:   'published',
      pages:    results           // detailed per-page results
    };
  }

  // ── All other platforms: use user access token ───────────────
  return await publisher({
    accessToken,
    accountId: account.accountId,
    content,
    mediaUrls
  });
};


// ═══════════════════════════════════════════════════════════════
// MAIN: publish to all selected accounts
// ═══════════════════════════════════════════════════════════════

const publishPostToPlatforms = async (post, accounts) => {
  const platformResults = [];

  for (const account of accounts) {
    try {
      const result = await publishToAccount(account, post.content, post.mediaUrls);

      platformResults.push({
        platform:       account.platform,
        accountId:      account.accountId,
        platformPostId: result.postId,
        status:         'published',
        publishedAt:    new Date(),
        pages:          result.pages || []   // Facebook page breakdown
      });

      logger.info(`✅ Published to ${account.platform} (${account.accountId})`);

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


// ═══════════════════════════════════════════════════════════════
// UTILITY: register a new platform publisher at runtime
// Usage: registerPublisher('snapchat', async ({ accessToken, content }) => { ... })
// ═══════════════════════════════════════════════════════════════

const registerPublisher = (platform, handler) => {
  publishers[platform.toLowerCase()] = handler;
  logger.info(`📌 Publisher registered for: ${platform}`);
};


module.exports = { publishPostToPlatforms, registerPublisher };