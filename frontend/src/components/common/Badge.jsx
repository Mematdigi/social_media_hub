import React from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = {
  default: 'bg-slate-100 text-slate-700',
  connected: 'bg-green-100 text-green-700',
  disconnected: 'bg-slate-100 text-slate-500',
  draft: 'bg-yellow-100 text-yellow-700',
  published: 'bg-blue-100 text-blue-700',
  soon: 'bg-slate-100 text-slate-400',
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
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider',
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
