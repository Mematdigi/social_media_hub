import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Users, ExternalLink } from 'lucide-react';
import { PlatformIcon } from './PlatformIcon';
import { Badge } from '../common/Badge';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { getPlatformConfig } from '../../utils/platformConfig';
import { cn } from '../../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL || process.env.API_URL || 'http://localhost:5000';
export const PlatformCard = ({ 
  platform, 
  connected = false, 
  account = null,
  oauthSupported = true,
  onDisconnect 
}) => {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const config = getPlatformConfig(platform);

  const handleConnect = () => {
      const token = localStorage.getItem('token'); // your JWT token key
      const user = localStorage.getItem('user'); // your user ID key
      const userId = user ? JSON.parse(user).id : null;
    // Redirect to OAuth flow
window.location.href = `${API_URL}/api/accounts/oauth/${platform}?user_id=${userId}`;
  };

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
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
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
                src={account.profilePicture}
                alt={account.accountName}
                className="w-6 h-6 rounded-full"
              />
              <span className="text-sm text-slate-600 truncate">
                {account.accountName}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-500 mb-4">
              <Users className="w-4 h-4" />
              <span>{formatFollowers(account.followers)} followers</span>
            </div>
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
          <Button
            data-testid={`connect-${platform}`}
            className="w-full mt-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-button"
            onClick={handleConnect}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Connect
          </Button>
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
