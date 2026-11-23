// components/posts/ThumbnailPicker.jsx
// 🆕 YouTube thumbnail: upload from your device, or let AI suggest ideas from the title +
// description and generate one (paid plans — 1 AI image credit).
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Crown, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { aiAPI } from '../../services/api';

const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;

export const ThumbnailPicker = ({ value, onChange, onUpload, uploading, title, description, tags }) => {
  const [ideas, setIdeas] = useState(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  const suggest = async () => {
    if (!String(title || '').trim() && !String(description || '').trim()) {
      toast.error('Write the video title or description first — the ideas are based on them.');
      return;
    }
    setLoadingIdeas(true);
    setUpgradeMsg('');
    try {
      const { data } = await aiAPI.thumbnailIdeas({ title, description, tags });
      setIdeas(data.ideas || []);
      setCanGenerate(Boolean(data.canGenerate));
    } catch (error) {
      toast.error(errorText(error, 'Could not suggest thumbnails.'));
    } finally {
      setLoadingIdeas(false);
    }
  };

  const generate = async (idea) => {
    setGenerating(idea.id);
    setUpgradeMsg('');
    try {
      const { data } = await aiAPI.thumbnailGenerate({ title, description, idea });
      onChange(data.url);
      toast.success('AI thumbnail ready (1 AI image credit used)');
    } catch (error) {
      const status = error?.response?.status;
      if (status === 402 || status === 403) setUpgradeMsg(errorText(error, 'AI thumbnails need a paid plan.'));
      else toast.error(errorText(error, 'Could not create the thumbnail.'));
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-5 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        {value ? (
          <div className="relative w-48 h-28 rounded-xl overflow-hidden border border-slate-200 flex-shrink-0 shadow-sm">
            <img src={value} alt="Thumbnail preview" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange('')}
              className="absolute top-2 right-2 bg-slate-900/80 text-white p-1.5 rounded-lg hover:bg-red-500 transition-all active:scale-95 shadow-sm">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className="w-48 h-28 flex flex-col items-center justify-center border-2 border-dashed border-red-200 rounded-xl bg-red-50/50 hover:bg-red-50 hover:border-red-400 cursor-pointer transition-all flex-shrink-0 group">
            <input type="file" accept="image/png, image/jpeg" onChange={onUpload} className="hidden" disabled={uploading} />
            {uploading ? <Loader2 className="w-6 h-6 text-red-500 animate-spin" /> : (
              <>
                <Camera className="w-6 h-6 text-red-400 group-hover:text-red-500 mb-2 transition-colors" />
                <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide group-hover:text-red-800">Upload from device</span>
              </>
            )}
          </label>
        )}
        <div className="flex-1 text-xs text-slate-500 leading-relaxed text-center sm:text-left">
          <p className="font-bold text-slate-800 mb-1.5 text-sm">Upload a 1280×720 JPG/PNG — or let AI make one.</p>
          <p className="font-medium mb-3">AI reads your title and description and suggests thumbnail ideas.</p>
          <button type="button" onClick={suggest} disabled={loadingIdeas}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {loadingIdeas ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {ideas ? 'Suggest again' : 'Suggest thumbnails with AI'}
          </button>
        </div>
      </div>

      {ideas && (
        <div className="grid gap-3 md:grid-cols-3">
          {ideas.map((idea) => (
            <div key={idea.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-heading text-base font-bold text-slate-900">“{idea.headline || 'No text'}”</p>
              <p className="mt-1 flex-1 text-xs text-slate-600">{idea.concept}</p>
              <p className="mt-2 text-[11px] text-slate-400">{[idea.style, idea.colors].filter(Boolean).join(' · ')}</p>
              {canGenerate ? (
                <button type="button" disabled={!!generating} onClick={() => generate(idea)}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                  {generating === idea.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  {generating === idea.id ? 'Creating… (up to 1 min)' : 'Generate (1 image credit)'}
                </button>
              ) : (
                <a href="/credits" className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                  <Crown className="w-3.5 h-3.5" /> Paid plans: generate with AI
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {upgradeMsg && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex-1">{upgradeMsg}</span>
          <a href="/credits" className="rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-3 py-1.5 text-xs font-semibold text-white">Upgrade</a>
        </div>
      )}
    </div>
  );
};

export default ThumbnailPicker;
