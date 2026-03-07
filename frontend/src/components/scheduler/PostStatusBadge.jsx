import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2, Check, X, Clock, Send } from 'lucide-react';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600', icon: null },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', icon: Clock },
  publishing: { label: 'Publishing...', color: 'bg-yellow-100 text-yellow-700', icon: Loader2, spin: true },
  published: { label: 'Published', color: 'bg-green-100 text-green-700', icon: Check },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-600', icon: X },
};

export const PostStatusBadge = ({ status }) => {
  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider',
      config.color
    )}>
      {Icon && <Icon className={cn('w-3 h-3', config.spin && 'animate-spin')} />}
      {config.label}
    </span>
  );
};

export default PostStatusBadge;
