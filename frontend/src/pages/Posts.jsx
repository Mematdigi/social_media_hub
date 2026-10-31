import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Plus, RefreshCw, Calendar, Share2, 
  ExternalLink, ChevronLeft, ChevronRight, Search, LayoutGrid, Image, Settings2, ShieldAlert, CheckCircle2, AlertCircle, Clock
} from 'lucide-react'; 
import { PageWrapper } from '../components/layout/PageWrapper';
import { PageHeader } from '../components/layout/PageHeader';
import { PostCard } from '../components/posts/PostCard';
import { MediaDeletionBadge } from '../components/posts/MediaDeletionBadge';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { accountsAPI } from '../services/api';
import { toast } from 'sonner';
import {postsAPI } from '../services/api'; // ✨ THE FIX: Import postsAPI directly

const statusTabs = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'scheduled', label: 'Scheduled' },
];

const platformTabs = [
  { id: 'all',       label: 'All Platforms' },
  { id: 'facebook',  label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube',   label: 'YouTube' },
  { id: 'twitter',   label: 'X (Twitter)' } 
];

export default function Posts() {
  const navigate = useNavigate();
  const { fetchPosts, deletePost, syncPosts, retryFailedPost, syncing } = usePosts();

  const [allPosts, setAllPosts] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState({}); 
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activePlatformFilter, setActivePlatformFilter] = useState('all');
  const [activeChannelFilter, setActiveChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLimit, setActiveLimit] = useState(10); 
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [availableChannels, setAvailableChannels] = useState([{ id: 'all', label: 'All Connected Channels', platform: 'all' }]);

  useEffect(() => {
    const fetchChannelsForDropdown = async () => {
      try {
        const response = await accountsAPI.getPlatforms();
        const data = response.data || response;
        const channels = [{ id: 'all', label: 'All Connected Channels', platform: 'all' }];
        
        if (Array.isArray(data)) {
          data.forEach(group => {
            if (group.connected && Array.isArray(group.accounts)) {
              group.accounts.forEach(acc => {
                 if (acc.platform === 'facebook' && acc.pages) {
                    acc.pages.forEach(p => {
                      channels.push({ id: p.pageId, label: `📘 ${p.pageName}`, platform: 'facebook' });
                    });
                 } else if (acc.platform === 'instagram') {
                    channels.push({ id: acc.id, label: `📷 ${acc.accountName}`, platform: 'instagram' });
                 } else if (acc.platform === 'youtube') {
                    channels.push({ id: acc.id, label: `📺 ${acc.accountName}`, platform: 'youtube' });
                 }
                 else if (acc.platform === 'twitter') {
                    channels.push({ id: acc.id, label: `🐦 ${acc.accountName}`, platform: 'twitter' });
                 }
              });
            }
          });
        }
        setAvailableChannels(channels);
      } catch (err) {
        console.error("Failed to load channel list");
      }
    };
    fetchChannelsForDropdown();
  }, []);

const loadPostsTargetedData = useCallback(async () => {
    if (!isSetupComplete) return;

    try {
      setLocalLoading(true);
      const params = { page: currentPage, limit: activeLimit };
      if (activeStatusFilter !== 'all') params.status = activeStatusFilter;
      if (activePlatformFilter !== 'all') params.platform = activePlatformFilter;
      if (activeChannelFilter !== 'all') params.channel = activeChannelFilter;
      if (searchQuery.trim() !== '') params.search = searchQuery;

      // ✨ THE FIX: We bypass the void hook and ask the API directly for the raw data!
      const response = await postsAPI.getAll(params);
      
      // Axios stores the JSON in response.data
      const responseData = response.data || response;
      
      setAllPosts(responseData.posts || []);
      
      if (responseData.pagination) {
        setTotalPages(responseData.pagination.totalPages);
        setTotalItems(responseData.pagination.total);
      }
    } catch (err) {
      toast.error('Failed to collect latest feed data.');
    } finally {
      setLocalLoading(false);
    }
  }, [currentPage, activeLimit, activeStatusFilter, activePlatformFilter, activeChannelFilter, searchQuery, isSetupComplete]);

  useEffect(() => {
    loadPostsTargetedData();
  }, [loadPostsTargetedData]);

  const handleDelete = async (postId, deleteFromPlatform = true) => {
    if (typeof postId === 'string' && postId.startsWith('live-')) {
      toast.error("This post wasn't published through SocialHub — delete it directly on the platform instead.");
      return;
    }
    try {
      await deletePost(postId, deleteFromPlatform);
      toast.success('Post deleted successfully.');
      loadPostsTargetedData(); 
    } catch (error) {
      toast.error('Failed to delete post.');
    }
  };

  const handleRetry = async (postId) => {
    try {
      await retryFailedPost(postId);
      toast.success('Retry attempted — check status below.');
      loadPostsTargetedData();
    } catch (error) {
      toast.error('Retry request failed.');
    }
  };

  const handleSync = async () => {
    try {
      await syncPosts();
      toast.success('Cross-platform account synchronization complete!');
      setCurrentPage(1);
      await loadPostsTargetedData(); 
    } catch (error) {
      toast.error('Sync request failed.');
    }
  };

  const getPostBrandName = (post) => {
    if (post.platformResults?.[0]?.pageName) return post.platformResults[0].pageName;
    if (post.youtubeTitle) return 'YouTube';
    return post.platforms?.[0] || 'Social';
  };

  // Format Helper for Audit Dates
  const formatAuditDate = (dateString) => {
    if (!dateString) return 'Pending...';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
    });
  };

  if (!isSetupComplete) {
    return (
      <PageWrapper>
        <PageHeader icon={FileText} title="Posts Database" subtitle="Configure your feed before loading" />

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="sh-card sh-card--accent relative overflow-hidden p-6 sm:p-10 max-w-3xl mx-auto mt-2 sm:mt-6">
          <span className="pointer-events-none absolute -right-16 -top-20 w-56 h-56 rounded-full [background:radial-gradient(closest-side,rgb(192 132 252/0.24),transparent)]" />
          <div className="relative text-center mb-8">
            <div className="sh-logo-mark sh-logo-mark--lg mx-auto mb-4"><LayoutGrid /></div>
            <h2 className="text-2xl font-heading font-bold text-slate-900">What would you like to load?</h2>
            <p className="text-slate-500 mt-2">Select your filters to pull the exact posts you want.</p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            <div>
              <label className="block text-[0.8125rem] font-semibold text-slate-700 mb-2">Target Platform</label>
              <select
                value={activePlatformFilter}
                onChange={(e) => { setActivePlatformFilter(e.target.value); setActiveChannelFilter('all'); }}
                className="sh-select"
              >
                {platformTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[0.8125rem] font-semibold text-slate-700 mb-2">Specific Channel/Page</label>
              <select
                value={activeChannelFilter}
                onChange={(e) => setActiveChannelFilter(e.target.value)}
                className="sh-select"
              >
                {availableChannels
                  .filter(t => activePlatformFilter === 'all' || t.platform === 'all' || t.platform === activePlatformFilter)
                  .map(t => <option key={t.id} value={t.id}>{t.label}</option>)
                }
              </select>
            </div>

            <div>
              <label className="block text-[0.8125rem] font-semibold text-slate-700 mb-2">Status</label>
              <select
                value={activeStatusFilter}
                onChange={(e) => setActiveStatusFilter(e.target.value)}
                className="sh-select"
              >
                {statusTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[0.8125rem] font-semibold text-slate-700 mb-2">Number of Posts</label>
              <select
                value={activeLimit}
                onChange={(e) => setActiveLimit(Number(e.target.value))}
                className="sh-select"
              >
                <option value={10}>Load 10 Posts</option>
                <option value={25}>Load 25 Posts</option>
                <option value={50}>Load 50 Posts</option>
                <option value={100}>Load 100 Posts</option>
              </select>
            </div>
          </div>

          <Button 
            onClick={() => setIsSetupComplete(true)} 
            className="relative w-full h-12 text-[0.9375rem]"
          >
            Load Posts Feed
          </Button>
        </motion.div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        icon={FileText}
        title="Posts Database"
        subtitle="Manage and sync your cross-platform content"
        actions={
          <>
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Platforms'}
            </Button>
            <Button className="flex-1 sm:flex-none px-5" onClick={() => navigate('/posts/new')}>
              <Plus className="w-4 h-4" />
              New Post
            </Button>
          </>
        }
      />

      <div className="sh-card p-4 sm:p-6 mb-6 sm:mb-8 space-y-5">
        
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search post content, titles, hashtags..."
                className="w-full h-11 pl-11 pr-4 rounded-xl border border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 outline-none text-sm bg-white hover:border-slate-300 transition-all text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="sh-segmented !flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveStatusFilter(tab.id); setCurrentPage(1); }}
                className={`sh-segmented__btn flex-1 !h-9 !px-4 ${activeStatusFilter === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-slate-100" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="sh-eyebrow flex items-center gap-1.5 mb-2 !text-slate-500">
              <Share2 className="w-3.5 h-3.5" /> Filter by Platform
            </div>
            <select
              value={activePlatformFilter}
              onChange={(e) => { setActivePlatformFilter(e.target.value); setActiveChannelFilter('all'); setCurrentPage(1); }}
              className="sh-select"
            >
              {platformTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <div className="sh-eyebrow flex items-center gap-1.5 mb-2 !text-slate-500">
              <LayoutGrid className="w-3.5 h-3.5" /> Specific Page / Channel
            </div>
            <select
              value={activeChannelFilter}
              onChange={(e) => { setActiveChannelFilter(e.target.value); setCurrentPage(1); }}
              className="sh-select"
            >
              {availableChannels
                .filter(t => activePlatformFilter === 'all' || t.platform === 'all' || t.platform === activePlatformFilter)
                .map(t => <option key={t.id} value={t.id}>{t.label}</option>)
              }
            </select>
          </div>

          <div>
            <div className="sh-eyebrow flex items-center gap-1.5 mb-2 !text-slate-500">
              <Settings2 className="w-3.5 h-3.5" /> Posts to Load (Limit)
            </div>
            <select
              value={activeLimit}
              onChange={(e) => { setActiveLimit(Number(e.target.value)); setCurrentPage(1); }}
              className="sh-select !text-indigo-700"
            >
              <option value={10}>Load 10 Posts</option>
              <option value={25}>Load 25 Posts</option>
              <option value={50}>Load 50 Posts</option>
              <option value={100}>Load 100 Posts</option>
            </select>
          </div>
        </div>
      </div>

      {localLoading ? (
        <div className="py-20 flex justify-center"><PageLoader /></div>
      ) : allPosts.length === 0 ? (
        <div className="sh-card sh-empty py-14">
          <div className="sh-empty__icon">
            <FileText />
          </div>
          <h3 className="sh-empty__title">No posts found</h3>
          <p className="sh-empty__desc !mb-0">No records match your exact server filters. Try adjusting the dropdowns above.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <AnimatePresence mode="popLayout">
            {allPosts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: 0.02 * index }}
                className={`sh-card sh-card--hover overflow-hidden p-4 sm:p-6 flex flex-col ${post.status === 'failed' ? '!border-red-200 ring-1 ring-inset ring-red-100' : ''}`}
              >
                {/* ── 1. Main Post Body ── */}
                <div className="flex gap-5 flex-col md:flex-row pb-5">
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex-shrink-0 md:w-56">
                      <div className="relative rounded-xl overflow-hidden bg-slate-100 h-44 md:h-44 ring-1 ring-slate-200/80 flex items-center justify-center">
                        {imageErrors[post.id] ? (
                          <div className={`w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br ${
                            post.platforms?.[0] === 'facebook' ? 'from-blue-500 to-indigo-600' : 'from-pink-500 via-purple-500 to-orange-500'
                          } text-white`}>
                            <Image className="w-6 h-6 mb-2 opacity-80" />
                            <span className="text-xs font-bold tracking-wide uppercase truncate max-w-full">{getPostBrandName(post)}</span>
                            <span className="text-[10px] opacity-70 mt-1 font-medium">
                              {post.mediaDeleted ? 'Removed from server' : 'Attachment Missing'}
                            </span>
                          </div>
                        ) : post.mediaUrls[0].match(/\.(mp4|webm|ogg|mov)$/i) ? (
                          <video src={post.mediaUrls[0]} preload="metadata" className="w-full h-full object-cover" />
                        ) : (
                          <img 
                            src={post.mediaUrls[0]} alt="Post cover thumbnail" loading="lazy" decoding="async" className="w-full h-full object-cover" 
                            onError={() => setImageErrors(prev => ({ ...prev, [post.id]: true }))}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {post.youtubeTitle && (
                      <div className="mb-3 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold ring-1 ring-inset ring-red-100">
                        YT: {post.youtubeTitle}
                      </div>
                    )}
                    <PostCard post={post} onDelete={handleDelete} />
                  </div>
                </div>

                {/* 🆕 When the uploaded video / images get deleted from the server */}
                <div className="mb-4 empty:hidden">
                  <MediaDeletionBadge
                    post={post}
                    onUpdated={(fields) =>
                      setAllPosts(prev => prev.map(p => (p.id === post.id ? { ...p, ...fields } : p)))
                    }
                  />
                </div>

                {/* ── 2. NEW: Database User & Audit Log ── */}
                <div className="mt-auto -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-slate-50/80 border-t border-slate-200/80 px-4 sm:px-6 py-4 sm:py-5">
                  
                  {/* Top Bar: Who & When (Pulled directly from DB User Schema) */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-3 mb-3 gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-indigo-50 ring-1 ring-inset ring-indigo-100 inline-flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-indigo-600" /></span>
                      <span className="text-sm font-semibold text-slate-900">Publishing Audit Log</span>
                    </div>

                    <div className="text-right flex items-center gap-2 bg-white pl-1.5 pr-3 py-1.5 rounded-full border border-slate-200 shadow-sm w-full md:w-auto">
                      <div className="w-7 h-7 rounded-full sh-grad-logo flex items-center justify-center font-semibold text-white text-xs">
                        {post.publisherInfo?.name ? post.publisherInfo.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="flex flex-col text-left mr-2">
                        {post.notSaved ? (
                          <span className="text-xs font-semibold text-blue-600">Synced Directly from Platform</span>
                        ) : (
                          <>
                            <span className="text-xs font-bold text-slate-800">
                              {post.publisherInfo?.name || 'Unknown User'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500 leading-tight">
                              {post.publisherInfo?.email || 'No email attached'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Specific Platform/Page Breakdown */}
                  <div className="space-y-2">
                    <span className="sh-eyebrow block pl-0.5 pb-0.5">Target Pages & Delivery Times</span>
                    
                    {post.platformResults && post.platformResults.length > 0 ? (
                      post.platformResults.map((res, rIdx) => {
                        // Gather specific page names for Facebook
                        const specificPageNames = res.pages && res.pages.length > 0 
                          ? res.pages.map(p => p.pageName).join(', ') 
                          : res.pageName;
                          
                        return (
                          <div key={rIdx} className={`bg-white rounded-xl border p-3 flex flex-col gap-2 ${res.status === 'failed' ? 'border-red-200' : 'border-slate-200/80'}`}>
                            
                            {/* Top Row: Status, Platform, Time */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {res.status === 'published' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                <span className="font-semibold text-sm capitalize text-slate-900">{res.platform}</span>
                                {specificPageNames && (
                                  <>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <span className="font-semibold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md ring-1 ring-inset ring-indigo-100 truncate max-w-[200px] md:max-w-xs">
                                      {specificPageNames}
                                    </span>
                                  </>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 tabular-nums">
                                  <Clock className="w-3 h-3" />
                                  {formatAuditDate(res.attemptedAt || res.publishedAt || post.publishedAt || post.createdAt)}
                                </span>
                                <span className={`h-6 inline-flex items-center px-2 rounded-full text-[11px] capitalize font-semibold ring-1 ring-inset ${
                                  res.status === 'published' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'
                                }`}>
                                  {res.status}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Row: Error Display & Retry */}
                            {res.error && (
                              <div className="mt-1 text-xs text-red-700 bg-red-50 p-3 rounded-lg border border-red-100 flex flex-col items-start gap-2">
                                <div><span className="font-bold text-red-800">Error:</span> {res.error}</div>
                                <Button size="sm" variant="outline" className="h-7 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 border-red-200 px-3 text-[11px]" onClick={() => handleRetry(post.id)}>
                                  <RefreshCw className="w-3 h-3 mr-1.5" /> Retry {res.platform}
                                </Button>
                              </div>
                            )}
                            
                            {res.permalinkUrl && (
                              <a href={res.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 w-fit">
                                <ExternalLink className="w-3 h-3" /> View live post
                              </a>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-slate-500 bg-white p-3 rounded-xl border border-dashed border-slate-300">
                        No platform targets found for this post yet.
                      </div>
                    )}
                  </div>
                  
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
              <p className="text-sm text-slate-500 bg-white border border-slate-200 h-10 inline-flex items-center px-4 rounded-xl shadow-sm tabular-nums">
                Page <span className="text-slate-900 font-bold">{currentPage}</span> of <span className="text-slate-900 font-bold">{totalPages}</span> <span className="text-slate-400 mx-1">|</span> Total Results: {totalItems}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="px-4" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1 || localLoading}>
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                <Button variant="outline" className="px-4" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || localLoading}>
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
