import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Filter, RefreshCw, Calendar, Share2 } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostCard } from '../components/posts/PostCard';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

const statusTabs = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'scheduled', label: 'Scheduled' },
];

const dateTabs = [
  { id: 'all',      label: 'All Time' },
  { id: 'today',    label: 'Today' },
  { id: 'week',     label: 'This Week' },
  { id: 'month',    label: 'This Month' },
];

export default function Posts() {
  const navigate = useNavigate();
  const { posts, loading, syncing, fetchPosts, deletePost, syncPosts } = usePosts();
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activeDateFilter, setActiveDateFilter] = useState('all');
  const [activePlatformFilter, setActivePlatformFilter] = useState('all');

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ════════════════════════════════════════════════════════════
  // Get unique platforms from posts
  // ════════════════════════════════════════════════════════════
  const platforms = useMemo(() => {
    const allPlatforms = new Set();
    posts.forEach(post => {
      post.platforms?.forEach(p => allPlatforms.add(p));
    });
    return Array.from(allPlatforms).sort();
  }, [posts]);

  const platformTabs = useMemo(() => [
    { id: 'all', label: 'All Platforms' },
    ...platforms.map(p => ({
      id: p,
      label: p.charAt(0).toUpperCase() + p.slice(1)
    }))
  ], [platforms]);

  // ════════════════════════════════════════════════════════════
  // Filter by date
  // ════════════════════════════════════════════════════════════
  const filterByDate = (post) => {
    if (activeDateFilter === 'all') return true;
    
    const postDate = new Date(post.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    switch (activeDateFilter) {
      case 'today':
        return postDate >= today;
      case 'week':
        return postDate >= weekAgo;
      case 'month':
        return postDate >= monthAgo;
      default:
        return true;
    }
  };

  // ════════════════════════════════════════════════════════════
  // Apply all filters
  // ════════════════════════════════════════════════════════════
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Status filter
      if (activeStatusFilter !== 'all' && post.status !== activeStatusFilter) {
        return false;
      }
      // Date filter
      if (!filterByDate(post)) {
        return false;
      }
      // Platform filter
      if (activePlatformFilter !== 'all' && !post.platforms.includes(activePlatformFilter)) {
        return false;
      }
      return true;
    });
  }, [posts, activeStatusFilter, activeDateFilter, activePlatformFilter]);

  // Delete post - UPDATED WITH INSTAGRAM REDIRECT LOGIC

// ════════════════════════════════════════════════════════════
  // Delete post
  // - Facebook: deletes silently (unchanged)
  // - Instagram: deletes from DB + warns user + opens Meta Suite
  // ════════════════════════════════════════════════════════════
const handleDelete = async (postId, deleteFromPlatform = true) => {
    try {
      const targetPost = posts.find((p) => p.id === postId);
      const isInstagramPost = targetPost?.platforms?.includes('instagram');

      const result = await deletePost(postId, deleteFromPlatform);

      if (isInstagramPost) {
        // Toasts only — redirect is handled by PostCard (pre-opened popup)
        toast.success('Post removed from your app.');
        toast.warning("Instagram doesn't allow deleting posts via API.", {
          description:
            'Please remove this post manually from Meta Business Suite to fully delete it from Instagram.',
          duration: 10000,
        });
      } else if (result?.platformErrors?.length > 0) {
        toast.warning(
          'Post removed from app, but could not delete from some platforms. You may need to remove it manually.'
        );
      } else {
        toast.success(
          deleteFromPlatform
            ? 'Post deleted from app and platforms'
            : 'Post removed from app'
        );
      }

      // ✅ IMPORTANT: return result so PostCard can read actionLink for the popup
      return result;
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete post');
      throw error; // re-throw so PostCard's catch block can clean up the popup
    }
  };
  
  // ════════════════════════════════════════════════════════════
  // Sync posts from Facebook
  // ════════════════════════════════════════════════════════════
  const handleSync = async () => {
    try {
      const result = await syncPosts();
      if (result.total === 0) {
        toast.info('All posts are already up to date');
      } else {
        toast.success(`Synced ${result.total} new post${result.total !== 1 ? 's' : ''}`);
      }
    } catch (error) {
      toast.error('Failed to sync posts');
    }
  };

  if (loading && posts.length === 0) {
    return (
      <PageWrapper title="Posts">
        <PageLoader />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Posts</h1>
              <p className="text-slate-600">Manage all your social media posts</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Facebook'}
            </Button>

            <Button
              data-testid="new-post-btn"
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 shadow-button"
              onClick={() => navigate('/posts/new')}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Post
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Status Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">Status</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`filter-${tab.id}`}
              onClick={() => setActiveStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activeStatusFilter === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
              {tab.id !== 'all' && (
                <span className="ml-2 text-xs opacity-75">
                  ({posts.filter((p) => p.status === tab.id).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Date Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">Date</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {dateTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveDateFilter(tab.id)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activeDateFilter === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Platform Filter */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <Share2 className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">Platform</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {platformTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActivePlatformFilter(tab.id)}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activePlatformFilter === tab.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Posts List - USING ORIGINAL PostCard COMPONENT */}
      {filteredPosts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-card"
        >
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-heading font-bold text-slate-900 mb-2">
            {activeStatusFilter === 'all' ? 'No posts yet' : `No ${activeStatusFilter} posts`}
          </h3>
          <p className="text-slate-600 mb-6">
            {activeStatusFilter === 'all'
              ? 'Create your first post or sync from Facebook to get started.'
              : 'Try changing the filter or create a new post.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Posts'}
            </Button>
            <Button
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6"
              onClick={() => navigate('/posts/new')}
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Post
            </Button>
          </div>
        </motion.div>
      ) : (
        <div data-testid="posts-list" className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredPosts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: 0.05 * index }}
                className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="flex gap-6 flex-col md:flex-row">
                  {/* Media Display - Images and Videos */}
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex-shrink-0 md:w-48">
                      <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                        {post.mediaUrls.map((url, idx) => {
                          const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
                          return (
                            <div key={idx} className="relative rounded-2xl overflow-hidden bg-slate-200 h-32 md:h-40">
                              {isVideo ? (
                                <video
                                  src={url}
                                  className="w-full h-full object-cover"
                                  controls
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <img
                                  src={url}
                                  alt={`Post media ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Post Content */}
                  <div className="flex-1 min-w-0">
                    <PostCard
                      post={post}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </PageWrapper>
  );
}