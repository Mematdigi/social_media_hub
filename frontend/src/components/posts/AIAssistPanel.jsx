import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, PenLine, TrendingUp, CalendarDays, Copy, Check, RefreshCw, Loader2,
  Hash, Clock, Lightbulb, ChevronDown, ExternalLink, AlertTriangle, Youtube, Plus, Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiAPI } from '../../services/api';
import { PlatformIcon } from '../accounts/PlatformIcon';
import { getPlatformConfig } from '../../utils/platformConfig';
import { toLocalInputValue } from '../../utils/mediaRetention';

// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant for the create / edit post form.
//   Write     → titles, captions per platform, hashtags, YouTube tags, best times
//   Trending  → live Google Trends + YouTube trending + AI ideas per platform
//   Events    → upcoming festivals, holidays and events + post ideas
// Everything is applied to the form through callbacks, so the form stays the same.
// ─────────────────────────────────────────────────────────────────────────────

const TONES = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'witty', label: 'Witty' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'promotional', label: 'Promotional / Sale' },
  { value: 'informative', label: 'Informative' },
  { value: 'emotional', label: 'Emotional' },
];

const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi (Devanagari)' },
  { value: 'hinglish', label: 'Hinglish' },
];

const REGIONS = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'UAE' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'SG', label: 'Singapore' },
];

const TABS = [
  { id: 'write', label: 'Write with AI', icon: PenLine },
  { id: 'trending', label: 'Trending now', icon: TrendingUp },
  { id: 'events', label: 'Festivals & events', icon: CalendarDays },
];

const PREFS_KEY = 'socialhub_ai_prefs';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

const savePrefs = (prefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — ignore */
  }
};

const platformName = (p) => getPlatformConfig(p)?.name || p;

const formatViews = (n) => {
  if (!n) return '';
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} Cr views`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K views`;
  return `${n} views`;
};

// "19:00" + "Weekdays" → next matching date/time as a datetime-local string
const nextOccurrence = (hhmm, dayLabel = '') => {
  const [h, m] = hhmm.split(':').map(Number);
  const label = dayLabel.toLowerCase();
  const named = DAY_NAMES.filter((d) => label.includes(d) || label.includes(d.slice(0, 3)));

  const matches = (date) => {
    const dow = date.getDay();
    if (label.includes('weekend')) return dow === 0 || dow === 6;
    if (label.includes('weekday')) return dow >= 1 && dow <= 5;
    if (named.length) return named.includes(DAY_NAMES[dow]);
    return true;
  };

  const earliest = Date.now() + 10 * 60 * 1000;
  for (let i = 0; i < 8; i++) {
    const c = new Date();
    c.setDate(c.getDate() + i);
    c.setHours(h, m, 0, 0);
    if (c.getTime() > earliest && matches(c)) return toLocalInputValue(c);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(h, m, 0, 0);
  return toLocalInputValue(fallback);
};

const to12h = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

const daysUntil = (iso) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
};

// ── Small building blocks ────────────────────────────────────────────────────
const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

const UseButton = ({ onClick, children = 'Use' }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold hover:bg-indigo-100 transition-colors whitespace-nowrap"
  >
    {children}
  </button>
);

const Block = ({ title, icon: Icon, children, action }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h4>
      {action}
    </div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none text-sm text-slate-800 font-medium transition-all';

const Spinner = ({ label }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
    <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
    <p className="text-sm font-semibold">{label}</p>
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────
export const AIAssistPanel = ({
  title = '',
  content = '',
  platforms = [],
  mediaKind = 'none',
  onUseTitle,
  onUseCaption,
  onAddHashtags,
  onUseYoutubeTags,
  onUseYoutubeCategory,
  onUseSchedule,
}) => {
  const saved = useMemo(loadPrefs, []);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('write');
  const [status, setStatus] = useState(null);

  // Shared settings
  const [region, setRegion] = useState(saved.region || 'IN');
  const [niche, setNiche] = useState(saved.niche || '');

  // Write
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState(saved.tone || 'friendly');
  const [language, setLanguage] = useState(saved.language || 'english');
  const [audience, setAudience] = useState(saved.audience || '');
  const [writing, setWriting] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [pickedTags, setPickedTags] = useState([]);

  // Trending
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendData, setTrendData] = useState(null);

  // Events
  const [eventDays, setEventDays] = useState(45);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsData, setEventsData] = useState(null);

  useEffect(() => {
    savePrefs({ region, niche, tone, language, audience });
  }, [region, niche, tone, language, audience]);

  useEffect(() => {
    if (!open || status) return;
    aiAPI.status()
      .then((res) => setStatus(res.data))
      .catch(() => setStatus({ configured: false }));
  }, [open, status]);

  const targetPlatforms = platforms.length ? platforms : ['facebook', 'instagram'];
  const showYoutube = targetPlatforms.includes('youtube');

  // ── Actions ────────────────────────────────────────────────
  const runSuggest = async (mode = 'generate', overrideTopic) => {
    const brief = (overrideTopic ?? topic).trim();
    if (mode === 'improve' && !content.trim()) {
      toast.error('Write a caption first, then ask the AI to improve it.');
      return;
    }
    if (!brief && !title.trim() && !content.trim()) {
      toast.error('Tell the AI what the post is about.');
      return;
    }

    setWriting(true);
    try {
      const res = await aiAPI.suggest({
        topic: brief, title, content, platforms: targetPlatforms,
        tone, language, audience, region, mode, mediaKind,
      });
      setSuggestions(res.data);
      setPickedTags([]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'The AI could not generate suggestions. Please try again.');
    } finally {
      setWriting(false);
    }
  };

  const loadTrending = async (refresh = false) => {
    setTrendLoading(true);
    try {
      const res = await aiAPI.trending({
        region,
        niche,
        platforms: (platforms.length ? platforms : ['facebook', 'instagram', 'youtube', 'twitter']).join(','),
        refresh: refresh ? 'true' : undefined,
      });
      setTrendData(res.data);
      if (res.data.aiError) toast.message(res.data.aiError);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load trends');
    } finally {
      setTrendLoading(false);
    }
  };

  const loadEvents = async (refresh = false) => {
    setEventsLoading(true);
    try {
      const res = await aiAPI.events({ region, days: eventDays, niche, refresh: refresh ? 'true' : undefined });
      setEventsData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load upcoming events');
    } finally {
      setEventsLoading(false);
    }
  };

  const writeFromIdea = (brief) => {
    setTopic(brief);
    setTab('write');
    runSuggest('generate', brief);
  };

  const togglePickedTag = (tag) =>
    setPickedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const addTags = (tags) => {
    if (!tags.length) return;
    onAddHashtags?.(tags);
    toast.success(`${tags.length} hashtag${tags.length === 1 ? '' : 's'} added to the caption`);
  };

  // ── Render helpers ─────────────────────────────────────────
  const renderWrite = () => (
    <div className="space-y-5">
      <div className="space-y-4">
        <Field label="What is this post about?">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="e.g. Launching Diwali gift hampers — free delivery in Delhi NCR till Nov 5"
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Tone">
            <select value={tone} onChange={(e) => setTone(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Post language">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Audience (optional)">
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. young professionals" className={inputCls} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span>Writing for:</span>
          {targetPlatforms.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              <PlatformIcon platform={p} size="sm" /> {platformName(p)}
            </span>
          ))}
          {!platforms.length && <span className="text-slate-400">(select destinations below to tailor captions)</span>}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => runSuggest('generate')}
            disabled={writing}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-bold shadow-sm disabled:opacity-60"
          >
            {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate suggestions
          </button>
          <button
            type="button"
            onClick={() => runSuggest('improve')}
            disabled={writing || !content.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
            title={content.trim() ? '' : 'Write a caption first'}
          >
            <PenLine className="w-4 h-4" />
            Improve my caption
          </button>
        </div>
      </div>

      {writing && <Spinner label="Writing titles, captions and hashtags…" />}

      {!writing && suggestions && (
        <div className="space-y-4">
          {suggestions.titles?.length > 0 && (
            <Block title="Title ideas" icon={Lightbulb}>
              <div className="space-y-2">
                {suggestions.titles.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="flex-1 text-sm font-semibold text-slate-800">{t}</p>
                    <CopyButton text={t} />
                    <UseButton onClick={() => { onUseTitle?.(t); toast.success('Title added'); }} />
                  </div>
                ))}
              </div>
            </Block>
          )}

          {suggestions.captions?.length > 0 && (
            <Block title="Captions" icon={PenLine}>
              <p className="text-xs text-slate-500 font-medium -mt-1">
                One caption is used for all selected platforms — pick the one that fits best.
              </p>
              <div className="space-y-3">
                {suggestions.captions.map((c, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <PlatformIcon platform={c.platform} size="sm" /> {platformName(c.platform)}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={`text-[11px] font-bold mr-1 ${c.platform === 'twitter' && c.text.length > 280 ? 'text-red-500' : 'text-slate-400'}`}>
                          {c.text.length} chars
                        </span>
                        <CopyButton text={c.text} />
                        <UseButton onClick={() => { onUseCaption?.(c.text); toast.success('Caption added'); }}>
                          Use caption
                        </UseButton>
                      </div>
                    </div>
                    <p className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                      {c.text}
                    </p>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {suggestions.hashtags?.length > 0 && (
            <Block
              title="Hashtags"
              icon={Hash}
              action={
                <div className="flex gap-2">
                  {pickedTags.length > 0 && (
                    <UseButton onClick={() => addTags(pickedTags)}>
                      <Plus className="w-3 h-3" /> Add {pickedTags.length} selected
                    </UseButton>
                  )}
                  <UseButton onClick={() => addTags(suggestions.hashtags)}>
                    <Plus className="w-3 h-3" /> Add all
                  </UseButton>
                </div>
              }
            >
              <div className="flex flex-wrap gap-2">
                {suggestions.hashtags.map((tag) => {
                  const picked = pickedTags.includes(tag);
                  return (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => togglePickedTag(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        picked
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-indigo-700 border-indigo-100 hover:border-indigo-300'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Tap hashtags to select, then add them to the caption.</p>
            </Block>
          )}

          {showYoutube && suggestions.youtubeTags?.length > 0 && (
            <Block
              title="YouTube tags"
              icon={Youtube}
              action={
                <div className="flex gap-2">
                  {suggestions.youtubeCategoryId && (
                    <UseButton onClick={() => { onUseYoutubeCategory?.(suggestions.youtubeCategoryId); toast.success('YouTube category set'); }}>
                      Use category
                    </UseButton>
                  )}
                  <UseButton onClick={() => { onUseYoutubeTags?.(suggestions.youtubeTags); toast.success('YouTube tags added'); }}>
                    Use tags
                  </UseButton>
                </div>
              }
            >
              <div className="flex flex-wrap gap-2">
                {suggestions.youtubeTags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-100 text-red-700 text-xs font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            </Block>
          )}

          {suggestions.bestTimes?.length > 0 && (
            <Block title={`Best time to post (${REGIONS.find((r) => r.value === region)?.label} time)`} icon={Clock}>
              <div className="space-y-2">
                {suggestions.bestTimes.map((b, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2 min-w-[150px]">
                      {b.platform && <PlatformIcon platform={b.platform} size="sm" />}
                      <span className="text-sm font-bold text-slate-800">{b.day ? `${b.day}, ` : ''}{to12h(b.time)}</span>
                    </div>
                    <p className="flex-1 text-xs text-slate-500 font-medium">{b.reason}</p>
                    <UseButton
                      onClick={() => {
                        onUseSchedule?.(nextOccurrence(b.time, b.day));
                        toast.success('Schedule time set — check Publishing Options');
                      }}
                    >
                      <Clock className="w-3 h-3" /> Schedule
                    </UseButton>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {suggestions.tips?.length > 0 && (
            <Block title="Tips to boost reach" icon={Sparkles}>
              <ul className="space-y-1.5">
                {suggestions.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600 font-medium">
                    <span className="text-indigo-500">•</span> {tip}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}
    </div>
  );

  const renderTrending = () => {
    const ideasByPlatform = (trendData?.ideas || []).reduce((acc, idea) => {
      (acc[idea.platform] = acc[idea.platform] || []).push(idea);
      return acc;
    }, {});

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => loadTrending(Boolean(trendData))}
            disabled={trendLoading}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-bold shadow-sm disabled:opacity-60"
          >
            {trendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : trendData ? <RefreshCw className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            {trendData ? 'Refresh trends' : 'Find what\'s trending'}
          </button>
        </div>

        {trendLoading && <Spinner label="Reading live trends and building ideas…" />}

        {!trendLoading && trendData && (
          <div className="space-y-4">
            {trendData.summary && (
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-sm text-indigo-900 font-medium">
                {trendData.summary}
              </div>
            )}

            {Object.keys(ideasByPlatform).length > 0 && (
              <Block title="Post ideas from today's trends" icon={Lightbulb}>
                <div className="space-y-3">
                  {Object.entries(ideasByPlatform).map(([platform, ideas]) => (
                    <div key={platform} className="space-y-2">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <PlatformIcon platform={platform} size="sm" /> {platformName(platform)}
                      </p>
                      {ideas.map((idea, i) => (
                        <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-slate-800">{idea.topic}</p>
                            {idea.format && <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-600 uppercase">{idea.format}</span>}
                            {idea.urgency && <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-100 text-[10px] font-bold text-amber-700 uppercase">{idea.urgency}</span>}
                          </div>
                          {idea.angle && <p className="text-xs text-slate-600 font-medium">{idea.angle}</p>}
                          {idea.hook && <p className="text-xs text-slate-500 italic">“{idea.hook}”</p>}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-400 font-medium">
                              {idea.basedOn ? `Based on: ${idea.basedOn}` : ''} {idea.hashtags?.length ? `· ${idea.hashtags.slice(0, 4).join(' ')}` : ''}
                            </p>
                            <UseButton onClick={() => writeFromIdea(`${idea.topic}. ${idea.angle} Format: ${idea.format}. Hook idea: ${idea.hook}`)}>
                              <Sparkles className="w-3 h-3" /> Write this post
                            </UseButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </Block>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Block title="Google Trends right now" icon={Globe}>
                {trendData.sources?.googleTrends?.length ? (
                  <ol className="space-y-2">
                    {trendData.sources.googleTrends.slice(0, 12).map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-slate-400 w-5 pt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setTopic(t.title)} className="text-sm font-semibold text-slate-800 hover:text-indigo-600 text-left truncate" title="Use as post brief">
                              {t.title}
                            </button>
                            {t.traffic && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{t.traffic}</span>}
                          </div>
                          {t.news?.[0]?.url && (
                            <a href={t.news[0].url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 truncate max-w-full">
                              <ExternalLink className="w-3 h-3 flex-shrink-0" /> {t.news[0].source}: {t.news[0].title}
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-500">{trendData.sources?.googleTrendsError ? 'Google Trends is unavailable right now.' : 'No trends returned.'}</p>
                )}
              </Block>

              <Block title="Trending on YouTube" icon={Youtube}>
                {trendData.sources?.youtube?.length ? (
                  <div className="space-y-2">
                    {trendData.sources.youtube.slice(0, 8).map((v) => (
                      <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" className="flex gap-3 p-1.5 rounded-xl hover:bg-slate-50">
                        {v.thumbnail && <img src={v.thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-100" />}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 line-clamp-2">{v.title}</p>
                          <p className="text-[11px] text-slate-500 font-medium truncate">{v.channel}{v.views ? ` · ${formatViews(v.views)}` : ''}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">{trendData.sources?.youtubeError || 'No YouTube trends returned.'}</p>
                )}
              </Block>
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              Live data from Google Trends and YouTube. Facebook, Instagram and X don't offer public trending data,
              so their ideas are AI-suggested from these live signals.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderEvents = () => (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={eventDays} onChange={(e) => setEventDays(Number(e.target.value))} className={`${inputCls} sm:w-48 cursor-pointer`}>
          <option value={30}>Next 30 days</option>
          <option value={45}>Next 45 days</option>
          <option value={60}>Next 60 days</option>
          <option value={90}>Next 90 days</option>
        </select>
        <button
          type="button"
          onClick={() => loadEvents(Boolean(eventsData))}
          disabled={eventsLoading}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white text-sm font-bold shadow-sm disabled:opacity-60"
        >
          {eventsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : eventsData ? <RefreshCw className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
          {eventsData ? 'Refresh events' : 'Show upcoming festivals & events'}
        </button>
      </div>

      {eventsLoading && <Spinner label="Checking the calendar…" />}

      {!eventsLoading && eventsData && (
        <div className="space-y-3">
          {eventsData.aiError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">{eventsData.aiError}</p>
          )}
          {eventsData.events?.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">No events found for this period.</p>
          )}
          {eventsData.events?.map((ev, i) => {
            const d = new Date(`${ev.date}T00:00:00`);
            return (
              <div key={`${ev.date}-${i}`} className="flex gap-4 p-4 rounded-2xl border border-slate-200 bg-white">
                <div className="flex-shrink-0 w-14 h-16 rounded-xl bg-gradient-to-b from-indigo-500 to-purple-500 text-white flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                  <span className="text-xl font-black leading-none">{d.getDate()}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{ev.name}</p>
                    {ev.type && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">{ev.type}</span>}
                    <span className="text-[11px] font-semibold text-slate-400">
                      {d.toLocaleDateString('en-US', { weekday: 'short' })} · {daysUntil(ev.date)}
                    </span>
                  </div>
                  {ev.dateConfidence === 'approximate' && (
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="w-3 h-3" /> Date may vary — please verify before scheduling
                    </p>
                  )}
                  {ev.description && <p className="text-xs text-slate-600 font-medium">{ev.description}</p>}
                  {ev.contentIdeas?.length > 0 && (
                    <div className="space-y-1.5">
                      {ev.contentIdeas.map((idea, j) => (
                        <div key={j} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
                          <p className="text-xs text-slate-700 font-medium">{idea}</p>
                          <UseButton onClick={() => writeFromIdea(`${ev.name} (${ev.date}): ${idea}`)}>
                            <Sparkles className="w-3 h-3" /> Write
                          </UseButton>
                        </div>
                      ))}
                    </div>
                  )}
                  {ev.hashtags?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ev.hashtags.map((h) => (
                        <span key={h} className="text-[11px] font-semibold text-indigo-600">{h}</span>
                      ))}
                      <button type="button" onClick={() => addTags(ev.hashtags)} className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 ml-1">
                        + add to caption
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {eventsData.source === 'ai' && eventsData.events?.length > 0 && (
            <p className="text-[11px] text-slate-400 font-medium">
              Dates are AI-suggested. Add CALENDARIFIC_API_KEY on the server for an official holiday calendar.
            </p>
          )}
        </div>
      )}
    </div>
  );

  // ── Layout ─────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-3xl border border-indigo-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-5 md:p-6 text-left bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-pink-50/60 hover:from-indigo-50 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-800">AI Assistant</h3>
          <p className="text-xs text-slate-500 font-medium">Titles, captions, hashtags, tags, best times, trends and festival ideas</p>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="p-5 md:p-6 space-y-5 border-t border-indigo-100">
              {status && status.configured === false && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  AI is not configured on the server yet. Add ANTHROPIC_API_KEY (or OPENAI_API_KEY) to the backend .env and restart.
                  Live trends will still load.
                </div>
              )}

              {/* Shared settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Region">
                  <select value={region} onChange={(e) => setRegion(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Brand / niche (optional)">
                  <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. personalised gifts, news, insurance" className={inputCls} />
                </Field>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                      tab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <t.icon className="w-4 h-4" /> {t.label}
                  </button>
                ))}
              </div>

              {tab === 'write' && renderWrite()}
              {tab === 'trending' && renderTrending()}
              {tab === 'events' && renderEvents()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AIAssistPanel;
