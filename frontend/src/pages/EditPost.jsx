import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit3, RefreshCw, AlertTriangle } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostForm } from '../components/posts/PostForm';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export default function EditPost() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { fetchPost, updatePost } = usePosts();
  const [post, setPost]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      try {
        const data = await fetchPost(id);
        setPost(data);
      } catch (error) {
        if (error.response?.status === 404) setNotFound(true);
        toast.error('Failed to load post');
      } finally {
        setLoading(false);
      }
    };
    loadPost();
  }, [id, fetchPost]);

  const handleSubmit = async (formData) => {
    setSaving(true);
    try {
      await updatePost(id, formData);
      toast.success(
        post?.status === 'published'
          ? 'Post updated — changes saved to Facebook too!'
          : 'Post updated successfully!'
      );
      navigate('/posts');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <PageLoader />
      </PageWrapper>
    );
  }

  if (notFound) {
    return (
      <PageWrapper>
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-card max-w-md mx-auto">
          <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Post not found</h2>
          <p className="text-slate-600 mb-6">
            The post you're looking for doesn't exist or has been deleted.
          </p>
          <Button className="rounded-full" onClick={() => navigate('/posts')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
          </Button>
        </div>
      </PageWrapper>
    );
  }

  const isSyncedPost    = post?.syncedFromPlatform;
  const isPublishedPost = post?.status === 'published';

  return (
    <PageWrapper>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            data-testid="back-btn"
            className="rounded-xl"
            onClick={() => navigate('/posts')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Edit3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Edit Post</h1>
              <p className="text-slate-600">Update your post content and settings</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl space-y-4"
      >
        {/* Banner: synced from platform */}
        {isSyncedPost && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
            <RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              This post was synced from Facebook. Saving changes here will also update the live post on Facebook.
            </p>
          </div>
        )}

        {/* Banner: published post edit warning */}
        {isPublishedPost && !isSyncedPost && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              This post is live. Saving changes will update the content on Facebook too.
            </p>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-card">
          <PostForm
            initialData={post}
            onSubmit={handleSubmit}
            loading={saving}
          />
        </div>
      </motion.div>
    </PageWrapper>
  );
}