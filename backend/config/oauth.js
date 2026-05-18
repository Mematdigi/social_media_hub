// OAuth 2.0 Configuration for Social Media Platforms
// Each platform has different OAuth endpoints and scopes

const OAUTH_CONFIG = {
  facebook: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scope: 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
    responseType: 'code',
  },
  instagram: {
    // Instagram uses Facebook's OAuth since it's part of Meta
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scope: 'instagram_basic,instagram_content_publish,pages_read_engagement',
    responseType: 'code',
  },
  twitter: {
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read offline.access',
    responseType: 'code',
  },
  linkedin: {
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'r_liteprofile r_emailaddress w_member_social',
    responseType: 'code',
  },
  tiktok: {
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,video.upload,video.publish',
    responseType: 'code',
  },
  youtube: {
    // YouTube uses Google's OAuth
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    responseType: 'code',
  },
  pinterest: {
    authUrl: 'https://www.pinterest.com/oauth/',
    tokenUrl: 'https://api.pinterest.com/v1/oauth/token',
    scope: 'boards:read boards:write pins:read pins:write',
    responseType: 'code',
  },
  discord: {
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scope: 'identify guilds messages.read',
    responseType: 'code',
  },
  twitch: {
    authUrl: 'https://id.twitch.tv/oauth2/authorize',
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    scope: 'user:read:email channel:manage:broadcast',
    responseType: 'code',
  },
  medium: {
    authUrl: 'https://medium.com/m/oauth/authorize',
    tokenUrl: 'https://api.medium.com/v1/tokens',
    scope: 'basicProfile,publishPost',
    responseType: 'code',
  },
  reddit: {
    authUrl: 'https://www.reddit.com/api/v1/authorize',
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    scope: 'read submit edit identity',
    responseType: 'code',
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'user:email repo',
    responseType: 'code',
  },
  mastodon: {
    // Mastodon requires instance URL, using a generic approach
    authUrl: 'https://mastodon.social/oauth/authorize',
    tokenUrl: 'https://mastodon.social/oauth/token',
    scope: 'read write follow',
    responseType: 'code',
  },
  behance: {
    authUrl: 'https://www.behance.net/v2/oauth/authorize',
    tokenUrl: 'https://api.behance.net/v2/oauth/token',
    scope: 'read write',
    responseType: 'code',
  },
  dribbble: {
    authUrl: 'https://dribbble.com/oauth/authorize',
    tokenUrl: 'https://dribbble.com/oauth/token',
    scope: 'public write',
    responseType: 'code',
  },
  vk: {
    authUrl: 'https://oauth.vk.com/authorize',
    tokenUrl: 'https://oauth.vk.com/access_token',
    scope: 'photos,wall,offline',
    responseType: 'code',
  },
  producthunt: {
    authUrl: 'https://www.producthunt.com/oauth/authorize',
    tokenUrl: 'https://api.producthunt.com/v1/oauth/token',
    scope: 'read write',
    responseType: 'code',
  },
};

// Get OAuth config for a platform
const getOAuthConfig = (platform) => {
  return OAUTH_CONFIG[platform] || null;
};

// Build authorization URL for a platform
const buildAuthUrl = (platform, clientId, redirectUri, state) => {
  const config = getOAuthConfig(platform);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: config.responseType,
    scope: config.scope,
    state: state,
  });

  // Platform-specific parameter additions
  if (platform === 'twitter') {
    params.append('code_challenge', 'challenge');
    params.append('code_challenge_method', 'plain');
  }

  return `${config.authUrl}?${params.toString()}`;
};

module.exports = {
  OAUTH_CONFIG,
  getOAuthConfig,
  buildAuthUrl,
};

