import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Link2, FileText, FileCheck, FilePen, Pencil, TrendingUp } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { Badge } from '../components/common/Badge';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import { useAccounts } from '../context/AccountsContext';
import { usePosts } from '../hooks/usePosts';
import { format } from 'date-fns';

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card hover:shadow-card-hover hover:border-indigo-100 transition-all group"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <p className="text-3xl font-heading font-bold text-slate-900">{value}</p>
      </div>
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
    </div>
  </motion.div>
);

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

  return (
    <PageWrapper>
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mb-2">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-lg text-slate-600">
          Here's what's happening with your social accounts today.
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div data-testid="dashboard-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon={Link2}
          label="Connected Accounts"
          value={connectedCount}
          color="#6366F1"
          delay={0.1}
        />
        <StatCard
          icon={FileText}
          label="Total Posts"
          value={stats.total}
          color="#8B5CF6"
          delay={0.15}
        />
        <StatCard
          icon={FileCheck}
          label="Published"
          value={stats.published}
          color="#3B82F6"
          delay={0.2}
        />
        <StatCard
          icon={FilePen}
          label="Drafts"
          value={stats.drafts}
          color="#F59E0B"
          delay={0.25}
        />
      </div>

      {/* Recent Posts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-3xl border border-slate-100 shadow-card overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-heading font-bold text-slate-900">Recent Posts</h2>
              <p className="text-sm text-slate-500">Your latest content</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="rounded-full text-indigo-600 hover:bg-indigo-50"
            onClick={() => navigate('/posts')}
          >
            View All
          </Button>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600 mb-4">No posts yet. Create your first post!</p>
            <Button
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
              onClick={() => navigate('/posts/new')}
            >
              Create Post
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentPosts.map((post) => (
              <div
                key={post.id}
                data-testid={`recent-post-${post.id}`}
                className="p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-medium truncate">
                      {post.content.length > 60 ? `${post.content.substring(0, 60)}...` : post.content}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        {post.accounts?.slice(0, 3).map((acc) => (
                          <PlatformIcon key={acc.id} platform={acc.platform} size="sm" />
                        ))}
                        {post.platforms?.length > 3 && (
                          <span className="text-xs text-slate-500 ml-1">
                            +{post.platforms.length - 3}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {format(new Date(post.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <Badge variant={post.status === 'published' ? 'published' : 'draft'}>
                    {post.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => navigate(`/posts/${post.id}/edit`)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </PageWrapper>
  );
}
