// ─────────────────────────────────────────────────────────────────────────────
// Dashboard AI assistant
//   <AIAssistantSection />  inline "How may I help you?" block on the dashboard
//   <AIAssistantLauncher /> floating AI button + slide-over panel
//
// Uses only existing endpoints:
//   • getLiveTrends()  → /ai/trends/sources (cached 10 min, shared with TrendsExplorer)
//   • getAIStatus()    → /ai/status (cached once per page load)
//   • Prompts are handed to the AI Agent page (/agent), which sends them.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles, Send, X, Bot, Flame, PenLine, CalendarClock, Lightbulb, Wand2, Hash,
  TrendingUp, ArrowRight, Inbox, AlertTriangle, FileClock, Link2, BarChart3, Zap, RefreshCw,
  Image as ImageIcon, Youtube,
} from 'lucide-react';
import { getAIStatus, getLiveTrends, loadAIPrefs, regionLabel, trendToBrief } from '../../utils/aiHelpers';
import { cn } from '../../lib/utils';

// ── Quick prompts: they fill the input so the user can edit before sending ──
const QUICK_PROMPTS = [
  { icon: PenLine, title: 'Write a post', desc: 'Caption + hashtags for any platform',
    prompt: 'Write an engaging Instagram and Facebook post for my brand about ' },
  { icon: CalendarClock, title: 'Plan my week', desc: '7-day content calendar',
    prompt: 'Create a 7-day social media content plan for my brand with post ideas, formats and best times to post in IST.' },
  { icon: Flame, title: "Today's trends", desc: 'What my brand can post about',
    prompt: 'What’s trending in India today that my brand could post about? Give me 5 ideas with captions.' },
  { icon: Wand2, title: 'Improve a caption', desc: 'Make it punchier & on-brand',
    prompt: 'Improve this caption and make it more engaging: ' },
  { icon: Hash, title: 'Hashtag ideas', desc: 'Reach the right audience',
    prompt: 'Suggest 20 relevant, high-reach hashtags for a post about ' },
  { icon: Lightbulb, title: 'Festival campaign', desc: 'Upcoming festivals & events',
    prompt: 'Plan a social media campaign for the next upcoming Indian festival, with an image idea, caption and posting schedule.' },
];

const PLACEHOLDERS = [
  'Write a Diwali offer post for Instagram…',
  'Plan next week’s content calendar…',
  'Turn my latest blog into 3 tweets…',
  'What should I post today?',
  'Schedule a festive post for 7 PM tomorrow…',
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

// ── Rotating placeholder ─────────────────────────────────────────────────────
const useRotatingPlaceholder = (paused) => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % PLACEHOLDERS.length), 3200);
    return () => clearInterval(t);
  }, [paused]);
  return PLACEHOLDERS[i];
};

// ── Shared hooks ─────────────────────────────────────────────────────────────
const useAIStatus = () => {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    getAIStatus().then((s) => alive && setStatus(s));
    return () => { alive = false; };
  }, []);
  return status;
};

const useTrending = () => {
  const region = useMemo(() => loadAIPrefs().region || 'IN', []);
  const [state, setState] = useState({ loading: true, trends: [], error: null });
  const load = (refresh = false) => {
    setState((s) => ({ ...s, loading: true }));
    getLiveTrends(region, { refresh })
      .then((data) => setState({ loading: false, trends: (data?.googleTrends || []).slice(0, 6), error: data?.googleTrendsError || null }))
      .catch(() => setState({ loading: false, trends: [], error: 'Trends are unavailable right now.' }));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, region, reload: () => load(true) };
};

// ── Smart suggestions derived from the user's own data (no API calls) ───────
const buildInsights = ({ posts = [], connectedCount = 0, unread = 0 }) => {
  const list = [];
  const drafts = posts.filter((p) => p.status === 'draft').length;
  const failed = posts.filter((p) => p.status === 'failed').length;
  const scheduled = posts.filter((p) => p.status === 'scheduled').length;

  if (connectedCount === 0) list.push({ icon: Link2, tone: 'indigo', title: 'Connect your first account', desc: 'Link Facebook, Instagram or YouTube to start publishing.', to: '/accounts', cta: 'Connect' });
  if (failed > 0) list.push({ icon: AlertTriangle, tone: 'red', title: `${failed} post${failed > 1 ? 's' : ''} failed to publish`, desc: 'Review the error and retry from the Posts page.', to: '/posts', cta: 'Review' });
  if (drafts > 0) list.push({ icon: FileClock, tone: 'amber', title: `${drafts} draft${drafts > 1 ? 's' : ''} waiting`, desc: 'Finish and publish them, or let AI polish the caption.', to: '/posts', cta: 'Open' });
  if (unread > 0) list.push({ icon: Inbox, tone: 'pink', title: `${unread} unread message${unread > 1 ? 's' : ''}`, desc: 'Reply fast to keep engagement high.', to: '/inbox', cta: 'Reply' });
  if (scheduled === 0 && connectedCount > 0) list.push({ icon: CalendarClock, tone: 'purple', title: 'Nothing scheduled yet', desc: 'Ask AI to plan and schedule this week’s posts.', prompt: 'Plan and schedule 3 posts for this week across my connected channels at the best times in IST.', cta: 'Plan with AI' });
  list.push({ icon: BarChart3, tone: 'emerald', title: 'Check what’s working', desc: 'See reach and engagement by platform.', to: '/analytics', cta: 'Analytics' });
  return list.slice(0, 4);
};

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  red: 'bg-red-50 text-red-600 ring-red-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  pink: 'bg-pink-50 text-pink-600 ring-pink-100',
  purple: 'bg-purple-50 text-purple-600 ring-purple-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
};

// ── Prompt box ───────────────────────────────────────────────────────────────
const PromptBox = ({ value, setValue, onSend, inputRef, compact }) => {
  const placeholder = useRotatingPlaceholder(Boolean(value));
  return (
    <div className="sh-ai-input">
      <div className="flex items-end gap-2 rounded-[0.95rem] bg-white p-2">
        <span className="hidden sm:inline-flex w-9 h-9 mb-0.5 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Sparkles className="w-[18px] h-[18px]" />
        </span>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          rows={compact ? 2 : Math.min(4, Math.max(1, value.split('\n').length))}
          placeholder={placeholder}
          aria-label="Ask the AI assistant"
          className="flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Send to AI Agent"
          className="sh-btn-gradient shrink-0 inline-flex items-center gap-1.5 h-10 px-3 sm:px-4 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      </div>
    </div>
  );
};

// ── Body shared by inline section and slide-over panel ───────────────────────
const useAssistant = () => {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const send = (text = value) => {
    const prompt = text.trim();
    if (!prompt) return;
    navigate('/agent', { state: { agentPrompt: prompt } });
  };
  const fill = (prompt) => {
    setValue(prompt);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(prompt.length, prompt.length); }
    });
  };
  return { navigate, value, setValue, inputRef, send, fill };
};

const StatusPill = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-white/80 border border-slate-200 text-[11px] font-semibold text-slate-600">
    <span className={cn('w-1.5 h-1.5 rounded-full', status == null ? 'bg-slate-300 animate-pulse' : status.configured ? 'bg-emerald-500' : 'bg-amber-500')} />
    {status == null ? 'Checking AI…' : status.configured ? 'AI online' : 'AI not set up'}
  </span>
);

const QuickActions = ({ onPick, cols = 'sm:grid-cols-2 xl:grid-cols-3' }) => (
  <motion.div variants={container} initial="hidden" animate="show" className={cn('grid grid-cols-2 gap-2 sm:gap-3', cols)}>
    {QUICK_PROMPTS.map((q) => (
      <motion.button
        key={q.title}
        variants={item}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={() => onPick(q.prompt)}
        className="group text-left rounded-xl border border-slate-200/80 bg-white p-3 sm:p-3.5 shadow-card hover:border-indigo-200 hover:shadow-card-hover transition-[border-color,box-shadow]"
      >
        <span className="inline-flex w-8 h-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-pink-50 text-indigo-600 ring-1 ring-inset ring-indigo-100 group-hover:scale-105 transition-transform">
          <q.icon className="w-4 h-4" />
        </span>
        <span className="mt-2 block text-[13px] sm:text-sm font-semibold text-slate-900 leading-snug">{q.title}</span>
        <span className="mt-0.5 hidden sm:block text-xs text-slate-500 leading-snug">{q.desc}</span>
      </motion.button>
    ))}
  </motion.div>
);

const Insights = ({ insights, onPrompt, navigate }) => (
  <motion.ul variants={container} initial="hidden" animate="show" className="space-y-2">
    {insights.map((s) => (
      <motion.li key={s.title} variants={item}>
        <button
          type="button"
          onClick={() => (s.prompt ? onPrompt(s.prompt) : navigate(s.to))}
          className="group w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-card-hover transition-all text-left"
        >
          <span className={cn('w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg ring-1 ring-inset', TONES[s.tone])}>
            <s.icon className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-900 truncate">{s.title}</span>
            <span className="block text-xs text-slate-500 truncate">{s.desc}</span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:gap-1.5 transition-all">
            {s.cta} <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </button>
      </motion.li>
    ))}
  </motion.ul>
);

const TrendingList = ({ trending, onCreate, onAsk, limit = 5 }) => {
  if (trending.loading) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 rounded-xl bg-gradient-to-r from-slate-100 via-indigo-50/70 to-slate-100 animate-pulse" />)}</div>;
  }
  if (!trending.trends.length) {
    return <p className="text-xs text-slate-500 py-4 text-center">{trending.error || 'No trends right now — try refreshing.'}</p>;
  }
  return (
    <motion.ol variants={container} initial="hidden" animate="show" className="space-y-1.5">
      {trending.trends.slice(0, limit).map((t, i) => (
        <motion.li key={t.title} variants={item} className="group flex items-center gap-2.5 p-2 pr-2.5 rounded-xl hover:bg-indigo-50/50 transition-colors">
          <span className={cn('w-6 h-6 shrink-0 rounded-md inline-flex items-center justify-center text-[11px] font-bold tabular-nums', i < 3 ? 'sh-grad-logo text-white' : 'bg-slate-100 text-slate-500')}>{i + 1}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-900 truncate">{t.title}</span>
            {t.traffic && <span className="block text-[11px] text-emerald-600 font-medium">{t.traffic} searches</span>}
          </span>
          <button type="button" onClick={() => onAsk(t)} className="opacity-100 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-7 px-2 rounded-lg text-[11px] font-semibold text-indigo-600 hover:bg-white" title="Ask AI about this">
            Ask AI
          </button>
          <button type="button" onClick={() => onCreate(t)} className="sh-btn-gradient h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1" title="Create a post">
            <Sparkles className="w-3 h-3" /> Post
          </button>
        </motion.li>
      ))}
    </motion.ol>
  );
};

const CardHead = ({ icon: Icon, title, subtitle, right }) => (
  <div className="flex items-center justify-between gap-2 mb-3">
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg sh-grad-logo text-white shadow-sm"><Icon className="w-4 h-4" /></span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// Inline dashboard section
// ═════════════════════════════════════════════════════════════════════════════
export const AIAssistantSection = ({ userName, posts, connectedCount, unread }) => {
  const { navigate, value, setValue, inputRef, send, fill } = useAssistant();
  const status = useAIStatus();
  const trending = useTrending();
  const insights = useMemo(() => buildInsights({ posts, connectedCount, unread }), [posts, connectedCount, unread]);

  const createFromTrend = (t) => navigate('/posts/new', { state: { aiBrief: trendToBrief(t), platformHint: null } });
  const askAboutTrend = (t) => send(`"${t.title}" is trending in ${regionLabel(trending.region)} today. How can my brand join this conversation? Give me 3 post ideas with captions.`);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      data-testid="dashboard-ai-assistant"
      className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-5 mb-6 sm:mb-8"
    >
      {/* ── Ask AI ── */}
      <div className="xl:col-span-3 sh-card sh-card--accent relative overflow-hidden p-4 sm:p-6 flex flex-col">
        <span className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full [background:radial-gradient(closest-side,rgb(192 132 252/0.24),transparent)] sh-float" />
        <span className="pointer-events-none absolute -left-16 -bottom-28 w-64 h-64 rounded-full [background:radial-gradient(closest-side,rgb(244 114 182/0.16),transparent)] sh-float [animation-delay:-4s]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="sh-logo-mark sh-logo-mark--lg"><Bot /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-indigo-600">AI Assistant</p>
                <h2 className="font-heading text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                  Hi {userName || 'there'}, how may I help you today?
                </h2>
              </div>
            </div>
            <StatusPill status={status} />
          </div>

          <PromptBox value={value} setValue={setValue} onSend={() => send()} inputRef={inputRef} />
          <p className="mt-2 mb-5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Zap className="w-3 h-3" /> Opens in AI Agent — nothing is posted until you approve it.
          </p>

          <p className="sh-eyebrow mb-2.5">Quick actions</p>
          <QuickActions onPick={fill} />
        </div>

        {/* What the full agent can do */}
        <div className="relative mt-5 xl:mt-auto pt-5">
          <div className="rounded-xl border border-indigo-100 [background:var(--grad-soft)] p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">Do more with AI Agent</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[[ImageIcon, 'Generate images'], [Wand2, 'Enhance photos'], [CalendarClock, 'Auto-schedule'], [Youtube, 'YouTube uploads']].map(([Icon, label]) => (
                  <span key={label} className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-white/80 ring-1 ring-inset ring-indigo-100 text-[11px] font-medium text-slate-700">
                    <Icon className="w-3 h-3 text-indigo-500" /> {label}
                  </span>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => navigate('/agent')}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-white border border-indigo-200 text-sm font-semibold text-indigo-700 hover:border-indigo-300 hover:shadow-card-hover transition-all">
              Open AI Agent <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 sm:gap-5">
        <div className="sh-card p-4 sm:p-5">
          <CardHead icon={Lightbulb} title="Smart suggestions" subtitle="Based on your account activity" />
          <Insights insights={insights} onPrompt={send} navigate={navigate} />
        </div>
        <div className="sh-card p-4 sm:p-5">
          <CardHead
            icon={TrendingUp}
            title="Today's trending topics"
            subtitle={`Top searches in ${regionLabel(trending.region)}`}
            right={(
              <button type="button" onClick={trending.reload} disabled={trending.loading} title="Refresh trends"
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 disabled:opacity-50">
                <RefreshCw className={cn('w-3.5 h-3.5', trending.loading && 'animate-spin')} />
              </button>
            )}
          />
          <TrendingList trending={trending} onCreate={createFromTrend} onAsk={askAboutTrend} />
        </div>
      </div>
    </motion.section>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// Floating AI button + slide-over panel
// ═════════════════════════════════════════════════════════════════════════════
export const AIAssistantLauncher = ({ open, onOpenChange, userName, posts, connectedCount, unread }) => {
  const { navigate, value, setValue, inputRef, send, fill } = useAssistant();
  const status = useAIStatus();
  const trending = useTrending();
  const insights = useMemo(() => buildInsights({ posts, connectedCount, unread }), [posts, connectedCount, unread]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open, onOpenChange, inputRef]);

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            type="button"
            data-testid="dashboard-ai-fab"
            onClick={() => onOpenChange(true)}
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            aria-label="Open AI assistant"
            className="sh-ai-fab fixed z-40 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 inline-flex items-center gap-2 h-14 pl-4 pr-5 rounded-full text-white font-semibold text-sm"
          >
            <Sparkles className="w-5 h-5" />
            <span className="hidden sm:inline">Ask AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              className="fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[2px]"
            />
            <motion.aside
              key="panel"
              role="dialog"
              aria-label="AI assistant"
              data-testid="dashboard-ai-panel"
              initial={{ x: '100%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed z-[70] inset-y-0 right-0 w-full sm:w-[440px] bg-white sm:rounded-l-[1.5rem] shadow-pop flex flex-col"
            >
              <div className="flex items-center justify-between gap-3 px-5 h-16 border-b border-slate-100 bg-gradient-to-r from-indigo-50/70 via-white to-pink-50/40 sm:rounded-tl-[1.5rem] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="sh-logo-mark"><Bot /></span>
                  <div className="min-w-0">
                    <p className="font-heading font-semibold text-slate-900 leading-tight">AI Assistant</p>
                    <p className="text-[11px] text-slate-500 truncate">Hi {userName || 'there'} — how may I help you?</p>
                  </div>
                </div>
                <button type="button" onClick={() => onOpenChange(false)} aria-label="Close AI assistant"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                <div>
                  <div className="flex justify-end mb-2"><StatusPill status={status} /></div>
                  <PromptBox value={value} setValue={setValue} onSend={() => send()} inputRef={inputRef} compact />
                </div>
                <div>
                  <p className="sh-eyebrow mb-2.5">Quick actions</p>
                  <QuickActions onPick={fill} cols="" />
                </div>
                <div>
                  <p className="sh-eyebrow mb-2.5">Suggestions for you</p>
                  <Insights insights={insights} onPrompt={send} navigate={navigate} />
                </div>
                <div>
                  <p className="sh-eyebrow mb-2.5">Trending in {regionLabel(trending.region)}</p>
                  <TrendingList
                    trending={trending}
                    limit={6}
                    onCreate={(t) => navigate('/posts/new', { state: { aiBrief: trendToBrief(t), platformHint: null } })}
                    onAsk={(t) => send(`"${t.title}" is trending in ${regionLabel(trending.region)} today. How can my brand join this conversation? Give me 3 post ideas with captions.`)}
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => navigate('/agent')}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
                  <Bot className="w-4 h-4" /> Open full AI Agent <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistantSection;
