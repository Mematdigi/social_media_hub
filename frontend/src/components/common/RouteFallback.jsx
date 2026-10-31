import React from 'react';

// Lightweight skeleton shown while a page chunk downloads (usually < 200 ms).
// Mirrors the app shell so the layout doesn't jump.
export const RouteFallback = ({ withShell = true }) => (
  <div className="min-h-screen sh-app-bg" aria-busy="true" aria-label="Loading">
    {withShell && (
      <div className="hidden md:block fixed inset-y-0 left-0 w-64 bg-white/90 border-r border-slate-200/80 p-4 space-y-3">
        <div className="sh-skeleton h-9 w-36" />
        <div className="pt-6 space-y-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="sh-skeleton h-10" />)}
        </div>
      </div>
    )}
    <div className={withShell ? 'md:ml-64 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10' : 'flex items-center justify-center min-h-screen'}>
      {withShell ? (
        <div className="mx-auto max-w-[1400px] space-y-5">
          <div className="sh-skeleton h-12 w-72" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="sh-skeleton h-32" />)}
          </div>
          <div className="sh-skeleton h-72" />
        </div>
      ) : (
        <div className="w-9 h-9 border-[3px] border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      )}
    </div>
  </div>
);

export default RouteFallback;
