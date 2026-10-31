import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, PenLine } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageHeader } from '../components/layout/PageHeader';
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
    
    // 1. Detect if this is a heavy video/YouTube upload
    let isVideoUpload = false;
    
    if (formData instanceof FormData) {
      // Fallback fallback case if native multi-part FormData is used
      const files = formData.getAll('media').length ? formData.getAll('media') : formData.getAll('files');
      isVideoUpload = files.some(file => file.type && file.type.startsWith('video/'));
      
      const platforms = formData.getAll('platforms');
      if (platforms.includes('youtube')) isVideoUpload = true;
    } else if (formData) {
      // ✅ Handle the plain JSON object format submitted by your PostForm
      const hasVideoFile = formData.mediaUrls?.some(url => url.match(/\.(mp4|mov|webm|ogg)$/i));
      const hasYoutubeTitle = !!formData.youtubeTitle;
      
      if (hasVideoFile || hasYoutubeTitle) {
        isVideoUpload = true;
      }
    }

    // 2. Show a persistent loading toast for long uploads
    if (isVideoUpload) {
      toast.loading('Uploading video content... This may take a few moments depending on file size.', { 
        id: 'upload-toast' 
      });
    }

    try {
      // 3. Send to backend
      await createPost(formData);
      
      if (isVideoUpload) toast.dismiss('upload-toast');
      toast.success('Post published successfully!');
      navigate('/posts');
      
    } catch (error) {
      if (isVideoUpload) toast.dismiss('upload-toast');
      toast.error(error.response?.data?.detail || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader
        icon={PenLine}
        title="Create New Post"
        subtitle="Compose and share content, images, and YouTube videos"
        onBack={() => navigate('/posts')}
        backTestId="back-btn"
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        // className="max-w-2xl"
      >
        <div className="max-w-5xl">
          <PostForm onSubmit={handleSubmit} loading={loading} />
        </div>
      </motion.div>
    </PageWrapper>
  );
}
