import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, Youtube, Instagram, Facebook, CalendarDays, RefreshCw, Loader2, ExternalLink,
  Sparkles, Heart, MessageCircle, AlertTriangle, Image as ImageIcon, Play, Info, Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { aiAPI } from '../../services/api';
import { PlatformIcon } from '../accounts/PlatformIcon';
import {
  REGIONS, regionLabel, loadAIPrefs, saveAIPrefs, getLiveTrends, formatCount, daysUntil,
  ideaToBrief, trendToBrief, videoToBrief,
} from '../../utils/aiHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// Trending topics + post ideas for Google, YouTube, Instagram, Facebook and
// upcoming festivals. Used on the Dashboard and inside the post composer.
//   onCreate(brief, platformHint) is called when the user picks a trend/idea.
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'google', label: 'Google', icon: Globe, color: 'text-blue-600' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-600' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-600' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-700' },
  { id: 'festivals', label: 'Festivals & events', icon: CalendarDays, color: 'text-purple-600' },
];

const IDEA_PLATFORMS = 'facebook,instagram,youtube';

const inputCls =
  'h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm outline-none hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';

const CreateButton = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="sh-btn-gradient inline-flex items-center gap-1 h-7 px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0"
  >
    <Sparkles className="w-3 h-3" /> {label}
  </button>
);

const SectionTitle = ({ icon: Icon, children, right }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
      <Icon className="w-3.5 h-3.5" /> {children}
    </h4>
    {right}
  </div>
);

const Note = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-medium ${tones[tone]}`}>
      {tone === 'amber' ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <Info className="w-4 h-4 flex-shrink-0" />}
      <span>{children}</span>
    </div>
  );
};

const SkeletonRows = ({ rows = 4 }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-gradient-to-r from-slate-100 via-indigo-50/70 to-slate-100 animate-pulse" />)}
  </div>
);

// ── Building blocks ─────────────────────────────────────────────────────────
const GoogleTrendList = ({ trends = [], onCreate, createLabel, limit }) => (
  <ol className="space-y-2">
    {trends.slice(0, limit).map((t, i) => (
      <li key={`${t.title}-${i}`} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-card-hover transition-all">
        <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 tabular-nums ${i < 3 ? 'sh-grad-logo text-white shadow-sm' : 'bg-indigo-50 text-indigo-600'}`}>{i + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{t.title}</p>
            {t.traffic && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-200 px-1.5 py-0.5 rounded-md">{t.traffic} searches</span>}
          </div>
          {t.news?.[0]?.url && (
            <a href={t.news[0].url} target="_blank" rel="noopener noreferrer" className="mt-0.5 text-[11px] text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 max-w-full">
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{t.news[0].source}: {t.news[0].title}</span>
            </a>
          )}
        </div>
        <CreateButton onClick={() => onCreate(trendToBrief(t), null)} label={createLabel} />
      </li>
    ))}
  </ol>
);

const YouTubeGrid = ({ videos = [], onCreate, createLabel, compact }) => (
  <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
    {videos.map((v) => (
      <div key={v.id} className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden flex flex-col hover:border-indigo-200 hover:shadow-card-hover transition-all">
        <a href={v.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-video bg-slate-100 group">
          {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <span className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="w-4 h-4 text-white fill-white" />
            </span>
          </span>
        </a>
        <div className="p-3 flex-1 flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-900 line-clamp-2">{v.title}</p>
          <p className="text-[11px] text-slate-500 font-medium truncate">{v.channel}{v.views ? ` · ${formatCount(v.views)} views` : ''}</p>
          <div className="mt-auto flex items-center justify-between gap-2">
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-slate-500 hover:text-red-600 inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Watch
            </a>
            <CreateButton onClick={() => onCreate(videoToBrief(v), 'youtube')} label={createLabel} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const InstagramPosts = ({ data, onCreate, createLabel, compact }) => {
  if (!data) return <SkeletonRows rows={2} />;
  if (!data.groups?.length) return <Note tone="amber">{data.error || 'No Instagram posts found for today\'s hashtags.'}</Note>;

  return (
    <div className="space-y-4">
      {data.error && <Note tone="amber">{data.error}</Note>}
      {data.groups.map((g) => (
        <div key={g.hashtag}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-bold text-pink-700">{g.hashtag}</p>
            <CreateButton onClick={() => onCreate(`Today's trending Instagram hashtag ${g.hashtag}. Create an original post that fits this trend.`, 'instagram')} label={createLabel} />
          </div>
          {g.posts.length === 0 ? (
            <p className="text-xs text-slate-500">No public top posts for this hashtag.</p>
          ) : (
            <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
              {g.posts.map((p) => (
                <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className="group rounded-xl overflow-hidden border border-slate-100 bg-white">
                  <div className="aspect-square bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center overflow-hidden">
                    {p.mediaUrl
                      ? <img src={p.mediaUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                      : (p.mediaType === 'VIDEO' ? <Play className="w-6 h-6 text-pink-400" /> : <ImageIcon className="w-6 h-6 text-pink-300" />)}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                      <span className="inline-flex items-center gap-0.5"><Heart className="w-3 h-3 text-pink-500" />{formatCount(p.likes)}</span>
                      <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-3 h-3 text-slate-400" />{formatCount(p.comments)}</span>
                    </p>
                    {p.caption && <p className="text-[10px] text-slate-500 line-clamp-2">{p.caption}</p>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const IdeaList = ({ ideas = [], onCreate, createLabel, loading, error }) => {
  if (loading && !ideas.length) return <SkeletonRows rows={3} />;
  if (!ideas.length) return error ? <Note tone="amber">{error}</Note> : <p className="text-xs text-slate-500">No ideas yet.</p>;
  return (
    <div className="space-y-2">
      {ideas.map((idea, i) => (
        <div key={i} className="p-3.5 rounded-xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-card-hover transition-all">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformIcon platform={idea.platform} size="sm" />
                <p className="text-sm font-semibold text-slate-900">{idea.topic}</p>
                {idea.format && <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600 uppercase">{idea.format}</span>}
                {idea.urgency && <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-100 text-[10px] font-bold text-amber-700 uppercase">{idea.urgency}</span>}
              </div>
              {idea.angle && <p className="text-xs text-slate-600 font-medium">{idea.angle}</p>}
              {idea.hook && <p className="text-xs text-slate-500 italic">“{idea.hook}”</p>}
              <p className="text-[11px] text-slate-400 font-medium">
                {idea.basedOn ? `Based on: ${idea.basedOn}` : ''}{idea.hashtags?.length ? ` · ${idea.hashtags.slice(0, 4).join(' ')}` : ''}
              </p>
            </div>
            <CreateButton onClick={() => onCreate(ideaToBrief(idea), idea.platform)} label={createLabel} />
          </div>
        </div>
      ))}
    </div>
  );
};

const EventList = ({ events = [], onCreate, createLabel }) => (
  <div className="space-y-3">
    {events.map((ev, i) => {
      const d = new Date(`${ev.date}T00:00:00`);
      return (
        <div key={`${ev.date}-${i}`} className="flex gap-4 p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-card-hover transition-all">
          <div className="flex-shrink-0 w-14 h-16 rounded-xl sh-grad-logo text-white flex flex-col items-center justify-center shadow-button">
            <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
            <span className="text-xl font-black leading-none">{d.getDate()}</span>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-800">{ev.name}</p>
              {ev.type && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">{ev.type}</span>}
              <span className="text-[11px] font-semibold text-slate-400">{d.toLocaleDateString('en-US', { weekday: 'short' })} · {daysUntil(ev.date)}</span>
            </div>
            {ev.dateConfidence === 'approximate' && (
              <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="w-3 h-3" /> Date may vary — please verify before scheduling
              </p>
            )}
            {ev.description && <p className="text-xs text-slate-600 font-medium">{ev.description}</p>}
            {ev.contentIdeas?.map((idea, j) => (
              <div key={j} className="flex items-center justify-between gap-2 p-2 pl-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-xs text-slate-700 font-medium">{idea}</p>
                <CreateButton onClick={() => onCreate(`${ev.name} (${ev.date}): ${idea}`, null)} label={createLabel} />
              </div>
            ))}
            {ev.hashtags?.length > 0 && <p className="text-[11px] font-semibold text-indigo-600">{ev.hashtags.join(' ')}</p>}
          </div>
        </div>
      );
    })}
  </div>
);

// ── Main component ──────────────────────────────────────────────────────────
export const TrendsExplorer = ({
  onCreate,
  createLabel = 'Create post',
  compact = false,
  region: regionProp,
  niche: nicheProp,
  onPrefsChange,
}) => {
  const saved = useRef(loadAIPrefs()).current;
  const [regionState, setRegionState] = useState(saved.region || 'IN');
  const [nicheState, setNicheState] = useState(saved.niche || '');
  const region = regionProp ?? regionState;
  const niche = nicheProp ?? nicheState;
  const [nicheDraft, setNicheDraft] = useState(niche);
  useEffect(() => { setNicheDraft(niche); }, [niche]);

  const updatePrefs = (patch) => {
    if (onPrefsChange) onPrefsChange(patch);
    else {
      if (patch.region !== undefined) setRegionState(patch.region);
      if (patch.niche !== undefined) setNicheState(patch.niche);
      saveAIPrefs(patch);
    }
  };

  const [tab, setTab] = useState('google');

  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [ideas, setIdeas] = useState(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [instagram, setInstagram] = useState(null);
  const [events, setEvents] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventDays, setEventDays] = useState(45);

  const loadLive = useCallback(async (refresh = false) => {
    setLiveLoading(true);
    try {
      setLive(await getLiveTrends(region, { refresh }));
    } catch (err) {
      setLive({ googleTrends: [], youtube: [], googleTrendsError: err.response?.data?.detail || 'Could not load trends' });
    } finally {
      setLiveLoading(false);
    }
  }, [region]);

  const loadIdeas = useCallback(async (refresh = false) => {
    setIdeasLoading(true);
    try {
      const res = await aiAPI.trending({ region, niche, platforms: IDEA_PLATFORMS, perPlatform: compact ? 2 : 3, refresh: refresh ? 'true' : undefined });
      setIdeas(res.data);
    } catch (err) {
      setIdeas({ ideas: [], aiError: err.response?.data?.detail || 'Could not load AI ideas' });
    } finally {
      setIdeasLoading(false);
    }
  }, [region, niche, compact]);

  const loadInstagram = useCallback(async (refresh = false) => {
    setInstagram(null);
    const tags = [...new Set((ideas?.ideas || [])
      .filter((i) => i.platform === 'instagram')
      .flatMap((i) => i.hashtags || []))].slice(0, 3);
    try {
      const res = await aiAPI.instagramTrends({ region, hashtags: tags.join(','), refresh: refresh ? 'true' : undefined });
      setInstagram(res.data);
    } catch (err) {
      setInstagram({ groups: [], error: err.response?.data?.detail || 'Could not load Instagram posts' });
    }
  }, [region, ideas]);

  const loadEvents = useCallback(async (refresh = false) => {
    setEventsLoading(true);
    try {
      const res = await aiAPI.events({ region, days: eventDays, niche, refresh: refresh ? 'true' : undefined });
      setEvents(res.data);
    } catch (err) {
      setEvents({ events: [], aiError: err.response?.data?.detail || 'Could not load upcoming events' });
    } finally {
      setEventsLoading(false);
    }
  }, [region, eventDays, niche]);

  // Live data + AI ideas load straight away; Instagram and festivals load when their tab opens
  const igKey = `${region}|${niche}`;
  const eventsKey = `${region}|${niche}|${eventDays}`;
  const igLoadedFor = useRef('');
  const eventsLoadedFor = useRef('');

  useEffect(() => { loadLive(); }, [loadLive]);
  useEffect(() => { loadIdeas(); }, [loadIdeas]);
  useEffect(() => {
    if (tab === 'instagram' && !ideasLoading && igLoadedFor.current !== igKey) {
      igLoadedFor.current = igKey;
      loadInstagram();
    }
  }, [tab, ideasLoading, igKey, loadInstagram]);
  useEffect(() => {
    if (tab === 'festivals' && eventsLoadedFor.current !== eventsKey) {
      eventsLoadedFor.current = eventsKey;
      loadEvents();
    }
  }, [tab, eventsKey, loadEvents]);

  const refreshAll = () => {
    loadLive(true);
    loadIdeas(true);
    if (tab === 'instagram') loadInstagram(true);
    if (tab === 'festivals') loadEvents(true);
    toast.success('Refreshing trends…');
  };

  const ideasFor = useMemo(() => {
    const list = ideas?.ideas || [];
    return (p) => list.filter((i) => i.platform === p);
  }, [ideas]);

  const busy = liveLoading || ideasLoading || eventsLoading;
  const googleTrends = live?.googleTrends || [];
  const videos = live?.youtube || [];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-2">
        <div className="sh-segmented !flex overflow-x-auto flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`sh-segmented__btn flex-1 !h-8 !text-xs ${tab === t.id ? 'is-active' : ''}`}
            >
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? t.color : ''}`} /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 2xl:justify-end">
          <select value={region} onChange={(e) => updatePrefs({ region: e.target.value })} className={`${inputCls} cursor-pointer`} title="Region">
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input
            value={nicheDraft}
            onChange={(e) => setNicheDraft(e.target.value)}
            onBlur={() => nicheDraft !== niche && updatePrefs({ niche: nicheDraft })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            placeholder="Your niche (optional)"
            className={`${inputCls} flex-1 min-w-0 2xl:flex-none 2xl:w-44`}
            title="Ideas are tailored to this niche"
          />
          <button type="button" onClick={refreshAll} disabled={busy} className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm text-slate-500 hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-50" title="Refresh">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {ideas?.summary && tab !== 'festivals' && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-indigo-100 text-xs sm:text-sm text-indigo-900 font-medium [background:var(--grad-soft)]">
          <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" /> {ideas.summary}
        </div>
      )}

      {/* Google */}
      {tab === 'google' && (
        <div>
          <SectionTitle icon={Globe}>Top Google searches in {regionLabel(region)} right now</SectionTitle>
          {!live ? <SkeletonRows rows={5} /> : googleTrends.length
            ? <GoogleTrendList trends={googleTrends} onCreate={onCreate} createLabel={createLabel} limit={compact ? 8 : 15} />
            : <Note tone="amber">{live.googleTrendsError ? 'Google Trends is unavailable right now. Try refreshing in a few minutes.' : 'No trends returned.'}</Note>}
        </div>
      )}

      {/* YouTube */}
      {tab === 'youtube' && (
        <div className="space-y-5">
          <div>
            <SectionTitle icon={Youtube}>Trending videos on YouTube</SectionTitle>
            {!live ? <SkeletonRows rows={3} /> : videos.length
              ? <YouTubeGrid videos={videos.slice(0, compact ? 4 : 9)} onCreate={onCreate} createLabel={createLabel} compact={compact} />
              : <Note tone="amber">{live.youtubeError || 'No YouTube trends returned.'}</Note>}
          </div>
          <div>
            <SectionTitle icon={Sparkles}>Video ideas for your channel</SectionTitle>
            <IdeaList ideas={ideasFor('youtube')} onCreate={onCreate} createLabel={createLabel} loading={ideasLoading} error={ideas?.aiError} />
          </div>
        </div>
      )}

      {/* Instagram */}
      {tab === 'instagram' && (
        <div className="space-y-5">
          <div>
            <SectionTitle icon={Instagram}>Top Instagram posts for today's hashtags</SectionTitle>
            <InstagramPosts data={instagram} onCreate={onCreate} createLabel={createLabel} compact={compact} />
          </div>
          <div>
            <SectionTitle icon={Sparkles}>Instagram post ideas</SectionTitle>
            <IdeaList ideas={ideasFor('instagram')} onCreate={onCreate} createLabel={createLabel} loading={ideasLoading} error={ideas?.aiError} />
          </div>
        </div>
      )}

      {/* Facebook */}
      {tab === 'facebook' && (
        <div className="space-y-5">
          <Note>Facebook doesn't share trending topics publicly, so these ideas are built from today's Google searches and YouTube trends in {regionLabel(region)}.</Note>
          <div>
            <SectionTitle icon={Sparkles}>Facebook post ideas</SectionTitle>
            <IdeaList ideas={ideasFor('facebook')} onCreate={onCreate} createLabel={createLabel} loading={ideasLoading} error={ideas?.aiError} />
          </div>
          {googleTrends.length > 0 && (
            <div>
              <SectionTitle icon={Globe}>What people are searching for</SectionTitle>
              <GoogleTrendList trends={googleTrends} onCreate={onCreate} createLabel={createLabel} limit={5} />
            </div>
          )}
        </div>
      )}

      {/* Festivals */}
      {tab === 'festivals' && (
        <div className="space-y-3">
          <SectionTitle
            icon={CalendarDays}
            right={(
              <select value={eventDays} onChange={(e) => setEventDays(Number(e.target.value))} className={`${inputCls} cursor-pointer`}>
                <option value={30}>Next 30 days</option>
                <option value={45}>Next 45 days</option>
                <option value={60}>Next 60 days</option>
                <option value={90}>Next 90 days</option>
              </select>
            )}
          >
            Upcoming festivals & events in {regionLabel(region)}
          </SectionTitle>
          {eventsLoading || !events ? <SkeletonRows rows={3} /> : (
            <>
              {events.aiError && <Note tone="amber">{events.aiError}</Note>}
              {events.events?.length ? <EventList events={events.events} onCreate={onCreate} createLabel={createLabel} />
                : !events.aiError && <p className="text-sm text-slate-500 text-center py-6">No events found for this period.</p>}
              {events.source === 'ai' && events.events?.length > 0 && (
                <p className="text-[11px] text-slate-400 font-medium">Dates are AI-suggested. Add CALENDARIFIC_API_KEY on the server for an official holiday calendar.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TrendsExplorer;
