import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Link2, FileText, FileCheck, FilePen, Pencil, TrendingUp, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Badge } from '../components/common/Badge';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useAccounts } from '../context/AccountsContext';
import { usePosts } from '../hooks/usePosts';
import { format } from 'date-fns';
import { TrendingDashboard } from '../components/dashboard/TrendingDashboard';
import { AIAssistantSection, AIAssistantLauncher } from '../components/dashboard/AIAssistant';
import { inboxAPI } from '../services/api';

// Animated number (eases from the previous value to the new one)
const useCountUp = (value, duration = 700) => {
  const [display, setDisplay] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const start = from.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || start === target) { setDisplay(target); from.current = target; return undefined; }
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
};

const StatCard = ({ icon: Icon, label, value, color, delay }) => {
  const shown = useCountUp(value);
  return (
  <motion.div
    initial={{ opacity: 0, y: 16, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    whileHover={{ y: -3 }}
    transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    className="sh-card sh-card--hover overflow-hidden p-4 sm:p-5 group"
  >
    <span className="sh-orb" style={{ background: `radial-gradient(closest-side, ${color}66, transparent)` }} />
    <div
      className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
      style={{ background: `linear-gradient(135deg, ${color}26, ${color}0d)`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <p className="relative mt-4 text-[1.75rem] sm:text-[2rem] leading-none font-heading font-bold text-slate-900 tabular-nums">{shown}</p>
    <p className="relative mt-1.5 text-[0.8125rem] font-medium text-slate-500 truncate">{label}</p>
  </motion.div>
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const { connectedCount } = useAccounts();
  const { posts, fetchPosts, loading } = usePosts();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    drafts: 0,
  });

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (posts.length > 0) {
      setStats({
        total: posts.length,
        published: posts.filter((p) => p.status === 'published').length,
        drafts: posts.filter((p) => p.status === 'draft').length,
      });
    }
  }, [posts]);

  const recentPosts = posts.slice(0, 5);

  // 🆕 AI assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    inboxAPI.getUnreadCount().then((res) => setUnread(res.data?.total || 0)).catch(() => {});
  }, []);
  const firstName = user?.name?.split(' ')[0];

  return (
    <PageWrapper>
      {/* Welcome Header with Create Post Button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sh-card relative overflow-hidden mb-6 sm:mb-8 px-5 py-6 sm:px-8 sm:py-8 !border-indigo-100 [background:var(--grad-soft)]"
      >
        <span className="pointer-events-none absolute -right-10 -top-16 w-64 h-64 rounded-full [background:radial-gradient(closest-side,rgb(192 132 252/0.40),transparent)] sh-float" />
        <span className="pointer-events-none absolute right-48 -bottom-24 w-56 h-56 rounded-full [background:radial-gradient(closest-side,rgb(244 114 182/0.32),transparent)] sh-float [animation-delay:-6s]" />
        <span className="pointer-events-none absolute left-1/3 -top-20 w-48 h-48 rounded-full [background:radial-gradient(closest-side,rgb(145 138 248/0.24),transparent)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-white/80 border border-indigo-100 text-[11px] font-semibold text-indigo-700 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-pink-500" />
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="text-[1.625rem] sm:text-[2.125rem] leading-tight font-heading font-bold text-slate-900">
              Welcome back, <span className="sh-text-grad">{user?.name?.split(' ')[0]}</span>
            </h1>
            <p className="mt-1.5 text-sm sm:text-base text-slate-600">
              Here's what's happening with your social accounts today.
            </p>
          </div>

          {/* New Create Post Button + 🆕 Ask AI */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="shrink-0 grid grid-cols-2 sm:flex items-center gap-2.5"
          >
            <Button
              type="button"
              variant="outline"
              data-testid="dashboard-ask-ai-btn"
              className="h-11 px-5 bg-white/90 border-indigo-200 text-indigo-700 hover:bg-white hover:text-indigo-800 hover:border-indigo-300"
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="w-4 h-4" />
              Ask AI
            </Button>
            <Button
              data-testid="dashboard-new-post-btn"
              className="h-11 px-6"
              onClick={() => navigate('/posts/new')}
            >
              <Plus className="w-4 h-4" />
              New Post
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div data-testid="dashboard-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard icon={Link2} label="Connected Accounts" value={connectedCount} color="#6366F1" delay={0.05} />
        <StatCard icon={FileText} label="Total Posts" value={stats.total} color="#A855F7" delay={0.1} />
        <StatCard icon={FileCheck} label="Published" value={stats.published} color="#10B981" delay={0.15} />
        <StatCard icon={FilePen} label="Drafts" value={stats.drafts} color="#EC4899" delay={0.2} />
      </div>

      {/* 🆕 AI assistant: ask anything, quick actions, smart suggestions, trending */}
      <AIAssistantSection userName={firstName} posts={posts} connectedCount={connectedCount} unread={unread} />

      {/* 🆕 Trending topics + AI post ideas */}
      <TrendingDashboard />

      {/* Recent Posts */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="sh-card overflow-hidden"
      >
        <div className="sh-card-header">
          <div className="flex items-center gap-3 min-w-0">
            <div className="sh-page-icon !w-10 !h-10 !rounded-xl">
              <TrendingUp className="!w-[18px] !h-[18px]" />
            </div>
            <div className="min-w-0">
              <h2 className="sh-card-title truncate">Recent Posts</h2>
              <p className="sh-card-subtitle truncate">Your latest content</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            onClick={() => navigate('/posts')}
          >
            View All
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-[3px] border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="sh-empty">
            <div className="sh-empty__icon">
              <FileText />
            </div>
            <p className="sh-empty__desc">No posts yet. Create your first post!</p>
            <Button onClick={() => navigate('/posts/new')}>
              Create Post
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentPosts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.05, duration: 0.3 }}
                data-testid={`recent-post-${post.id}`}
                className="group px-4 py-3.5 sm:px-6 sm:py-4 hover:bg-indigo-50/40 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">

                  {/* Main Content Area */}
                  <div className="flex-1 min-w-0 w-full">
                    <p className="text-sm sm:text-[0.9375rem] text-slate-900 font-medium truncate">
                      {post.content.length > 60 ? `${post.content.substring(0, 60)}...` : post.content}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1.5">
                        {post.accounts?.slice(0, 3).map((acc) => (
                          <PlatformIcon key={acc.id} platform={acc.platform} size="sm" />
                        ))}
                        {post.platforms?.length > 3 && (
                          <span className="text-xs font-medium text-slate-500 ml-0.5">
                            +{post.platforms.length - 3}
                          </span>
                        )}
                      </div>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-xs text-slate-500">
                        {format(new Date(post.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* Action Elements (Badge & Button) */}
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-3">
                    <Badge variant={post.status === 'published' ? 'published' : 'draft'}>
                      {post.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg shrink-0 group-hover:bg-white group-hover:shadow-sm"
                      onClick={() => navigate(`/posts/${post.id}/edit`)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Room so the floating AI button never covers the last row */}
      <div className="h-20 sm:h-10" aria-hidden="true" />

      {/* 🆕 Floating AI button + assistant panel */}
      <AIAssistantLauncher
        open={aiOpen}
        onOpenChange={setAiOpen}
        userName={firstName}
        posts={posts}
        connectedCount={connectedCount}
        unread={unread}
      />
    </PageWrapper>
  );
}
