import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, PenLine, Check, Hash, Clock, Lightbulb, Flame, Youtube,
  AlertTriangle, X, Plus, Wand2, SlidersHorizontal, RefreshCw,
} from 'lucide-react';
import { PlatformIcon } from '../accounts/PlatformIcon';
import {
  TONES, LANGUAGES, REGIONS, regionLabel, platformName, to12h, nextOccurrence, getLiveTrends,
} from '../../utils/aiHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// Inline AI suggestions shown under each field of the post form.
// Clicking a suggestion puts it into the field; the field stays editable.
// ─────────────────────────────────────────────────────────────────────────────

const selectCls =
  'px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer';

const hasHashtag = (content, tag) => {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(content || '');
};

// Light box that sits directly under a field
const SuggestionBox = ({ icon: Icon, label, action, loading, children }) => (
  <div className={`mt-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-3.5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
        {label}
      </p>
      {action}
    </div>
    {children}
  </div>
);

const SmallButton = ({ onClick, children, title, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-indigo-100 text-indigo-700 text-[11px] font-bold hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
  >
    {children}
  </button>
);

const Shimmer = ({ lines = 3 }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="h-8 rounded-xl bg-white/80 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
    ))}
  </div>
);

// ── 1. AI bar (top of the Compose card) ─────────────────────────────────────
export const AISuggestBar = ({ ai, onSuggest, onImprove, canImprove }) => {
  const [showMore, setShowMore] = useState(false);
  const { prefs, setPrefs, status, loading, error, brief, setBrief } = ai;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/40 p-4 space-y-3">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">AI suggestions</p>
            <p className="text-[11px] text-slate-500 font-medium">
              Type a title or pick a trend — ideas appear under each field. Click one to use it, or write your own.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={prefs.tone} onChange={(e) => setPrefs({ tone: e.target.value })} className={selectCls} title="Tone">
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={prefs.language} onChange={(e) => setPrefs({ language: e.target.value })} className={selectCls} title="Post language">
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`p-2 rounded-xl border text-slate-500 hover:text-indigo-600 ${showMore ? 'bg-white border-indigo-200 text-indigo-600' : 'bg-white border-slate-200'}`}
            title="More options"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSuggest}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-bold shadow-sm disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? 'Thinking…' : 'Suggest'}
          </button>
          <button
            type="button"
            onClick={onImprove}
            disabled={loading || !canImprove}
            title={canImprove ? 'Rewrite my caption' : 'Write a caption first'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" /> Improve caption
          </button>
        </div>
      </div>

      {showMore && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={prefs.region} onChange={(e) => setPrefs({ region: e.target.value })} className={selectCls} title="Audience region">
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input
            value={prefs.audience}
            onChange={(e) => setPrefs({ audience: e.target.value })}
            placeholder="Audience, e.g. young professionals"
            className={`${selectCls} cursor-text`}
          />
          <input
            value={prefs.niche}
            onChange={(e) => setPrefs({ niche: e.target.value })}
            placeholder="Brand / niche, e.g. personalised gifts"
            className={`${selectCls} cursor-text`}
          />
        </div>
      )}

      {brief && (
        <div className="flex items-start gap-2 text-xs font-semibold text-indigo-800 bg-white/70 border border-indigo-100 rounded-xl px-3 py-2">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="flex-1 line-clamp-2">Writing about: {brief}</span>
          <button type="button" onClick={() => setBrief('')} className="text-slate-400 hover:text-slate-700" title="Clear topic">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {status && status.configured === false && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>AI is not configured on the server: {status.reason || 'add GEMINI_API_KEY to backend/.env and restart.'} Trending topics still work.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs font-semibold text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => ai.setError('')} className="text-red-400 hover:text-red-700"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
};

// ── 2. Trending topic chips (under the title while it is empty) ─────────────
export const TrendingTopicChips = ({ region = 'IN', onPick }) => {
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    let active = true;
    setTrends(null);
    getLiveTrends(region)
      .then((data) => active && setTrends(data.googleTrends || []))
      .catch(() => active && setTrends([]));
    return () => { active = false; };
  }, [region]);

  if (trends && trends.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-orange-600">
        <Flame className="w-3.5 h-3.5" /> Trending in {regionLabel(region)}
      </span>
      {!trends
        ? [1, 2, 3, 4].map((i) => <span key={i} className="h-7 w-24 rounded-full bg-slate-100 animate-pulse" />)
        : trends.slice(0, 8).map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => onPick(t)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-100 text-orange-800 text-xs font-semibold hover:bg-orange-100 hover:border-orange-200 transition-colors"
              title="Write a post about this"
            >
              {t.title}
              {t.traffic && <span className="text-[10px] text-orange-500 font-bold">{t.traffic}</span>}
            </button>
          ))}
    </div>
  );
};

// ── 3. Title suggestions ────────────────────────────────────────────────────
export const TitleSuggestions = ({ titles = [], current = '', onPick, loading, onRefresh }) => {
  if (!titles.length && !loading) return null;
  return (
    <SuggestionBox
      icon={Sparkles}
      label="Suggested titles — click to use"
      loading={loading && titles.length > 0}
      action={titles.length > 0 && onRefresh && (
        <SmallButton onClick={onRefresh} disabled={loading} title="New suggestions"><RefreshCw className="w-3 h-3" /> More</SmallButton>
      )}
    >
      {!titles.length ? <Shimmer lines={3} /> : (
        <div className="flex flex-col gap-1.5">
          {titles.map((t) => {
            const active = t.trim() === current.trim();
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                className={`flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-800 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50'
                }`}
              >
                {active ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <Plus className="w-3.5 h-3.5 flex-shrink-0 text-indigo-400" />}
                <span className="flex-1">{t}</span>
              </button>
            );
          })}
        </div>
      )}
    </SuggestionBox>
  );
};

// ── 4. Caption suggestions (one tab per platform) ───────────────────────────
export const CaptionSuggestions = ({ captions = [], current = '', onPick, loading }) => {
  const [tab, setTab] = useState(0);
  // Open on the caption that is already in the field (e.g. after auto-fill), else the first one
  useEffect(() => {
    const inUse = captions.findIndex((c) => c.text.trim() === current.trim());
    setTab(inUse >= 0 ? inUse : 0);
  }, [captions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!captions.length && !loading) return null;
  const selected = captions[Math.min(tab, captions.length - 1)];
  const isUsed = selected && selected.text.trim() === current.trim();

  return (
    <SuggestionBox icon={PenLine} label="Suggested captions — click to use" loading={loading && captions.length > 0}>
      {!captions.length ? <Shimmer lines={4} /> : (
        <div className="space-y-2.5">
          {captions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {captions.map((c, i) => (
                <button
                  key={`${c.platform}-${i}`}
                  type="button"
                  onClick={() => setTab(i)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    i === tab ? 'bg-white border-indigo-300 text-indigo-700 shadow-sm' : 'bg-white/50 border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <PlatformIcon platform={c.platform} size="sm" /> {platformName(c.platform)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onPick(selected.text)}
            className={`w-full text-left rounded-xl border p-3 transition-all ${
              isUsed ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-100 hover:border-indigo-300'
            }`}
          >
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">{selected.text}</p>
          </button>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold ${selected.platform === 'twitter' && selected.text.length > 280 ? 'text-red-500' : 'text-slate-400'}`}>
              {platformName(selected.platform)} · {selected.text.length} characters
            </span>
            <button
              type="button"
              onClick={() => onPick(selected.text)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
            >
              {isUsed ? <><Check className="w-3.5 h-3.5" /> In use</> : <><PenLine className="w-3.5 h-3.5" /> Use this caption</>}
            </button>
          </div>
        </div>
      )}
    </SuggestionBox>
  );
};

// ── 5. Hashtag chips (click to add / remove from the caption) ───────────────
export const HashtagSuggestions = ({ hashtags = [], content = '', onToggle, onAddAll, tips = [] }) => {
  if (!hashtags.length) return null;
  const missing = hashtags.filter((t) => !hasHashtag(content, t));
  return (
    <SuggestionBox
      icon={Hash}
      label="Suggested hashtags — click to add or remove"
      action={missing.length > 0 && <SmallButton onClick={() => onAddAll(missing)}><Plus className="w-3 h-3" /> Add all</SmallButton>}
    >
      <div className="flex flex-wrap gap-1.5">
        {hashtags.map((tag) => {
          const added = hasHashtag(content, tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag, added)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                added ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-700 border-indigo-100 hover:border-indigo-300'
              }`}
            >
              {added && <Check className="w-3 h-3" />}
              {tag}
            </button>
          );
        })}
      </div>
      {tips.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-indigo-100 space-y-1">
          {tips.slice(0, 3).map((tip, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-slate-600 font-medium">
              <Lightbulb className="w-3 h-3 mt-0.5 text-amber-500 flex-shrink-0" /> {tip}
            </li>
          ))}
        </ul>
      )}
    </SuggestionBox>
  );
};

// ── 6. YouTube tags + category ──────────────────────────────────────────────
export const YoutubeTagSuggestions = ({ tags = [], current = '', onAdd, onAddAll, category, categoryLabel, currentCategory, onUseCategory }) => {
  const currentSet = useMemo(
    () => new Set(current.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)),
    [current]
  );
  if (!tags.length && !category) return null;
  const missing = tags.filter((t) => !currentSet.has(t.toLowerCase()));

  return (
    <SuggestionBox
      icon={Youtube}
      label="Suggested YouTube tags — click to add"
      action={missing.length > 0 && <SmallButton onClick={() => onAddAll(missing)}><Plus className="w-3 h-3" /> Add all</SmallButton>}
    >
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const added = currentSet.has(tag.toLowerCase());
          return (
            <button
              key={tag}
              type="button"
              onClick={() => !added && onAdd(tag)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                added ? 'bg-red-600 text-white border-red-600 cursor-default' : 'bg-white text-red-700 border-red-100 hover:border-red-300'
              }`}
            >
              {added && <Check className="w-3 h-3" />}
              {tag}
            </button>
          );
        })}
      </div>
      {category && categoryLabel && (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
          <span>Suggested category: <b className="text-slate-800">{categoryLabel}</b></span>
          {String(currentCategory) === String(category)
            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><Check className="w-3.5 h-3.5" /> Selected</span>
            : <SmallButton onClick={() => onUseCategory(category)}>Use category</SmallButton>}
        </div>
      )}
    </SuggestionBox>
  );
};

// ── 7. Best times (under the schedule field) ────────────────────────────────
export const BestTimeSuggestions = ({ bestTimes = [], region = 'IN', onPick }) => {
  if (!bestTimes.length) return null;
  return (
    <SuggestionBox icon={Clock} label={`Best times to post (${regionLabel(region)} time) — click to schedule`}>
      <div className="flex flex-col gap-1.5">
        {bestTimes.map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(nextOccurrence(b.time, b.day))}
            className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left px-3 py-2 rounded-xl bg-white border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 min-w-[170px]">
              {b.platform && <PlatformIcon platform={b.platform} size="sm" />}
              {b.day ? `${b.day}, ` : ''}{to12h(b.time)}
            </span>
            <span className="text-xs text-slate-500 font-medium">{b.reason}</span>
          </button>
        ))}
      </div>
    </SuggestionBox>
  );
};
