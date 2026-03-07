import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Link2, FileText, Calendar, Inbox, BarChart3, ChevronLeft, ChevronRight, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccounts } from '../../context/AccountsContext';
import { inboxAPI } from '../../services/api';
import { getPlatformConfig } from '../../utils/platformConfig';
import { cn } from '../../lib/utils';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/accounts', icon: Link2, label: 'Accounts' },
  { path: '/posts', icon: FileText, label: 'Posts' },
  { path: '/scheduler', icon: Calendar, label: 'Scheduler' },
  { path: '/inbox', icon: Inbox, label: 'Inbox', showBadge: true },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout, isAuthenticated } = useAuth();
  const { accounts } = useAccounts();
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await inboxAPI.getUnreadCount();
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
        'fixed left-0 top-0 h-screen z-50 flex flex-col',
        'bg-white/90 backdrop-blur-xl border-r border-slate-100',
        'sidebar-transition'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-heading font-bold text-xl text-slate-900">SocialHub</span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="w-10 h-10 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        )}
      </div>

      {/* Collapse Button */}
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3 text-slate-600" /> : <ChevronLeft className="w-3 h-3 text-slate-600" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            data-testid={`nav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-colors',
                isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            {item.showBadge && unreadCount > 0 && collapsed && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Connected Accounts Mini List */}
      {!collapsed && displayedAccounts.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Connected</p>
          <div className="flex -space-x-2">
            {displayedAccounts.map((account) => {
              const config = getPlatformConfig(account.platform);
              return (
                <div key={account.id} className="relative w-8 h-8 rounded-full border-2 border-white overflow-hidden" title={account.accountName}>
                  <img src={account.profilePicture} alt={account.accountName} className="w-full h-full object-cover" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: config.color }} />
                </div>
              );
            })}
            {accounts.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-500">+{accounts.length - 5}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User */}
      <div className="p-3 border-t border-slate-100">
        <div className={cn('flex items-center gap-3 px-3 py-2', collapsed && 'justify-center')}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-pink-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-white">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</span>
          </div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          data-testid="logout-btn"
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 mt-1 rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
