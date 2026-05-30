import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Pencil, Trash2, Clock, RefreshCw } from 'lucide-react';
import { PostStatusBadge } from '../scheduler/PostStatusBadge';
import { PlatformIcon } from '../accounts/PlatformIcon';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

export const PostCard = ({ post, onDelete }) => {
  const navigate = useNavigate();
  const [deleting, setDeleting] = React.useState(false);
  // For published posts: ask whether to also delete from Facebook
  const [deleteFromPlatform, setDeleteFromPlatform] = React.useState(true);

  const isPublished = post.status === 'published';
  const isSynced    = post.syncedFromPlatform;

 const handleDelete = async () => {
    const isInstagramPost = post.platforms?.includes('instagram');

    // ✅ Pre-open popup SYNCHRONOUSLY while user gesture is still alive.
    // This is the only reliable way to bypass popup blockers.
    let metaSuiteWindow = null;
    if (isInstagramPost) {
      metaSuiteWindow = window.open('about:blank', '_blank');
      if (metaSuiteWindow) {
        metaSuiteWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Opening Meta Business Suite...</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 60px 20px; text-align: center; color: #333; background: #f8f9fa; }
                .spinner { display:inline-block; width:48px; height:48px; border:4px solid #e0e0e0; border-top-color:#1877F2; border-radius:50%; animation:spin 0.8s linear infinite; margin: 20px 0; }
                @keyframes spin { to { transform: rotate(360deg); } }
                h2 { color:#1877F2; margin-bottom:10px; }
                p { color:#666; }
              </style>
            </head>
            <body>
              <h2>Opening Meta Business Suite</h2>
              <div class="spinner"></div>
              <p>Deleting your post from the app first...</p>
              <p style="font-size:13px;color:#999;">You'll need to manually remove the post from Instagram here.</p>
            </body>
          </html>
        `);
      }
    }

    setDeleting(true);
    try {
      const result = await onDelete(post.id, deleteFromPlatform);

      // ✅ Redirect the pre-opened popup to the actual Meta Suite URL
      if (metaSuiteWindow && !metaSuiteWindow.closed) {
        const apiActionLink = result?.platformErrors?.find(
          (err) => err.platform === 'instagram' && err.actionLink
        )?.actionLink;

        const metaUrl =
          apiActionLink ||
          'https://business.facebook.com/latest/posts/published_posts';

        metaSuiteWindow.location.href = metaUrl;
      }
    } catch (err) {
      // If delete failed, close the empty popup so user isn't left with a blank tab
      if (metaSuiteWindow && !metaSuiteWindow.closed) {
        metaSuiteWindow.close();
      }
    } finally {
      setDeleting(false);
    }
  };

  const contentPreview = post.content.length > 100
    ? `${post.content.substring(0, 100)}...`
    : post.content;

  return (
    <motion.div
      data-testid={`post-card-${post.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-white rounded-3xl border border-slate-100 p-5 shadow-card hover:shadow-card-hover transition-all"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {/* Synced badge */}
          {/* Synced badge — now handles both FB and IG */}
  {isSynced && (
        <div className="flex items-center gap-1.5 mb-2">
          <RefreshCw className="w-3 h-3 text-blue-400" />
          <span className="text-xs text-blue-500 font-medium">
            Synced from {post.platforms?.includes('instagram') ? 'Instagram' : 'Facebook'}
          </span>
        </div>
      )}

      {/* Instagram media type badge — add after synced banner */}
      {post.platforms?.includes('instagram') && post.mediaType && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 text-xs font-medium mb-2">
          <PlatformIcon platform="instagram" size="sm" />
          {post.mediaType === 'CAROUSEL_ALBUM' ? 'Carousel'
            : post.mediaType === 'VIDEO'       ? 'Reel'
            : 'Photo'}
        </div>
      )}
      {/* Threads badge */}
      {post.platforms?.includes('threads') && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium mb-2">
          <PlatformIcon platform="threads" size="sm" />
          🧵 Thread
        </div>
      )}
          <p className="text-slate-700 leading-relaxed">{contentPreview}</p>
        </div>
        <PostStatusBadge status={post.status} />
      </div>

      {/* Scheduled Time */}
      {post.scheduledAt && post.status === 'scheduled' && (
        <div className="flex items-center gap-2 text-sm text-blue-600 mb-3 bg-blue-50 px-3 py-2 rounded-xl">
          <Clock className="w-4 h-4" />
          Scheduled for {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
        </div>
      )}

      {/* Platforms */}
      <div className="flex flex-wrap gap-2 mb-4">
        {post.accounts?.map((account) => (
          <div key={account.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50">
            <PlatformIcon platform={account.platform} size="sm" />
            <span className="text-xs font-medium text-slate-600">{account.accountName}</span>
          </div>
        ))}
        {(!post.accounts || post.accounts.length === 0) && post.platforms?.map((platform) => (
          <div key={platform} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50">
            <PlatformIcon platform={platform} size="sm" />
            <span className="text-xs font-medium text-slate-600 capitalize">{platform}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-sm text-slate-500">
          {post.publishedAt
            ? `Published ${format(new Date(post.publishedAt), 'MMM d, yyyy')}`
            : `Created ${format(new Date(post.createdAt), 'MMM d, yyyy')}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            data-testid={`edit-post-${post.id}`}
            variant="ghost"
            size="sm"
            className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600"
            onClick={() => navigate(`/posts/${post.id}/edit`)}
          >
            <Pencil className="w-4 h-4 mr-1" />
            Edit
          </Button>

          <AlertDialog onOpenChange={(open) => { if (open) setDeleteFromPlatform(true); }}>
            <AlertDialogTrigger asChild>
              <Button
                data-testid={`delete-post-${post.id}`}
                variant="ghost"
                size="sm"
                className="rounded-xl hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading">Delete Post?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isPublished
                    ? 'This post is live on social media. Choose what to delete.'
                    : 'This action cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Extra option for published posts */}
              {isPublished && (
                <div className="space-y-2 px-1 pb-1">
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    deleteFromPlatform
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-white'
                  }`}>
                    <input
                      type="radio"
                      name="deleteMode"
                      checked={deleteFromPlatform}
                      onChange={() => setDeleteFromPlatform(true)}
                      className="mt-0.5 accent-red-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Delete everywhere</p>
                     // In "Remove from app only" description:
    <p className="text-xs text-slate-500 mt-0.5">
      Keep the post live on {post.platforms?.join(' & ')}, just stop tracking it here
    </p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    !deleteFromPlatform
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-slate-200 bg-white'
                  }`}>
                    <input
                      type="radio"
                      name="deleteMode"
                      checked={!deleteFromPlatform}
                      onChange={() => setDeleteFromPlatform(false)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Remove from app only</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Keep the post live on Facebook, just stop tracking it here
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`rounded-full ${
                    deleteFromPlatform
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {deleting
                    ? 'Deleting...'
                    : deleteFromPlatform
                    ? 'Delete Everywhere'
                    : 'Remove from App'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </motion.div>
  );
};

export default PostCard;