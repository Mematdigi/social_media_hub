import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link2, Plus } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PlatformCard } from '../components/accounts/PlatformCard';
import { PageLoader } from '../components/common/Loader';
import { useAccounts } from '../context/AccountsContext';
import { toast } from 'sonner';

export default function Accounts() {
  const { platforms, loading, connectedCount, disconnectAccount, refetchAccounts } = useAccounts();

  // 🚀 FIX: Listen to the global message event from the OAuth popup to refresh UI data
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.source === 'socialhub_oauth') {
        const { platform: responsePlatform, success, message } = event.data;

        if (success) {
          toast.success(`${responsePlatform.charAt(0).toUpperCase() + responsePlatform.slice(1)} connected successfully!`);
          if (refetchAccounts) refetchAccounts(); // Instantly update the matrix grid
        } else {
          toast.error(`Failed to connect ${responsePlatform}: ${message}`);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refetchAccounts]);

  if (loading) {
    return (
      <PageWrapper title="Connected Accounts">
        <PageLoader />
      </PageWrapper>
    );
  }

  // Helper trigger to open dynamic authorization popups securely 
  const handleTriggerOAuthFlow = (platformName) => {
    const token = localStorage.getItem('socialhub_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userId = payload.user_id || payload._id || payload.id || payload.userId;
      
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
      const url = `${BACKEND_URL}/api/accounts/oauth/${platformName}?user_id=${userId}`;
      
      const w = 600;
      const h = 720;
      const left = (window.screen.width - w) / 2;
      const top = (window.screen.height - h) / 2;

      window.open(
        url,
        `${platformName}_oauth`,
        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
      );
    } catch (e) {
      console.error('Failed to parse OAuth initialization parameter strings:', e);
    }
  };

  return (
    <PageWrapper>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Link2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">
                Connected Accounts
              </h1>
              <p className="text-slate-600">
                Manage your social media connections
              </p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100">
            <span className="text-sm font-medium text-indigo-600">
              {connectedCount} connected
            </span>
          </div>
        </div>
      </motion.div>

      {/* 🌟 INTELLIGENT MULTI-ACCOUNT PROFILE GRID MATRIX */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        data-testid="platforms-grid"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4"
      >
        {platforms.map((platform, index) => {
          
          // ── CASE 1: Platform has MULTIPLE distinct profiles linked ────────────────
          if (platform.connected && Array.isArray(platform.accounts) && platform.accounts.length > 0) {
            return (
              <React.Fragment key={`group-${platform.platform}`}>
                {platform.accounts.map((singleAccount, accIndex) => (
                  <motion.div
                    key={`acc-${singleAccount.id || singleAccount._id || accIndex}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * index }}
                  >
                    <PlatformCard
                      platform={platform.platform}
                      connected={true}
                      account={singleAccount}
                      oauthSupported={platform.oauthSupported}
                      onDisconnect={disconnectAccount}
                    />
                  </motion.div>
                ))}
                
                {/* ➕ "ADD ANOTHER" ACCORDION CARD BUTTON SLOTS */}
                {(platform.platform === 'youtube' || platform.platform === 'twitter' || platform.platform === 'x' || platform.platform === 'facebook' || platform.platform === 'instagram') && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl p-5 bg-slate-50/40 hover:bg-slate-50 hover:border-indigo-300 transition-all duration-200 min-h-[240px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleTriggerOAuthFlow(platform.platform)}
                      className="group flex flex-col items-center justify-center text-center w-full h-full"
                    >
                      <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 group-hover:scale-105 transition-transform duration-200 mb-2">
                        <Plus className="w-5 h-5 text-indigo-500" />
                      </div>
                      <h4 className="font-heading font-bold text-slate-800 text-sm">Add Another</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-[140px]">Link an extra {platform.name} channel context</p>
                    </button>
                  </motion.div>
                )}
              </React.Fragment>
            );
          }

          // ── CASE 2: Normal fallback execution cards (Unconnected profiles) ───────
          return (
            <motion.div
              key={`empty-${platform.platform}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              <PlatformCard
                platform={platform.platform}
                connected={false}
                account={null} 
                oauthSupported={platform.oauthSupported}
                onDisconnect={disconnectAccount}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </PageWrapper>
  );
}