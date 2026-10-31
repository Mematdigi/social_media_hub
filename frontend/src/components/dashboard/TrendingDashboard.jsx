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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      data-testid="dashboard-trending"
      className="sh-card sh-card--accent overflow-hidden mb-6 sm:mb-8"
    >
      <div className="sh-card-header !justify-start">
        <div className="sh-page-icon sh-grad-logo !w-10 !h-10 !rounded-xl">
          <Flame className="!w-[18px] !h-[18px] text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="sh-card-title">Trending today</h2>
          <p className="sh-card-subtitle">
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
