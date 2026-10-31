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
    <span className="ml-auto flex-shrink-0 min-w-[1.25rem] h-5 inline-flex items-center justify-center px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-semibold tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  );
};

/** Filters sidebar content — reused in both drawer and desktop panel */
const FiltersContent = ({ filters, setFilters, connectedPlatforms, unreadCount, onSync, syncing, onClose }) => (
  <div className="flex flex-col h-full">
    {/* Header shown only in drawer mode */}
    {onClose && (
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <p className="font-heading font-semibold text-slate-900 text-base">Filters</p>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
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
          'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors',
          !filters.platform && !filters.type
            ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgb(var(--brand-100))]'
            : 'text-slate-700 hover:bg-slate-100/70'
        )}
      >
        <InboxIcon className="w-4 h-4 flex-shrink-0" />
        <span>All Messages</span>
        <UnreadBadge count={unreadCount.total} />
      </button>

      {/* Type section */}
      <div className="pt-4 pb-1 space-y-0.5">
        <p className="sh-eyebrow px-3 mb-1.5">
          Type
        </p>
        {['dm', 'comment', 'mention', 'reply'].map((type) => {
          const Icon = TYPE_ICONS[type];
          return (
            <button
              key={type}
              onClick={() => { setFilters((f) => ({ ...f, type: f.type === type ? null : type })); onClose?.(); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors',
                filters.type === type
                  ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgb(var(--brand-100))]'
                  : 'text-slate-600 hover:bg-slate-100/70'
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
        <div className="pt-4 pb-1 space-y-0.5">
          <p className="sh-eyebrow px-3 mb-1.5">
            Platform
          </p>
          {connectedPlatforms.map((platform) => (
            <button
              key={platform}
              onClick={() => { setFilters((f) => ({ ...f, platform: f.platform === platform ? null : platform })); onClose?.(); }}
              className={cn(
                'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors',
                filters.platform === platform
                  ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgb(var(--brand-100))]'
                  : 'text-slate-600 hover:bg-slate-100/70'
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
        className="w-full"
      >
        <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
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
      'relative flex gap-3 px-4 py-3.5 border-b border-slate-100 cursor-pointer transition-colors',
      isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50 active:bg-slate-100',
      isSelected && 'before:absolute before:left-0 before:inset-y-0 before:w-[3px] before:bg-indigo-600',
      !message.isRead && !isSelected && 'bg-sky-50/40'
    )}
  >
    {/* Avatar */}
    <div className="relative flex-shrink-0 self-start h-10">
      <img
        src={message.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.senderName}`}
        alt={message.senderName}
        className="w-10 h-10 rounded-full object-cover bg-slate-100 ring-1 ring-slate-200"
      />
      <span className="absolute -bottom-1 -right-1 rounded-full bg-white p-0.5 shadow-sm">
        <PlatformIcon platform={message.platform} size="sm" className="!w-3.5 !h-3.5" />
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
        <span className="text-[11px] text-slate-400 flex-shrink-0 whitespace-nowrap tabular-nums">
          {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
        </span>
      </div>

      <p className="text-[0.8125rem] text-slate-500 truncate mt-0.5 leading-snug">
        {message.content}
      </p>

      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] h-[18px] inline-flex items-center px-1.5 rounded-md bg-slate-100 text-slate-500 uppercase font-semibold tracking-wide">
          {message.type}
        </span>
        {message.isReplied && (
          <Check className="w-3.5 h-3.5 text-green-600" />
        )}
        {!message.isRead && (
          <span className="w-2 h-2 rounded-full bg-indigo-600 ml-auto shadow-[0_0_0_3px_rgb(var(--brand-500)/0.15)]" />
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
    <div className="flex items-center gap-3 px-4 sm:px-5 h-16 border-b border-slate-100 flex-shrink-0">
      {/* Back button — visible on mobile/tablet */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex-shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors text-slate-600 lg:hidden"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      <img
        src={message.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.senderName}`}
        alt={message.senderName}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm sm:text-[0.9375rem] truncate">{message.senderName}</p>
        <p className="text-xs text-slate-500 truncate">{message.senderHandle}</p>
      </div>
      <PlatformIcon platform={message.platform} size="sm" showBackground className="flex-shrink-0 !rounded-lg" />
    </div>

    {/* Thread body */}
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 bg-slate-50/60">
      {/* Post preview */}
      {message.postPreview && (
        <div className="p-3 sm:p-4 rounded-xl bg-white border border-slate-200/80 border-l-[3px] border-l-slate-300">
          <p className="sh-eyebrow mb-1">
            In reply to your post
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">{message.postPreview}</p>
        </div>
      )}

      {/* Message bubble */}
      <div className="max-w-[44rem] bg-white rounded-2xl rounded-tl-md border border-slate-200/80 shadow-card p-4 sm:p-5">
        <p className="text-slate-800 leading-relaxed text-sm sm:text-[0.9375rem]">{message.content}</p>
        <p className="text-xs text-slate-400 mt-3">
          {format(new Date(message.receivedAt), 'MMMM d, yyyy · h:mm a')}
        </p>
      </div>

      {/* Sent reply */}
      {message.isReplied && message.replyContent && (
        <div className="ml-auto max-w-[44rem] p-3 sm:p-4 rounded-2xl rounded-tr-md sh-grad-brand text-white shadow-button">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Check className="w-3 h-3 text-indigo-200" />
            <p className="text-[10px] text-indigo-200 font-semibold uppercase tracking-wider">
              Your reply sent
            </p>
          </div>
          <p className="text-sm text-white leading-relaxed">{message.replyContent}</p>
        </div>
      )}
    </div>

    {/* Reply composer */}
    {!message.isReplied && (
      <div className="flex-shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-t border-slate-200/80 bg-white">
        <Textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Type your reply…"
          maxLength={500}
          className="w-full min-h-[72px] sm:min-h-[84px] bg-slate-50/70 focus-visible:bg-white text-sm resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className={cn(
            'text-xs font-medium tabular-nums',
            replyContent.length >= 480 ? 'text-red-500' : 'text-slate-400'
          )}>
            {replyContent.length}/500
          </span>
          <Button
            onClick={onReply}
            disabled={!replyContent.trim() || sending}
            className="h-9 px-4"
          >
            {sending
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</>
              : <><Send className="w-3.5 h-3.5" />Send Reply</>
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
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-6 lg:pt-10 pb-5 lg:pb-6 flex items-center justify-between gap-3 flex-wrap">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 sm:gap-4 min-w-0"
        >
          <div className="sh-page-icon">
            <InboxIcon />
          </div>
          <div className="min-w-0">
            <h1 className="text-[1.375rem] sm:text-[1.75rem] font-heading font-bold text-slate-900 leading-tight">
              Inbox
            </h1>
            <p className="mt-0.5 text-sm sm:text-[0.9375rem] text-slate-500 leading-tight truncate">
              Manage all your messages
            </p>
          </div>
        </motion.div>

        {/* Mobile filter trigger */}
        <div className="flex items-center gap-2">
          {unreadCount.total > 0 && (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-slate-200 shadow-sm text-slate-700 text-xs font-semibold tabular-nums"><span className="w-2 h-2 rounded-full bg-rose-500" />
              {unreadCount.total} unread
            </span>
          )}
          <button
            onClick={() => setFilterDrawerOpen(true)}
            className="lg:hidden relative flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-colors text-slate-700 text-sm font-medium"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {(filters.platform || filters.type) && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white" />
            )}
          </button>
        </div>
      </div>

      {/* ── Main inbox panel ─────────────────── */}
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10 pb-6 lg:pb-10">
        {/*
          Layout strategy:
          • Mobile (<lg):   one panel visible at a time, navigate via mobileView state
          • Desktop (≥lg):  3-column: filters | list | thread
        */}
        <div className="flex gap-4 h-[calc(100dvh-172px)] md:h-[calc(100dvh-116px)] lg:h-[calc(100dvh-160px)] min-h-[420px]">

          {/* ── FILTERS — desktop sidebar (always visible on lg+) ── */}
          <aside className="hidden lg:flex flex-col w-56 xl:w-60 flex-shrink-0 sh-card overflow-hidden">
            <div className="px-5 h-14 flex items-center border-b border-slate-100">
              <p className="sh-card-title !text-[0.9375rem]">Filters</p>
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
            'flex flex-col sh-card overflow-hidden flex-shrink-0 w-full',
            // Mobile: full width, show/hide based on mobileView
            mobileView === MOBILE_VIEW.LIST ? 'flex' : 'hidden',
            // Desktop: always visible, fixed width
            'lg:flex lg:w-80 xl:w-96',
            // On lg the hidden class from mobile should not apply
            'lg:!flex'
          )}>
            {/* List header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 tabular-nums">
                  {messages.length} messages
                </span>
                {filters.platform || filters.type ? (
                  <button
                    onClick={() => setFilters({ platform: null, type: null, isRead: null })}
                    className="text-[11px] h-6 px-2 rounded-full bg-indigo-50 text-indigo-700 font-semibold ring-1 ring-inset ring-indigo-100 hover:bg-indigo-100 transition-colors"
                  >
                    Clear filter ×
                  </button>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs h-8 px-2.5 text-slate-500 hover:text-slate-900"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            </div>

            {/* List body */}
            <div className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="sh-empty h-full">
                  <div className="sh-empty__icon"><InboxIcon /></div>
                  <p className="sh-empty__desc !mb-3">No messages found</p>
                  {(filters.platform || filters.type) && (
                    <button
                      onClick={() => setFilters({ platform: null, type: null, isRead: null })}
                      className="text-sm text-indigo-600 font-semibold hover:text-indigo-700"
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
            'flex flex-col sh-card overflow-hidden flex-1 min-w-0',
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
              <div className="hidden lg:flex sh-empty h-full bg-slate-50/60">
                <div className="sh-empty__icon !bg-white"><InboxIcon /></div>
                <div className="text-center">
                  <p className="sh-empty__title">No message selected</p>
                  <p className="sh-empty__desc !mb-0">Pick a conversation from the list</p>
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
              className="fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-sm lg:hidden"
            />
            {/* Drawer panel — slides up from bottom */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-pop lg:hidden"
              style={{ maxHeight: '80dvh' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-300" />
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