import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Link2, FileText, Calendar, Inbox, BarChart3, ChevronLeft, ChevronRight, LogOut, Sparkles, Bot } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccounts } from '../../context/AccountsContext';
import { inboxAPI } from '../../services/api';
import { getPlatformConfig } from '../../utils/platformConfig';
import { cn } from '../../lib/utils';
import { preloadRoute } from '../../routes/lazyPages';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts', icon: Link2, label: 'Accounts' },
  { path: '/posts', icon: FileText, label: 'Posts' },
  { path: '/scheduler', icon: Calendar, label: 'Scheduler' },
  { path: '/inbox', icon: Inbox, label: 'Inbox', showBadge: true },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/agent', icon: Bot, label: 'AI Agent' }, // 🆕
];

// Remember the last unread count between pages so the badge doesn't flicker
let lastUnreadCount = 0;

export const Sidebar = ({ mobileOpen = false, onNavigate }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(lastUnreadCount);
  const { user, logout, isAuthenticated } = useAuth();
  const { accounts } = useAccounts();
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await inboxAPI.getUnreadCount();
      lastUnreadCount = response.data.total;
      setUnreadCount(response.data.total);
    } catch (error) {
      console.error('Failed to fetch unread count');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // Poll every 60 seconds
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayedAccounts = accounts.slice(0, 5);

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: collapsed ? 80 : 256 }}
      className={cn(
        'fixed left-0 top-0 h-screen h-[100dvh] z-50 flex flex-col',
        'bg-white md:bg-white/90 md:backdrop-blur-xl text-slate-600 border-r border-slate-200/80',
        'shadow-pop md:shadow-[1px_0_0_rgb(var(--ink-200)/0.6),8px_0_32px_-24px_rgb(60_40_140/0.18)]',
        'transition-transform duration-300 ease-out md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
        'sidebar-transition'
      )}
    >
      {/* Subtle top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(90%_100%_at_0%_0%,rgb(var(--accent-purple)/0.10),transparent_70%)]" />

      {/* Logo */}
      <div className={cn('relative flex items-center h-16 px-4 border-b border-slate-200/70', collapsed ? 'justify-center' : 'justify-between')}>
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5">
              <div className="sh-logo-mark">
                <Sparkles />
              </div>
              <span className="font-heading font-bold text-lg tracking-tight text-slate-900">SocialHub</span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="sh-logo-mark mx-auto">
            <Sparkles />
          </div>
        )}
      </div>

      {/* Collapse Button */}
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        className="hidden md:flex absolute -right-3 top-[3.25rem] z-10 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm items-center justify-center text-slate-500 hover:text-slate-900 hover:border-slate-300 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Navigation */}
      <nav className="relative flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!collapsed && <p className="sh-eyebrow px-3 pb-2">Workspace</p>}
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`nav-${item.label.toLowerCase()}`}
            onClick={onNavigate}
            onMouseEnter={() => preloadRoute(item.path)}
            onFocus={() => preloadRoute(item.path)}
            onTouchStart={() => preloadRoute(item.path)}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'sh-nav-item',
                collapsed && 'justify-center px-0',
                isActive && 'is-active'
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="whitespace-nowrap overflow-hidden flex-1">
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
            {item.showBadge && unreadCount > 0 && !collapsed && (
              <span className="min-w-[1.375rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[11px] font-semibold tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {item.showBadge && unreadCount > 0 && collapsed && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Connected Accounts Mini List */}
      {!collapsed && displayedAccounts.length > 0 && (
        <div className="relative mx-3 mb-3 px-3 py-3 rounded-xl border border-indigo-100 [background:var(--grad-soft)]">
          <p className="sh-eyebrow mb-2.5">Connected</p>
          <div className="flex -space-x-2">
            {displayedAccounts.map((account) => {
              const config = getPlatformConfig(account.platform);
              return (
                <div key={account.id} className="relative w-8 h-8 rounded-full ring-2 ring-white bg-slate-100" title={account.accountName}>
                  <img src={account.profilePicture} alt={account.accountName} className="w-full h-full rounded-full object-cover" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white" style={{ backgroundColor: config.color }} />
                </div>
              );
            })}
            {accounts.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-white ring-2 ring-white shadow-sm flex items-center justify-center">
                <span className="text-[10px] font-semibold text-slate-600">+{accounts.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User */}
      <div className="relative p-3 border-t border-slate-200/70">
        <div className={cn('flex items-center gap-3 px-2 py-2', collapsed && 'justify-center px-0')}>
          <div className="w-9 h-9 rounded-full sh-grad-logo ring-2 ring-white shadow-sm flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-white">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
          </div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          data-testid="logout-btn"
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={cn(
            'flex items-center gap-3 w-full h-10 px-3 mt-1 rounded-xl text-sm text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors font-medium',
            collapsed && 'justify-center px-0'
          )}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
