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

const API_URL   = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const TOKEN_KEY = 'token';

import { accountsAPI } from '../../services/api';// ── Facebook SDK scopes ────────────────────────────────────────────────────
const FB_SCOPES = {
  facebook: [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ].join(','),

  instagram: [
    'public_profile',
    'email',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'business_management',
  ].join(','),
};

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

  // ── Auth helpers ──────────────────────────────────────────────────────────
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

  // ── Cleanup popup listeners on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('message', handlePopupMessage);
    };
  }, []);

  // ── Save Facebook token to backend ───────────────────────────────────────
  const saveTokenToBackend = async (accessToken) => {
    const token = getAuthToken();
    const res = await fetch(`${API_URL}/api/accounts/connect/facebook/token`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ accessToken }),
    });
    return await res.json();
  };

  // ── Save Instagram token to backend ──────────────────────────────────────
  const saveInstagramTokenToBackend = async (accessToken) => {
    const token = getAuthToken();
    const res = await fetch(`${API_URL}/api/accounts/connect/instagram/token`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ accessToken }),
    });
    return await res.json();
  };

  // ── Handle postMessage from Threads popup ─────────────────────────────────
  const handlePopupMessage = (event) => {
    if (event.origin !== API_URL) return;
    if (event.data?.platform !== 'threads') return;

    // Cleanup
    window.removeEventListener('message', handlePopupMessage);
    clearInterval(intervalRef.current);
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }

    if (event.data.success) {
      if (onConnected) {
        onConnected('threads');
      } else {
        window.location.href = '/accounts?connected=threads';
      }
    } else {
      setConnectError(event.data.message || 'Failed to connect Threads');
    }
    setConnecting(false);
  };

  // ── METHOD 1: Facebook SDK popup (Facebook + Instagram) ──────────────────
  const connectFacebookSDK = () => {
    setConnectError('');

    if (!window.FB) {
      setConnectError('Facebook SDK not loaded. Please refresh the page.');
      return;
    }
    if (isTokenExpired()) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
      return;
    }

    setConnecting(true);
    const scope = FB_SCOPES[platform] || FB_SCOPES.facebook;

    // ✅ Regular function — NOT async
    window.FB.login(function(response) {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;

        const saveToken = platform === 'instagram'
          ? saveInstagramTokenToBackend(accessToken)
          : saveTokenToBackend(accessToken);

        saveToken
          .then((data) => {
            if (data.success) {
              if (onConnected) {
                onConnected(platform);
              } else {
                window.location.href = `/accounts?connected=${platform}`;
              }
            } else {
              setConnectError(data.message || `Failed to connect ${config.name}`);
            }
          })
          .catch(() => setConnectError('Network error. Please try again.'))
          .finally(() => setConnecting(false));

      } else {
        setConnecting(false);
        setConnectError('Login was cancelled.');
      }
    }, { scope });
  };

  // ── METHOD 2: Threads popup (same feel as FB SDK) ────────────────────────
// PlatformCard.jsx — connectThreadsPopup
const connectThreadsPopup = () => {
  setConnectError('');
  setConnecting(true);

  // ✅ Delegate entirely to accountsAPI
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

  // ── METHOD 3: OAuth redirect (all other platforms) ───────────────────────
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

  // ── Main connect handler ──────────────────────────────────────────────────
  const handleConnect = () => {
    if (platform === 'facebook' || platform === 'instagram') {
      connectFacebookSDK();    // ✅ FB.login popup
    } else if (platform === 'threads') {
      connectThreadsPopup();   // ✅ Threads popup — same UX as FB SDK
    } else {
      connectOAuth();           // Full redirect for Twitter, LinkedIn etc.
    }
  };

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    if (!account) return;
    setDisconnecting(true);
    try {
      await onDisconnect(account.id);
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
        {/* Header */}
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

        {/* Platform name */}
        <h3 className="font-heading font-bold text-slate-900 mb-1">
          {config.name}
        </h3>

        {/* Connected */}
        {connected && account ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <img
                src={account.profilePicture}
                alt={account.accountName}
                className="w-6 h-6 rounded-full object-cover"
                onError={(e) => {
                  e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${platform}`;
                }}
              />
              <span className="text-sm text-slate-600 truncate">
                {account.accountName}
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

      {/* Disconnect dialog */}
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