import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Calendar, Send, Loader2, Youtube, FileText, Tag, Lock, Globe, Users, Camera } from 'lucide-react';
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

// ✅ NEW HELPER: Safely converts backend UTC ISO strings to local datetime-local format
const formatDateTimeLocal = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString().slice(0, 16);
};

export const PostForm = ({ initialData = null, initialPost = null, onSubmit, loading }) => {
  const initial = initialData || initialPost || null;

  const [content, setContent]           = useState(initial?.content || '');
  const [mediaUrls, setMediaUrls]       = useState(initial?.mediaUrls || []);
  const [mediaFormats, setMediaFormats] = useState(initial?.mediaFormats || {});

  // ── YouTube-specific fields ──────────────────────────────────────────────
  const [youtubeTitle,       setYoutubeTitle]       = useState(initial?.youtubeTitle || '');
  const [youtubeTags,        setYoutubeTags]        = useState(initial?.youtubeTags?.join(', ') || '');
  const [youtubeCategory,    setYoutubeCategory]    = useState(initial?.youtubeCategory || '22');
  const [youtubePrivacy,     setYoutubePrivacy]     = useState(initial?.youtubePrivacy || 'public');
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState(initial?.youtubeMadeForKids || false);

  // ── Account & Page State ─────────────────────────────────────────────────
  const [selectedAccounts, setSelectedAccounts] = useState(initial?.accountIds || []);
  const [selectedPages,    setSelectedPages]    = useState(initial?.selectedPages || {});

  const [status,      setStatus]      = useState(initial?.status || 'draft');
  // ✅ FIX: Applied the formatting helper to the initial state
  const [scheduledAt, setScheduledAt] = useState(formatDateTimeLocal(initial?.scheduledAt));
  
  const [accounts,    setAccounts]    = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('facebook');
  const [youtubeThumbnail, setYoutubeThumbnail] = useState(initial?.youtubeThumbnail || '');
  const [uploadingThumb, setUploadingThumb] = useState(false);

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
          [accountId]: accountData.pages.map(p => p.pageId),
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim()) {
      toast.error('Please write some content');
      return;
    }
    if (selectedAccounts.length === 0) {
      toast.error('Please select at least one account');
      return;
    }
    if (isYoutubeSelected && !youtubeTitle.trim()) {
      toast.error('Please enter a YouTube video title');
      return;
    }
    if (scheduledAt && new Date(scheduledAt) < new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    const parsedTags = youtubeTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const formData = {
      content:             content.trim(),
      accountIds:          selectedAccounts,
      selectedPages,
      mediaUrls,
      mediaFormats,
      status:              scheduledAt ? 'scheduled' : status,
      scheduledAt:         scheduledAt ? new Date(scheduledAt).toISOString() : null,
      ...(isYoutubeSelected && {
        youtubeTitle:       youtubeTitle.trim(),
        youtubeTags:        parsedTags,
        youtubeCategory,
        youtubeCategory,
        youtubePrivacy,
        youtubeMadeForKids,
        youtubeThumbnail,
      }),
    };

    onSubmit(formData);
  };

  const connectedAccountsList = React.useMemo(() => {
    const items = [];
    accounts.forEach(platformGroup => {
      if (platformGroup.connected && Array.isArray(platformGroup.accounts)) {
        platformGroup.accounts.forEach(acc => {
          items.push({
            platform: platformGroup.platform,
            account: acc
          });
        });
      } else if (platformGroup.connected && platformGroup.account) {
        items.push({
          platform: platformGroup.platform,
          account: platformGroup.account
        });
      }
    });
    return items;
  }, [accounts]);

  const isYoutubeSelected = selectedAccounts.some(accountId => {
    const matched = connectedAccountsList.find(
      item => (item.account.id === accountId || item.account._id === accountId)
    );
    return matched?.platform === 'youtube';
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── YouTube Extended Fields ────────────────────────────────────────── */}
      <AnimatePresence>
        {isYoutubeSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-red-50 rounded-2xl border border-red-100 p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center">
                  <Youtube className="w-4 h-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-red-900">YouTube Settings</p>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-red-800 mb-1.5">
                  Video Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={youtubeTitle}
                  onChange={(e) => setYoutubeTitle(e.target.value)}
                  placeholder="Enter an engaging title for your video..."
                  maxLength={100}
                  className="w-full px-4 py-2.5 rounded-xl border border-red-200 bg-white focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                />
                <p className="text-xs text-red-400 mt-1 text-right">{youtubeTitle.length}/100</p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-medium text-red-800 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Tags
                  <span className="text-red-400 font-normal">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={youtubeTags}
                  onChange={(e) => setYoutubeTags(e.target.value)}
                  placeholder="e.g. tutorial, react, webdev, coding"
                  className="w-full px-4 py-2.5 rounded-xl border border-red-200 bg-white focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                />
                {youtubeTags.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {youtubeTags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Category + Privacy */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-red-800 mb-1.5">Category</label>
                  <select
                    value={youtubeCategory}
                    onChange={(e) => setYoutubeCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-red-200 bg-white focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                  >
                    {YOUTUBE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-red-800 mb-1.5">Privacy</label>
                  <select
                    value={youtubePrivacy}
                    onChange={(e) => setYoutubePrivacy(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-red-200 bg-white focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none text-sm"
                  >
                    {YOUTUBE_PRIVACY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label} — {opt.desc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                {YOUTUBE_PRIVACY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = youtubePrivacy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setYoutubePrivacy(opt.value)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                        active
                          ? 'border-red-500 bg-red-500 text-white shadow-sm'
                          : 'border-red-200 bg-white text-red-700 hover:border-red-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Made for Kids */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-white border border-red-100 hover:border-red-200 transition-colors">
                <input
                  type="checkbox"
                  checked={youtubeMadeForKids}
                  onChange={(e) => setYoutubeMadeForKids(e.target.checked)}
                  className="rounded text-red-500 focus:ring-red-400 w-4 h-4"
                />
                <div>
                  <p className="text-sm font-medium text-red-900">Made for Kids</p>
                  <p className="text-xs text-red-400">Marks your video as child-directed content</p>
                </div>
              </label>

              {/* YouTube Thumbnail */}
              <div className="border-t border-red-100 pt-4 mt-2">
                <label className="block text-xs font-medium text-red-800 mb-2 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Video Thumbnail 
                  <span className="text-red-400 font-normal">(Optional — Recommended: 1280x720)</span>
                </label>

                <div className="flex gap-4 items-center bg-white p-3 rounded-xl border border-red-100">
                  {youtubeThumbnail ? (
                    <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200 shadow-sm">
                      <img src={youtubeThumbnail} alt="Thumbnail preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setYoutubeThumbnail('')}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-32 h-20 flex flex-col items-center justify-center border-2 border-dashed border-red-200 rounded-lg bg-red-50/50 hover:bg-red-50 hover:border-red-300 cursor-pointer transition-all flex-shrink-0 text-center p-2">
                      <input type="file" accept="image/png, image/jpeg" onChange={handleThumbnailUpload} className="hidden" disabled={uploadingThumb} />
                      {uploadingThumb ? (
                        <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-red-400 mb-1" />
                          <span className="text-[10px] font-medium text-red-700">Upload Cover</span>
                        </>
                      )}
                    </label>
                  )}

                  <div className="text-xs text-red-600/80">
                    <p className="font-semibold text-red-900">Custom Video Banner</p>
                    <p className="mt-0.5">Upload a high-quality JPG or PNG file. This image will show up on your channel feed.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content / Description ─────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {isYoutubeSelected ? 'Video Description' : "What's on your mind?"}
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            isYoutubeSelected
              ? 'Write your video description here...'
              : 'Write your post content here...'
          }
          rows={4}
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
        />
        <div className="mt-2 text-xs text-slate-500">{content.length} characters</div>
      </div>

      {/* ── Media Upload ──────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Add Media</label>
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-2">Media Format for Upload</label>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-sm"
          >
            {Object.entries(MEDIA_FORMATS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
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
            className="flex items-center justify-center gap-3 px-4 py-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 cursor-pointer transition-colors"
          >
            {uploading
              ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              : <Upload className="w-5 h-5 text-slate-400" />
            }
            <div>
              <p className="font-medium text-slate-700">
                {uploading ? `Uploading... ${uploadProgress}%` : 'Click to upload or drag files'}
              </p>
              <p className="text-xs text-slate-500">Images and videos up to 100MB</p>
            </div>
          </label>
        </div>

        {uploading && uploadProgress > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {mediaUrls.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Uploaded Media ({mediaUrls.length})
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {mediaUrls.map((url, idx) => {
                const format  = mediaFormats[url] || 'unknown';
                const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group rounded-lg overflow-hidden bg-slate-100"
                  >
                    {isVideo
                      ? <video src={url} className="w-full h-24 object-cover" />
                      : <img src={url} alt={`Media ${idx + 1}`} className="w-full h-24 object-cover" />
                    }
                    <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-xs px-2 py-1 rounded">
                      {MEDIA_FORMATS[format]?.label || format}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Account & Page Selection ──────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Select Accounts & Pages
        </label>
        <div className="space-y-3">
          {connectedAccountsList.length === 0 ? (
            <p className="text-sm text-slate-500">No connected accounts available</p>
          ) : (
            connectedAccountsList.map((item) => {
              const accountId         = item.account.id || item.account._id;
              const displayName       = item.account.accountName || item.account.name;
              const avatar            = item.account.profilePicture || item.account.avatarUrl;
              const hasPages          = item.account.pages && item.account.pages.length > 0;
              const isMainChecked     = selectedAccounts.includes(accountId);

              return (
                <div
                  key={`${item.platform}-${accountId}`}
                  className={`rounded-xl border transition-colors ${
                    isMainChecked
                      ? 'border-indigo-200 bg-indigo-50/30'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <label className="flex items-center gap-3 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMainChecked}
                      onChange={(e) =>
                        handleAccountToggle(accountId, e.target.checked, item.account)
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <img
                      src={avatar}
                      alt={displayName}
                      className="w-8 h-8 rounded-full object-cover"
                      onError={(e) => {
                        e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${item.platform}`;
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{displayName}</p>
                      <p className="text-xs text-slate-500 capitalize">{item.platform}</p>
                    </div>
                  </label>

                  <AnimatePresence>
                    {hasPages && isMainChecked && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-11 mr-4 mb-3 p-3 bg-white rounded-lg border border-slate-100 shadow-sm space-y-2">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Select Specific Pages
                          </p>
                          {item.account.pages.map((page) => (
                            <label
                              key={page.pageId}
                              className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1.5 rounded-md"
                            >
                              <input
                                type="checkbox"
                                checked={selectedPages[accountId]?.includes(page.pageId) || false}
                                onChange={(e) =>
                                  handlePageToggle(accountId, page.pageId, e.target.checked)
                                }
                                className="rounded text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5"
                              />
                              <FileText className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-medium text-slate-700">
                                {page.pageName}
                              </span>
                            </label>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Scheduling ───────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          <Calendar className="w-4 h-4 inline mr-2" />
          Schedule Post (Optional)
        </label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full px-4 py-2 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none"
        />
        {scheduledAt && (
          <p className="mt-2 text-xs text-indigo-600">
            📅 Post will be published on {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* ── Draft / Publish ───────────────────────────────────────────────── */}
      {!scheduledAt && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Save As</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === 'draft'}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className="text-sm text-slate-700">Draft</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="published"
                checked={status === 'published'}
                onChange={(e) => setStatus(e.target.value)}
              />
              <span className="text-sm text-slate-700">Publish Now</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <Button
        type="submit"
        disabled={loading || uploading}
        className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-3 font-medium"
      >
        <Send className="w-4 h-4 mr-2" />
        {/* ✅ FIX: Dynamic Button Text based on Schedule selection */}
        {loading 
          ? 'Saving...' 
          : scheduledAt 
            ? (initial ? 'Update Scheduled Post' : 'Schedule Post')
            : (initial ? 'Update Post' : 'Publish Post')
        }
      </Button>
    </form>
  );
};

export default PostForm;