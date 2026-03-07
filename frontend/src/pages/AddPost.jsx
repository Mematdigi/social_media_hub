import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, PenLine } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostForm } from '../components/posts/PostForm';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

export default function AddPost() {
  const navigate = useNavigate();
  const { createPost } = usePosts();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (formData) => {
    setLoading(true);
    try {
      await createPost(formData);
      toast.success('Post created successfully!');
      navigate('/posts');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

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
              <PenLine className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">
                Create New Post
              </h1>
              <p className="text-slate-600">
                Compose and share content across your accounts
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
          <PostForm onSubmit={handleSubmit} loading={loading} />
        </div>
      </motion.div>
    </PageWrapper>
  );
}
