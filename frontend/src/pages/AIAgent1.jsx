// pages/AIAgent.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AI Agent: chat with Claude to plan, write, design, enhance, publish and
// schedule posts. Before anything goes live the agent shows a post card where
// you choose the channels / Facebook pages and press "Post now" or "Schedule".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Bot, Send, Paperclip, X, Plus, Trash2, Loader2, Image as ImageIcon, Video,
  Check, AlertTriangle, Clock, ExternalLink, History, Sparkles, CalendarClock,
} from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { PlatformIcon } from '../components/accounts/PlatformIcon';
import { useAccounts } from '../context/AccountsContext';
import { agentAPI, accountsAPI } from '../services/api';
import { cn } from '../lib/utils';

const STARTERS = [
  'Create a Diwali post for Instagram and Facebook with an image, and schedule it for the best time',
  'What’s trending in India today that my brand could post about?',
  'Enhance the photo I upload and write a caption for it',
  'Turn my video into a YouTube upload with a title, description and tags',
];

const isVideoUrl = (url = '') => /\.(mp4|mov|avi|mkv|webm|ogg)(\?|$)/i.test(url);
const toLocalInput = (date) => format(date, "yyyy-MM-dd'T'HH:mm");
const nextFullHour = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
};
const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;

// ── Lightweight text formatting (bold + bullet lines) ────────────────────────
const renderInline = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );

const FormattedText = ({ text }) => (
  <div className="space-y-1.5 text-[15px] leading-relaxed text-slate-700">
    {text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-1" />;
      const bullet = trimmed.match(/^([-•*]|\d+\.)\s+(.*)$/);
      if (bullet) {
        return (
          <div key={i} className="flex gap-2 pl-1">
            <span className="text-slate-400 select-none">{/\d/.test(bullet[1]) ? bullet[1] : '•'}</span>
            <span>{renderInline(bullet[2])}</span>
          </div>
        );
      }
      const heading = trimmed.match(/^#{1,4}\s+(.*)$/);
      if (heading) return <p key={i} className="font-semibold text-slate-900 pt-1">{renderInline(heading[1])}</p>;
      return <p key={i}>{renderInline(line)}</p>;
    })}
  </div>
);

const MediaThumb = ({ url, className }) => (
  isVideoUrl(url) ? (
    <video src={url} className={cn('object-cover bg-slate-900', className)} muted playsInline preload="metadata" />
  ) : (
    <img src={url} alt="" className={cn('object-cover bg-slate-100', className)} loading="lazy" />
  )
);

// ── Post card: the user picks channels and confirms ──────────────────────────
const STATUS_TEXT = {
  posted: 'Posted',
  partial: 'Posted, but some channels failed',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
  dismissed: 'Skipped',
  failed: 'Failed',
};

const ProposalCard = ({ item, accounts, onConfirm, disabled }) => {
  const data = item.data || {};
  const isPending = item.status === 'pending';

  const initial = useMemo(() => {
    const selected = new Set((data.suggested_account_ids || []).filter(id => accounts.some(a => a.id === id)));
    const pages = {};
    accounts.forEach(acc => {
      if (acc.platform !== 'facebook' || !acc.pages?.length) return;
      const chosen = acc.pages.filter(p => (data.suggested_page_ids || []).includes(p.pageId)).map(p => p.pageId);
      if (chosen.length) {
        pages[acc.id] = chosen;
        selected.add(acc.id);
      }
    });
    return { selected: [...selected], pages };
  }, [data, accounts]);

  const [caption, setCaption] = useState(data.caption || '');
  const [youtubeTitle, setYoutubeTitle] = useState(data.youtube_title || '');
  const [selected, setSelected] = useState(initial.selected);
  const [pages, setPages] = useState(initial.pages);
  const [mode, setMode] = useState(data.scheduled_at ? 'schedule' : 'now');
  const [when, setWhen] = useState(toLocalInput(data.scheduled_at ? new Date(data.scheduled_at) : nextFullHour()));
  const [mediaUrls, setMediaUrls] = useState(data.media_urls || []);
  const [submitting, setSubmitting] = useState(null);
  const [problem, setProblem] = useState('');

  const selectedAccounts = accounts.filter(a => selected.includes(a.id));
  const platforms = selectedAccounts.map(a => a.platform);
  const hasYoutube = platforms.includes('youtube');

  const toggleAccount = (acc) => {
    setProblem('');
    if (selected.includes(acc.id)) {
      setSelected(prev => prev.filter(id => id !== acc.id));
      setPages(prev => { const next = { ...prev }; delete next[acc.id]; return next; });
    } else {
      setSelected(prev => [...prev, acc.id]);
      // A Facebook account with exactly one page: select that page automatically
      if (acc.platform === 'facebook' && acc.pages?.length === 1) setPages(prev => ({ ...prev, [acc.id]: [acc.pages[0].pageId] }));
    }
  };

  const togglePage = (accId, pageId) => {
    setProblem('');
    setPages(prev => {
      const current = prev[accId] || [];
      return { ...prev, [accId]: current.includes(pageId) ? current.filter(id => id !== pageId) : [...current, pageId] };
    });
  };

  const validate = (action) => {
    if (!caption.trim()) return 'The caption is empty.';
    if (!selected.length) return 'Choose at least one channel to post to.';
    for (const acc of selectedAccounts) {
      if (acc.platform === 'facebook' && acc.pages?.length && !(pages[acc.id] || []).length) {
        return `Choose at least one Facebook page for ${acc.accountName || 'Facebook'}.`;
      }
    }
    if (platforms.includes('instagram') && !mediaUrls.length) return 'Instagram needs an image or a video.';
    if (platforms.includes('twitter') && caption.length > 280) return `X allows 280 characters. This caption has ${caption.length}.`;
    if (hasYoutube && !mediaUrls.some(isVideoUrl)) return 'YouTube needs a video.';
    if (hasYoutube && !youtubeTitle.trim()) return 'Add a YouTube title.';
    if (action === 'schedule' && new Date(when).getTime() < Date.now() + 60 * 1000) return 'Pick a time in the future.';
    return '';
  };

  const submit = async (action) => {
    const issue = action === 'cancel' ? '' : validate(action);
    if (issue) { setProblem(issue); return; }
    setSubmitting(action);
    try {
      await onConfirm({
        toolUseId: item.toolUseId,
        action,
        content: caption.trim(),
        accountIds: selected,
        selectedPages: pages,
        mediaUrls,
        scheduledAt: action === 'schedule' ? new Date(when).toISOString() : null,
        youtubeTitle: youtubeTitle.trim(),
        youtubeTags: data.youtube_tags || [],
        youtubePrivacy: data.youtube_privacy || 'public',
      });
    } catch (error) {
      setProblem(errorText(error, 'Could not publish the post.'));
    } finally {
      setSubmitting(null);
    }
  };

  // ── Finished card ──
  if (!isPending) {
    const final = item.final || {};
    const results = item.result?.results || [];
    const ok = ['posted', 'scheduled'].includes(item.status);
    const shownMedia = final.mediaUrls || data.media_urls || [];
    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className={cn(
          'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b',
          ok ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : ['cancelled', 'dismissed'].includes(item.status) ? 'bg-slate-50 text-slate-500 border-slate-100'
              : 'bg-amber-50 text-amber-800 border-amber-100'
        )}>
          {ok ? <Check className="w-4 h-4" /> : ['cancelled', 'dismissed'].includes(item.status) ? <X className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {STATUS_TEXT[item.status] || item.status}
          {item.status === 'scheduled' && final.scheduledAt && (
            <span className="font-normal"> for {format(new Date(final.scheduledAt), 'EEE d MMM, h:mm a')}</span>
          )}
        </div>
        <div className="p-4 flex gap-4">
          {shownMedia[0] && <MediaThumb url={shownMedia[0]} className="w-20 h-20 rounded-xl shrink-0" />}
          <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4">{final.caption || data.caption}</p>
        </div>
        {results.length > 0 && (
          <ul className="px-4 pb-4 space-y-1.5">
            {results.map((r, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={r.platform} size="sm" />
                  <span className="capitalize text-slate-700">{r.platform}</span>
                  <span className={cn('text-xs font-medium', r.status === 'failed' ? 'text-red-600' : 'text-slate-500')}>{r.status}</span>
                </div>
                {r.error && <p className="text-xs text-red-600 ml-6">{r.error}</p>}
                {r.pages?.filter(p => p.error).map((p, j) => (
                  <p key={j} className="text-xs text-red-600 ml-6">{p.page}: {p.error}</p>
                ))}
              </li>
            ))}
          </ul>
        )}
        {item.error && <p className="px-4 pb-4 text-sm text-red-600">{item.error}</p>}
      </div>
    );
  }

  // ── Open card ──
  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-slate-100">
        <p className="font-heading font-bold text-slate-900">Ready to post</p>
        {data.notes && <p className="text-sm text-slate-500 mt-0.5">{data.notes}</p>}
      </div>

      <div className="p-5 space-y-5">
        {mediaUrls.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {mediaUrls.map(url => (
              <div key={url} className="relative">
                <MediaThumb url={url} className="w-28 h-28 rounded-xl border border-slate-200" />
                <button
                  type="button"
                  onClick={() => setMediaUrls(prev => prev.filter(u => u !== url))}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label="Remove this file from the post"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor={`caption-${item.id}`}>Caption</label>
          <textarea
            id={`caption-${item.id}`}
            value={caption}
            onChange={e => { setCaption(e.target.value); setProblem(''); }}
            rows={Math.min(12, Math.max(4, caption.split('\n').length + 1))}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
          <p className={cn('text-xs mt-1', platforms.includes('twitter') && caption.length > 280 ? 'text-red-600' : 'text-slate-400')}>
            {caption.length} characters{platforms.includes('twitter') ? ' · X limit 280' : ''}
          </p>
        </div>

        {hasYoutube && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor={`yt-${item.id}`}>YouTube title</label>
            <input
              id={`yt-${item.id}`}
              value={youtubeTitle}
              maxLength={100}
              onChange={e => setYoutubeTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Where should this go?</p>
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-500">No channels connected yet. Connect them on the Accounts page.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map(acc => {
                const on = selected.includes(acc.id);
                return (
                  <div key={acc.id} className={cn('rounded-xl border transition-colors', on ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200')}>
                    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggleAccount(acc)} className="w-4 h-4 accent-indigo-600" />
                      <PlatformIcon platform={acc.platform} size="sm" showBackground />
                      <span className="text-sm font-medium text-slate-800 truncate">{acc.accountName || acc.platform}</span>
                      <span className="text-xs text-slate-400 capitalize ml-auto">{acc.platform === 'twitter' ? 'X' : acc.platform}</span>
                    </label>
                    {on && acc.platform === 'facebook' && acc.pages?.length > 0 && (
                      <div className="px-3 pb-3 pl-10 grid sm:grid-cols-2 gap-1.5">
                        {acc.pages.map(p => (
                          <label key={p.pageId} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(pages[acc.id] || []).includes(p.pageId)}
                              onChange={() => togglePage(acc.id, p.pageId)}
                              className="w-4 h-4 accent-indigo-600"
                            />
                            <span className="truncate">{p.pageName}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">When?</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50" role="radiogroup" aria-label="When to post">
              {[['now', 'Now'], ['schedule', 'Schedule']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                    mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'schedule' && (
              <input
                type="datetime-local"
                value={when}
                min={toLocalInput(new Date())}
                onChange={e => { setWhen(e.target.value); setProblem(''); }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Scheduled date and time"
              />
            )}
          </div>
        </div>

        {problem && (
          <p className="flex items-start gap-2 text-sm text-red-600" role="alert">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={disabled || Boolean(submitting)}
            onClick={() => submit(mode === 'schedule' ? 'schedule' : 'post')}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
          >
            {submitting && submitting !== 'cancel'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : mode === 'schedule' ? <CalendarClock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            {submitting && submitting !== 'cancel'
              ? (mode === 'schedule' ? 'Scheduling…' : 'Posting…')
              : (mode === 'schedule' ? 'Schedule post' : 'Post now')}
          </button>
          <button
            type="button"
            disabled={disabled || Boolean(submitting)}
            onClick={() => submit('cancel')}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Cancel
          </button>
          {submitting && submitting !== 'cancel' && mediaUrls.some(isVideoUrl) && (
            <span className="text-xs text-slate-500">Videos can take a few minutes to upload.</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── One item in the conversation ─────────────────────────────────────────────
const ChatItem = ({ item, accounts, onConfirm, busy }) => {
  if (item.type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] space-y-2">
          {item.attachments?.length > 0 && (
            <div className="flex gap-2 justify-end flex-wrap">
              {item.attachments.map(a => <MediaThumb key={a.url} url={a.url} className="w-24 h-24 rounded-xl border border-slate-200" />)}
            </div>
          )}
          {item.text && (
            <div className="rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-[15px] leading-relaxed text-white whitespace-pre-wrap">
              {item.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.type === 'assistant') {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="max-w-[85%] pt-1"><FormattedText text={item.text} /></div>
      </div>
    );
  }

  if (item.type === 'activity') {
    return (
      <div className={cn('flex items-center gap-2 pl-11 text-xs', item.error ? 'text-red-600' : 'text-slate-400')}>
        {item.error ? <AlertTriangle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
        {item.text}
      </div>
    );
  }

  if (item.type === 'image') {
    return (
      <div className="pl-11">
        <figure className="inline-block max-w-md rounded-2xl border border-slate-200 bg-white p-2">
          {item.beforeUrl ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <img src={item.beforeUrl} alt="Original" className="w-full rounded-xl" />
                <figcaption className="text-xs text-slate-400 mt-1 px-1">Before</figcaption>
              </div>
              <div>
                <img src={item.url} alt="Enhanced" className="w-full rounded-xl" />
                <figcaption className="text-xs text-slate-500 mt-1 px-1">After</figcaption>
              </div>
            </div>
          ) : (
            <img src={item.url} alt={item.prompt || 'Generated image'} className="w-full rounded-xl" />
          )}
          <div className="flex items-center justify-between gap-3 px-1 pt-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> {item.label}
              </p>
              {item.detail && <p className="text-xs text-slate-400 truncate">{item.detail}</p>}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Full size <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </figure>
      </div>
    );
  }

  if (item.type === 'proposal') {
    return (
      <div className="pl-11 max-w-2xl">
        <ProposalCard item={item} accounts={accounts} onConfirm={onConfirm} disabled={busy} />
      </div>
    );
  }

  if (item.type === 'error') {
    return (
      <div className="pl-11 flex items-start gap-2 text-sm text-red-600" role="alert">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {item.text}
      </div>
    );
  }

  return null;
};

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AIAgent() {
  const { accounts } = useAccounts();
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null); // { id, title, display, hasPending }
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]); // { url, kind, name, preview }
  const [uploading, setUploading] = useState(null);   // progress %
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);

  const activeAccounts = useMemo(() => accounts.filter(a => a.isActive !== false), [accounts]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await agentAPI.sessions();
      setSessions(res.data);
    } catch (_) { /* list is optional */ }
  }, []);

  useEffect(() => {
    agentAPI.status().then(res => setStatus(res.data)).catch(() => setStatus({ configured: false, reason: 'Could not reach the server.' }));
    loadSessions();
  }, [loadSessions]);

  // Keep the newest message in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [session?.display?.length, busy]);

  const openSession = async (id) => {
    setShowHistory(false);
    try {
      const res = await agentAPI.session(id);
      setSession(res.data);
    } catch (error) {
      toast.error(errorText(error, 'Could not open this chat.'));
    }
  };

  const newChat = () => {
    setSession(null);
    setDraft('');
    setAttachments([]);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const deleteSession = async (id) => {
    if (!window.confirm('Delete this chat? Posts already published or scheduled are not affected.')) return;
    try {
      await agentAPI.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (session?.id === id) newChat();
    } catch (error) {
      toast.error(errorText(error, 'Could not delete the chat.'));
    }
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    for (const file of files) {
      const kind = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : null;
      if (!kind) { toast.error(`${file.name} is not an image or video.`); continue; }
      setUploading(0);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await accountsAPI.uploadMedia(formData, setUploading);
        const { url } = res.data || res;
        setAttachments(prev => [...prev, { url, kind, name: file.name, preview: kind === 'image' ? URL.createObjectURL(file) : null }]);
      } catch (error) {
        toast.error(`Upload failed for ${file.name}: ${errorText(error, 'try again')}`);
      } finally {
        setUploading(null);
      }
    }
  };

  const send = async (text = draft) => {
    const message = text.trim();
    if ((!message && !attachments.length) || busy || uploading !== null) return;

    const sent = attachments;
    const optimistic = { id: `tmp-${Date.now()}`, type: 'user', text: message, attachments: sent.map(({ url, kind, name }) => ({ url, kind, name })) };
    setSession(prev => ({ ...(prev || { id: null, title: 'New chat' }), display: [...(prev?.display || []), optimistic] }));
    setDraft('');
    setAttachments([]);
    setBusy(true);

    try {
      const res = await agentAPI.chat({
        sessionId: session?.id || undefined,
        message,
        attachments: sent.map(({ url, kind, name }) => ({ url, kind, name })),
      });
      setSession(res.data);
      loadSessions();
    } catch (error) {
      toast.error(errorText(error, 'The agent could not answer.'));
      // Put the message back so nothing is lost
      setSession(prev => prev ? { ...prev, display: prev.display.filter(d => d.id !== optimistic.id) } : prev);
      setDraft(message);
      setAttachments(sent);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const confirm = async (decision) => {
    setBusy(true);
    try {
      const res = await agentAPI.confirm({ sessionId: session.id, ...decision });
      setSession(res.data);
      const card = res.data.display.find(d => d.type === 'proposal' && d.toolUseId === decision.toolUseId);
      if (card?.status === 'posted') toast.success('Posted');
      else if (card?.status === 'scheduled') toast.success('Post scheduled');
      else if (card?.status === 'partial') toast.warning('Posted, but some channels failed');
      else if (card?.status === 'failed') toast.error('Publishing failed');
      loadSessions();
    } finally {
      setBusy(false);
    }
  };

  const display = session?.display || [];
  const notReady = status && !status.configured;

  return (
    <PageWrapper>
      <div className="relative flex gap-6 h-[calc(100vh-3rem)] md:h-[calc(100vh-5rem)]">
        {/* ── Chat history ── */}
        <aside className={cn(
          'w-64 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white',
          showHistory ? 'flex absolute inset-y-0 left-0 z-20 shadow-xl lg:static lg:shadow-none' : 'hidden lg:flex'
        )}>
          <div className="p-3 border-b border-slate-100">
            <button
              type="button"
              onClick={newChat}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Plus className="w-4 h-4" /> New chat
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label="Previous chats">
            {sessions.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">Your chats will appear here.</p>}
            {sessions.map(s => (
              <div
                key={s.id}
                className={cn('group flex items-center rounded-xl', session?.id === s.id ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <button
                  type="button"
                  onClick={() => openSession(s.id)}
                  className="flex-1 min-w-0 text-left px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl"
                >
                  <span className={cn('block text-sm truncate', session?.id === s.id ? 'text-indigo-700 font-medium' : 'text-slate-700')}>{s.title}</span>
                  <span className="block text-xs text-slate-400">{format(new Date(s.updatedAt), 'd MMM, h:mm a')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(s.id)}
                  className="p-2 mr-1 rounded-lg text-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  aria-label={`Delete chat ${s.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Conversation ── */}
        <section className="flex-1 min-w-0 flex flex-col rounded-2xl border border-slate-200 bg-white">
          <header className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Show previous chats"
            >
              <History className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading font-bold text-slate-900 leading-tight">AI Agent</h1>
              <p className="text-xs text-slate-400 truncate">
                {status?.configured
                  ? `Writes, designs, enhances, posts and schedules for you · ${status.model}`
                  : 'Writes, designs, enhances, posts and schedules for you'}
              </p>
            </div>
          </header>

          {notReady && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {status.reason}
            </div>
          )}
          {status?.configured && status.images && !status.images.configured && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <ImageIcon className="w-4 h-4 mt-0.5 shrink-0" /> Image generation is off. {status.images.reason}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
            {display.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto">
                <h2 className="font-heading text-2xl md:text-3xl font-bold text-slate-900">What should we post today?</h2>
                <p className="mt-2 text-slate-500">
                  Describe the post, attach photos or videos, and say where and when. You’ll pick the channels and approve every post before it goes out.
                </p>
                <div className="mt-6 grid sm:grid-cols-2 gap-2 w-full">
                  {STARTERS.map(text => (
                    <button
                      key={text}
                      type="button"
                      disabled={busy || notReady}
                      onClick={() => (text.startsWith('Enhance') || text.startsWith('Turn my video') ? (setDraft(text), fileRef.current?.click()) : send(text))}
                      className="text-left rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              display.map(item => (
                <ChatItem key={item.id} item={item} accounts={activeAccounts} onConfirm={confirm} busy={busy} />
              ))
            )}

            {busy && (
              <div className="flex items-center gap-3 pl-1 text-sm text-slate-500" aria-live="polite">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                Working on it. Designing images or publishing can take a minute.
              </div>
            )}
          </div>

          {/* ── Composer ── */}
          <div className="border-t border-slate-100 p-4">
            {(attachments.length > 0 || uploading !== null) && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {attachments.map(a => (
                  <div key={a.url} className="relative">
                    {a.kind === 'image'
                      ? <img src={a.preview || a.url} alt={a.name} className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                      : (
                        <div className="w-16 h-16 rounded-xl bg-slate-900 flex flex-col items-center justify-center text-white">
                          <Video className="w-5 h-5" />
                          <span className="text-[10px] mt-1 px-1 truncate max-w-full">{a.name}</span>
                        </div>
                      )}
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter(x => x.url !== a.url))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600"
                      aria-label={`Remove ${a.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {uploading !== null && (
                  <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin mb-1" /> {uploading}%
                  </div>
                )}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white">
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || uploading !== null}
                className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Attach photos or videos"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={Math.min(6, Math.max(1, draft.split('\n').length))}
                placeholder={notReady ? 'The AI Agent is not set up yet' : 'e.g. Post this photo on Instagram tomorrow at 7 PM with a festive caption'}
                disabled={notReady}
                className="flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                aria-label="Message the AI Agent"
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={busy || notReady || uploading !== null || (!draft.trim() && !attachments.length)}
                className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                aria-label="Send"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" /> Times are in IST. Nothing is posted until you press Post now or Schedule.
            </p>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
