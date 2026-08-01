import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Plus, Filter, RefreshCw, Calendar, Share2, 
  ExternalLink, ChevronLeft, ChevronRight, Search, LayoutGrid, Image, Settings2 
} from 'lucide-react'; 
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostCard } from '../components/posts/PostCard';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { accountsAPI } from '../services/api';
import { toast } from 'sonner';

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
  { id: 'youtube',   label: 'YouTube' }
];

export default function Posts() {
  const navigate = useNavigate();
  const { fetchPosts, deletePost, syncPosts, retryFailedPost, syncing } = usePosts();

  const [allPosts, setAllPosts] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({}); 
  
  // ── Manual Control States ─────────────────────────────────────────
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activePlatformFilter, setActivePlatformFilter] = useState('all');
  const [activeChannelFilter, setActiveChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // ── SERVER-SIDE PAGINATION STATES ─────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const [activeLimit, setActiveLimit] = useState(10); // NEW: Manual Limit Dropdown
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // ── Dedicated Channel Extractor ───────────────────────────────────
  const [availableChannels, setAvailableChannels] = useState([{ id: 'all', label: 'All Connected Channels', platform: 'all' }]);

  // Fetch accounts ONCE to build the specific channel dropdown independent of post count
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

  // ════════════════════════════════════════════════════════════
  // 🚀 FAST SERVER-SIDE FETCHER
  // ════════════════════════════════════════════════════════════
  const loadPostsTargetedData = useCallback(async () => {
    try {
      setLocalLoading(true);
      
      const params = {
        page: currentPage,
        limit: activeLimit,
      };
      
      if (activeStatusFilter !== 'all') params.status = activeStatusFilter;
      if (activePlatformFilter !== 'all') params.platform = activePlatformFilter;
      if (activeChannelFilter !== 'all') params.channel = activeChannelFilter;
      if (searchQuery.trim() !== '') params.search = searchQuery;

      const response = await fetchPosts(params);
      
      setAllPosts(response?.posts || response?.data?.posts || []);
      
      if (response?.pagination || response?.data?.pagination) {
        const pData = response.pagination || response.data.pagination;
        setTotalPages(pData.totalPages);
        setTotalItems(pData.total);
      }
    } catch (err) {
      toast.error('Failed to collect latest feed data.');
    } finally {
      setLocalLoading(false);
    }
  }, [fetchPosts, currentPage, activeLimit, activeStatusFilter, activePlatformFilter, activeChannelFilter, searchQuery]);

  // Execute fetch when ANY parameter changes
  useEffect(() => {
    loadPostsTargetedData();
  }, [loadPostsTargetedData]);

  const handleDelete = async (postId, deleteFromPlatform = true) => {
    // 🆕 Live platform posts (id starts with "live-") aren't saved in our database —
    // there's nothing here to delete. Point the user to the platform itself instead.
    if (typeof postId === 'string' && postId.startsWith('live-')) {
      toast.error("This post wasn't published through SocialHub — delete it directly on the platform instead.");
      return;
    }
    try {
      await deletePost(postId, deleteFromPlatform);
      toast.success('Post deleted successfully.');
      loadPostsTargetedData(); // Refresh list to ensure accurate pagination
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

  return (
    <PageWrapper>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-md">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Posts Database</h1>
              <p className="text-slate-600 font-medium mt-1">Manage and sync your cross-platform content</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Platforms'}
            </Button>
            <Button className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-6 font-semibold" onClick={() => navigate('/posts/new')}>
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Control Panel (Search + Status + Dynamic Filters) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-8 space-y-6">
        
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Text Search */}
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
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/50 outline-none text-sm bg-slate-50/50 hover:bg-white transition-all font-medium text-slate-800"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveStatusFilter(tab.id); setCurrentPage(1); }}
                className={`px-5 py-2 rounded-xl font-bold text-sm transition-all ${
                  activeStatusFilter === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-slate-100" />

        {/* Server-Side Load Limiters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Share2 className="w-3.5 h-3.5" /> Filter by Platform
            </div>
            <select
              value={activePlatformFilter}
              onChange={(e) => { setActivePlatformFilter(e.target.value); setActiveChannelFilter('all'); setCurrentPage(1); }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold text-slate-700"
            >
              {platformTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <LayoutGrid className="w-3.5 h-3.5" /> Specific Page / Channel
            </div>
            <select
              value={activeChannelFilter}
              onChange={(e) => { setActiveChannelFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold text-slate-700"
            >
              {availableChannels
                .filter(t => activePlatformFilter === 'all' || t.platform === 'all' || t.platform === activePlatformFilter)
                .map(t => <option key={t.id} value={t.id}>{t.label}</option>)
              }
            </select>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Settings2 className="w-3.5 h-3.5" /> Posts to Load (Limit)
            </div>
            <select
              value={activeLimit}
              onChange={(e) => { setActiveLimit(Number(e.target.value)); setCurrentPage(1); }}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold text-indigo-700"
            >
              <option value={10}>Load 10 Posts</option>
              <option value={25}>Load 25 Posts</option>
              <option value={50}>Load 50 Posts</option>
              <option value={100}>Load 100 Posts</option>
            </select>
          </div>
        </div>
      </div>

      {/* Posts Feed Stack */}
      {localLoading ? (
        <div className="py-20 flex justify-center"><PageLoader /></div>
      ) : allPosts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <FileText className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">No posts found</h3>
          <p className="text-slate-500 text-sm font-medium">No records match your exact server filters. Try increasing the load limit or clearing tags.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="popLayout">
            {allPosts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: 0.02 * index }}
                className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-6 md:gap-8 flex-col md:flex-row">
                  
                  {/* Media Thumbnail Container */}
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex-shrink-0 md:w-56">
                      <div className="relative rounded-2xl overflow-hidden bg-slate-100 h-40 md:h-48 shadow-sm border border-slate-200 flex items-center justify-center">
                        {imageErrors[post.id] ? (
                          <div className={`w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br ${
                            post.platforms?.[0] === 'facebook' ? 'from-blue-500 to-indigo-600' : 'from-pink-500 via-purple-500 to-orange-500'
                          } text-white`}>
                            <Image className="w-6 h-6 mb-2 opacity-80" />
                            <span className="text-xs font-bold tracking-wide uppercase truncate max-w-full">{getPostBrandName(post)}</span>
                            <span className="text-[10px] opacity-70 mt-1 font-medium">Attachment Missing</span>
                          </div>
                        ) : post.mediaUrls[0].match(/\.(mp4|webm|ogg|mov)$/i) ? (
                          <video src={post.mediaUrls[0]} className="w-full h-full object-cover" />
                        ) : (
                          <img 
                            src={post.mediaUrls[0]} alt="Post cover thumbnail" className="w-full h-full object-cover" 
                            onError={() => setImageErrors(prev => ({ ...prev, [post.id]: true }))}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Post Content Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      {post.youtubeTitle && (
                        <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-100 shadow-sm">
                          YT: {post.youtubeTitle}
                        </div>
                      )}
                      <PostCard post={post} onDelete={handleDelete} />
                    </div>

                    {/* Action Permalink Buttons */}
                    {post.platformResults && post.platformResults.length > 0 && (
                      <div className="flex flex-wrap gap-2.5 mt-5 pt-5 border-t border-slate-100">
                        {post.platformResults.map((res, rIdx) => res.permalinkUrl && (
                          <a
                            key={rIdx} href={res.permalinkUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>View on {res.platform === 'youtube' ? 'YouTube' : res.platform.charAt(0).toUpperCase() + res.platform.slice(1)}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* 🆕 Publish Audit + Timing + Failure Detail Block */}
                    <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
                      {/* Posted directly on the platform — not through SocialHub */}
                      {post.notSaved && (
                        <div className="inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">
                          <Share2 className="w-3.5 h-3.5" />
                          <span>
                            Posted directly on {post.platforms?.[0] ? post.platforms[0].charAt(0).toUpperCase() + post.platforms[0].slice(1) : 'the platform'} — not published via SocialHub
                          </span>
                          {post.publishedAt && (
                            <span className="opacity-70 font-medium">
                              · {new Date(post.publishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Published through SocialHub — show who + when */}
                      {!post.notSaved && post.publishedBy && (
                        <p className="text-xs font-medium text-slate-500">
                          Published via <span className="font-bold text-indigo-600">SocialHub</span> by{' '}
                          <span className="font-bold text-slate-700">{post.publishedBy.name || post.publishedBy.email || post.publishedBy.userId}</span>
                          {post.publishedBy.email && <span> ({post.publishedBy.email})</span>}
                          {post.publishedAt && <span> • {new Date(post.publishedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                        </p>
                      )}

                      {/* Draft / scheduled, not yet published — show who created it and when */}
                      {!post.notSaved && !post.publishedBy && post.createdBy && (
                        <p className="text-xs font-medium text-slate-500">
                          Created via <span className="font-bold text-indigo-600">SocialHub</span> by{' '}
                          <span className="font-bold text-slate-700">{post.createdBy.name || post.createdBy.email || post.createdBy.userId}</span>
                          {post.createdBy.email && <span> ({post.createdBy.email})</span>}
                          {post.createdAt && <span> • {new Date(post.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                        </p>
                      )}

                      {post.status === 'failed' && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                          <p className="text-xs font-bold text-red-700 mb-1">Publish failed</p>
                          {post.publishError && <p className="text-xs text-red-600 mb-2">{post.publishError}</p>}
                          {post.lastAttemptAt && (
                            <p className="text-[11px] text-red-400 mb-3">
                              Last attempt: {new Date(post.lastAttemptAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg border-red-200 text-red-700 hover:bg-red-100 font-semibold text-xs"
                            onClick={() => handleRetry(post.id)}
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Failed Platforms
                          </Button>
                        </div>
                      )}

                      {post.platformResults && post.platformResults.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {post.platformResults.map((res, rIdx) => (
                            <div
                              key={rIdx}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                res.status === 'published' ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                : res.status === 'failed' ? 'bg-red-50 border-red-100 text-red-700'
                                : 'bg-slate-50 border-slate-100 text-slate-500'
                              }`}
                              title={res.error || ''}
                            >
                              <span className="capitalize">{res.platform}</span>
                              {res.pageName && <span className="opacity-70">· {res.pageName}</span>}
                              <span className="opacity-60">· {res.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Server-Side Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-8 mt-10">
              <p className="text-sm font-medium text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
                Page <span className="text-slate-900 font-bold">{currentPage}</span> of <span className="text-slate-900 font-bold">{totalPages}</span> <span className="text-slate-400 mx-1">|</span> Total Results: {totalItems}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl px-5 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 shadow-sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1 || localLoading}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                </Button>
                <Button variant="outline" className="rounded-xl px-5 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 shadow-sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || localLoading}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}