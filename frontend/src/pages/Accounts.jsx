import React from 'react';
import { motion } from 'framer-motion';
import { Link2 } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PlatformCard } from '../components/accounts/PlatformCard';
import { PageLoader } from '../components/common/Loader';
import { useAccounts } from '../context/AccountsContext';

export default function Accounts() {
  const { platforms, loading, connectedCount, disconnectAccount } = useAccounts();

  if (loading) {
    return (
      <PageWrapper title="Connected Accounts">
        <PageLoader />
      </PageWrapper>
    );
  }

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
              {connectedCount}/25 connected
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        data-testid="platforms-grid"
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        {platforms.map((platform, index) => (
          <motion.div
            key={platform.platform}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <PlatformCard
              platform={platform.platform}
              connected={platform.connected}
              account={platform.account}
              oauthSupported={platform.oauthSupported}
              onDisconnect={disconnectAccount}
            />
          </motion.div>
        ))}
      </motion.div>
    </PageWrapper>
  );
}
