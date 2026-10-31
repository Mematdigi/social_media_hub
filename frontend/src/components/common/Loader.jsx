import React from 'react';
import { cn } from '../../lib/utils';

export const Loader = ({ size = 'md', className }) => {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-[3px]',
    lg: 'w-9 h-9 border-[3px]',
  };

  return (
    <div
      data-testid="loader"
      className={cn(
        'rounded-full border-slate-200 border-t-indigo-600 animate-spin [animation-duration:0.7s]',
        sizes[size],
        className
      )}
    />
  );
};

export const PageLoader = () => (
  <div className="flex flex-col items-center justify-center gap-3 min-h-[400px]">
    <Loader size="lg" />
    <span className="text-sm text-slate-400">Loading…</span>
  </div>
);

export default Loader;
