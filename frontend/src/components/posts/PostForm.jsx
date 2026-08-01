import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Calendar, Send, Loader2, Youtube, FileText, Tag, Lock, Globe, Users, Camera, LayoutGrid, Image as ImageIcon, Share2 } from 'lucide-react';
import { Button } from '../ui/button';
import { accountsAPI } from '../../services/api';
import { toast } from 'sonner';

const MEDIA_FORMATS = {
  facebook: { label: 'Facebook Post', accepted: '.jpg,.jpeg,.png,.gif,.mp4,.mov' },
  instagram_feed: { label: 'Instagram Feed', accepted: '.jpg,.jpeg,.png,.gif' },
  instagram_reel: { label: 'Instagram Reel (9:16)', accepted: '.mp4,.mov' },
  instagram_story: { label: 'Instagram Story (9:16)', accepted: '.jpg,.jpeg,.png,.gif,.mp4' },
  youtube: { label: 'YouTube Video', accepted: '.mp4,.mov,.avi,.mkv' },
  twitter: { label: 'Twitter/X', accepted: '.jpg,.jpeg,.png,.gif,.mp4,.mov' },
  tiktok: { label: 'TikTok (9:16)', accepted: '.mp4,.mov' },
  linkedin: { label: 'LinkedIn', accepted: '.jpg,.jpeg,.png,.gif,.mp4,.mov' },
};

const YOUTUBE_CATEGORIES = [
  { id: '1',  label: 'Film & Animation' },
  { id: '2',  label: 'Autos & Vehicles' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '22', label: 'People & Blogs' },
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '25', label: 'News & Politics' },
  { id: '26', label: 'Howto & Style' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
  { id: '29', label: 'Nonprofits & Activism' },
];

const YOUTUBE_PRIVACY_OPTIONS = [
  { value: 'public',   label: 'Public',   icon: Globe,  desc: 'Anyone can search for and view' },
  { value: 'unlisted', label: 'Unlisted', icon: Users,  desc: 'Anyone with the link can view' },
  { value: 'private',  label: 'Private',  icon: Lock,   desc: 'Only you can view' },
];

const formatDateTimeLocal = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString().slice(0, 16);
};

const SectionCard = ({ title, icon: Icon, children, subtitle }) => (
  <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
    <div className="flex items-center gap-3 border-b border-slate-100 pb-5 mb-2">
      <div className="w-10 h-10 rounded-xl bg-indigo-50/80 flex items-center justify-center border border-indigo-100/50">
        <Icon className="w-5 h-5 text-indigo-600" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

export const PostForm = ({ initialData = null, initialPost = null, onSubmit, loading }) => {
  const initial = initialData || initialPost || null;

  // ✨ UNIFIED TITLE: Replaces youtubeTitle so it applies to all platforms
  const [postTitle, setPostTitle]       = useState(initial?.youtubeTitle || initial?.title || '');
  const [content, setContent]           = useState(initial?.content || '');
  const [mediaUrls, setMediaUrls]       = useState(initial?.mediaUrls || []);
  const [mediaFormats, setMediaFormats] = useState(initial?.mediaFormats || {});

  const [youtubeTags,        setYoutubeTags]        = useState(initial?.youtubeTags?.join(', ') || '');
  const [youtubeCategory,    setYoutubeCategory]    = useState(initial?.youtubeCategory || '22');
  const [youtubePrivacy,     setYoutubePrivacy]     = useState(initial?.youtubePrivacy || 'public');
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(initial?.youtubeMadeForKids || false);

  const [selectedAccounts, setSelectedAccounts] = useState(initial?.accountIds || []);
  const [selectedPages,    setSelectedPages]    = useState(initial?.selectedPages || {});
  const [activeGroups, setActiveGroups] = useState([]);

  const [status,      setStatus]      = useState(initial?.status || 'draft');
  const [scheduledAt, setScheduledAt] = useState(formatDateTimeLocal(initial?.scheduledAt));
  
  const [accounts,    setAccounts]    = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('facebook');
  const [youtubeThumbnail, setYoutubeThumbnail] = useState(initial?.youtubeThumbnail || '');
  const [uploadingThumb, setUploadingThumb] = useState(false);
  
  // ✨ FIX: Strict locking state to completely prevent double-click publishing
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getPlatforms();
      const data = response.data || response;
      setAccounts(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load accounts');
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const newUrls = [...mediaUrls];
      const newFormats = { ...mediaFormats };

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await accountsAPI.uploadMedia(formData, (progress) => {
          setUploadProgress(progress);
        });

        const { url } = response.data || response;
        newUrls.push(url);
        newFormats[url] = selectedFormat;
      }

      setMediaUrls(newUrls);
      setMediaFormats(newFormats);
      toast.success(`${files.length} file(s) uploaded successfully`);
    } catch (error) {
      toast.error('Failed to upload file(s)');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingThumb(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await accountsAPI.uploadMedia(formData);
      const { url } = response.data || response;

      setYoutubeThumbnail(url);
      toast.success('Video thumbnail attached successfully!');
    } catch (error) {
      toast.error('Failed to upload thumbnail');
    } finally {
      setUploadingThumb(false);
    }
  };

  const removeMedia = (index) => {
    const url        = mediaUrls[index];
    const newUrls    = mediaUrls.filter((_, i) => i !== index);
    const newFormats = { ...mediaFormats };
    delete newFormats[url];
    setMediaUrls(newUrls);
    setMediaFormats(newFormats);
  };

  const handleAccountToggle = (accountId, isChecked, accountData) => {
    if (isChecked) {
      setSelectedAccounts(prev => [...prev, accountId]);
      if (accountData.pages && accountData.pages.length > 0) {
        setSelectedPages(prev => ({
          ...prev,
          [accountId]: [],
        }));
      }
    } else {
      setSelectedAccounts(prev => prev.filter(id => id !== accountId));
      setSelectedPages(prev => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }
  };

  const handlePageToggle = (accountId, pageId, isChecked) => {
    setSelectedPages(prev => {
      const currentPages = prev[accountId] || [];
      if (isChecked) {
        return { ...prev, [accountId]: [...currentPages, pageId] };
      } else {
        return { ...prev, [accountId]: currentPages.filter(id => id !== pageId) };
      }
    });
  };

  const handleGroupToggle = (groupName, isChecked) => {
    if (isChecked) {
      setActiveGroups(prev => [...prev, groupName]);
    } else {
      setActiveGroups(prev => prev.filter(g => g !== groupName));
      if (groupName === 'instagram') {
        const ids = igAccounts.map(i => i.account.id || i.account._id);
        setSelectedAccounts(prev => prev.filter(id => !ids.includes(id)));
      }
      if (groupName === 'youtube') {
        const ids = ytAccounts.map(i => i.account.id || i.account._id);
        setSelectedAccounts(prev => prev.filter(id => !ids.includes(id)));
      }
    }
  };

  const connectedAccountsList = React.useMemo(() => {
    const items = [];
    accounts.forEach(platformGroup => {
      if (platformGroup.connected && Array.isArray(platformGroup.accounts)) {
        platformGroup.accounts.forEach(acc => {
          items.push({ platform: platformGroup.platform, account: acc });
        });
      } else if (platformGroup.connected && platformGroup.account) {
        items.push({ platform: platformGroup.platform, account: platformGroup.account });
      }
    });
    return items;
  }, [accounts]);

  const { displayList, igAccounts, ytAccounts } = React.useMemo(() => {
    const normal = [];
    const ig = [];
    const yt = [];
    connectedAccountsList.forEach(item => {
      if (item.platform === 'instagram') ig.push(item);
      else if (item.platform === 'youtube') yt.push(item);
      else normal.push(item);
    });
    return { displayList: normal, igAccounts: ig, ytAccounts: yt };
  }, [connectedAccountsList]);

  const isYoutubeSelected = selectedAccounts.some(accountId => {
    const matched = connectedAccountsList.find(
      item => (item.account.id === accountId || item.account._id === accountId)
    );
    return matched?.platform === 'youtube';
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // ✨ FIX: Strict locking to prevent double-click API spam
    if (isSubmitting || loading) return;
    setIsSubmitting(true);

    if (!content.trim() && !postTitle.trim()) {
      toast.error('Please write some content or a title');
      setIsSubmitting(false);
      return;
    }
    if (selectedAccounts.length === 0) {
      toast.error('Please select at least one destination account');
      setIsSubmitting(false);
      return;
    }
    if (isYoutubeSelected && !postTitle.trim()) {
      toast.error('A Post Title is required to publish to YouTube');
      setIsSubmitting(false);
      return;
    }
    if (scheduledAt && new Date(scheduledAt) < new Date()) {
      toast.error('Scheduled time must be in the future');
      setIsSubmitting(false);
      return;
    }

    const parsedTags = youtubeTags.split(',').map(t => t.trim()).filter(Boolean);

    // ✨ FIX: Inject the unified Title into the Content for FB & IG captions
    // We check if the content already starts with the title to prevent duplication when editing an old post
    let finalContent = content.trim();
    if (postTitle.trim()) {
      if (!finalContent.startsWith(postTitle.trim())) {
        finalContent = finalContent ? `${postTitle.trim()}\n\n${finalContent}` : postTitle.trim();
      }
    }

    const formData = {
      content:             finalContent,
      accountIds:          selectedAccounts,
      selectedPages,
      mediaUrls,
      mediaFormats,
      status:              scheduledAt ? 'scheduled' : status,
      scheduledAt:         scheduledAt ? new Date(scheduledAt).toISOString() : null,
      ...(isYoutubeSelected && {
        youtubeTitle:       postTitle.trim(),
        youtubeTags:        parsedTags,
        youtubeCategory,
        youtubePrivacy,
        youtubeMadeForKids,
        youtubeThumbnail,
      }),
    };

    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto pb-12">

      {/* ── 1. Content Composition ─────────────────────────────────────────── */}
      <SectionCard title="Compose Post" subtitle="Write the content for your post" icon={LayoutGrid}>
        
        {/* ✨ UNIFIED TITLE BOX: Placed here so it applies to Facebook, Instagram, and YouTube automatically */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Post Title <span className="text-slate-400 font-medium ml-1">(Required for YouTube)</span>
          </label>
          <input
            type="text"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
            placeholder="Enter a catchy title..."
            maxLength={100}
            className="w-full px-5 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-[15px] text-slate-800 placeholder:text-slate-400 transition-all shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Description / Caption
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What do you want to share?"
            rows={5}
            className="w-full px-5 py-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none transition-all text-[15px] text-slate-800 placeholder:text-slate-400 shadow-sm"
          />
          <div className="flex justify-between items-center mt-2">
            <div className="text-[11px] font-bold text-slate-400 bg-slate-100/80 px-2.5 py-1 rounded-md uppercase tracking-wide">
              {content.length} characters
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Media Upload ──────────────────────────────────────────────────── */}
      <SectionCard title="Media Attachments" subtitle="Upload photos or videos" icon={ImageIcon}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <label className="text-sm font-semibold text-slate-700 w-32">Format:</label>
          <div className="relative flex-1">
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="w-full appearance-none pl-4 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-slate-800 font-medium transition-all cursor-pointer"
            >
              {Object.entries(MEDIA_FORMATS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="relative">
          <input
            type="file"
            id="media-input"
            multiple
            accept="image/*,video/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
          <label
            htmlFor="media-input"
            className="flex flex-col items-center justify-center gap-4 px-4 py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-indigo-50/50 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer transition-all group"
          >
            {uploading ? (
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500" />
              </div>
            )}
            <div className="text-center space-y-1">
              <p className="font-semibold text-slate-700 text-base group-hover:text-indigo-700 transition-colors">
                {uploading ? `Uploading ${uploadProgress}%` : 'Click to browse or drag files here'}
              </p>
              <p className="text-sm text-slate-500">Support for high-res images & videos up to 100MB</p>
            </div>
          </label>
        </div>

        {uploading && uploadProgress > 0 && (
          <div className="mt-5">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {mediaUrls.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
              Attached Files ({mediaUrls.length})
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {mediaUrls.map((url, idx) => {
                const format  = mediaFormats[url] || 'unknown';
                const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group rounded-xl overflow-hidden bg-slate-100 shadow-sm border border-slate-200 aspect-square"
                  >
                    {isVideo ? (
                      <video src={url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={url} alt={`Media ${idx + 1}`} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-1 rounded-md">
                      {MEDIA_FORMATS[format]?.label || format}
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute top-2 right-2 bg-white text-slate-600 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all transform hover:scale-110 active:scale-95"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── 3. Destinations ──────────────────────────────────────── */}
      <SectionCard title="Destinations" subtitle="Select where to publish this post" icon={Share2}>
        <div className="space-y-4 pt-2">
          {connectedAccountsList.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <p className="text-sm text-slate-500 font-medium">No connected accounts available</p>
            </div>
          ) : (
            <>
              {/* ── Facebook Accounts ─────────────────────────────────────── */}
              {displayList.map((item) => {
                const accountId         = item.account.id || item.account._id;
                const displayName       = item.account.accountName || item.account.name;
                const avatar            = item.account.profilePicture || item.account.avatarUrl;
                const hasPages          = item.account.pages && item.account.pages.length > 0;
                const isMainChecked     = selectedAccounts.includes(accountId);

                return (
                  <div key={`${item.platform}-${accountId}`} className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isMainChecked ? 'border-blue-400 shadow-md shadow-blue-500/5 ring-1 ring-blue-400' : 'border-slate-200 hover:border-slate-300'}`}>
                    <label className={`flex items-center gap-4 p-4 md:p-5 cursor-pointer transition-colors ${isMainChecked ? 'bg-blue-50/30' : 'bg-white hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={isMainChecked}
                        onChange={(e) => handleAccountToggle(accountId, e.target.checked, item.account)}
                        className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 w-4.5 h-4.5 cursor-pointer"
                      />
                      <img
                        src={avatar}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-100"
                        onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${item.platform}`; }}
                      />
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-sm">{displayName}</p>
                        <p className="text-xs text-slate-500 font-medium capitalize mt-0.5">{item.platform} Profile</p>
                      </div>
                    </label>

                    <AnimatePresence>
                      {hasPages && isMainChecked && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                          <div className="pb-5 px-5 bg-blue-50/30">
                            <div className="pl-12 border-l-2 border-blue-200/60 ml-6 py-2 space-y-2">
                              {item.account.pages.map((page) => (
                                <label key={page.pageId} className="flex items-center gap-3 cursor-pointer hover:bg-white/80 p-2.5 rounded-xl transition-colors group">
                                  <input
                                    type="checkbox"
                                    checked={selectedPages[accountId]?.includes(page.pageId) || false}
                                    onChange={(e) => handlePageToggle(accountId, page.pageId, e.target.checked)}
                                    className="rounded border-slate-300 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                                  />
                                  <div className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center group-hover:border-blue-300 transition-colors">
                                    <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" />
                                  </div>
                                  <span className="text-sm font-semibold text-slate-700">{page.pageName}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {/* ── Instagram Group Dropdown ───────────────────────── */}
              {igAccounts.length > 0 && (
                <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${activeGroups.includes('instagram') ? 'border-pink-400 shadow-md shadow-pink-500/5 ring-1 ring-pink-400' : 'border-slate-200 hover:border-slate-300'}`}>
                  <label className={`flex items-center gap-4 p-4 md:p-5 cursor-pointer transition-colors ${activeGroups.includes('instagram') ? 'bg-pink-50/30' : 'bg-white hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={activeGroups.includes('instagram')}
                      onChange={(e) => handleGroupToggle('instagram', e.target.checked)}
                      className="rounded-md border-slate-300 text-pink-500 focus:ring-pink-500 w-4.5 h-4.5 cursor-pointer"
                    />
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 p-[1.5px] shadow-sm">
                      <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                        <Camera className="w-4 h-4 text-pink-600" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">Instagram Network</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{igAccounts.length} Connected Accounts</p>
                    </div>
                  </label>

                  <AnimatePresence>
                    {activeGroups.includes('instagram') && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <div className="pb-5 px-5 bg-pink-50/30">
                          <div className="pl-12 border-l-2 border-pink-200/60 ml-6 py-2 space-y-2">
                            {igAccounts.map((item) => {
                              const accountId = item.account.id || item.account._id;
                              const displayName = item.account.pages?.[0]?.pageName || item.account.name || item.account.accountName;
                              const avatar = item.account.profilePicture || item.account.avatarUrl;
                              return (
                                <label key={accountId} className="flex items-center gap-3 cursor-pointer hover:bg-white/80 p-2.5 rounded-xl transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={selectedAccounts.includes(accountId)}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedAccounts(prev => [...prev, accountId]);
                                      else setSelectedAccounts(prev => prev.filter(id => id !== accountId));
                                    }}
                                    className="rounded border-slate-300 text-pink-500 focus:ring-pink-500 w-4 h-4 cursor-pointer"
                                  />
                                  <img src={avatar} alt={displayName} className="w-7 h-7 rounded-full object-cover shadow-sm border border-slate-200" onError={(e) => e.target.src = 'https://api.dicebear.com/7.x/initials/svg?seed=ig'}/>
                                  <span className="text-sm font-semibold text-slate-700">{displayName}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── YouTube Group Dropdown ─────────────────────────── */}
              {ytAccounts.length > 0 && (
                <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${activeGroups.includes('youtube') ? 'border-red-400 shadow-md shadow-red-500/5 ring-1 ring-red-400' : 'border-slate-200 hover:border-slate-300'}`}>
                  <label className={`flex items-center gap-4 p-4 md:p-5 cursor-pointer transition-colors ${activeGroups.includes('youtube') ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={activeGroups.includes('youtube')}
                      onChange={(e) => handleGroupToggle('youtube', e.target.checked)}
                      className="rounded-md border-slate-300 text-red-600 focus:ring-red-500 w-4.5 h-4.5 cursor-pointer"
                    />
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center border border-red-100 shadow-sm">
                      <Youtube className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">YouTube Channels</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{ytAccounts.length} Connected Channels</p>
                    </div>
                  </label>

                  <AnimatePresence>
                    {activeGroups.includes('youtube') && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <div className="pb-5 px-5 bg-red-50/30">
                          <div className="pl-12 border-l-2 border-red-200/60 ml-6 py-2 space-y-2">
                            {ytAccounts.map((item) => {
                              const accountId = item.account.id || item.account._id;
                              const displayName = item.account.accountName || item.account.name;
                              const avatar = item.account.profilePicture || item.account.avatarUrl;
                              return (
                                <label key={accountId} className="flex items-center gap-3 cursor-pointer hover:bg-white/80 p-2.5 rounded-xl transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={selectedAccounts.includes(accountId)}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedAccounts(prev => [...prev, accountId]);
                                      else setSelectedAccounts(prev => prev.filter(id => id !== accountId));
                                    }}
                                    className="rounded border-slate-300 text-red-500 focus:ring-red-500 w-4 h-4 cursor-pointer"
                                  />
                                  <img src={avatar} alt={displayName} className="w-7 h-7 rounded-full object-cover shadow-sm border border-slate-200" onError={(e) => e.target.src = 'https://api.dicebear.com/7.x/initials/svg?seed=yt'}/>
                                  <span className="text-sm font-semibold text-slate-700">{displayName}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>

      {/* ── 4. YouTube Extended Fields (Light UI) ──────────────────────── */}
      <AnimatePresence>
        {isYoutubeSelected && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-b from-red-50/50 to-white rounded-3xl p-6 md:p-8 shadow-sm space-y-6 border border-red-100 mt-2">
              <div className="flex items-center gap-3 mb-2 border-b border-red-100/60 pb-5">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-md shadow-red-500/20">
                  <Youtube className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-950">YouTube Extra Settings</h3>
                  <p className="text-xs text-slate-500 font-medium">Configure tags and privacy</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={youtubeTags}
                  onChange={(e) => setYoutubeTags(e.target.value)}
                  placeholder="e.g. tutorial, coding, vlog"
                  className="w-full px-5 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-red-400 focus:ring-4 focus:ring-red-500/10 outline-none text-sm text-slate-800 placeholder:text-slate-400 transition-all shadow-sm"
                />
                {youtubeTags.trim() && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {youtubeTags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs font-semibold shadow-sm">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
                  <select
                    value={youtubeCategory}
                    onChange={(e) => setYoutubeCategory(e.target.value)}
                    className="w-full appearance-none px-5 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-red-400 focus:ring-4 focus:ring-red-500/10 outline-none text-sm text-slate-800 cursor-pointer shadow-sm font-medium"
                  >
                    {YOUTUBE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Privacy Setting</label>
                  <select
                    value={youtubePrivacy}
                    onChange={(e) => setYoutubePrivacy(e.target.value)}
                    className="w-full appearance-none px-5 py-3.5 rounded-xl border border-slate-200 bg-white focus:border-red-400 focus:ring-4 focus:ring-red-500/10 outline-none text-sm text-slate-800 cursor-pointer shadow-sm font-medium"
                  >
                    {YOUTUBE_PRIVACY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3.5 cursor-pointer p-4 md:p-5 rounded-2xl bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50/30 transition-all shadow-sm">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={youtubeMadeForKids}
                      onChange={(e) => setYoutubeMadeForKids(e.target.checked)}
                      className="rounded-md border-slate-300 text-red-500 focus:ring-red-500 w-5 h-5 cursor-pointer"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Made for Kids</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">Marks your video as child-directed content to comply with COPPA.</p>
                  </div>
                </label>
              </div>

              <div className="border-t border-red-100 pt-6 mt-2">
                <label className="block text-sm font-bold text-slate-700 mb-3">Custom Video Thumbnail</label>
                <div className="flex flex-col sm:flex-row gap-5 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  {youtubeThumbnail ? (
                    <div className="relative w-48 h-28 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 shadow-sm">
                      <img src={youtubeThumbnail} alt="Thumbnail preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setYoutubeThumbnail('')}
                        className="absolute top-2 right-2 bg-slate-900/80 text-white p-1.5 rounded-lg hover:bg-red-500 transition-all active:scale-95 shadow-sm"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-48 h-28 flex flex-col items-center justify-center border-2 border-dashed border-red-200 rounded-xl bg-red-50/50 hover:bg-red-50 hover:border-red-400 cursor-pointer transition-all flex-shrink-0 group">
                      <input type="file" accept="image/png, image/jpeg" onChange={handleThumbnailUpload} className="hidden" disabled={uploadingThumb} />
                      {uploadingThumb ? (
                        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 text-red-400 group-hover:text-red-500 mb-2 transition-colors" />
                          <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide group-hover:text-red-800">Upload Cover</span>
                        </>
                      )}
                    </label>
                  )}
                  <div className="text-xs text-slate-500 leading-relaxed text-center sm:text-left">
                    <p className="font-bold text-slate-800 mb-1.5 text-sm">Upload a high-quality JPG or PNG.</p>
                    <p className="font-medium">For best results, use a 1280x720 image under 2MB. This is the first thing viewers see on your channel feed!</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 5. Publishing Options ──────────────────────────────────────────── */}
      <SectionCard title="Publishing Options" subtitle="Choose when to post" icon={Calendar}>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Schedule Date & Time (Optional)</label>
          <div className="relative">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-slate-800 font-medium transition-all cursor-pointer"
            />
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Calendar className="w-5 h-5 text-slate-400" />
            </div>
          </div>
          {scheduledAt && (
            <div className="mt-4 inline-flex items-center gap-2.5 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-xs font-bold border border-indigo-100">
              <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Will publish on {new Date(scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </div>

        {!scheduledAt && (
          <div className="pt-2">
            <label className="block text-sm font-bold text-slate-700 mb-3">Action</label>
            <div className="flex gap-4">
              <label className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl cursor-pointer transition-all font-bold text-sm border-2 ${status === 'draft' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200'}`}>
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={status === 'draft'}
                  onChange={(e) => setStatus(e.target.value)}
                  className="hidden"
                />
                Save as Draft
              </label>
              
              <label className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl cursor-pointer transition-all font-bold text-sm border-2 ${status === 'published' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50 hover:border-slate-200'}`}>
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={status === 'published'}
                  onChange={(e) => setStatus(e.target.value)}
                  className="hidden"
                />
                Publish Now
              </label>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Submit Button ─────────────────────────────────────────────────── */}
      <div className="pt-4">
        <Button
          type="submit"
          disabled={loading || uploading || isSubmitting}
          className="w-full rounded-2xl bg-slate-900 hover:bg-slate-800 text-white py-6 shadow-xl shadow-slate-900/20 font-bold text-base transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {loading || isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
          {loading || isSubmitting 
            ? 'Processing...' 
            : scheduledAt 
              ? (initial ? 'Update Scheduled Post' : 'Confirm Schedule')
              : (initial ? 'Update Post' : (status === 'draft' ? 'Save Draft' : 'Launch Post'))
          }
        </Button>
      </div>
    </form>
  );
};

export default PostForm;