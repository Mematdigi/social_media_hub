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
      className="h-full flex flex-col"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          {/* Synced badge */}
          {/* Synced badge — now handles both FB and IG */}
  {isSynced && (
        <div className="inline-flex items-center gap-1.5 mb-2 mr-1.5 h-6 px-2 rounded-md bg-sky-50 ring-1 ring-inset ring-sky-100">
          <RefreshCw className="w-3 h-3 text-sky-600" />
          <span className="text-[11px] text-sky-700 font-semibold">
            Synced from {post.platforms?.includes('instagram') ? 'Instagram' : 'Facebook'}
          </span>
        </div>
      )}

      {/* Instagram media type badge — add after synced banner */}
      {post.platforms?.includes('instagram') && post.mediaType && (
        <div className="inline-flex items-center gap-1 h-6 px-2 mr-1.5 rounded-md bg-pink-50 ring-1 ring-inset ring-pink-100 text-pink-700 text-[11px] font-semibold mb-2">
          <PlatformIcon platform="instagram" size="sm" />
          {post.mediaType === 'CAROUSEL_ALBUM' ? 'Carousel'
            : post.mediaType === 'VIDEO'       ? 'Reel'
            : 'Photo'}
        </div>
      )}
      {/* Threads badge */}
      {post.platforms?.includes('threads') && (
        <div className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-slate-100 ring-1 ring-inset ring-slate-200 text-slate-700 text-[11px] font-semibold mb-2">
          <PlatformIcon platform="threads" size="sm" />
          🧵 Thread
        </div>
      )}
          <p className="text-[0.9375rem] text-slate-800 leading-relaxed break-words">{contentPreview}</p>
        </div>
        <PostStatusBadge status={post.status} />
      </div>

      {/* Scheduled Time */}
      {post.scheduledAt && post.status === 'scheduled' && (
        <div className="flex items-center gap-2 text-[0.8125rem] font-medium text-sky-700 mb-3 bg-sky-50 ring-1 ring-inset ring-sky-100 px-3 py-2 rounded-lg">
          <Clock className="w-4 h-4" />
          Scheduled for {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
        </div>
      )}

      {/* Platforms */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {post.accounts?.map((account) => (
          <div key={account.id} className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white border border-slate-200">
            <PlatformIcon platform={account.platform} size="sm" />
            <span className="text-xs font-medium text-slate-600">{account.accountName}</span>
          </div>
        ))}
        {(!post.accounts || post.accounts.length === 0) && post.platforms?.map((platform) => (
          <div key={platform} className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white border border-slate-200">
            <PlatformIcon platform={platform} size="sm" />
            <span className="text-xs font-medium text-slate-600 capitalize">{platform}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
        <span className="text-xs sm:text-[0.8125rem] text-slate-500 truncate">
          {post.publishedAt
            ? `Published ${format(new Date(post.publishedAt), 'MMM d, yyyy')}`
            : `Created ${format(new Date(post.createdAt), 'MMM d, yyyy')}`}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            data-testid={`edit-post-${post.id}`}
            variant="ghost"
            size="sm"
            className="h-8 hover:bg-indigo-50 hover:text-indigo-700"
            onClick={() => navigate(`/posts/${post.id}/edit`)}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>

          <AlertDialog onOpenChange={(open) => { if (open) setDeleteFromPlatform(true); }}>
            <AlertDialogTrigger asChild>
              <Button
                data-testid={`delete-post-${post.id}`}
                variant="ghost"
                size="sm"
                className="h-8 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Post?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isPublished
                    ? 'This post is live on social media. Choose what to delete.'
                    : 'This action cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>

              {/* Extra option for published posts */}
              {isPublished && (
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    deleteFromPlatform
                      ? 'border-red-300 bg-red-50/70 ring-4 ring-red-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="deleteMode"
                      checked={deleteFromPlatform}
                      onChange={() => setDeleteFromPlatform(true)}
                      className="mt-0.5 accent-red-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Delete everywhere</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Remove the post from {post.platforms?.join(' & ')} and from this app
                      </p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    !deleteFromPlatform
                      ? 'border-indigo-300 bg-indigo-50/70 ring-4 ring-indigo-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="deleteMode"
                      checked={!deleteFromPlatform}
                      onChange={() => setDeleteFromPlatform(false)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Remove from app only</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Keep the post live on Facebook, just stop tracking it here
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`sh-no-grad shadow-sm ${
                    deleteFromPlatform
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-slate-800 hover:bg-slate-900'
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