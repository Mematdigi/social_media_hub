import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link2, Plus } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageHeader } from '../components/layout/PageHeader';
import { PlatformCard } from '../components/accounts/PlatformCard';
import { PageLoader } from '../components/common/Loader';
import { useAccounts } from '../context/AccountsContext';
import { toast } from 'sonner';

export default function Accounts() {
  const { platforms, loading, connectedCount, disconnectAccount, refetchAccounts } = useAccounts();

  // 🚀 FIX: Listen to the global message event from the OAuth popup to refresh UI data
// 🚀 FIX: Listen to the global message event from the OAuth popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.source === 'socialhub_oauth') {
        const { platform: responsePlatform, success, message } = event.data;

        if (success) {
          toast.success(`${responsePlatform.charAt(0).toUpperCase() + responsePlatform.slice(1)} connected successfully!`);
          
          if (refetchAccounts) refetchAccounts(); 
          
          // ✨ THE AUTO-REFRESH FIX: Force the browser to automatically reload after 1.5 seconds
          setTimeout(() => {
            window.location.reload();
          }, 1500);

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
      <PageHeader
        icon={Link2}
        title="Connected Accounts"
        subtitle="Manage your social media connections"
        actions={
          <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white border border-slate-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]" />
            <span className="text-sm font-semibold text-slate-700 tabular-nums">
              {connectedCount} connected
            </span>
          </div>
        }
      />

      {/* 🌟 INTELLIGENT MULTI-ACCOUNT PROFILE GRID MATRIX */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        data-testid="platforms-grid"
        className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
      >
        {platforms.map((platform, index) => {
          
          // ── CASE 1: Platform has MULTIPLE distinct profiles linked ────────────────
          if (platform.connected && Array.isArray(platform.accounts) && platform.accounts.length > 0) {
            return (
              <React.Fragment key={`group-${platform.platform}`}>
                {platform.accounts.map((singleAccount, accIndex) => {
                  
                  // Break out Facebook nested pages into individual cards
                  if (platform.platform === 'facebook' && singleAccount.pages && singleAccount.pages.length > 0) {
                    return singleAccount.pages.map((page, pageIndex) => (
                      <motion.div
                        key={`fb-page-${page.pageId || pageIndex}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * index }}
                      >
                        <PlatformCard
                          platform={platform.platform}
                          connected={true}
                          account={{
                            ...singleAccount, // Keep parent data (like profilePicture)
                            accountName: page.pageName, // Override with specific Page Name
                            accountId: page.pageId,     // Override with specific Page ID
                            category: page.category     // Pass the category
                          }}
                          oauthSupported={platform.oauthSupported}
                          // ✨ FIX: Target the parent database ID so the backend successfully deletes the connection
                          onDisconnect={() => disconnectAccount(singleAccount.id || singleAccount._id)} 
                        />
                      </motion.div>
                    ));
                  }

                  // Existing logic for Instagram/YouTube/Twitter
                  return (
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
                        // ✨ FIX: Explicitly target the database ID here as well
                        onDisconnect={() => disconnectAccount(singleAccount.id || singleAccount._id)}
                      />
                    </motion.div>
                  );
                })}
                
                {/* ➕ "ADD ANOTHER" ACCORDION CARD BUTTON SLOTS */}
                {(platform.platform === 'youtube' || platform.platform === 'twitter' || platform.platform === 'x' || platform.platform === 'facebook' || platform.platform === 'instagram') && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200/70 rounded-[1.125rem] p-5 bg-white/50 hover:border-indigo-300 hover:[background:var(--grad-soft)] transition-all duration-200 min-h-[240px]"
                  >
                    <button
                      type="button"
                      onClick={() => handleTriggerOAuthFlow(platform.platform)}
                      className="group flex flex-col items-center justify-center text-center w-full h-full"
                    >
                      <div className="w-11 h-11 inline-flex items-center justify-center rounded-xl sh-grad-brand shadow-button group-hover:scale-105 transition-transform duration-200 mb-3">
                        <Plus className="w-5 h-5 text-white" />
                      </div>
                      <h4 className="font-heading font-semibold text-slate-900 text-sm">Add Another</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-[150px]">Link an extra {platform.name} channel context</p>
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