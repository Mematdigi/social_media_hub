// utils/mediaRetention.js
// Shared helpers for "delete uploaded media from the server after X days".
import { format, formatDistanceToNow } from 'date-fns';
import { postsAPI } from '../services/api';

export const RETENTION_OPTIONS = [
  { value: 'default', label: 'Server default' },
  { value: '0',       label: 'Never delete' },
  { value: '1',       label: '1 day after publishing' },
  { value: '3',       label: '3 days after publishing' },
  { value: '7',       label: '7 days after publishing' },
  { value: '15',      label: '15 days after publishing' },
  { value: '30',      label: '30 days after publishing' },
  { value: 'custom',  label: 'Custom date & time' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Cached once per page load
let settingsPromise = null;
export const getMediaSettings = () => {
  if (!settingsPromise) {
    settingsPromise = postsAPI
      .getMediaSettings()
      .then((res) => res.data)
      .catch(() => {
        settingsPromise = null;
        return { defaultRetentionDays: 3 };
      });
  }
  return settingsPromise;
};

// Date → value for <input type="datetime-local">
export const toLocalInputValue = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return isNaN(d.getTime()) ? '' : format(d, "MMM d, yyyy 'at' h:mm a");
};

export const relativeTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  if (d.getTime() <= Date.now()) return 'any moment now';
  return formatDistanceToNow(d, { addSuffix: true });
};

export const isVideoUrl = (url = '') => /\.(mp4|mov|webm|ogg|avi|mkv)(\?|$)/i.test(String(url));

export const getMediaKind = (urls = []) => {
  if (!urls || urls.length === 0) return 'none';
  return urls.some(isVideoUrl) ? 'video' : 'image';
};

export const mediaNoun = (urls = []) => {
  const kind = getMediaKind(urls);
  if (kind === 'video') return 'Video';
  return urls.length > 1 ? 'Images' : 'Image';
};

// Post from the API → picker state
export const retentionFromPost = (post) => {
  if (!post) return { retention: 'default', deleteOn: '' };
  if (post.mediaDeleteOn) return { retention: 'custom', deleteOn: toLocalInputValue(post.mediaDeleteOn) };
  if (post.mediaRetentionDays === null || post.mediaRetentionDays === undefined) {
    return { retention: 'default', deleteOn: '' };
  }
  return { retention: String(post.mediaRetentionDays), deleteOn: '' };
};

// Picker state → request body fields
export const retentionToPayload = ({ retention, deleteOn }) => {
  if (retention === 'custom') {
    return { mediaRetentionDays: null, mediaDeleteOn: deleteOn ? new Date(deleteOn).toISOString() : null };
  }
  if (retention === 'default' || retention === '' || retention === undefined) {
    return { mediaRetentionDays: null, mediaDeleteOn: null };
  }
  return { mediaRetentionDays: Number(retention), mediaDeleteOn: null };
};

// Returns an error message, or '' when valid
export const validateRetention = ({ retention, deleteOn }, scheduledAt) => {
  if (retention !== 'custom') return '';
  if (!deleteOn) return 'Pick a date and time for deleting the media, or choose another option.';
  const when = new Date(deleteOn).getTime();
  if (isNaN(when)) return 'The media delete date is not valid.';
  if (when <= Date.now()) return 'The media delete date must be in the future.';
  if (scheduledAt && when <= new Date(scheduledAt).getTime()) {
    return 'The media delete date must be after the scheduled publish time.';
  }
  return '';
};

// Projected delete date for the form preview
export const projectDeleteDate = ({ retention, deleteOn, defaultDays, scheduledAt, publishedAt, publishNow }) => {
  if (retention === 'custom') return deleteOn ? new Date(deleteOn) : null;
  const days = retention === 'default' ? Number(defaultDays) : Number(retention);
  if (!Number.isFinite(days) || days <= 0) return null;

  let base = null;
  if (publishedAt) base = new Date(publishedAt);
  else if (scheduledAt) base = new Date(scheduledAt);
  else if (publishNow) base = new Date();
  return base ? new Date(base.getTime() + days * DAY_MS) : null;
};
