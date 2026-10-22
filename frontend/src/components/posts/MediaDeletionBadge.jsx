import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, ShieldCheck, Clock, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { postsAPI } from '../../services/api';
import {
  RETENTION_OPTIONS,
  getMediaSettings,
  formatDateTime,
  relativeTime,
  mediaNoun,
  retentionFromPost,
  retentionToPayload,
  validateRetention,
  toLocalInputValue,
} from '../../utils/mediaRetention';

const HOUR_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Shows when a post's uploaded video/images will be (or were) deleted from the
// server, with an inline control to change it. Used on the Posts page.
// Props: post, onUpdated(fields)
// ─────────────────────────────────────────────────────────────────────────────
export const MediaDeletionBadge = ({ post, onUpdated }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => retentionFromPost(post));
  const [defaultDays, setDefaultDays] = useState(3);

  useEffect(() => {
    let active = true;
    getMediaSettings().then((s) => {
      if (active && s?.defaultRetentionDays !== undefined) setDefaultDays(Number(s.defaultRetentionDays));
    });
    return () => { active = false; };
  }, []);

  const options = useMemo(() => {
    const list = RETENTION_OPTIONS.map((o) =>
      o.value === 'default'
        ? { ...o, label: defaultDays > 0 ? `Server default (${defaultDays} days)` : 'Server default (never)' }
        : o
    );
    if (!list.some((o) => o.value === draft.retention)) {
      list.splice(list.length - 1, 0, { value: draft.retention, label: `${draft.retention} days after publishing` });
    }
    return list;
  }, [defaultDays, draft.retention]);

  // Synced or live-only posts have no files on our server
  const isLive = typeof post?.id === 'string' && post.id.startsWith('live-');
  if (!post || isLive || (!post.hasLocalMedia && !post.mediaDeleted)) return null;

  const noun = mediaNoun(post.mediaUrls);
  const deleteAt = post.mediaScheduledDeleteAt ? new Date(post.mediaScheduledDeleteAt) : null;
  const soon = deleteAt && deleteAt.getTime() - Date.now() < 24 * HOUR_MS;

  const save = async () => {
    const error = validateRetention(draft, post.status === 'scheduled' ? post.scheduledAt : null);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const res = await postsAPI.updateMediaRetention(post.id, retentionToPayload(draft));
      onUpdated?.(res.data);
      toast.success('Media deletion setting updated');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update media deletion setting');
    } finally {
      setSaving(false);
    }
  };

  // ── Already removed ────────────────────────────────────────
  if (post.mediaDeleted) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600">
        <Trash2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        {noun} removed from server{post.mediaDeletedAt ? ` on ${formatDateTime(post.mediaDeletedAt)}` : ''} — the live post is not affected.
      </div>
    );
  }

  // ── Status line ────────────────────────────────────────────
  let tone = 'bg-amber-50 border-amber-200 text-amber-800';
  let icon = <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />;
  let text;

  if (deleteAt && post.status === 'published') {
    if (soon) tone = 'bg-red-50 border-red-200 text-red-700';
    text = `${noun} will be deleted from the server on ${formatDateTime(deleteAt)} (${relativeTime(deleteAt)})`;
  } else if (deleteAt && post.status === 'scheduled') {
    tone = 'bg-indigo-50 border-indigo-200 text-indigo-700';
    icon = <Clock className="w-3.5 h-3.5 flex-shrink-0" />;
    text = `${noun} will be deleted from the server on ${formatDateTime(deleteAt)}, after this post is published`;
  } else if (post.status === 'published' || post.mediaRetentionDays === 0) {
    tone = 'bg-emerald-50 border-emerald-200 text-emerald-700';
    icon = <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />;
    text = `${noun} is kept on the server (never deleted)`;
  } else {
    tone = 'bg-slate-50 border-slate-200 text-slate-600';
    icon = <Clock className="w-3.5 h-3.5 flex-shrink-0" />;
    const days = post.mediaRetentionDays ?? defaultDays;
    text = post.mediaDeleteOn
      ? `${noun} will be deleted from the server on ${formatDateTime(post.mediaDeleteOn)}`
      : `${noun} stays until this post is published, then is deleted ${days} day${days === 1 ? '' : 's'} later`;
  }

  return (
    <div className={`rounded-xl border px-4 py-2.5 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          {icon}
          <span>{text}</span>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => { setDraft(retentionFromPost(post)); setEditing(true); }}
            className="inline-flex items-center gap-1 self-start sm:self-auto px-2.5 py-1 rounded-lg bg-white/80 border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-white transition-colors"
          >
            <Pencil className="w-3 h-3" /> Change
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={draft.retention}
            onChange={(e) => setDraft({ retention: e.target.value, deleteOn: e.target.value === 'custom' ? draft.deleteOn : '' })}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {draft.retention === 'custom' && (
            <input
              type="datetime-local"
              value={draft.deleteOn}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setDraft({ ...draft, deleteOn: e.target.value })}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex items-center px-2 py-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaDeletionBadge;
