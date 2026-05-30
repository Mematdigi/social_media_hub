import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, X, Calendar, Send, Loader2, Youtube } from 'lucide-react';
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

export const PostForm = ({ initialPost = null, onSubmit, loading }) => {
  const [content, setContent] = useState(initialPost?.content || '');
  const [youtubeTitle, setYoutubeTitle] = useState(initialPost?.youtubeTitle || '');
  const [mediaUrls, setMediaUrls] = useState(initialPost?.mediaUrls || []);
  const [mediaFormats, setMediaFormats] = useState(initialPost?.mediaFormats || {});
  const [selectedAccounts, setSelectedAccounts] = useState(initialPost?.accountIds || []);
  const [status, setStatus] = useState(initialPost?.status || 'draft');
  const [scheduledAt, setScheduledAt] = useState(initialPost?.scheduledAt || '');
  const [accounts, setAccounts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('facebook');

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

        const { url, mediaType } = response.data || response;
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

  const removeMedia = (index) => {
    const url = mediaUrls[index];
    const newUrls = mediaUrls.filter((_, i) => i !== index);
    const newFormats = { ...mediaFormats };
    delete newFormats[url];

    setMediaUrls(newUrls);
    setMediaFormats(newFormats);
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

    if (scheduledAt && new Date(scheduledAt) < new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    const formData = {
      content: content.trim(),
      youtubeTitle: youtubeTitle.trim() || undefined, // Only send if it has a value
      accountIds: selectedAccounts,
      mediaUrls,
      mediaFormats,
      status: scheduledAt ? 'scheduled' : status,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };

    onSubmit(formData);
  };

  const connectedAccounts = accounts.filter(acc => acc.connected && acc.account);
  
  // Check if any selected account belongs to YouTube
  const isYoutubeSelected = selectedAccounts.some(accountId => {
    const accountData = connectedAccounts.find(
      acc => (acc.account.id || acc.account._id) === accountId
    );
    return accountData?.platform === 'youtube';
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Dynamic YouTube Title Input (Only shows if YouTube is selected) */}
      {isYoutubeSelected && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }} 
          className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-4"
        >
          <label className="block text-sm font-medium text-red-900 mb-2 flex items-center gap-2">
            <Youtube className="w-4 h-4" /> YouTube Video Title
          </label>
          <input
            type="text"
            value={youtubeTitle}
            onChange={(e) => setYoutubeTitle(e.target.value)}
            placeholder="Enter an engaging title for your video..."
            className="w-full px-4 py-2 rounded-xl border border-red-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
            required={isYoutubeSelected} // Make it required if YouTube is checked!
          />
        </motion.div>
      )}

      {/* Content (Acts as YouTube Description if YouTube is selected) */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          {isYoutubeSelected ? "What's your video about? (YouTube Description)" : "What's on your mind?"}
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isYoutubeSelected ? "Write your video description here..." : "Write your post content here..."}
          rows={4}
          className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none resize-none"
        />
        <div className="mt-2 text-xs text-slate-500">
          {content.length} characters
        </div>
      </div>

      {/* Media Upload */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Add Media
        </label>

        {/* Format Selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-600 mb-2">
            Media Format for Upload
          </label>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 outline-none text-sm"
          >
            {Object.entries(MEDIA_FORMATS).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
        </div>

        {/* Upload Input */}
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
              <p className="text-xs text-slate-500">
                Images and videos up to 100MB
              </p>
            </div>
          </label>
        </div>

        {/* Progress bar */}
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

        {/* Media Preview */}
        {mediaUrls.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Uploaded Media ({mediaUrls.length})
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {mediaUrls.map((url, idx) => {
                const format = mediaFormats[url] || 'unknown';
                const isVideo = url.match(/\.(mp4|webm|ogg|mov)$/i);

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group rounded-lg overflow-hidden bg-slate-100"
                  >
                    {isVideo ? (
                      <video
                        src={url}
                        className="w-full h-24 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <img
                        src={url}
                        alt={`Media ${idx + 1}`}
                        className="w-full h-24 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}

                    {/* Format Badge */}
                    <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-xs px-2 py-1 rounded">
                      {MEDIA_FORMATS[format]?.label || format}
                    </div>

                    {/* Remove Button */}
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

      {/* Account Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Select Accounts
        </label>
        <div className="space-y-2">
          {connectedAccounts.length === 0 ? (
            <p className="text-sm text-slate-500">No connected accounts available</p>
          ) : (
            connectedAccounts.map((acc) => {
              // ✅ SAFETY FALLBACKS: Handle both SQL-style (Facebook) and Mongo-style (YouTube) data
              const accountId = acc.account.id || acc.account._id;
              const displayName = acc.account.accountName || acc.account.name;
              const avatar = acc.account.profilePicture || acc.account.avatarUrl;

              return (
                <label
                  key={accountId}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.includes(accountId)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAccounts([...selectedAccounts, accountId]);
                      } else {
                        setSelectedAccounts(selectedAccounts.filter(id => id !== accountId));
                      }
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  
                  {/* Account Avatar */}
                  <img 
                    src={avatar} 
                    alt={displayName} 
                    className="w-8 h-8 rounded-full object-cover" 
                    onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/initials/svg?seed=${acc.platform}`; }}
                  />

                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{displayName}</p>
                    <p className="text-xs text-slate-500 capitalize">{acc.platform}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Scheduling */}
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

      {/* Status */}
      {!scheduledAt && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Save As
          </label>
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

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={loading || uploading}
        className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-3 font-medium"
      >
        <Send className="w-4 h-4 mr-2" />
        {loading ? 'Creating Post...' : initialPost ? 'Update Post' : 'Create Post'}
      </Button>
    </form>
  );
};

export default PostForm;