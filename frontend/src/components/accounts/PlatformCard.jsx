import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Users, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { PlatformIcon } from './PlatformIcon';
import { Badge } from '../common/Badge';
import { Button } from '../ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { getPlatformConfig } from '../../utils/platformConfig';
import { cn } from '../../lib/utils';
import { accountsAPI } from '../../services/api';
import { toast } from 'sonner';

const API_URL   = process.env.REACT_APP_BACKEND_URL;
const TOKEN_KEY = 'socialhub_token';

export const PlatformCard = ({
  platform,
  connected      = false,
  account        = null,
  oauthSupported = true,
  onDisconnect,
  onConnected,
}) => {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting]       = useState(false);
  const [connectError, setConnectError]   = useState('');

  const popupRef    = useRef(null);
  const intervalRef = useRef(null);

  const config = getPlatformConfig(platform);

  const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

  const getUserId = () => {
    const token = getAuthToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id || payload._id || payload.id || payload.userId || null;
    } catch { return null; }
  };

  const isTokenExpired = () => {
    const token = getAuthToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch { return true; }
  };

  // Note: The global message listener is now handled securely in Accounts.jsx
  // to trigger refetchAccounts(), so we don't need duplicate listeners here 
  // unless we are handling specific local state failures.

  // ════════════════════════════════════════════════════════════
  // ✅ HARDCODED Facebook OAuth (Direct to Facebook)
  // ════════════════════════════════════════════════════════════
  const connectFacebookHardcoded = () => {
    setConnectError('');
    if (isTokenExpired()) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setConnectError('You must be logged in.');
      return;
    }
    setConnecting(true);

    const FACEBOOK_CLIENT_ID = '1108979541367564';
    const REDIRECT_URI = 'https://media.mematdigi.com/api/accounts/oauth/facebook/callback';
    const STATE = btoa(JSON.stringify({ user_id: userId, platform: 'facebook' }));
    const SCOPE = 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts';

    const facebookAuthUrl =
      `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${FACEBOOK_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&state=${encodeURIComponent(STATE)}` +
      `&response_type=code` +
      `&auth_type=rerequest`;

    openPopupContainer(facebookAuthUrl, 'facebook_oauth');
  };

  // ════════════════════════════════════════════════════════════
  // ✅ HARDCODED Instagram OAuth (Direct to Facebook)
  // ════════════════════════════════════════════════════════════
  const connectInstagramHardcoded = () => {
    setConnectError('');
    if (isTokenExpired()) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setConnectError('You must be logged in.');
      return;
    }
    setConnecting(true);

    const FACEBOOK_CLIENT_ID = '1108979541367564';
    const REDIRECT_URI = 'https://media.mematdigi.com/api/accounts/oauth/instagram/callback';
    const STATE = btoa(JSON.stringify({ user_id: userId, platform: 'instagram' }));
    const SCOPE = 'public_profile,pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,business_management';

    const instagramAuthUrl =
      `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${FACEBOOK_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&state=${encodeURIComponent(STATE)}` +
      `&response_type=code` +
      `&auth_type=rerequest`;

    openPopupContainer(instagramAuthUrl, 'instagram_oauth');
  };

  // ════════════════════════════════════════════════════════════
  // 🐦 Twitter (X) & 🎥 YouTube Dynamic OAuth Flow
  // ════════════════════════════════════════════════════════════
  const connectDynamicPopup = (platformName) => {
    setConnectError('');
    if (isTokenExpired()) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setConnectError('You must be logged in.');
      return;
    }
    setConnecting(true);

    const authUrl = `${API_URL}/api/accounts/oauth/${platformName}?user_id=${userId}`;
    openPopupContainer(authUrl, `${platformName}_oauth`);
  };

  // ════════════════════════════════════════════════════════════
  // Shared Layout Wrapper Tool
  // ════════════════════════════════════════════════════════════
  const openPopupContainer = (url, targetName) => {
    const w = 600;
    const h = 720;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;

    const popup = window.open(
      url,
      targetName,
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    if (!popup) {
      console.error('❌ Popup blocked');
      setConnecting(false);
      setConnectError('Popup blocked. Please allow popups for this site and try again.');
      return;
    }

    popupRef.current = popup;
    const checkPopup = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkPopup);
        setConnecting(false); // Reset button state when popup closes
      }
    }, 500);
    intervalRef.current = checkPopup;
  };

  const connectThreadsPopup = () => {
    setConnectError('');
    setConnecting(true);

    accountsAPI.initiateOAuth('threads')
      .then(() => {
        if (onConnected) onConnected('threads');
      })
      .catch((err) => {
        setConnectError(err.message || 'Failed to connect Threads');
      })
      .finally(() => {
        setConnecting(false);
      });
  };

  const connectOAuth = () => {
    setConnectError('');
    if (isTokenExpired()) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return;
    }
    const userId = getUserId();
    if (!userId) {
      setConnectError('You must be logged in.');
      return;
    }
    window.location.href = `${API_URL}/api/accounts/oauth/${platform}?user_id=${userId}`;
  };

  // ════════════════════════════════════════════════════════════
  // Main Connect Handler
  // ════════════════════════════════════════════════════════════
  const handleConnect = () => {
    if (platform === 'facebook') {
      connectFacebookHardcoded();
    } else if (platform === 'instagram') {
      connectInstagramHardcoded();
    } else if (platform === 'threads') {
      connectThreadsPopup();
    } else if (platform === 'twitter' || platform === 'x' || platform === 'youtube') {
      connectDynamicPopup(platform);
    } else {
      connectOAuth(); 
    }
  };

  // 🚀 CRITICAL FIX: Ensure disconnect uses the unique account ID
  const handleDisconnect = async () => {
    if (!account) return;
    setDisconnecting(true);
    try {
      const targetId = account.id || account._id; 
      if (!targetId) {
        toast.error("Cannot disconnect: Account ID missing.");
        setConnectError("Cannot disconnect: Account ID missing.");
        return;
      }
      await onDisconnect(targetId);
      toast.success(`${account.accountName || config.name} disconnected successfully.`);
    } catch (error) {
      console.error("Disconnect error:", error);
      toast.error("Failed to disconnect account.");
    } finally {
      setDisconnecting(false);
      setShowDisconnectDialog(false);
    }
  };

  const formatFollowers = (count) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)    return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <>
      <motion.div
        data-testid={`platform-card-${platform}`}
        whileHover={{ y: -4 }}
        className={cn(
          'relative overflow-hidden bg-white rounded-[1.125rem] border p-5 transition-[box-shadow,border-color] duration-200 h-full flex flex-col',
          'shadow-card hover:shadow-card-hover',
          connected
            ? 'border-emerald-200/80 sh-card--accent'
            : oauthSupported
            ? 'border-slate-200/80 hover:border-indigo-200'
            : 'border-slate-200/80 bg-slate-50/70 opacity-70'
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <PlatformIcon platform={platform} size="lg" showBackground />
          {connected ? (
            <Badge variant="connected">
              <Check className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : !oauthSupported ? (
            <Badge variant="soon">Coming Soon</Badge>
          ) : null}
        </div>

        <h3 className="font-heading font-semibold text-[1.0625rem] text-slate-900 mb-1.5">
          {config.name}
        </h3>

        {connected && account ? (
          <div className="flex flex-col flex-grow">
            <div className="flex items-center gap-2 mb-3">
              <img
                src={account.profilePicture || account.avatarUrl}
                alt={account.accountName || account.name}
                className="w-6 h-6 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm"
                onError={(e) => {
                  e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`;
                }}
              />
              <span className="text-sm text-slate-600 truncate font-medium">
                {account.accountName || account.name}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 self-start h-6 px-2 rounded-md bg-slate-50 ring-1 ring-inset ring-slate-200/80 text-xs font-medium text-slate-600 mb-3">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>{formatFollowers(account.followers)} followers</span>
            </div>

            <div className="flex-grow">
              {platform === 'facebook' && account.pages?.length > 0 && (
                <div className="text-xs text-slate-500 mb-3">
                  📄 {account.pages.length} page{account.pages.length > 1 ? 's' : ''} connected
                </div>
              )}
              {platform === 'instagram' && account.igUsername && (
                <div className="text-xs text-slate-500 mb-3 truncate">
                  📷 @{account.igUsername}
                </div>
              )}
              {platform === 'threads' && account.accountName && (
                <div className="text-xs text-slate-500 mb-3 truncate">
                  🧵 @{account.accountName}
                </div>
              )}
              {(platform === 'twitter' || platform === 'x') && (account.username || account.accountName) && (
                <div className="text-xs text-slate-500 mb-3 truncate">
                  🐦 @{account.username || account.accountName}
                </div>
              )}
              {platform === 'youtube' && (account.accountName || account.name) && (
                <div className="text-xs text-slate-500 mb-3 truncate" title={account.accountName || account.name}>
                  📺 {account.accountName || account.name}
                </div>
              )}
            </div>
            
            <Button
              data-testid={`disconnect-${platform}`}
              variant="outline"
              size="sm"
              className="w-full mt-auto hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              onClick={() => setShowDisconnectDialog(true)}
            >
              <X className="w-4 h-4" />
              Disconnect
            </Button>
          </div>
        ) : oauthSupported ? (
          <div className="mt-auto pt-4">
            {connectError && (
              <div className="flex items-start gap-1.5 text-xs font-medium text-red-700 mb-2 bg-red-50 ring-1 ring-inset ring-red-100 p-2 rounded-lg">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="leading-tight">{connectError}</span>
              </div>
            )}
            <Button
              type="button"
              data-testid={`connect-${platform}`}
              disabled={connecting}
              className="w-full disabled:opacity-60"
              onClick={handleConnect}
            >
              {connecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Connecting...</>
              ) : (
                <><ExternalLink className="w-4 h-4" />Connect</>
              )}
            </Button>
          </div>
        ) : (
          <div className="mt-auto pt-4">
            <p className="text-sm text-slate-400">
              OAuth integration coming soon
            </p>
          </div>
        )}
      </motion.div>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {account?.accountName || config.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this specific account from SocialHub. You can reconnect it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="sh-no-grad bg-red-600 hover:bg-red-700 text-white shadow-sm"
            >
              {disconnecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Disconnecting...</> : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PlatformCard;