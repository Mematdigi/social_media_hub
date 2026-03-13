import React, { useState, useEffect } from 'react';
import { X, Plus, Image, Clock, Send } from 'lucide-react';
import { PlatformSelector } from './PlatformSelector';
import { SchedulePicker } from '../composer/SchedulePicker';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Loader } from '../common/Loader';
import { cn } from '../../lib/utils';

export const PostForm = ({ initialData = null, onSubmit, loading = false }) => {
  const [content, setContent] = useState('');
  const [accountIds, setAccountIds] = useState([]);
  const [mediaUrls, setMediaUrls] = useState(['']);
  const [status, setStatus] = useState('draft');
  const [scheduleMode, setScheduleMode] = useState('now');
  const [scheduledAt, setScheduledAt] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      console.log('Initializing form with data:', initialData);
      setContent(initialData.content || '');
      setAccountIds(initialData.accountIds || []);
      setMediaUrls(initialData.mediaUrls?.length > 0 ? initialData.mediaUrls : ['']);
      setStatus(initialData.status || 'draft');
      if (initialData.scheduledAt) {
        setScheduleMode('later');
        setScheduledAt(initialData.scheduledAt);
      }
    }
  }, [initialData]);

  const validate = () => {
    const newErrors = {};
    if (!content.trim()) newErrors.content = 'Content is required';
    if (accountIds.length === 0) newErrors.accountIds = 'At least one account must be selected';
    if (scheduleMode === 'later' && !scheduledAt) newErrors.scheduledAt = 'Please select a date and time';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const formData = {
      content: content.trim(),
      accountIds,
      mediaUrls: mediaUrls.filter((url) => url.trim()),
      status: scheduleMode === 'later' ? 'scheduled' : status,
      scheduledAt: scheduleMode === 'later' ? scheduledAt : null,
    };

    await onSubmit(formData);
  };

  const addMediaUrl = () => {
    if (mediaUrls.length < 4) setMediaUrls([...mediaUrls, '']);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content" className="text-base font-medium">Post Content</Label>
        <Textarea
          id="content"
          data-testid="post-content-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
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

      {/* Platform Selector */}
      <div className="space-y-2">
        <Label className="text-base font-medium">Post to Accounts</Label>
        <PlatformSelector selectedIds={accountIds} onChange={setAccountIds} />
        {errors.accountIds && <span className="text-sm text-red-500">{errors.accountIds}</span>}
      </div>

      {/* Media URLs */}
      <div className="space-y-2">
        <Label className="text-base font-medium flex items-center gap-2">
          <Image className="w-4 h-4" />
          Media URLs (optional)
        </Label>
        <div className="space-y-2">
          {mediaUrls.map((url, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                data-testid={`media-url-${index}`}
                value={url}
                onChange={(e) => updateMediaUrl(index, e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-indigo-500"
              />
              <Button type="button" variant="ghost" size="icon" className="rounded-xl hover:bg-red-50 hover:text-red-600" onClick={() => removeMediaUrl(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
        {mediaUrls.length < 4 && (
          <Button type="button" variant="ghost" size="sm" className="rounded-xl text-indigo-600 hover:bg-indigo-50" onClick={addMediaUrl}>
            <Plus className="w-4 h-4 mr-1" />
            Add another URL
          </Button>
        )}
      </div>

      {/* Schedule Toggle */}
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
            {errors.scheduledAt && <span className="text-sm text-red-500 mt-2 block">{errors.scheduledAt}</span>}
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

      {/* Submit */}
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
