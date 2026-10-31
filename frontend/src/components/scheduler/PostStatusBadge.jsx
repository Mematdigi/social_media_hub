import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2, Check, X, Clock, Send } from 'lucide-react';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600 ring-slate-200', icon: null },
  scheduled: { label: 'Scheduled', color: 'bg-sky-50 text-sky-700 ring-sky-200', icon: Clock },
  publishing: { label: 'Publishing...', color: 'bg-yellow-50 text-yellow-700 ring-yellow-200', icon: Loader2, spin: true },
  published: { label: 'Published', color: 'bg-green-50 text-green-700 ring-green-200', icon: Check },
  failed: { label: 'Failed', color: 'bg-red-50 text-red-600 ring-red-200', icon: X },
};

export const PostStatusBadge = ({ status }) => {
  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold tracking-wide ring-1 ring-inset whitespace-nowrap',
      config.color
    )}>
      {Icon ? <Icon className={cn('w-3 h-3', config.spin && 'animate-spin')} /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
      {config.label}
    </span>
  );
};

export default PostStatusBadge;
