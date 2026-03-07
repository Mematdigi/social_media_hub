import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Pencil, Trash2, Clock } from 'lucide-react';
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(post.id);
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
        <p className="text-slate-700 flex-1 leading-relaxed">{contentPreview}</p>
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
            : `Created ${format(new Date(post.createdAt), 'MMM d, yyyy')}`
          }
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
          
          <AlertDialog>
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
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="rounded-full bg-red-500 hover:bg-red-600">
                  {deleting ? 'Deleting...' : 'Delete'}
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
