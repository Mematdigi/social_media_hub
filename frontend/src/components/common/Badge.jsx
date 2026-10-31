import React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = {
  default: 'bg-slate-100 text-slate-700 ring-slate-200',
  connected: 'bg-green-50 text-green-700 ring-green-200',
  disconnected: 'bg-slate-100 text-slate-500 ring-slate-200',
  draft: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  published: 'bg-green-50 text-green-700 ring-green-200',
  soon: 'bg-slate-50 text-slate-400 ring-slate-200',
  platform: 'text-white',
};

export const Badge = ({ 
  children, 
  variant = 'default', 
  color,
  className,
  ...props 
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold capitalize tracking-wide ring-1 ring-inset whitespace-nowrap',
        badgeVariants[variant],
        className
      )}
      style={color ? { backgroundColor: color } : undefined}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
