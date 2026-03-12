import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Filter } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostCard } from '../components/posts/PostCard';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

const filterTabs = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'published', label: 'Published' },
];

export default function Posts() {
  const navigate = useNavigate();
  const { posts, loading, fetchPosts, deletePost } = usePosts();
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDelete = async (postId) => {
    try {
      await deletePost(postId);
      toast.success('Post deleted successfully');
    } catch (error) {
      toast.error('Failed to delete post');
    }
  };

  const filteredPosts = posts.filter((post) => {
    if (activeFilter === 'all') return true;
    return post.status === activeFilter;
  });

  if (loading && posts.length === 0) {
    return (
      <PageWrapper title="Posts">
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
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">
                Posts
              </h1>
              <p className="text-slate-600">
                Manage all your social media posts
              </p>
            </div>
          </div>
          <Button
            data-testid="new-post-btn"
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 shadow-button"
            onClick={() => navigate('/posts/new')}
          >
            <Plus className="w-5 h-5 mr-2" />
            New Post
          </Button>
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 mb-6"
      >
        <Filter className="w-5 h-5 text-slate-400" />
        <div className="flex gap-2 pb-2 sm:pb-0 w-full snap-x [&::-webkit-scrollbar]:hidden">
  {filterTabs.map((tab) => (
    <button
      key={tab.id}
      data-testid={`filter-${tab.id}`}
      onClick={() => setActiveFilter(tab.id)}
      className={`shrink-0 whitespace-nowrap snap-start px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-medium text-xs sm:text-sm transition-all ${
        activeFilter === tab.id
          ? 'bg-indigo-100 text-indigo-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {tab.label}
      {tab.id !== 'all' && (
        <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs opacity-75">
          ({posts.filter((p) => p.status === tab.id).length})
        </span>
      )}
    </button>
  ))}
</div>
      </motion.div>

      {/* Posts List */}
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
            {activeFilter === 'all' ? 'No posts yet' : `No ${activeFilter} posts`}
          </h3>
          <p className="text-slate-600 mb-6">
            {activeFilter === 'all'
              ? 'Create your first post to get started!'
              : 'Try changing the filter or create a new post.'}
          </p>
          <Button
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6"
            onClick={() => navigate('/posts/new')}
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Post
          </Button>
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
              >
                <PostCard post={post} onDelete={handleDelete} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </PageWrapper>
  );
}
