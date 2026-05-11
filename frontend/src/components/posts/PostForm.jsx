import { X, Plus, Image, Clock, Send, Instagram } from 'lucide-react';
import { PlatformSelector } from './PlatformSelector';
import { SchedulePicker } from '../composer/SchedulePicker';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Loader } from '../common/Loader';
import { PlatformIcon } from '../accounts/PlatformIcon';
import { cn } from '../../lib/utils';
import { useAccounts } from '../../context/AccountsContext';
import React, { useState, useEffect } from 'react';

export const PostForm = ({ initialData = null, onSubmit, loading = false }) => {
  const { accounts } = useAccounts();

  const [content, setContent]             = useState('');
  const [accountIds, setAccountIds]       = useState([]);
  const [selectedPages, setSelectedPages] = useState({});
  const [mediaUrls, setMediaUrls]         = useState(['']);
  const [mediaType, setMediaType]         = useState('');   // ← NEW
  const [status, setStatus]               = useState('draft');
  const [scheduleMode, setScheduleMode]   = useState('now');
  const [scheduledAt, setScheduledAt]     = useState(null);
  const [errors, setErrors]               = useState({});

  // ── Check if any selected account is Instagram ──────────────────────────
  const hasInstagram = accountIds.some(id => {
    const acc = accounts?.find(a => a.id === id);
    return acc?.platform === 'instagram';
  });


const hasThreads = accountIds.some(id => {
  const acc = accounts?.find(a => a.id === id);
  return acc?.platform === 'threads';
});
  useEffect(() => {
    if (initialData) {
      setContent(initialData.content       || '');
      setAccountIds(initialData.accountIds || []);
      setSelectedPages(initialData.selectedPages || {});
      setMediaUrls(initialData.mediaUrls?.length > 0 ? initialData.mediaUrls : ['']);
      setMediaType(initialData.mediaType   || '');   // ← NEW
      setStatus(initialData.status         || 'draft');
      if (initialData.scheduledAt) {
        setScheduleMode('later');
        setScheduledAt(initialData.scheduledAt);
      }
    }
  }, [initialData]);

  const handlePlatformChange = ({ accountIds: ids, selectedPages: pages }) => {
    setAccountIds(ids);
    setSelectedPages(pages);
    // Reset mediaType if Instagram is deselected
    const stillHasIG = ids.some(id => {
      const acc = accounts?.find(a => a.id === id);
      return acc?.platform === 'instagram';
    });
    if (!stillHasIG) setMediaType('');
  };

  const validate = () => {
    const newErrors = {};
    if (!content.trim()) newErrors.content = 'Content is required';
    if (accountIds.length === 0) newErrors.accountIds = 'At least one account must be selected';

    const hasPageAccountWithNoPages = accountIds.some(id => {
      const pages = selectedPages[id];
      return pages !== undefined && pages.length === 0;
    });
    if (hasPageAccountWithNoPages) {
      newErrors.accountIds = 'Please select at least one page for each connected account';
    }

    // Instagram validation — require media URL if IMAGE or CAROUSEL selected
    if (hasInstagram && (mediaType === 'IMAGE' || mediaType === 'CAROUSEL')) {
      const filledUrls = mediaUrls.filter(u => u.trim());
      if (!filledUrls.length) {
        newErrors.mediaUrls = `${mediaType === 'CAROUSEL' ? 'Carousel' : 'Photo'} posts require at least one image URL`;
      }
    }
    if (hasInstagram && mediaType === 'REELS') {
      const filledUrls = mediaUrls.filter(u => u.trim());
      if (!filledUrls.length) {
        newErrors.mediaUrls = 'Reels require a video URL';
      }
    }
{/* ── Threads Info ───────────────────────────────────────────── */}
// Add inside validate(), after Instagram validations:
if (hasThreads && content.length > 500) {
  newErrors.content = 'Threads has a 500 character limit';
}

    if (scheduleMode === 'later' && !scheduledAt) newErrors.scheduledAt = 'Please select a date and time';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const formData = {
      content:      content.trim(),
      accountIds,
      selectedPages,
      mediaUrls:    mediaUrls.filter(url => url.trim()),
      mediaType:    mediaType || undefined,   // ← NEW
      status:       scheduleMode === 'later' ? 'scheduled' : status,
      scheduledAt:  scheduleMode === 'later' ? scheduledAt : null,
    };

    await onSubmit(formData);
  };

  const addMediaUrl = () => {
    if (mediaUrls.length < 10) setMediaUrls([...mediaUrls, '']);
  };

  const updateMediaUrl = (index, value) => {
    const updated = [...mediaUrls];
    updated[index] = value;
    setMediaUrls(updated);
  };

  const removeMediaUrl = (index) => {
    if (mediaUrls.length > 1) {
      setMediaUrls(mediaUrls.filter((_, i) => i !== index));
    } else {
      setMediaUrls(['']);
    }
  };

  const isEditing = !!initialData;

  // Max media URLs depends on type
  const maxUrls = mediaType === 'CAROUSEL' ? 10 : mediaType === 'REELS' ? 1 : 4;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="content" className="text-base font-medium">
          Post Content
        </Label>
        <Textarea
          id="content"
          data-testid="post-content-input"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What's on your mind? Write your post here..."
          className={cn(
            'min-h-[150px] resize-y rounded-xl bg-slate-50 border-transparent',
            'focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10',
            errors.content && 'border-red-300 focus:border-red-500'
          )}
        />
        <div className="flex items-center justify-between">
          {errors.content ? (
            <span className="text-sm text-red-500">{errors.content}</span>
          ) : (
            <span className="text-sm text-slate-500">{content.length} characters</span>
          )}
        </div>
      </div>

      {/* ── Platform Selector ────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-base font-medium">Post to Accounts</Label>
        <PlatformSelector
          selectedIds={accountIds}
          selectedPages={selectedPages}
          onChange={handlePlatformChange}
        />
        {errors.accountIds && (
          <span className="text-sm text-red-500">{errors.accountIds}</span>
        )}
      </div>

      {/* ── Instagram Post Type ─────────────────────────────────────────── */}
      {hasInstagram && (
        <div className="space-y-3">
          <Label className="text-base font-medium flex items-center gap-2">
            <PlatformIcon platform="instagram" size="sm" />
            Instagram Post Type
          </Label>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: '',         label: '⚡ Auto Detect',  hint: 'Picks type from your URL' },
              { value: 'IMAGE',    label: '📷 Photo',         hint: 'Single image post' },
              { value: 'REELS',    label: '🎬 Reel',          hint: 'Video post' },
              { value: 'CAROUSEL', label: '🖼️ Carousel',      hint: 'Up to 10 images' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setMediaType(opt.value);
                  // Trim URLs to 1 if switching to REELS
                  if (opt.value === 'REELS') {
                    setMediaUrls([mediaUrls[0] || '']);
                  }
                }}
                title={opt.hint}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all border-2',
                  mediaType === opt.value
                    ? 'bg-pink-50 border-pink-300 text-pink-700'
                    : 'bg-slate-50 border-transparent text-slate-600 hover:border-slate-200'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Inline hint per type */}
          {mediaType === 'REELS' && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              🎬 Paste a public MP4/MOV video URL below. Reels may take up to 60s to process.
            </p>
          )}
          {mediaType === 'CAROUSEL' && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              🖼️ Add up to 10 image URLs. Each URL becomes one slide.
            </p>
          )}
          {mediaType === '' && (
            <p className="text-xs text-slate-400">
              Auto Detect: 1 image URL → Photo · 2+ image URLs → Carousel · video URL → Reel
            </p>
          )}
        </div>
      )}

      {/* ── Threads Info ───────────────────────────────────────────── */}
{hasThreads && (
  <div className="space-y-2">
    <Label className="text-base font-medium flex items-center gap-2">
      <PlatformIcon platform="threads" size="sm" />
      Threads
    </Label>
    <div className={cn(
      'flex items-center gap-2 px-4 py-3 rounded-xl text-sm border-2',
      content.length > 500
        ? 'bg-red-50 border-red-200 text-red-600'
        : content.length > 400
        ? 'bg-amber-50 border-amber-200 text-amber-600'
        : 'bg-slate-50 border-transparent text-slate-500'
    )}>
      <span>🧵</span>
      <span>
        {content.length}/500 characters
        {content.length > 500 && ' — Threads limit exceeded'}
        {content.length > 400 && content.length <= 500 && ' — approaching limit'}
      </span>
    </div>
    <p className="text-xs text-slate-400">
      Threads supports text-only posts or posts with a single image/video URL.
      Only the first media URL will be used.
    </p>
  </div>
)}

      {/* ── Media URLs ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-base font-medium flex items-center gap-2">
          <Image className="w-4 h-4" />
          Media URLs
          {!hasInstagram && (
            <span className="text-xs font-normal text-slate-400">(optional)</span>
          )}
          {hasInstagram && mediaType !== 'REELS' && mediaType !== '' && (
            <span className="text-xs font-normal text-pink-400">required for Instagram</span>
          )}
        </Label>

        <div className="space-y-2">
          {mediaUrls.map((url, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                data-testid={`media-url-${index}`}
                value={url}
                onChange={e => updateMediaUrl(index, e.target.value)}
                placeholder={
                  mediaType === 'REELS'
                    ? 'https://example.com/video.mp4'
                    : `https://example.com/image${mediaUrls.length > 1 ? `-${index + 1}` : ''}.jpg`
                }
                className={cn(
                  'flex-1 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500',
                  errors.mediaUrls && !url.trim() && 'border-red-300'
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-xl hover:bg-red-50 hover:text-red-600"
                onClick={() => removeMediaUrl(index)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {errors.mediaUrls && (
          <span className="text-sm text-red-500">{errors.mediaUrls}</span>
        )}

        {mediaUrls.length < maxUrls && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-indigo-600 hover:bg-indigo-50"
            onClick={addMediaUrl}
          >
            <Plus className="w-4 h-4 mr-1" />
            {mediaType === 'CAROUSEL'
              ? `Add image (${mediaUrls.length}/${maxUrls})`
              : 'Add another URL'}
          </Button>
        )}
      </div>

      {/* ── Schedule Toggle ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Label className="text-base font-medium">When to Post</Label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setScheduleMode('now')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all',
              scheduleMode === 'now'
                ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-200'
                : 'bg-slate-50 text-slate-600 border-2 border-transparent hover:border-slate-200'
            )}
          >
            <Send className="w-4 h-4" />
            Post Now
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('later')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all',
              scheduleMode === 'later'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                : 'bg-slate-50 text-slate-600 border-2 border-transparent hover:border-slate-200'
            )}
          >
            <Clock className="w-4 h-4" />
            Schedule for Later
          </button>
        </div>

        {scheduleMode === 'later' && (
          <div className="mt-4">
            <SchedulePicker value={scheduledAt} onChange={setScheduledAt} />
            {errors.scheduledAt && (
              <span className="text-sm text-red-500 mt-2 block">{errors.scheduledAt}</span>
            )}
          </div>
        )}

        {scheduleMode === 'now' && (
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => setStatus('draft')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all',
                status === 'draft'
                  ? 'bg-yellow-100 text-yellow-700 border-2 border-yellow-200'
                  : 'bg-slate-50 text-slate-600 border-2 border-transparent hover:border-slate-200'
              )}
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => setStatus('published')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all',
                status === 'published'
                  ? 'bg-green-100 text-green-700 border-2 border-green-200'
                  : 'bg-slate-50 text-slate-600 border-2 border-transparent hover:border-slate-200'
              )}
            >
              Publish Now
            </button>
          </div>
        )}
      </div>

      {/* ── Submit ───────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <Button
          type="submit"
          data-testid="submit-post-btn"
          disabled={loading}
          className="w-full sm:w-auto rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-8 py-3 font-bold shadow-button"
        >
          {loading ? (
            <>
              <Loader size="sm" className="mr-2 border-white border-t-transparent" />
              Saving...
            </>
          ) : scheduleMode === 'later' ? (
            'Schedule Post'
          ) : isEditing ? (
            'Save Changes'
          ) : status === 'published' ? (
            'Publish Now'
          ) : (
            'Save Draft'
          )}
        </Button>
      </div>

    </form>
  );
};

export default PostForm;