// components/admin/AiCostsTab.jsx — Admin → "AI costs"
// ─────────────────────────────────────────────────────────────────────────────
// Exact Google AI spend, built from EVERY AI call the backend made (tokens Google returned × price list):
//   • totals, cost incl. GST, and a box to compare with the Google AI Studio "Spend" page
//   • real ₹ per credit (post / image / video) vs the "cost per credit" in Plans & settings
//   • cost per day, per model (every token type), per feature, per post, per user
//   • the full call log (every single call, filter + CSV export) and a post-by-post breakdown
//   • the price list (USD per 1M tokens, ₹ rate, GST) — editable, with "re-price past calls"
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Download, Loader2, Plus, RefreshCw, Save, Search, X } from 'lucide-react';
import { adminAPI } from '../../services/api';
import { cn } from '../../lib/utils';

const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;

// ₹ with sensible decimals: ₹1,234 · ₹12.35 · ₹0.034
export const inr = (n) => {
  const v = Number(n) || 0;
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 1 ? 2 : 3;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
const usd = (n) => `$${(Number(n) || 0).toFixed(Math.abs(n) >= 1 ? 2 : 4)}`;
const num = (n) => (Number(n) || 0).toLocaleString('en-IN');
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Fixed colour per kind (validated for colour-blind separation); the day table below the chart is the text view
const KINDS = [
  ['text', 'Text (captions, ideas)', '#4f46e5'],
  ['agent', 'AI Agent', '#0ea5e9'],
  ['image', 'Images', '#db2777'],
  ['video', 'Videos', '#d97706'],
];
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l]));
const KIND_COLOR = Object.fromEntries(KINDS.map(([k, , c]) => [k, c]));

const PERIODS = [['1', 'Today'], ['7', '7 days'], ['28', '28 days (same as Google)'], ['30', '30 days'], ['90', '90 days'], ['custom', 'Custom']];

const Card = ({ label, value, hint, tone }) => (
  <div className={cn('rounded-2xl border bg-white p-5', tone === 'warn' ? 'border-amber-200' : 'border-slate-200')}>
    <p className="text-sm font-medium text-slate-500">{label}</p>
    <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
);

const Section = ({ title, hint, right, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="mb-4 flex flex-wrap items-start gap-3">
      <div>
        <h3 className="font-heading text-lg font-bold text-slate-900">{title}</h3>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {right && <div className="ml-auto">{right}</div>}
    </div>
    {children}
  </section>
);

const Th = ({ children, right }) => <th className={cn('whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500', right && 'text-right')}>{children}</th>;
const Td = ({ children, right, strong, muted, className }) => (
  <td className={cn('whitespace-nowrap px-3 py-2', right && 'text-right tabular-nums', strong && 'font-semibold text-slate-900', muted && 'text-slate-500', className)}>{children}</td>
);

const KindPill = ({ kind }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[kind] || '#94a3b8' }} />
    {KIND_LABEL[kind] || kind}
  </span>
);

// Token columns shared by the model table, call log and post breakdown
const TokenCells = ({ r }) => (
  <>
    <Td right>{num(r.inputTokens)}</Td>
    <Td right muted>{num(r.cachedTokens)}</Td>
    <Td right>{num(r.thoughtTokens)}</Td>
    <Td right>{num(r.outputTextTokens)}</Td>
    <Td right>{num(r.outputImageTokens)}</Td>
    <Td right>{num(r.outputVideoTokens)}</Td>
  </>
);
const TokenHeads = () => (
  <><Th right>Input</Th><Th right>Cached</Th><Th right>Thinking</Th><Th right>Text out</Th><Th right>Image out</Th><Th right>Video out</Th></>
);

// ── Daily chart ─────────────────────────────────────────────────────────────
const DayTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{label} · {inr(row.costInr)}</p>
      {KINDS.filter(([k]) => row[k] > 0).map(([k, l, c]) => (
        <p key={k} className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}: {inr(row[k])}</p>
      ))}
      <p className="mt-1 text-slate-400">{row.calls} AI calls</p>
    </div>
  );
};

const DailyChart = ({ days }) => (
  <>
    <div className="mb-3 flex flex-wrap gap-4">
      {KINDS.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}
    </div>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="day" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<DayTooltip />} cursor={{ fill: '#f8fafc' }} />
          {KINDS.map(([k, , c], i) => (
            <Bar key={k} dataKey={k} stackId="cost" fill={c} stroke="#fff" strokeWidth={1}
              radius={i === KINDS.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-indigo-600">Show as table</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left"><tr><Th>Day</Th>{KINDS.map(([k, l]) => <Th key={k} right>{l}</Th>)}<Th right>Calls</Th><Th right>Total</Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[...days].reverse().map((d) => (
              <tr key={d.day}><Td muted>{d.day}</Td>{KINDS.map(([k]) => <Td key={k} right>{inr(d[k])}</Td>)}<Td right>{d.calls}</Td><Td right strong>{inr(d.costInr)}</Td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  </>
);

// ── One post: every AI call that went into it ───────────────────────────────
const PostModal = ({ postId, onClose }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    adminAPI.aiCostPost(postId).then((r) => setData(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load this post')); onClose(); });
  }, [postId, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold text-slate-900">AI cost of this post</h3>
            <p className="truncate text-sm text-slate-500">{data?.post ? (data.post.youtubeTitle || data.post.content || '').slice(0, 140) : postId}</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {!data ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Card label="Total" value={inr(data.totals.costInr)} hint={`${usd(data.totals.costUsd)} · incl. GST ${inr(data.totals.costInrWithGst)}`} />
              <Card label="AI calls" value={data.totals.calls} />
              <Card label="Tokens" value={num(data.totals.tokens)} />
              <Card label="Post" value={data.post?.status || 'deleted'} hint={(data.post?.platforms || []).join(', ')} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr><Th>Time</Th><Th>Feature</Th><Th>Model</Th><TokenHeads /><Th right>Video s</Th><Th right>Cost</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.calls.map((c) => (
                    <tr key={c._id} className={c.status === 'error' ? 'bg-rose-50/50' : ''}>
                      <Td muted>{when(c.createdAt)}</Td>
                      <Td><p>{c.feature}</p><KindPill kind={c.kind} /></Td>
                      <Td muted>{c.model}</Td>
                      <TokenCells r={c} />
                      <Td right>{c.videoSeconds || '—'}</Td>
                      <Td right strong>{c.status === 'error' ? 'failed' : inr(c.costInr)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Every AI call ───────────────────────────────────────────────────────────
const CallLog = ({ params, models, features, userFilter, clearUser, openPost }) => {
  const [filters, setFilters] = useState({ kind: '', status: '', model: '', feature: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const query = useMemo(() => ({
    ...params, page, limit: 50,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    ...(userFilter ? { userId: userFilter.id } : {}),
  }), [params, page, filters, userFilter]);

  useEffect(() => { setPage(1); }, [params, filters, userFilter]);
  useEffect(() => {
    setData(null);
    adminAPI.aiCostCalls(query).then((r) => setData(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load calls')); setData({ rows: [], total: 0 }); });
  }, [query]);

  const exportCsv = async () => {
    try {
      const { data: blob } = await adminAPI.aiCostCsv({ ...query, page: undefined, limit: undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-costs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorText(e, 'Export failed'));
    }
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const select = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <Section title="Every AI call" hint="One row per call to Google. Click a row to see how its cost is made up."
      right={<button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Export CSV</button>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={filters.q} onChange={set('q')} placeholder="Email, prompt, post id…" className={cn(select, 'w-56 pl-9')} />
        </div>
        <select value={filters.kind} onChange={set('kind')} className={select}><option value="">All kinds</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={filters.feature} onChange={set('feature')} className={select}><option value="">All features</option>{features.map((f) => <option key={f}>{f}</option>)}</select>
        <select value={filters.model} onChange={set('model')} className={select}><option value="">All models</option>{models.map((m) => <option key={m}>{m}</option>)}</select>
        <select value={filters.status} onChange={set('status')} className={select}><option value="">OK + failed</option><option value="ok">OK only</option><option value="error">Failed only</option></select>
        {userFilter && (
          <button type="button" onClick={clearUser} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
            {userFilter.email} <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!data ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left"><tr><Th>Time</Th><Th>User</Th><Th>Feature</Th><Th>Model</Th><TokenHeads /><Th right>Cost</Th><Th>Post</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.length === 0 && <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-400">No AI calls in this period</td></tr>}
                {data.rows.map((c) => (
                  <React.Fragment key={c._id}>
                    <tr onClick={() => setOpen(open === c._id ? null : c._id)} className={cn('cursor-pointer hover:bg-slate-50', c.status === 'error' && 'bg-rose-50/50')}>
                      <Td muted>{when(c.createdAt)}</Td>
                      <Td className="max-w-[180px] truncate">{c.email || '—'}</Td>
                      <Td><p>{c.feature}</p><KindPill kind={c.kind} /></Td>
                      <Td muted>{c.model}</Td>
                      <TokenCells r={c} />
                      <Td right strong>
                        {c.status === 'error' ? <span className="text-rose-600">failed</span> : inr(c.costInr)}
                        {c.estimated && <span title="Google sent no token counts — estimated from the video length" className="ml-1 text-amber-500">≈</span>}
                        {!c.priceFound && c.status === 'ok' && <span title="This model is not in the price list" className="ml-1 text-amber-500">!</span>}
                      </Td>
                      <Td>{c.postId ? <button type="button" onClick={(e) => { e.stopPropagation(); openPost(c.postId); }} className="text-xs font-semibold text-indigo-600 hover:underline">View</button> : <span className="text-xs text-slate-400">—</span>}</Td>
                    </tr>
                    {open === c._id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={13} className="px-4 py-3 text-xs text-slate-600">
                          <div className="grid gap-2 md:grid-cols-3">
                            <div><p className="font-semibold text-slate-800">Cost parts (USD)</p>
                              {Object.entries(c.costParts || {}).map(([k, v]) => <p key={k}>{k}: ${v}</p>)}
                              <p className="mt-1 font-semibold">{usd(c.costUsd)} = {inr(c.costInr)}</p>
                            </div>
                            <div><p className="font-semibold text-slate-800">Details</p>
                              <p>Total tokens: {num(c.totalTokens)}</p>
                              {c.videoSeconds > 0 && <p>Video length: {c.videoSeconds}s</p>}
                              {c.images > 0 && <p>Images: {c.images}</p>}
                              <p>Took {Math.round((c.durationMs || 0) / 100) / 10}s · {c.route || 'background'}</p>
                              {c.mediaUrl && <p>File: {c.mediaUrl}</p>}
                              {c.error && <p className="text-rose-600">Error: {c.error}</p>}
                            </div>
                            <div><p className="font-semibold text-slate-800">Prompt</p><p className="break-words">{c.promptPreview || '—'}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
            <span>{num(data.total)} calls</span>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="ml-auto rounded-lg border px-3 py-1 disabled:opacity-40">Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </>
      )}
    </Section>
  );
};

// ── Price list ──────────────────────────────────────────────────────────────
const PRICE_FIELDS = [['input', 'Input'], ['cached', 'Cached'], ['output', 'Text out + thinking'], ['image', 'Image out'], ['video', 'Video out'], ['perSecond', '$ / video second']];

const PricingEditor = ({ params, onSaved }) => {
  const [p, setP] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newId, setNewId] = useState('');

  const load = useCallback(() => {
    adminAPI.aiPricing().then((r) => setP(r.data)).catch((e) => toast.error(errorText(e, 'Could not load prices')));
  }, []);
  useEffect(load, [load]);

  if (!p) return <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />;

  const setModel = (id, key, value) => setP((cur) => ({ ...cur, models: { ...cur.models, [id]: { ...cur.models[id], [key]: value } } }));
  const removeModel = (id) => setP((cur) => { const models = { ...cur.models }; delete models[id]; return { ...cur, models }; });
  const addModel = (id) => {
    const clean = id.trim().toLowerCase().replace(/^models\//, '');
    if (!clean) return;
    setP((cur) => ({ ...cur, models: { ...cur.models, [clean]: cur.models[clean] || { label: clean } } }));
    setNewId('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await adminAPI.saveAiPricing({ usdToInr: p.usdToInr, gstPercent: p.gstPercent, videoTokensPerSecond: p.videoTokensPerSecond, models: p.models });
      setP((cur) => ({ ...cur, ...data }));
      toast.success('Prices saved — new AI calls use them');
      onSaved?.();
    } catch (e) {
      toast.error(errorText(e, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const recalc = async () => {
    if (!window.confirm('Re-price every AI call in the selected period with the prices below? (Save first if you changed them.)')) return;
    try {
      const { data } = await adminAPI.recalcAiCosts(params);
      toast.success(`${data.updated} calls re-priced`);
      onSaved?.();
    } catch (e) {
      toast.error(errorText(e, 'Could not recalculate'));
    }
  };

  const field = 'w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums';
  return (
    <Section title="Prices" hint="USD per 1 million tokens (Google's paid tier). Thinking tokens are billed at the text-out price. Check against ai.google.dev/pricing when Google changes prices."
      right={<div className="flex gap-2">
        <button type="button" onClick={recalc} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Re-price this period</button>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save prices</button>
      </div>}>
      {p.missing?.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>These models were used but have no price, so their calls show ₹0: {p.missing.map((m) => (
            <button key={m} type="button" onClick={() => addModel(m)} className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">+ {m}</button>
          ))}</div>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">₹ per US$ <input type="number" step="0.01" value={p.usdToInr} onChange={(e) => setP({ ...p, usdToInr: e.target.value })} className={field} /></label>
        <label className="flex items-center gap-2">GST % <input type="number" step="0.1" value={p.gstPercent} onChange={(e) => setP({ ...p, gstPercent: e.target.value })} className={field} /></label>
        {Object.entries(p.videoTokensPerSecond || {}).map(([res, v]) => (
          <label key={res} className="flex items-center gap-2">Video tokens/s {res} <input type="number" value={v} onChange={(e) => setP({ ...p, videoTokensPerSecond: { ...p.videoTokensPerSecond, [res]: e.target.value } })} className={field} /></label>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left"><tr><Th>Model id</Th><Th>Name</Th>{PRICE_FIELDS.map(([k, l]) => <Th key={k} right>{l}</Th>)}<Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(p.models).map(([id, m]) => (
              <tr key={id}>
                <Td muted>{id}</Td>
                <Td><input value={m.label || ''} onChange={(e) => setModel(id, 'label', e.target.value)} className="w-56 rounded-lg border border-slate-200 px-2 py-1 text-sm" /></Td>
                {PRICE_FIELDS.map(([k]) => (
                  <Td key={k} right><input type="number" step="0.001" value={m[k] ?? ''} placeholder="—" onChange={(e) => setModel(id, k, e.target.value)} className={field} /></Td>
                ))}
                <Td><button type="button" onClick={() => removeModel(id)} className="text-xs text-slate-400 hover:text-rose-600">Remove</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="new model id, e.g. gemini-3.8-flash" className="w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <button type="button" onClick={() => addModel(newId)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" />Add model</button>
      </div>
    </Section>
  );
};

// ── The tab ─────────────────────────────────────────────────────────────────
const AiCostsTab = () => {
  const [period, setPeriod] = useState('28');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [reload, setReload] = useState(0);
  const [googleInr, setGoogleInr] = useState('');
  const [postId, setPostId] = useState(null);
  const [userFilter, setUserFilter] = useState(null);

  const params = useMemo(() => (period === 'custom'
    ? (custom.from ? { from: custom.from, ...(custom.to ? { to: custom.to } : {}) } : { days: 30 })
    : { days: Number(period) }), [period, custom]);

  useEffect(() => {
    setData(null);
    adminAPI.aiCosts(params).then((r) => setData(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load AI costs')); setData({ error: true }); });
  }, [params, reload]);

  const closePost = useCallback(() => setPostId(null), []);

  const t = data?.totals || {};
  const diff = googleInr && t.costInr ? ((t.costInr - Number(googleInr)) / Number(googleInr)) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setPeriod(id)}
            className={cn('rounded-full px-3 py-1.5 text-sm font-medium', period === id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
            to
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="rounded-lg border border-slate-200 px-2 py-1" />
          </span>
        )}
      </div>

      {!data ? <Loader2 className="h-6 w-6 animate-spin text-indigo-500" /> : data.error ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card label="Google AI cost" value={inr(t.costInr)} hint={`${usd(t.costUsd)} · incl. ${data.pricing.gstPercent}% GST ${inr(t.costInrWithGst)}`} />
            <Card label="AI calls" value={num(t.calls)} hint={`${num(t.errors)} failed (not billed) · avg ${inr(t.avgInrPerCall)} per call`} />
            <Card label="Tokens" value={num(t.totalTokens)} hint={`in ${num(t.inputTokens)} · thinking ${num(t.thoughtTokens)} · out ${num((t.outputTextTokens || 0) + (t.outputImageTokens || 0) + (t.outputVideoTokens || 0))}`} />
            <Card label="Avg AI cost per post" value={inr(data.linkedToPosts.avgPerPostInr)} hint={`${data.linkedToPosts.posts} posts used AI · ${inr(data.linkedToPosts.costInr)} total`} />
            <Card label="AI not in any post" value={inr(data.notLinkedInr)} hint="Ideas, agent chats, drafts never saved, regenerations" />
            <Card label="Images made" value={num(t.images)} hint={`${num(t.outputImageTokens)} image tokens`} />
            <Card label="Video seconds" value={num(t.videoSeconds)} hint={`${num(t.outputVideoTokens)} video tokens`} />
            <Card label="Needs attention" tone={(t.unpriced || t.estimated) ? 'warn' : undefined} value={`${t.unpriced || 0} unpriced · ${t.estimated || 0} estimated`}
              hint="Unpriced = model missing in Prices. Estimated = Google sent no token counts." />
          </div>

          <Section title="Compare with your Google bill" hint="Open AI Studio → Spend, pick the same days, and type the ₹ total. Google's days are US Pacific time and costs can take up to 24 h to appear, so small differences are normal. Calls made before this update was installed are not in SocialHub's numbers.">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">Google AI Studio cost ₹ <input type="number" value={googleInr} onChange={(e) => setGoogleInr(e.target.value)} className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-right" /></label>
              <span>SocialHub recorded <b>{inr(t.costInr)}</b></span>
              {diff !== null && (
                <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', Math.abs(diff) <= 5 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% {Math.abs(diff) <= 5 ? '— matches' : '— check Prices / the ₹ rate'}
                </span>
              )}
            </div>
          </Section>

          <Section title="Real cost per credit" hint="AI cost of each kind ÷ credits used for it. Compare with the 'cost per credit' you set in Plans & settings (used for profit estimates).">
            <div className="grid gap-3 sm:grid-cols-3">
              {[['post', 'Post credit (text + agent)'], ['image', 'Image credit'], ['video', 'Video credit']].map(([k, l]) => {
                const c = data.perCredit[k];
                return (
                  <div key={k} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-sm text-slate-500">{l}</p>
                    <p className="mt-1 font-heading text-xl font-bold text-slate-900">{c.actualPerCredit === null ? '—' : inr(c.actualPerCredit)}</p>
                    <p className="text-xs text-slate-400">{c.used} credits · {inr(c.costInr)} AI cost · your setting {c.setting != null ? inr(c.setting) : '—'}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Cost per day">
            {data.byDay.length === 0 ? <p className="py-8 text-center text-slate-400">No AI calls in this period</p> : <DailyChart days={data.byDay} />}
          </Section>

          <Section title="By model" hint="Every token type Google bills, per model.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr><Th>Model</Th><Th right>Calls</Th><TokenHeads /><Th right>Video s</Th><Th right>USD</Th><Th right>₹</Th><Th right>Avg / call</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byModel.map((m) => (
                    <tr key={m._id}>
                      <Td strong>{m._id}{m.unpriced > 0 && <span className="ml-1 text-amber-500" title="No price set for this model">!</span>}</Td>
                      <Td right>{num(m.calls)}{m.errors > 0 && <span className="text-xs text-rose-500"> ({m.errors} failed)</span>}</Td>
                      <TokenCells r={m} />
                      <Td right>{m.videoSeconds || '—'}</Td>
                      <Td right muted>{usd(m.costUsd)}</Td>
                      <Td right strong>{inr(m.costInr)}</Td>
                      <Td right>{inr(m.avgInrPerCall)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="By feature">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr><Th>Feature</Th><Th right>Calls</Th><Th right>Avg / call</Th><Th right>Avg time</Th><Th right>Total</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byFeature.map((f) => (
                    <tr key={`${f._id.feature}-${f._id.kind}`}>
                      <Td><p className="text-slate-800">{f._id.feature}</p><KindPill kind={f._id.kind} /></Td>
                      <Td right>{num(f.calls)}</Td><Td right>{inr(f.avgInrPerCall)}</Td><Td right muted>{f.avgSeconds}s</Td><Td right strong>{inr(f.costInr)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="What one action costs" hint="Average of successful calls in this period.">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr><Th>Action</Th><Th right>Times</Th><Th right>Avg cost</Th><Th right>Per video second</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.unitCosts.map((u) => (
                    <tr key={u.feature}>
                      <Td>{u.feature}</Td><Td right>{num(u.calls)}</Td><Td right strong>{inr(u.avgInr)}</Td>
                      <Td right muted>{u.perVideoSecondInr ? `${inr(u.perVideoSecondInr)} (avg ${u.avgVideoSeconds}s)` : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          <Section title="By post" hint="AI calls linked to a saved post: text from its composer, its AI images / videos / thumbnail, and AI Agent chats that created it. Click a post for every call.">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left"><tr><Th>Post</Th><Th>User</Th><Th>AI used</Th><Th right>Calls</Th><Th right>Tokens</Th><Th right>Cost</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byPost.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No posts with AI yet</td></tr>}
                  {data.byPost.map((p) => (
                    <tr key={p._id} onClick={() => setPostId(p._id)} className="cursor-pointer hover:bg-slate-50">
                      <Td className="max-w-[280px]"><p className="truncate text-slate-800">{p.caption}</p><p className="text-xs text-slate-400">{p.status} · {(p.platforms || []).join(', ')}</p></Td>
                      <Td muted className="max-w-[160px] truncate">{p.email}</Td>
                      <Td><div className="flex flex-col gap-0.5">{p.kinds.map((k) => <KindPill key={k} kind={k} />)}</div></Td>
                      <Td right>{p.calls}</Td><Td right muted>{num(p.totalTokens)}</Td><Td right strong>{inr(p.costInr)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="By user" hint="Click a user to filter the call log below.">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left"><tr><Th>User</Th><Th right>Calls</Th><Th right>Posts</Th><Th right>Images</Th><Th right>Video s</Th><Th right>Tokens</Th><Th right>Cost</Th><Th right>Incl. GST</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byUser.map((u) => (
                    <tr key={u._id || 'none'} onClick={() => u._id && setUserFilter({ id: u._id, email: u.email })} className="cursor-pointer hover:bg-slate-50">
                      <Td><p className="text-slate-800">{u.name || u.email}</p>{u.name && <p className="text-xs text-slate-400">{u.email}</p>}</Td>
                      <Td right>{num(u.calls)}</Td><Td right>{u.posts}</Td><Td right>{u.images}</Td><Td right>{u.videoSeconds || 0}</Td>
                      <Td right muted>{num(u.totalTokens)}</Td><Td right strong>{inr(u.costInr)}</Td><Td right muted>{inr(u.costInrWithGst)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <CallLog params={params} models={data.byModel.map((m) => m._id)} features={[...new Set(data.byFeature.map((f) => f._id.feature))]}
            userFilter={userFilter} clearUser={() => setUserFilter(null)} openPost={setPostId} />
        </>
      )}

      <PricingEditor params={params} onSaved={() => setReload((n) => n + 1)} />
      {postId && <PostModal postId={postId} onClose={closePost} />}
    </div>
  );
};

export default AiCostsTab;
