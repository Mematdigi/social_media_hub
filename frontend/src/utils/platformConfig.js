import { 
  FaFacebook, 
  FaInstagram, 
  FaTwitter, 
  FaLinkedin, 
  FaTiktok, 
  FaYoutube, 
  FaPinterest, 
  FaSnapchat, 
  FaReddit, 
  FaTumblr, 
  FaTelegram, 
  FaWhatsapp, 
  FaDiscord, 
  FaTwitch, 
  FaMedium, 
  FaQuora, 
  FaVk, 
  FaWeibo, 
  FaMastodon, 
  FaBehance, 
  FaDribbble, 
  FaGithub, 
  FaProductHunt 
} from 'react-icons/fa';
import { SiThreads, SiBluesky } from 'react-icons/si';

export const PLATFORM_CONFIG = {
  facebook: {
    name: 'Facebook',
    color: '#1877F2',
    icon: FaFacebook,
    oauthSupported: true,
  },
  instagram: {
    name: 'Instagram',
    color: '#E4405F',
    icon: FaInstagram,
    oauthSupported: true,
  },
  twitter: {
    name: 'Twitter / X',
    color: '#1DA1F2',
    icon: FaTwitter,
    oauthSupported: true,
  },
  linkedin: {
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: FaLinkedin,
    oauthSupported: true,
  },
  tiktok: {
    name: 'TikTok',
    color: '#000000',
    icon: FaTiktok,
    oauthSupported: true,
  },
  youtube: {
    name: 'YouTube',
    color: '#FF0000',
    icon: FaYoutube,
    oauthSupported: true,
  },
  pinterest: {
    name: 'Pinterest',
    color: '#E60023',
    icon: FaPinterest,
    oauthSupported: true,
  },
  snapchat: {
    name: 'Snapchat',
    color: '#FFFC00',
    icon: FaSnapchat,
    oauthSupported: false,
  },
  reddit: {
    name: 'Reddit',
    color: '#FF4500',
    icon: FaReddit,
    oauthSupported: true,
  },
  tumblr: {
    name: 'Tumblr',
    color: '#36465D',
    icon: FaTumblr,
    oauthSupported: true,
  },
  telegram: {
    name: 'Telegram',
    color: '#0088CC',
    icon: FaTelegram,
    oauthSupported: false,
  },
  whatsapp_business: {
    name: 'WhatsApp Business',
    color: '#25D366',
    icon: FaWhatsapp,
    oauthSupported: false,
  },
  discord: {
    name: 'Discord',
    color: '#5865F2',
    icon: FaDiscord,
    oauthSupported: true,
  },
  twitch: {
    name: 'Twitch',
    color: '#9146FF',
    icon: FaTwitch,
    oauthSupported: true,
  },
  medium: {
    name: 'Medium',
    color: '#000000',
    icon: FaMedium,
    oauthSupported: true,
  },
  quora: {
    name: 'Quora',
    color: '#B92B27',
    icon: FaQuora,
    oauthSupported: false,
  },
  vk: {
    name: 'VK',
    color: '#4C75A3',
    icon: FaVk,
    oauthSupported: true,
  },
  weibo: {
    name: 'Weibo',
    color: '#E6162D',
    icon: FaWeibo,
    oauthSupported: false,
  },
  threads: {
    name: 'Threads',
    color: '#000000',
    icon: SiThreads,
    oauthSupported: false,
  },
  mastodon: {
    name: 'Mastodon',
    color: '#6364FF',
    icon: FaMastodon,
    oauthSupported: true,
  },
  bluesky: {
    name: 'Bluesky',
    color: '#0085FF',
    icon: SiBluesky,
    oauthSupported: false,
  },
  behance: {
    name: 'Behance',
    color: '#1769FF',
    icon: FaBehance,
    oauthSupported: true,
  },
  dribbble: {
    name: 'Dribbble',
    color: '#EA4C89',
    icon: FaDribbble,
    oauthSupported: true,
  },
  github: {
    name: 'GitHub',
    color: '#181717',
    icon: FaGithub,
    oauthSupported: true,
  },
  producthunt: {
    name: 'Product Hunt',
    color: '#DA552F',
    icon: FaProductHunt,
    oauthSupported: true,
  },
};

export const getPlatformConfig = (platform) => {
  return PLATFORM_CONFIG[platform] || {
    name: platform,
    color: '#6366F1',
    icon: null,
    oauthSupported: false,
  };
};

export const getPlatformIcon = (platform) => {
  const config = PLATFORM_CONFIG[platform];
  return config?.icon || null;
};

export const getPlatformColor = (platform) => {
  const config = PLATFORM_CONFIG[platform];
  return config?.color || '#6366F1';
};

export default PLATFORM_CONFIG;
