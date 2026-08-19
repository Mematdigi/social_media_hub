import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Plus, RefreshCw, Calendar, Share2, 
  ExternalLink, ChevronLeft, ChevronRight, Search, LayoutGrid, Image, Settings2, ShieldAlert, CheckCircle2, AlertCircle, Clock
} from 'lucide-react'; 
import { PageWrapper } from '../components/layout/PageWrapper';
import { PostCard } from '../components/posts/PostCard';
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
        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-md">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900">Posts Database</h1>
              <p className="text-slate-600 font-medium mt-1">Configure your feed before loading</p>
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-3xl mx-auto mt-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800">What would you like to load?</h2>
            <p className="text-slate-500 mt-2 font-medium">Select your filters to pull the exact posts you want.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Target Platform</label>
              <select
                value={activePlatformFilter}
                onChange={(e) => { setActivePlatformFilter(e.target.value); setActiveChannelFilter('all'); }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold"
              >
                {platformTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Specific Channel/Page</label>
              <select
                value={activeChannelFilter}
                onChange={(e) => setActiveChannelFilter(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold"
              >
                {availableChannels
                  .filter(t => activePlatformFilter === 'all' || t.platform === 'all' || t.platform === activePlatformFilter)
                  .map(t => <option key={t.id} value={t.id}>{t.label}</option>)
                }
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
              <select
                value={activeStatusFilter}
                onChange={(e) => setActiveStatusFilter(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold"
              >
                {statusTabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Number of Posts</label>
              <select
                value={activeLimit}
                onChange={(e) => setActiveLimit(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none text-sm bg-slate-50 hover:bg-white focus:bg-white focus:border-indigo-400 transition-all cursor-pointer font-semibold"
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
            className="w-full py-4 text-base rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md hover:shadow-lg transition-all"
          >
            Load Posts Feed
          </Button>
        </motion.div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
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

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-8 space-y-6">
        
        <div className="flex flex-col lg:flex-row gap-6">
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

      {localLoading ? (
        <div className="py-20 flex justify-center"><PageLoader /></div>
      ) : allPosts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <FileText className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">No posts found</h3>
          <p className="text-slate-500 text-sm font-medium">No records match your exact server filters. Try adjusting the dropdowns above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {allPosts.map((post, index) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ delay: 0.02 * index }}
                className={`bg-white rounded-3xl border ${post.status === 'failed' ? 'border-red-300 shadow-red-100' : 'border-slate-200'} p-6 shadow-sm hover:shadow-md transition-all flex flex-col`}
              >
                {/* ── 1. Main Post Body ── */}
                <div className="flex gap-6 flex-col md:flex-row pb-6">
                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="flex-shrink-0 md:w-56">
                      <div className="relative rounded-2xl overflow-hidden bg-slate-100 h-40 md:h-48 shadow-inner border border-slate-200 flex items-center justify-center">
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

                  <div className="flex-1 min-w-0">
                    {post.youtubeTitle && (
                      <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-100 shadow-sm">
                        YT: {post.youtubeTitle}
                      </div>
                    )}
                    <PostCard post={post} onDelete={handleDelete} />
                  </div>
                </div>

                {/* ── 2. NEW: Database User & Audit Log ── */}
                <div className="mt-auto bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-inner">
                  
                  {/* Top Bar: Who & When (Pulled directly from DB User Schema) */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 border-b border-slate-200 mb-4 gap-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-indigo-500" />
                      <span className="font-bold text-slate-800">Publishing Audit Log</span>
                    </div>

                    <div className="text-right flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-xs">
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-1">Target Pages & Delivery Times</span>
                    
                    {post.platformResults && post.platformResults.length > 0 ? (
                      post.platformResults.map((res, rIdx) => {
                        // Gather specific page names for Facebook
                        const specificPageNames = res.pages && res.pages.length > 0 
                          ? res.pages.map(p => p.pageName).join(', ') 
                          : res.pageName;
                          
                        return (
                          <div key={rIdx} className={`bg-white rounded-xl border p-3 flex flex-col gap-2 shadow-sm ${res.status === 'failed' ? 'border-red-300' : 'border-slate-200'}`}>
                            
                            {/* Top Row: Status, Platform, Time */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {res.status === 'published' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                <span className="font-bold text-sm capitalize text-slate-800">{res.platform}</span>
                                {specificPageNames && (
                                  <>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                    <span className="font-semibold text-xs md:text-sm text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 truncate max-w-[200px] md:max-w-xs">
                                      {specificPageNames}
                                    </span>
                                  </>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                  <Clock className="w-3 h-3" />
                                  {formatAuditDate(res.attemptedAt || res.publishedAt || post.publishedAt || post.createdAt)}
                                </span>
                                <span className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wide font-black border ${
                                  res.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                  {res.status}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Row: Error Display & Retry */}
                            {res.error && (
                              <div className="mt-2 text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200 font-mono flex flex-col items-start gap-2">
                                <div><span className="font-bold text-red-800">Error:</span> {res.error}</div>
                                <Button size="sm" variant="outline" className="h-7 bg-white text-red-700 hover:bg-red-100 border-red-200 font-bold px-3 text-[11px]" onClick={() => handleRetry(post.id)}>
                                  <RefreshCw className="w-3 h-3 mr-1.5" /> Retry {res.platform}
                                </Button>
                              </div>
                            )}
                            
                            {res.permalinkUrl && (
                              <a href={res.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 w-fit mt-1">
                                <ExternalLink className="w-3 h-3" /> View live post
                              </a>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm font-medium text-slate-500 italic bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        No platform targets found for this post yet.
                      </div>
                    )}
                  </div>
                  
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

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