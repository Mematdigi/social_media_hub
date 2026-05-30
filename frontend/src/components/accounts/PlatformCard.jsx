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
  const handlerRef  = useRef(null);

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

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      if (handlerRef.current) {
        window.removeEventListener('message', handlerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // 1. Create the listener function
    const handleMessage = (event) => {
      // Check if the message is coming from our backend popup
      if (event.data && event.data.source === 'socialhub_oauth') {
        const { platform, success, message } = event.data;

        if (success) {
          // Show the success toast
          toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully!`);
          
          // Slight delay to let the toast appear, then refresh the page to update data
          setTimeout(() => {
            window.location.href = `/accounts?connected=${platform}`;
          }, 1000);
          
        } else {
          toast.error(`Failed to connect ${platform}: ${message}`);
        }
      }
    };

    // 2. Attach the listener to the browser
    window.addEventListener('message', handleMessage);
    handlerRef.current = handleMessage;

    // 3. Cleanup when component unmounts
    return () => {
      clearInterval(intervalRef.current);
      if (handlerRef.current) {
        window.removeEventListener('message', handlerRef.current);
      }
    };
  }, []); // Run once on mount
  
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

    console.log('🔗 Facebook OAuth URL:', facebookAuthUrl);

    const w = 600;
    const h = 720;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;

    const popup = window.open(
      facebookAuthUrl,
      'facebook_oauth',
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
        setConnecting(false);
      }
    }, 500);

    intervalRef.current = checkPopup;
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

    console.log('🔗 Instagram OAuth URL:', instagramAuthUrl);

    const w = 600;
    const h = 720;
    const left = (window.screen.width - w) / 2;
    const top = (window.screen.height - h) / 2;

    const popup = window.open(
      instagramAuthUrl,
      'instagram_oauth',
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
        setConnecting(false);
      }
    }, 500);

    intervalRef.current = checkPopup;
  };

  // ════════════════════════════════════════════════════════════
  // Other platforms - Backend redirect
  // ════════════════════════════════════════════════════════════
  const connectThreadsPopup = () => {
    setConnectError('');
    setConnecting(true);

    accountsAPI.initiateOAuth('threads')
      .then(() => {
        if (onConnected) {
          onConnected('threads');
        } else {
          window.location.href = '/accounts?connected=threads';
        }
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
    // This will redirect the user to your backend to start the OAuth flow (e.g. YouTube)
    // When the backend callback finishes, it automatically redirects back to /accounts
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
    } else {
      // Handles YouTube (and any other standard OAuth platform)
      connectOAuth(); 
    }
  };

 const handleDisconnect = async () => {
    if (!account) return;
    setDisconnecting(true);
    try {
      // ✅ Fallback to account._id for YouTube/MongoDB raw documents
      const targetId = account.id || account._id; 
      
      if (!targetId) {
        console.error("No account ID found to disconnect:", account);
        setConnectError("Cannot disconnect: Account ID missing.");
        return;
      }

      await onDisconnect(targetId);
      
    } catch (error) {
      console.error("Disconnect error:", error);
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
          'bg-white rounded-3xl border-2 p-5 transition-all duration-200',
          'shadow-card hover:shadow-card-hover',
          connected
            ? 'border-green-200'
            : oauthSupported
            ? 'border-slate-100 hover:border-indigo-200'
            : 'border-slate-100 opacity-60'
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

        <h3 className="font-heading font-bold text-slate-900 mb-1">
          {config.name}
        </h3>

        {connected && account ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <img
                src={account.profilePicture || account.avatarUrl}
                alt={account.accountName || account.name}
                className="w-6 h-6 rounded-full object-cover"
                onError={(e) => {
                  e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`;
                }}
              />
              <span className="text-sm text-slate-600 truncate">
                {account.accountName || account.name}
              </span>
            </div>

            <div className="flex items-center gap-1 text-sm text-slate-500 mb-4">
              <Users className="w-4 h-4" />
              <span>{formatFollowers(account.followers)} followers</span>
            </div>

            {platform === 'facebook' && account.pages?.length > 0 && (
              <div className="text-xs text-slate-400 mb-3">
                📄 {account.pages.length} page{account.pages.length > 1 ? 's' : ''} connected
              </div>
            )}
            {platform === 'instagram' && account.igUsername && (
              <div className="text-xs text-slate-400 mb-3">
                📷 @{account.igUsername}
              </div>
            )}
            {platform === 'threads' && account.accountName && (
              <div className="text-xs text-slate-400 mb-3">
                🧵 @{account.accountName}
              </div>
            )}

            <Button
              data-testid={`disconnect-${platform}`}
              variant="outline"
              size="sm"
              className="w-full rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              onClick={() => setShowDisconnectDialog(true)}
            >
              <X className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </>
        ) : oauthSupported ? (
          <>
            {connectError && (
              <div className="flex items-center gap-1 text-xs text-red-500 mt-2 mb-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span>{connectError}</span>
              </div>
            )}
            <Button
              type="button"
              data-testid={`connect-${platform}`}
              disabled={connecting}
              className="w-full mt-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-button disabled:opacity-60"
              onClick={handleConnect}
            >
              {connecting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</>
              ) : (
                <><ExternalLink className="w-4 h-4 mr-2" />Connect</>
              )}
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-400 mt-2">
            OAuth integration coming soon
          </p>
        )}
      </motion.div>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              Disconnect {config.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove your {config.name} account from SocialHub. You can reconnect it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-full bg-red-500 hover:bg-red-600"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PlatformCard;