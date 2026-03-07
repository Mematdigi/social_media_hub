import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Inbox as InboxIcon, RefreshCw, Check, CheckCheck, Send, MessageSquare, AtSign, Reply, Filter } from 'lucide-react';
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

const typeIcons = {
  dm: MessageSquare,
  comment: MessageSquare,
  mention: AtSign,
  reply: Reply,
};

export default function Inbox() {
  const { accounts } = useAccounts();
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [unreadCount, setUnreadCount] = useState({ total: 0, byPlatform: {} });
  const [filters, setFilters] = useState({ platform: null, type: null, isRead: null });

  const fetchMessages = useCallback(async () => {
    try {
      const response = await inboxAPI.getMessages(filters);
      setMessages(response.data.messages);
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await inboxAPI.getUnreadCount();
      setUnreadCount(response.data);
    } catch (error) {
      console.error('Failed to fetch unread count');
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchUnreadCount();
  }, [fetchMessages, fetchUnreadCount]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await inboxAPI.sync();
      toast.success(`Synced! ${response.data.newMessages} new messages`);
      fetchMessages();
      fetchUnreadCount();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectMessage = async (message) => {
    setSelectedMessage(message);
    setReplyContent('');
    if (!message.isRead) {
      try {
        await inboxAPI.markRead(message.id);
        setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, isRead: true } : m));
        fetchUnreadCount();
      } catch (error) {
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
    } catch (error) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedMessage) return;
    setSending(true);
    try {
      await inboxAPI.reply(selectedMessage.id, replyContent);
      toast.success('Reply sent!');
      setSelectedMessage({ ...selectedMessage, isReplied: true, replyContent });
      setMessages((prev) => prev.map((m) => m.id === selectedMessage.id ? { ...m, isReplied: true } : m));
      setReplyContent('');
    } catch (error) {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const connectedPlatforms = [...new Set(accounts.map((a) => a.platform))];

  if (loading) return <PageWrapper title="Inbox"><PageLoader /></PageWrapper>;

  return (
    <PageWrapper>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <InboxIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Inbox</h1>
              <p className="text-slate-600">Manage all your messages in one place</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)]">
        {/* Filters Panel */}
        <div className="col-span-3 bg-white rounded-3xl border border-slate-100 p-4 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <button
                onClick={() => setFilters({ platform: null, type: null, isRead: null })}
                className={cn('w-full flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all',
                  !filters.platform && !filters.type ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
                )}
              >
                All Messages
                {unreadCount.total > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                    {unreadCount.total > 99 ? '99+' : unreadCount.total}
                  </span>
                )}
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 px-4">Type</p>
              {['dm', 'comment', 'mention', 'reply'].map((type) => {
                const Icon = typeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => setFilters({ ...filters, type: filters.type === type ? null : type })}
                    className={cn('w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                      filters.type === type ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {type.charAt(0).toUpperCase() + type.slice(1)}s
                  </button>
                );
              })}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 px-4">Platform</p>
              {connectedPlatforms.map((platform) => (
                <button
                  key={platform}
                  onClick={() => setFilters({ ...filters, platform: filters.platform === platform ? null : platform })}
                  className={cn('w-full flex items-center justify-between px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    filters.platform === platform ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-600'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={platform} size="sm" />
                    <span className="capitalize">{platform}</span>
                  </div>
                  {unreadCount.byPlatform[platform] > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                      {unreadCount.byPlatform[platform]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <Button onClick={handleSync} disabled={syncing} variant="outline" className="w-full rounded-xl">
                <RefreshCw className={cn('w-4 h-4 mr-2', syncing && 'animate-spin')} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>
          </div>
        </div>

        {/* Messages List */}
        <div className="col-span-4 bg-white rounded-3xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="font-medium text-slate-700">{messages.length} messages</span>
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-xs">
              <CheckCheck className="w-4 h-4 mr-1" />Mark all read
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <InboxIcon className="w-12 h-12 mb-2" />
                <p>No messages found</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => handleSelectMessage(message)}
                  className={cn(
                    'p-4 border-b border-slate-100 cursor-pointer transition-all',
                    selectedMessage?.id === message.id ? 'bg-indigo-50' : 'hover:bg-slate-50',
                    !message.isRead && 'border-l-4 border-l-blue-500'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <img src={message.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${message.senderName}`} alt="" className="w-10 h-10 rounded-full" />
                      <div className="absolute -bottom-1 -right-1">
                        <PlatformIcon platform={message.platform} size="sm" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={cn('text-sm truncate', !message.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
                          {message.senderName}
                        </p>
                        <span className="text-xs text-slate-400">
                          {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 truncate mt-0.5">{message.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase font-bold">
                          {message.type}
                        </span>
                        {message.isReplied && <Check className="w-3 h-3 text-green-500" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="col-span-5 bg-white rounded-3xl border border-slate-100 overflow-hidden flex flex-col">
          {selectedMessage ? (
            <>
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <img src={selectedMessage.senderAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${selectedMessage.senderName}`} alt="" className="w-12 h-12 rounded-full" />
                  <div>
                    <p className="font-bold text-slate-900">{selectedMessage.senderName}</p>
                    <p className="text-sm text-slate-500">{selectedMessage.senderHandle}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <PlatformIcon platform={selectedMessage.platform} size="md" showBackground />
                  </div>
                </div>
              </div>
              
              <div className="flex-1 p-6 overflow-y-auto">
                {selectedMessage.postPreview && (
                  <div className="p-4 rounded-xl bg-slate-100 mb-4">
                    <p className="text-xs text-slate-500 mb-1">In reply to your post:</p>
                    <p className="text-sm text-slate-700">{selectedMessage.postPreview}</p>
                  </div>
                )}
                <p className="text-slate-700 leading-relaxed">{selectedMessage.content}</p>
                <p className="text-sm text-slate-400 mt-4">
                  {format(new Date(selectedMessage.receivedAt), 'MMMM d, yyyy at h:mm a')}
                </p>
                
                {selectedMessage.isReplied && selectedMessage.replyContent && (
                  <div className="mt-6 p-4 rounded-xl bg-green-50 border border-green-100">
                    <p className="text-xs text-green-600 font-medium mb-1">Your reply:</p>
                    <p className="text-sm text-green-800">{selectedMessage.replyContent}</p>
                  </div>
                )}
              </div>
              
              {!selectedMessage.isReplied && (
                <div className="p-4 border-t border-slate-100">
                  <div className="flex gap-3">
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Type your reply..."
                      className="flex-1 min-h-[80px] rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500"
                      maxLength={500}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-400">{replyContent.length}/500</span>
                    <Button
                      onClick={handleReply}
                      disabled={!replyContent.trim() || sending}
                      className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white"
                    >
                      {sending ? 'Sending...' : <><Send className="w-4 h-4 mr-2" />Send Reply</>}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <InboxIcon className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Select a message to view</p>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
