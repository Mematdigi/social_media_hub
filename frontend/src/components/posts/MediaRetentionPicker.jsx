import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, ShieldCheck, Info } from 'lucide-react';
import {
  RETENTION_OPTIONS,
  getMediaSettings,
  formatDateTime,
  relativeTime,
  projectDeleteDate,
  toLocalInputValue,
} from '../../utils/mediaRetention';

// ─────────────────────────────────────────────────────────────────────────────
// "Delete uploaded media from the server" picker for the create / edit form.
// Props:
//   retention, deleteOn        current picker state
//   onChange({ retention, deleteOn })
//   scheduledAt                local datetime string from the form (optional)
//   publishedAt                ISO date when editing an already-published post
//   publishNow                 true when the form will publish immediately
//   mediaNoun                  "Video" | "Image" | "Images"
//   mediaDeletedAt             ISO date if the files were already removed
// ─────────────────────────────────────────────────────────────────────────────
export const MediaRetentionPicker = ({
  retention = 'default',
  deleteOn = '',
  onChange,
  scheduledAt = '',
  publishedAt = null,
  publishNow = false,
  mediaNoun = 'Media',
  mediaDeletedAt = null,
}) => {
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
        ? { ...o, label: defaultDays > 0 ? `Server default (${defaultDays} day${defaultDays === 1 ? '' : 's'} after publishing)` : 'Server default (never delete)' }
        : o
    );
    // Keep an unusual saved value (e.g. 10 days) selectable
    if (!list.some((o) => o.value === retention)) {
      list.splice(list.length - 1, 0, { value: retention, label: `${retention} days after publishing` });
    }
    return list;
  }, [defaultDays, retention]);

  const deleteDate = projectDeleteDate({ retention, deleteOn, defaultDays, scheduledAt, publishedAt, publishNow });
  const neverDeletes = retention === '0' || (retention === 'default' && defaultDays <= 0);
  const days = retention === 'default' ? defaultDays : Number(retention);

  if (mediaDeletedAt) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <Trash2 className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-600 font-medium">
          {mediaNoun} for this post was removed from the server on {formatDateTime(mediaDeletedAt)}.
          The live post on each platform is not affected.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-slate-700">
        Delete uploaded {mediaNoun.toLowerCase()} from server
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          value={retention}
          onChange={(e) => onChange({ retention: e.target.value, deleteOn: e.target.value === 'custom' ? deleteOn : '' })}
          className="w-full appearance-none px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-slate-800 font-medium transition-all cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {retention === 'custom' && (
          <input
            type="datetime-local"
            value={deleteOn}
            min={toLocalInputValue(scheduledAt ? new Date(scheduledAt) : new Date())}
            onChange={(e) => onChange({ retention, deleteOn: e.target.value })}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-slate-800 font-medium transition-all cursor-pointer"
          />
        )}
      </div>

      {neverDeletes ? (
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold border border-emerald-100">
          <ShieldCheck className="w-3.5 h-3.5" />
          {mediaNoun} will stay on the server permanently
        </div>
      ) : deleteDate ? (
        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg text-xs font-bold border border-amber-200">
          <Trash2 className="w-3.5 h-3.5" />
          {mediaNoun} will be deleted from the server on {formatDateTime(deleteDate)} ({relativeTime(deleteDate)})
        </div>
      ) : retention !== 'custom' ? (
        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-lg text-xs font-bold border border-amber-200">
          <Trash2 className="w-3.5 h-3.5" />
          {mediaNoun} will be deleted {days} day{days === 1 ? '' : 's'} after the post is published
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs text-slate-500 font-medium">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        Only the uploaded copy on our server is removed. The live posts on Facebook, Instagram, YouTube and X stay up.
        Drafts, scheduled and failed posts always keep their media.
      </p>
    </div>
  );
};

export default MediaRetentionPicker;
