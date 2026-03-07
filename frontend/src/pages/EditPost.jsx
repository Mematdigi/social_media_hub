import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit3 } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostForm } from '../components/posts/PostForm';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

export default function EditPost() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { fetchPost, updatePost } = usePosts();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      try {
        const data = await fetchPost(id);
        setPost(data);
      } catch (error) {
        if (error.response?.status === 404) {
          setNotFound(true);
        }
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
      toast.success('Post updated successfully!');
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
          <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">
            Post not found
          </h2>
          <p className="text-slate-600 mb-6">
            The post you're looking for doesn't exist or has been deleted.
          </p>
          <Button
            className="rounded-full"
            onClick={() => navigate('/posts')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
          </Button>
        </div>
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
              <h1 className="text-3xl font-heading font-bold text-slate-900">
                Edit Post
              </h1>
              <p className="text-slate-600">
                Update your post content and settings
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl"
      >
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
