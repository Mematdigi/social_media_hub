import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Plus, Filter, RefreshCw, Calendar, Share2, 
  ExternalLink, ChevronLeft, ChevronRight, Search, LayoutGrid, Image 
} from 'lucide-react'; 
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostCard } from '../components/posts/PostCard';
import { PageLoader } from '../components/common/Loader';
import { Button } from '../components/ui/button';
import { usePosts } from '../hooks/usePosts';
import { toast } from 'sonner';

const statusTabs = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'scheduled', label: 'Scheduled' },
];

const dateTabs = [
  { id: 'all',      label: 'All Time' },
  { id: 'today',    label: 'Today' },
  { id: 'week',     label: 'This Week' },
  { id: 'month',    label: 'This Month' },
];

export default function Posts() {
  const navigate = useNavigate();
  const { fetchPosts, deletePost, syncPosts, syncing } = usePosts();
  
  // ── Master Client-Side Data States ───────────────────────────────────────
  const [allPosts, setAllPosts] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState({}); // Tracking broken Meta URL signatures
  
  // ── Filter States ────────────────────────────────────────────────────────
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activeDateFilter, setActiveDateFilter] = useState('all');
  const [activePlatformFilter, setActivePlatformFilter] = useState('all');
  const [activeChannelFilter, setActiveChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // ── 📊 FRONTEND PAGINATION ───────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // ════════════════════════════════════════════════════════════
  // 🌟 Clean Master Data Fetcher (Bypasses Backend Pagination Limits)
  // ════════════════════════════════════════════════════════════
  const loadPostsMasterData = useCallback(async () => {
    try {
      setLocalLoading(true);
      // Forces backend to dump entire profile dataset at once
      const response = await fetchPosts({ page: 1, limit: 999999, status: '' });
      const records = response?.posts || response?.data?.posts || (Array.isArray(response) ? response : []);
      
      if (Array.isArray(records)) {
        setAllPosts(records);
      }
    } catch (err) {
      console.error('Master dataset pull failure:', err);
      toast.error('Failed to collect latest feed data updates.');
    } finally {
      setLocalLoading(false);
    }
  }, [fetchPosts]);

  // Initial runtime loader trigger on component render mount
  useEffect(() => {
    loadPostsMasterData();
  }, [loadPostsMasterData]);

  // ════════════════════════════════════════════════════════════
  // Dynamic Tab Extractors
  // ════════════════════════════════════════════════════════════
  const platformTabs = useMemo(() => {
    const allPlatforms = new Set();
    allPosts.forEach(post => {
      if (Array.isArray(post.platforms)) post.platforms.forEach(p => allPlatforms.add(p));
      if (Array.isArray(post.platformResults)) post.platformResults.forEach(r => { if (r.platform) allPlatforms.add(r.platform); });
    });
    return [
      { id: 'all', label: 'All Platforms' },
      ...Array.from(allPlatforms).sort().map(p => ({
        id: p,
        label: p === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1)
      }))
    ];
  }, [allPosts]);

  // 🌟 ENHANCED: Extracts exact account and page names dynamically for the dropdown list
  const channelTabs = useMemo(() => {
    const channelMap = new Map(); // Key: accountId/pageId, Value: { label, platform }

    allPosts.forEach(post => {
      if (Array.isArray(post.platformResults)) {
        post.platformResults.forEach(res => {
          // 1. Map YouTube Channels by Name
          if (res.platform === 'youtube' && res.accountId) {
            const labelName = post.youtubeTitle ? `📺 ${post.youtubeTitle.substring(0, 20)}... (YT)` : '🎥 YouTube Channel';
            channelMap.set(res.accountId, { label: labelName, platform: 'youtube' });
          } 
          // 2. Map Facebook & Instagram Pages by Name
          else if (res.pageId && res.pageName) {
            const prefix = res.platform === 'facebook' ? '📘' : '📷';
            channelMap.set(res.pageId, { label: `${prefix} ${res.pageName}`, platform: res.platform });
          } 
          // 3. Fallback for Explicit Handles
          else if (res.igUsername) {
            channelMap.set(res.igUsername, { label: `📷 @${res.igUsername}`, platform: 'instagram' });
          }
        });
      }
    });

    return [
      { id: 'all', label: 'All Connected Channels / Pages', platform: 'all' },
      ...Array.from(channelMap.entries()).map(([id, data]) => ({ id, label: data.label, platform: data.platform }))
    ];
  }, [allPosts]);

  // ════════════════════════════════════════════════════════════
  // 🌟 Complete Client-Side Filtering Engine
  // ════════════════════════════════════════════════════════════
  const filteredPostsList = useMemo(() => {
    return allPosts.filter((post) => {
      // 1. Status Filter
      if (activeStatusFilter !== 'all' && post.status !== activeStatusFilter) return false;

      // 2. Date Filter
      if (activeDateFilter !== 'all') {
        const postDate = new Date(post.createdAt);
        const today = new Date(); today.setHours(0,0,0,0);
        const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);
        
        if (activeDateFilter === 'today' && postDate < today) return false;
        if (activeDateFilter === 'week' && postDate < weekAgo) return false;
        if (activeDateFilter === 'month' && postDate < monthAgo) return false;
      }

      // 3. Network Platform Filter
      if (activePlatformFilter !== 'all') {
        const hasTopPlatform = post.platforms?.includes(activePlatformFilter);
        const hasResultPlatform = post.platformResults?.some(r => r.platform === activePlatformFilter);
        if (!hasTopPlatform && !hasResultPlatform) return false;
      }

      // 4. Exact Sub-Channel / Page Dropdown Selector Rule
      if (activeChannelFilter !== 'all') {
        const matchesChannel = post.platformResults?.some(r => 
          r.accountId === activeChannelFilter || r.pageId === activeChannelFilter || r.igUsername === activeChannelFilter
        );
        if (!matchesChannel) return false;
      }

      // 5. Interactive Text Search Bar Filter
      if (searchQuery.trim() !== '') {
        const normalizedQuery = searchQuery.toLowerCase();
        const contentMatch = post.content?.toLowerCase().includes(normalizedQuery);
        const titleMatch   = post.youtubeTitle?.toLowerCase().includes(normalizedQuery);
        const pageMatch    = post.platformResults?.some(r => r.pageName?.toLowerCase().includes(normalizedQuery));
        if (!contentMatch && !titleMatch && !pageMatch) return false;
      }

      return true;
    });
  }, [allPosts, activeStatusFilter, activeDateFilter, activePlatformFilter, activeChannelFilter, searchQuery]);

  const totalPages = Math.ceil(filteredPostsList.length / itemsPerPage);
  
  const paginatedPostsDisplay = useMemo(() => {
    const offsetStart = (currentPage - 1) * itemsPerPage;
    return filteredPostsList.slice(offsetStart, offsetStart + itemsPerPage);
  }, [filteredPostsList, currentPage]);

  const handleDelete = async (postId, deleteFromPlatform = true) => {
    try {
      await deletePost(postId, deleteFromPlatform);
      toast.success('Post deleted successfully.');
      setAllPosts(prev => prev.filter(p => p.id !== postId));
    } catch (error) {
      toast.error('Failed to delete post.');
    }
  };
  
  const handleSync = async () => {
    try {
      await syncPosts();
      toast.success('Cross-platform account synchronization complete!');
      await loadPostsMasterData(); 
      setCurrentPage(1);
    } catch (error) {
      toast.error('Sync request failed.');
    }
  };

  // Helper function to figure out the best name banner for a fallback cover placeholder
  const getPostBrandName = (post) => {
    if (post.platformResults?.[0]?.pageName) return post.platformResults[0].pageName;
    if (post.youtubeTitle) return 'YouTube';
    return post.platforms?.[0] || 'Social';
  };

  if (localLoading && allPosts.length === 0) {
    return (
      <PageWrapper title="Posts">
        <PageLoader />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Posts</h1>
              <p className="text-slate-600">Manage all your cross-platform content tasks</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Platforms'}
            </Button>

            <Button
              className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 shadow-button"
              onClick={() => navigate('/posts/new')}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Post
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Search Input Bar */}
      <div className="mb-6 relative max-w-md w-full">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          placeholder="Search post content, titles, hashtags..."
          className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50/50 outline-none text-sm bg-white shadow-sm"
        />
      </div>

      {/* Status Tabs */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-600">
          <Filter className="w-4 h-4" /> Status
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveStatusFilter(tab.id); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activeStatusFilter === tab.id ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Filter Tabs */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-600">
          <Calendar className="w-4 h-4" /> Date Range
        </div>
        <div className="flex gap-2 flex-wrap">
          {dateTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveDateFilter(tab.id); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                activeDateFilter === tab.id ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Platform & Extended Channel Filter Selectors row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-600">
            <Share2 className="w-4 h-4" /> Platform Group
          </div>
          <div className="flex gap-2 flex-wrap">
            {platformTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActivePlatformFilter(tab.id); setActiveChannelFilter('all'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                  activePlatformFilter === tab.id ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-slate-600">
            <LayoutGrid className="w-4 h-4" /> Filter by Specific Channel / Page Name
          </div>
          <select
            value={activeChannelFilter}
            onChange={(e) => { setActiveChannelFilter(e.target.value); setCurrentPage(1); }}
            className="w-full max-w-xs px-3 py-2 rounded-2xl border border-slate-200 outline-none text-sm bg-white shadow-sm cursor-pointer font-medium text-slate-700"
          >
            {channelTabs
              .filter(t => activePlatformFilter === 'all' || t.platform === 'all' || t.platform === activePlatformFilter)
              .map(t => <option key={t.id} value={t.id}>{t.label}</option>)
            }
          </select>
        </div>
      </div>

      {/* Posts Feed Stack */}
      {paginatedPostsDisplay.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center shadow-card">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">No posts match filters</h3>
          <p className="text-slate-500 text-sm">Try adjusting your search keywords or clearing active platform tags.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {paginatedPostsDisplay.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ delay: 0.02 * index }}
                className="bg-white rounded-3xl border border-slate-100 p-6 shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="flex gap-6 flex-col md:flex-row">
                  
                  {/* Media Thumbnail Container */}
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex-shrink-0 md:w-48">
                      <div className="relative rounded-2xl overflow-hidden bg-slate-100 h-32 md:h-40 shadow-sm border border-slate-200 flex items-center justify-center">
                        
                        {/* ✅ FIX: If the Meta CDN asset has thrown an image loading error flag, swap with placeholder layout banner instantly */}
                        {imageErrors[post.id] ? (
                          <div className={`w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br ${
                            post.platforms?.[0] === 'facebook' ? 'from-blue-500 to-indigo-600' : 'from-pink-500 via-purple-500 to-orange-500'
                          } text-white`}>
                            <Image className="w-5 h-5 mb-1.5 opacity-80" />
                            <span className="text-[11px] font-bold tracking-wide uppercase truncate max-w-full">
                              {getPostBrandName(post)}
                            </span>
                            <span className="text-[9px] opacity-60 mt-0.5 font-medium">Post Attached</span>
                          </div>
                        ) : post.mediaUrls[0].match(/\.(mp4|webm|ogg|mov)$/i) ? (
                          <video src={post.mediaUrls[0]} className="w-full h-full object-cover" />
                        ) : (
                          <img 
                            src={post.mediaUrls[0]} 
                            alt="Post cover thumbnail" 
                            className="w-full h-full object-cover" 
                            onError={() => {
                              setImageErrors(prev => ({ ...prev, [post.id]: true }));
                            }}
                          />
                        )}
                        
                      </div>
                    </div>
                  )}

                  {/* Post Content Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      {post.youtubeTitle && (
                        <div className="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-50 text-red-700 text-xs font-bold border border-red-100">
                          YT: {post.youtubeTitle}
                        </div>
                      )}
                      <PostCard post={post} onDelete={handleDelete} />
                    </div>

                    {/* Action Permalink Buttons */}
                    {post.platformResults && post.platformResults.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                        {post.platformResults.map((res, rIdx) => res.permalinkUrl && (
                          <a
                            key={rIdx} href={res.permalinkUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View on {res.platform === 'youtube' ? 'YouTube' : res.platform.charAt(0).toUpperCase() + res.platform.slice(1)}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-8">
              <p className="text-sm font-medium text-slate-500">
                Showing page <span className="text-slate-900 font-semibold">{currentPage}</span> of <span className="text-slate-900 font-semibold">{totalPages}</span> ({filteredPostsList.length} filtered items)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm" className="rounded-full px-4 border-slate-200 text-slate-600"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline" size="sm" className="rounded-full px-4 border-slate-200 text-slate-600"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}
                >
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