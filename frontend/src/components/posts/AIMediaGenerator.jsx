// components/posts/AIMediaGenerator.jsx
// 🆕 "Generate with AI" next to "upload from your computer" in Create post.
// Image = 1 AI image credit · Video = 1 AI video credit (takes 1–6 minutes).
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Loader2, Sparkles, Video, Wand2, X } from 'lucide-react';
import { aiAPI } from '../../services/api';
import { cn } from '../../lib/utils';

const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;
const IMAGE_RATIOS = [['1:1', 'Square'], ['4:5', 'Portrait 4:5'], ['9:16', 'Story / Reel 9:16'], ['16:9', 'Landscape 16:9']];
const VIDEO_RATIOS = [['9:16', 'Reel / Short 9:16'], ['16:9', 'Landscape 16:9']];

// Pick sensible defaults from the "Format" dropdown above the upload box
export const defaultsForFormat = (format) => {
  if (['instagram_reel', 'gif'].includes(format)) return { kind: 'video', ratio: '9:16' };
  if (format === 'youtube') return { kind: 'video', ratio: '16:9' };
  if (format === 'instagram_story') return { kind: 'image', ratio: '9:16' };
  if (format === 'instagram_feed') return { kind: 'image', ratio: '4:5' };
  return { kind: 'image', ratio: '1:1' };
};

export const AIMediaGenerator = ({ open, onClose, onAdd, caption, format }) => {
  const defaults = defaultsForFormat(format);
  const [kind, setKind] = useState(defaults.kind);
  const [ratio, setRatio] = useState(defaults.ratio);
  const [prompt, setPrompt] = useState('');
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!open) return null;

  const switchKind = (k) => {
    setKind(k);
    setResult(null);
    if (k === 'video' && !['9:16', '16:9'].includes(ratio)) setRatio('9:16');
  };

  const writeFromCaption = async () => {
    setWriting(true);
    setError('');
    try {
      const { data } = await aiAPI.mediaPrompt({ caption, kind, aspectRatio: ratio });
      setPrompt(data.prompt);
    } catch (e) {
      setError(errorText(e, 'Could not write a prompt.'));
    } finally {
      setWriting(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const call = kind === 'video' ? aiAPI.mediaVideo : aiAPI.mediaImage;
      const { data } = await call({ prompt, aspectRatio: ratio });
      setResult(data);
    } catch (e) {
      setError(errorText(e, `Could not create the ${kind}.`));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    onAdd(result.url);
    toast.success(`AI ${result.kind} added to your post`);
    setResult(null);
    setPrompt('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
            <Sparkles className="w-5 h-5 text-indigo-500" /> Generate with AI
          </h3>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            {[['image', 'Photo', ImageIcon, '1 image credit'], ['video', 'Video', Video, '1 video credit · 1–6 min']].map(([k, label, Icon, hint]) => (
              <button key={k} type="button" disabled={busy} onClick={() => switchKind(k)}
                className={cn('flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-semibold',
                  kind === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                <Icon className="w-5 h-5" /> {label}
                <span className="text-[11px] font-medium text-slate-400">{hint}</span>
              </button>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">Shape</p>
            <div className="flex flex-wrap gap-2">
              {(kind === 'video' ? VIDEO_RATIOS : IMAGE_RATIOS).map(([r, label]) => (
                <button key={r} type="button" disabled={busy} onClick={() => setRatio(r)}
                  className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', ratio === r ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Describe the {kind}</p>
              <button type="button" onClick={writeFromCaption} disabled={writing || busy || !String(caption || '').trim()}
                title={String(caption || '').trim() ? 'Write the description from your post text' : 'Write your post text first'}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">
                {writing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Write it from my post
              </button>
            </div>
            <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={3000} disabled={busy}
              placeholder={kind === 'video'
                ? 'e.g. Slow camera move around a steaming cup of masala chai on a rainy balcony, cosy evening light, soft rain sound'
                : 'e.g. A bright Diwali flat-lay with diyas, marigolds and sweets on a wooden table, warm light, text "Happy Diwali"'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>

          {error && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <span className="flex-1">{error}</span>
              {/credits/i.test(error) && <a href="/credits" className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Upgrade</a>}
            </div>
          )}

          {result ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                {result.kind === 'video'
                  ? <video src={result.url} controls playsInline className="max-h-[360px] w-full" />
                  : <img src={result.url} alt="AI result" className="max-h-[360px] w-full object-contain" />}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={add} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Add to post</button>
                <button type="button" onClick={generate} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Try again (1 more credit)</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={generate} disabled={busy || prompt.trim().length < 5}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? (kind === 'video' ? 'Creating your video… this can take a few minutes' : 'Creating your photo…') : `Generate ${kind === 'video' ? 'video' : 'photo'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIMediaGenerator;
