import React, { useState, useEffect } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/utils';

export const PageWrapper = ({ children, title, noPadding = false }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // UI-only: off-canvas sidebar state on small screens
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const sidebar = document.querySelector('[data-testid="sidebar"]');
    if (sidebar) {
      const observer = new MutationObserver(() => {
        setSidebarCollapsed(sidebar.style.width === '80px');
      });
      observer.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
      return () => observer.disconnect();
    }
  }, []);

  return (
    <div className="min-h-screen sh-app-bg">
      <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />

      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main
        className={cn(
          'min-h-screen min-w-0 transition-[margin] duration-300 ease-out',
          sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
        )}
      >
        {/* Mobile top bar */}
        <div className="sh-topbar">
          <div className="flex items-center gap-2.5">
            <div className="sh-logo-mark !w-8 !h-8 !rounded-[0.625rem]">
              <Sparkles />
            </div>
            <span className="font-heading font-semibold text-base tracking-tight text-slate-900">SocialHub</span>
          </div>
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="w-10 h-10 -mr-2 inline-flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div
          className={cn(
            'mx-auto w-full max-w-[1400px]',
            noPadding ? '' : 'px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10'
          )}
        >
          {title && (
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-slate-900 mb-6 sm:mb-8">
              {title}
            </h1>
          )}
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageWrapper;
