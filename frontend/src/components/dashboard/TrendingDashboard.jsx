import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { TrendsExplorer } from '../trends/TrendsExplorer';

// ─────────────────────────────────────────────────────────────────────────────
// "Trending today" card on the Dashboard.
// "Create post" opens the composer with title, caption, hashtags and tags
// already written for that trend (the user can still edit everything).
// ─────────────────────────────────────────────────────────────────────────────
export const TrendingDashboard = () => {
  const navigate = useNavigate();

  const handleCreate = (brief, platformHint) => {
    navigate('/posts/new', { state: { aiBrief: brief, platformHint } });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      data-testid="dashboard-trending"
      className="bg-white rounded-3xl border border-slate-100 shadow-card overflow-hidden mb-10"
    >
      <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-slate-100">
        <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-500 flex items-center justify-center">
          <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="font-heading font-bold text-slate-900 text-base sm:text-lg">Trending today</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            What people are searching and watching — click “Create post” and AI writes it for you
          </p>
        </div>
      </div>
      <div className="p-4 sm:p-6">
        <TrendsExplorer onCreate={handleCreate} createLabel="Create post" />
      </div>
    </motion.div>
  );
};

export default TrendingDashboard;
