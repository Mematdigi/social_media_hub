import React from 'react';
import { cn } from '../../lib/utils';

export const Loader = ({ size = 'md', className }) => {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-3',
    lg: 'w-10 h-10 border-4',
  };

  return (
    <div
      data-testid="loader"
      className={cn(
        'rounded-full border-slate-200 border-t-indigo-600 animate-spin',
        sizes[size],
        className
      )}
    />
  );
};

export const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <Loader size="lg" />
  </div>
);

export default Loader;
