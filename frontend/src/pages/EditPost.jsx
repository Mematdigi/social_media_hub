import React, { useState, useEffect, useMemo } from 'react'; // ✅ Cleansed spacing here
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Edit3, RefreshCw, AlertTriangle, Camera, ExternalLink, Youtube } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostForm } from '../components/posts/PostForm';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

// Meta Business Suite URLs
const META_BUSINESS_SUITE_URL = 'https://business.facebook.com/latest/home';
const META_INSTAGRAM_POSTS_URL = 'https://business.facebook.com/latest/posts/published_posts';

export default function EditPost() {
  const navigate = useNavigate();
  const { id }   = useParams();
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

  // ── Derived platform flags ─────────────────────────────────────────────────
  const isFacebook  = post?.platforms?.includes('facebook');
  const isInstagram = post?.platforms?.includes('instagram');
  const isYoutube   = post?.platforms?.includes('youtube'); 
  const isBoth      = isFacebook && isInstagram;
  const isSynced    = post?.syncedFromPlatform;
  const isPublished = post?.status === 'published';

  // ── Is Instagram-only published post ──────────────────────────────────────
  const isInstagramOnly = isPublished && isInstagram && !isFacebook && !isYoutube;

  // ── Dynamic Platform label constructor ─────────────────────────────────────
  const platformLabel = useMemo(() => {
    const active = [];
    if (isFacebook) active.push('Facebook');
    if (isInstagram) active.push('Instagram');
    if (isYoutube) active.push('YouTube');
    return active.join(' & ');
  }, [isFacebook, isInstagram, isYoutube]);

  // ── Redirect to Meta Business Suite ───────────────────────────────────────
  const openMetaBusinessSuite = () => {
    toast.info('Opening Meta Business Suite...');
    window.open(META_INSTAGRAM_POSTS_URL, '_blank');
  };

  // ── Success toast messaging ────────────────────────────────────────────────
  const getSuccessMessage = () => {
    if (post?.status !== 'published') return 'Post update saved successfully!';
    return `Post updated — changes successfully sent to ${platformLabel}!`;
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = async (formData) => {
    if (isInstagramOnly) {
      openMetaBusinessSuite();
      return;
    }

    setSaving(true);
    
    if (isYoutube) {
      toast.loading('Updating your video configuration on YouTube...', { id: 'edit-post-toast' });
    }

    try {
      await updatePost(id, formData);
      if (isYoutube) toast.dismiss('edit-post-toast');
      toast.success(getSuccessMessage());
      navigate('/posts');
    } catch (error) {
      if (isYoutube) toast.dismiss('edit-post-toast');
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
          <Button className="rounded-full" onClick={() => navigate('/posts')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Posts
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
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
              <h1 className="text-3xl font-heading font-bold text-slate-900">Edit Post</h1>
              <p className="text-slate-600">Update your post content and settings</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Banners + Form ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl space-y-4"
      >

        {/* ── Banner: synced from Facebook ──────────────────────────────── */}
        {isSynced && isFacebook && !isInstagram && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
            <RefreshCw className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              This post was synced from Facebook. Saving changes will also update the live post on Facebook.
            </p>
          </div>
        )}

        {/* ── Banner: synced from Instagram ─────────────────────────────── */}
        {isSynced && isInstagram && !isFacebook && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-pink-50 border border-pink-200">
            <Camera className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-pink-700">
              This post was synced from Instagram. Saving changes will update the caption on Instagram.
            </p>
          </div>
        )}

        {/* ── Banner: synced from YouTube ───────────────────────────────── */}
        {isSynced && isYoutube && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
            <Youtube className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              This video was synced from YouTube. Edits here will apply to your live channel video settings.
            </p>
          </div>
        )}

        {/* ── Banner: synced from multi-platforms ────────────────────────── */}
        {isSynced && isBoth && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-purple-50 border border-purple-200">
            <RefreshCw className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-purple-700">
              This post was synced from {platformLabel}. Saving changes will update both platforms.
            </p>
          </div>
        )}

        {/* ── Banner: live Facebook post warning ────────────────────────── */}
        {isPublished && !isSynced && isFacebook && !isInstagram && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              This post is live on Facebook. Saving changes will update the content there too.
            </p>
          </div>
        )}

        {/* ── Banner: live YouTube post warning ─────────────────────────── */}
        {isPublished && !isSynced && isYoutube && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">
              This video is live on YouTube. Modifying settings will update your live thumbnail parameters, categories, and titles.
            </p>
          </div>
        )}

        {/* ── Banner: Instagram-only ────────────────────────────────────── */}
        {isInstagramOnly && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-pink-50 border border-pink-200">
            <ExternalLink className="w-4 h-4 text-pink-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-pink-700">
                This post is live on Instagram.
              </p>
              <p className="text-sm text-pink-600 mt-0.5">
                Instagram posts can only be edited via Meta Business Suite. Click the button below to open it directly.
              </p>
              <p className="text-xs text-pink-400 mt-1">
                ⚠️ Only captions can be edited. Images and videos cannot be changed.
              </p>
              <button
                onClick={openMetaBusinessSuite}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-600 hover:bg-pink-700 text-white text-xs font-medium transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open Meta Business Suite
              </button>
            </div>
          </div>
        )}

        {/* ── Banner: live on both platforms ────────────────────────────── */}
        {isPublished && !isSynced && isBoth && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-amber-700">
                This post is live on Facebook & Instagram. Saving will update both platforms.
              </p>
              <p className="text-xs text-amber-500 mt-1">
                ⚠️ Instagram caption, image or video cannot be edited via API.
              </p>
            </div>
          </div>
        )}

        {/* ── Form Block ────────────────────────────────────────────────── */}
        {!isInstagramOnly && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-card">
            <PostForm
              initialPost={post}
              onSubmit={handleSubmit}
              loading={saving}
            />
          </div>
        )}

        {/* ── Instagram Redirect Fallback ────────────────────────────────── */}
        {isInstagramOnly && (
          <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-card text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">
              Edit on Meta Business Suite
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Instagram does not allow post edits via third-party apps. You can edit your caption directly on Meta Business Suite.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" className="rounded-full" onClick={() => navigate('/posts')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Posts
              </Button>
              <Button
                className="rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white"
                onClick={openMetaBusinessSuite}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Meta Business Suite
              </Button>
            </div>
          </div>
        )}

      </motion.div>
    </PageWrapper>
  );
}