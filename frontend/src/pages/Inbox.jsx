import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Inbox as InboxIcon,
  RefreshCw,
  Check,
  CheckCheck,
  Send,
  MessageSquare,
  AtSign,
  Reply,
  ArrowLeft,
  SlidersHorizontal,
  X,
  ChevronRight,
} from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { inboxAPI } from '../services/api';
import { useAccounts } from '../context/AccountsContext';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const TYPE_ICONS = {
  dm:      MessageSquare,
  comment: MessageSquare,
  mention: AtSign,
  reply:   Reply,
};

const TYPE_LABELS = {
  dm:      'DMs',
  comment: 'Comments',
  mention: 'Mentions',
  reply:   'Replies',
};

// Mobile view states: 'list' | 'thread' | 'filters'
const MOBILE_VIEW = { LIST: 'list', THREAD: 'thread', FILTERS: 'filters' };

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

/** Unread count pill */
const UnreadBadge = ({ count }) => {
  if (!count) return null;
  return (
    <span className="ml-auto flex-shrink-0 min-w-[1.25rem] text-center px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
};

/** Filters sidebar content — reused in both drawer and desktop panel */
const FiltersContent = ({ filters, setFilters, connectedPlatforms, unreadCount, onSync, syncing, onClose }) => (
  <div className="flex flex-col h-full">
    {/* Header shown only in drawer mode */}
    {onClose && (
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
        <p className="font-semibold text-slate-900 text-sm">Filters</p>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )}

    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
      {/* All messages */}
      <button
        onClick={() => { setFilters({ platform: null, type: null, isRead: null }); onClose?.(); }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]',
          !filters.platform && !filters.type
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-700 hover:bg-slate-50'
        )}
      >
        <InboxIcon className="w-4 h-4 flex-shrink-0" />
        <span>All Messages</span>
        <UnreadBadge count={unreadCount.total} />
      </button>

      {/* Type section */}
      <div className="pt-3 pb-1">
        <p className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
          Type
        </p>
        {['dm', 'comment', 'mention', 'reply'].map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <button
              key={type}
              onClick={() => { setFilters((f) => ({ ...f, type: f.type === type ? null : type })); onClose?.(); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]',
                filters.type === type
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Platform section */}
      {connectedPlatforms.length > 0 && (
        <div className="pt-3 pb-1">
          <p className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
            Platform
          </p>
          {connectedPlatforms.map((platform) => (
            <button
              key={platform}
              onClick={() => { setFilters((f) => ({ ...f, platform: f.platform === platform ? null : platform })); onClose?.(); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px]',
                filters.platform === platform
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <PlatformIcon platform={platform} size="sm" />
              <span className="capitalize flex-1 text-left">{platform}</span>
              <UnreadBadge count={unreadCount.byPlatform?.[platform]} />
            </button>
          ))}
        </div>
      )}
    </div>

    {/* Sync button */}
    <div className="px-3 py-3 border-t border-slate-100">
      <Button
        onClick={onSync}
        disabled={syncing}
        variant="outline"
        className="w-full rounded-xl h-10 text-sm"
      >
        <RefreshCw className={cn('w-4 h-4 mr-2', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync Now'}
      </Button>
    </div>
  </div>
);

/** Single message row in the list */
const MessageRow = ({ message, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={cn(
      'flex gap-3 p-3 sm:p-4 border-b border-slate-100 cursor-pointer transition-colors',
      isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50 active:bg-slate-100',
      !message.isRead && 'border-l-[3px] border-l-blue-500 pl-[calc(0.75rem-3px)] sm:pl-[calc(1rem-3px)]'
    )}
  >
    {/* Avatar */}
    <div className="relative flex-shrink-0">
      <img
        src={message.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.senderName}`}
        alt={message.senderName}
        className="w-10 h-10 rounded-full object-cover bg-slate-100"
      />
      <span className="absolute -bottom-1 -right-1">
        <PlatformIcon platform={message.platform} size="sm" />
      </span>
    </div>

    {/* Content */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className={cn(
          'text-sm truncate',
          !message.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
        )}>
          {message.senderName}
        </p>
        <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap">
          {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
        </span>
      </div>

      <p className="text-xs text-slate-500 truncate mt-0.5 leading-snug">
        {message.content}
      </p>

      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase font-bold tracking-wide">
          {message.type}
        </span>
        {message.isReplied && (
          <Check className="w-3 h-3 text-green-500" />
        )}
        {!message.isRead && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto" />
        )}
      </div>
    </div>

    {/* Chevron on mobile */}
    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 self-center sm:hidden" />
  </div>
);

/** Thread view — message detail + reply composer */
const ThreadView = ({ message, replyContent, setReplyContent, onReply, sending, onBack }) => (
  <div className="flex flex-col h-full">
    {/* Thread header */}
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
      {/* Back button — visible on mobile/tablet */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 active:bg-slate-200 transition-colors text-slate-600 lg:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      <img
        src={message.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.senderName}`}
        alt={message.senderName}
        className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{message.senderName}</p>
        <p className="text-xs text-slate-500 truncate">{message.senderHandle}</p>
      </div>
      <PlatformIcon platform={message.platform} size="md" showBackground className="flex-shrink-0" />
    </div>

    {/* Thread body */}
    <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
      {/* Post preview */}
      {message.postPreview && (
        <div className="p-3 sm:p-4 rounded-xl bg-slate-100 border-l-2 border-slate-300">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
            In reply to your post
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">{message.postPreview}</p>
        </div>
      )}

      {/* Message bubble */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5">
        <p className="text-slate-800 leading-relaxed text-sm sm:text-base">{message.content}</p>
        <p className="text-xs text-slate-400 mt-3">
          {format(new Date(message.receivedAt), 'MMMM d, yyyy · h:mm a')}
        </p>
      </div>

      {/* Sent reply */}
      {message.isReplied && message.replyContent && (
        <div className="p-3 sm:p-4 rounded-xl bg-green-50 border border-green-100">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-green-600" />
            <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">
              Your reply sent
            </p>
          </div>
          <p className="text-sm text-green-800 leading-relaxed">{message.replyContent}</p>
        </div>
      )}
    </div>

    {/* Reply composer */}
    {!message.isReplied && (
      <div className="flex-shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-t border-slate-100 bg-white">
        <Textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Type your reply…"
          maxLength={500}
          className="w-full min-h-[72px] sm:min-h-[80px] rounded-xl bg-slate-50 border-transparent
                     focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10
                     text-sm resize-none transition-all"
        />
        <div className="flex items-center justify-between mt-2.5">
          <span className={cn(
            'text-xs font-medium',
            replyContent.length >= 480 ? 'text-red-500' : 'text-slate-400'
          )}>
            {replyContent.length}/500
          </span>
          <Button
            onClick={onReply}
            disabled={!replyContent.trim() || sending}
            className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm h-9 px-4 shadow-sm"
          >
            {sending
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />Sending…</>
              : <><Send className="w-3.5 h-3.5 mr-1.5" />Send Reply</>
            }
          </Button>
        </div>
      </div>
    )}
  </div>
);

/* ─────────────────────────────────────────────
   Main Inbox component
───────────────────────────────────────────── */
export default function Inbox() {
  const { accounts } = useAccounts();

  // Data state
  const [messages, setMessages]         = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [sending, setSending]           = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [unreadCount, setUnreadCount]   = useState({ total: 0, byPlatform: {} });
  const [filters, setFilters]           = useState({ platform: null, type: null, isRead: null });

  // Mobile navigation state
  const [mobileView, setMobileView]     = useState(MOBILE_VIEW.LIST);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  /* ── Data fetching ─────────────────────────── */
  const fetchMessages = useCallback(async () => {
    try {
      const res = await inboxAPI.getMessages(filters);
      setMessages(res.data.messages);
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await inboxAPI.getUnreadCount();
      setUnreadCount(res.data);
    } catch {
      console.error('Failed to fetch unread count');
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchUnreadCount();
  }, [fetchMessages, fetchUnreadCount]);

  /* ── Handlers ──────────────────────────────── */
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await inboxAPI.sync();
      toast.success(`Synced! ${res.data.newMessages} new messages`);
      fetchMessages();
      fetchUnreadCount();
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectMessage = async (message) => {
    setSelectedMessage(message);
    setReplyContent('');
    setMobileView(MOBILE_VIEW.THREAD); // push to thread on mobile

    if (!message.isRead) {
      try {
        await inboxAPI.markRead(message.id);
        setMessages((prev) =>
          prev.map((m) => m.id === message.id ? { ...m, isRead: true } : m)
        );
        fetchUnreadCount();
      } catch {
        console.error('Failed to mark as read');
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await inboxAPI.markAllRead(filters.platform);
      toast.success('All messages marked as read');
      fetchMessages();
      fetchUnreadCount();
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedMessage) return;
    setSending(true);
    try {
      await inboxAPI.reply(selectedMessage.id, replyContent);
      toast.success('Reply sent!');
      const updated = { ...selectedMessage, isReplied: true, replyContent };
      setSelectedMessage(updated);
      setMessages((prev) =>
        prev.map((m) => m.id === selectedMessage.id ? { ...m, isReplied: true } : m)
      );
      setReplyContent('');
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleBackToList = () => {
    setMobileView(MOBILE_VIEW.LIST);
    setSelectedMessage(null);
  };

  const connectedPlatforms = [...new Set(accounts.map((a) => a.platform))];

  /* ── Loading ───────────────────────────────── */
  if (loading) {
    return (
      <PageWrapper title="Inbox">
        <PageLoader />
      </PageWrapper>
    );
  }

  /* ── Render ────────────────────────────────── */
  return (
    <PageWrapper noPadding>
      {/* ── Page Header ──────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center flex-shrink-0">
            <InboxIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-slate-900 leading-tight">
              Inbox
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-tight">
              Manage all your messages
            </p>
          </div>
        </motion.div>

        {/* Mobile filter trigger */}
        <div className="flex items-center gap-2">
          {unreadCount.total > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-red-600 text-xs font-bold">
              {unreadCount.total} unread
            </span>
          )}
          <button
            onClick={() => setFilterDrawerOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700 text-sm font-medium min-h-[40px]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {(filters.platform || filters.type) && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            )}
          </button>
        </div>
      </div>

      {/* ── Main inbox panel ─────────────────── */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6">
        {/*
          Layout strategy:
          • Mobile (<lg):   one panel visible at a time, navigate via mobileView state
          • Desktop (≥lg):  3-column: filters | list | thread
        */}
        <div className="flex gap-4 h-[calc(100dvh-190px)] sm:h-[calc(100dvh-200px)] lg:h-[calc(100dvh-180px)] min-h-[400px]">

          {/* ── FILTERS — desktop sidebar (always visible on lg+) ── */}
          <aside className="hidden lg:flex flex-col w-52 xl:w-60 flex-shrink-0 bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-4 py-4 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Filters</p>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <FiltersContent
                filters={filters}
                setFilters={setFilters}
                connectedPlatforms={connectedPlatforms}
                unreadCount={unreadCount}
                onSync={handleSync}
                syncing={syncing}
              />
            </div>
          </aside>

          {/* ── MESSAGES LIST ─────────────────────────────────────── */}
          <div className={cn(
            'flex flex-col bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm flex-shrink-0',
            // Mobile: full width, show/hide based on mobileView
            mobileView === MOBILE_VIEW.LIST ? 'flex' : 'hidden',
            // Desktop: always visible, fixed width
            'lg:flex lg:w-72 xl:w-80',
            // On lg the hidden class from mobile should not apply
            'lg:!flex'
          )}>
            {/* List header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  {messages.length} messages
                </span>
                {filters.platform || filters.type ? (
                  <button
                    onClick={() => setFilters({ platform: null, type: null, isRead: null })}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition-colors"
                  >
                    Clear filter ×
                  </button>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs h-8 px-2 rounded-lg text-slate-500 hover:text-slate-700"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            </div>

            {/* List body */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 px-4 py-10">
                  <InboxIcon className="w-10 h-10 opacity-50" />
                  <p className="text-sm text-center">No messages found</p>
                  {(filters.platform || filters.type) && (
                    <button
                      onClick={() => setFilters({ platform: null, type: null, isRead: null })}
                      className="text-xs text-indigo-600 font-medium hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <MessageRow
                        message={message}
                        isSelected={selectedMessage?.id === message.id}
                        onClick={() => handleSelectMessage(message)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* ── THREAD PANEL ──────────────────────────────────────── */}
          <div className={cn(
            'flex flex-col bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm flex-1 min-w-0',
            // Mobile: only visible when a message is selected
            mobileView === MOBILE_VIEW.THREAD ? 'flex' : 'hidden',
            'lg:!flex'
          )}>
            {selectedMessage ? (
              <motion.div
                key={selectedMessage.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col h-full"
              >
                <ThreadView
                  message={selectedMessage}
                  replyContent={replyContent}
                  setReplyContent={setReplyContent}
                  onReply={handleReply}
                  sending={sending}
                  onBack={handleBackToList}
                />
              </motion.div>
            ) : (
              /* Empty thread placeholder — desktop only (mobile never shows this panel without a message) */
              <div className="hidden lg:flex flex-col items-center justify-center h-full gap-4 text-slate-300 px-6">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                  <InboxIcon className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-500 text-base">No message selected</p>
                  <p className="text-sm text-slate-400 mt-1">Pick a conversation from the list</p>
                </div>
              </div>
            )}
          </div>

        </div>{/* end 3-col */}
      </div>{/* end main panel */}

      {/* ── MOBILE FILTER DRAWER ─────────────────────────────── */}
      <AnimatePresence>
        {filterDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFilterDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
            />
            {/* Drawer panel — slides up from bottom */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl lg:hidden"
              style={{ maxHeight: '80dvh' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div style={{ height: 'calc(80dvh - 1.5rem)' }}>
                <FiltersContent
                  filters={filters}
                  setFilters={setFilters}
                  connectedPlatforms={connectedPlatforms}
                  unreadCount={unreadCount}
                  onSync={handleSync}
                  syncing={syncing}
                  onClose={() => setFilterDrawerOpen(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </PageWrapper>
  );
}