import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '../../lib/utils';

export const PageWrapper = ({ children, title }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    <div className="min-h-screen bg-slate-50/50">
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'ml-20' : 'ml-64'
        )}
      >
        <div className="p-6 md:p-10">
          {title && (
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mb-8">
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
