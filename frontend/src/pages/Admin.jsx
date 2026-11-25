// pages/Admin.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin (only the emails in ADMIN_EMAILS in backend/.env):
//   • AI costs — 🆕 exact Google AI cost of every call, post, model and user (components/admin/AiCostsTab.jsx)
//   • Usage    — credits used per day, active users, average credits per AI post, top users
//   • Creators — separate logins for your company's creators: free AI, every use tracked
//   • Requests — approve after you receive the payment → the plan's credits are added
//   • Users    — search anyone and add / remove AI post, image and video credits
//   • Payments — Razorpay payments made on the website (credits are added automatically)
//   • Plans    — prices, GST, credits per plan, the ₹149 top-up and the free sign-up credits
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Check, Loader2, Plus, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { adminAPI } from '../services/api';
import { cn } from '../lib/utils';
import AiCostsTab from '../components/admin/AiCostsTab'; // 🆕

const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const KINDS = [['post', 'Posts'], ['image', 'Images'], ['video', 'Videos']];
const creditLine = (c = {}) => KINDS.map(([k, l]) => (c[k] ? `${c[k]} ${l.toLowerCase()}` : null)).filter(Boolean).join(' · ') || '—';

const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';

// ── Requests ─────────────────────────────────────────────────────────────────
const RequestsTab = ({ onChanged }) => {
  const [status, setStatus] = useState('pending');
  const [list, setList] = useState(null);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setList(null);
    try { setList((await adminAPI.requests(status)).data); } catch (e) { toast.error(errorText(e, 'Could not load requests')); setList([]); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const act = async (r, action) => {
    if (action === 'approve' && !window.confirm(`Approve ${r.planName} (${rupees(r.price)}) for ${r.userEmail}?\nOnly approve after you have received the payment.`)) return;
    setBusy(r.id);
    try {
      if (action === 'approve') await adminAPI.approve(r.id, notes[r.id] || '');
      else await adminAPI.reject(r.id, notes[r.id] || '');
      toast.success(action === 'approve' ? `Credits added for ${r.userEmail}` : 'Request rejected');
      load();
      onChanged();
    } catch (e) {
      toast.error(errorText(e, 'Could not update the request'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {['pending', 'approved', 'rejected', 'cancelled', 'all'].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={cn('rounded-full px-3 py-1.5 text-sm font-medium capitalize', status === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
            {s}
          </button>
        ))}
      </div>
      {!list ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">No {status === 'all' ? '' : status} requests</p>
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{r.planName} · {rupees(r.price)} <span className="font-normal text-slate-400">({r.source})</span></p>
                  <p className="text-sm text-slate-600">{r.userName} · {r.userEmail}</p>
                  <p className="text-xs text-slate-400">{creditLine(r.credits)} · {new Date(r.createdAt).toLocaleString('en-IN')}</p>
                  {r.note && <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700">Customer: {r.note}</p>}
                  {r.adminNote && <p className="mt-1 text-xs text-slate-500">Your note: {r.adminNote}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{r.status}</span>
              </div>
              {r.status === 'pending' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input value={notes[r.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Note (optional, the customer sees it)" className={cn(inputCls, 'flex-1 min-w-[200px]')} />
                  <button type="button" disabled={busy === r.id} onClick={() => act(r, 'approve')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Paid — approve
                  </button>
                  <button type="button" disabled={busy === r.id} onClick={() => act(r, 'reject')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-red-50 hover:text-red-700">
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Usage ────────────────────────────────────────────────────────────────────
const KIND_COLORS = { post: 'bg-indigo-500', image: 'bg-pink-500', video: 'bg-purple-500' };

const UsageTab = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    adminAPI.usage(days).then((r) => setData(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load usage')); setData({ daily: [], topUsers: [], totals: {} }); });
  }, [days]);

  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />;
  const max = Math.max(1, ...data.daily.map((d) => d.total));
  const cards = [
    [`Credits used (${days} days)`, `${data.totals.total || 0}`, KINDS.map(([k, l]) => `${data.totals[k] || 0} ${l.toLowerCase()}`).join(' · ')],
    ['Users who used AI', data.activeUsers || 0, `avg ${data.avgPerActiveUser || 0} credits each`],
    ['Average per day', data.avgPerDay || 0, 'credits / day (all users)'],
    ['Avg credits per AI post', data.avgCreditsPerPost ?? '—', 'post + image + video credits ÷ AI posts'],
    ['Est. Google AI cost', rupees(data.costInr || 0), `customers ${rupees(data.customers?.costInr || 0)} · company ${rupees(data.company?.costInr || 0)}`],
    ['Company use (free, tracked)', `${data.company?.credits || 0} credits`, `≈ ${rupees(data.company?.costInr || 0)} cost to you`],
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)}
            className={cn('rounded-full px-3 py-1.5 text-sm font-medium', days === d ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
            Last {d} days
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <h3 className="font-heading text-lg font-bold text-slate-900">Credits used per day</h3>
          <div className="ml-auto flex gap-3 text-xs text-slate-500">
            {KINDS.map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-sm', KIND_COLORS[k])} />{l}</span>)}
          </div>
        </div>
        {data.daily.length === 0 ? <p className="py-8 text-center text-slate-400">No AI usage yet</p> : (
          <div className="flex h-48 items-end gap-1 overflow-x-auto">
            {data.daily.map((d) => (
              <div key={d.day} className="flex min-w-[14px] flex-1 flex-col justify-end" title={`${d.day}: ${d.post} posts · ${d.image} images · ${d.video} videos · ${d.activeUsers} users`}>
                {['video', 'image', 'post'].map((k) => d[k] > 0 && (
                  <div key={k} className={KIND_COLORS[k]} style={{ height: `${(d[k] / max) * 176}px` }} />
                ))}
              </div>
            ))}
          </div>
        )}
        {data.daily.length > 0 && (
          <div className="mt-4 max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="py-2">Day</th><th>Posts</th><th>Images</th><th>Videos</th><th>Total</th><th>Company</th><th>Est. cost</th><th>Users</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.day}><td className="py-2 text-slate-600">{d.day}</td><td>{d.post}</td><td>{d.image}</td><td>{d.video}</td><td className="font-semibold">{d.total}</td><td>{d.free || 0}</td><td>{rupees(d.costInr || 0)}</td><td>{d.activeUsers}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-heading text-lg font-bold text-slate-900">Top users ({days} days)</h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Posts</th><th className="px-4 py-3">Images</th><th className="px-4 py-3">Videos</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Avg / AI post</th><th className="px-4 py-3">Est. cost</th><th className="px-4 py-3">Last used</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topUsers.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No usage yet</td></tr>}
              {data.topUsers.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-800">{u.name}{u.company && <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">COMPANY</span>}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-2.5">{u.post}</td><td className="px-4 py-2.5">{u.image}</td><td className="px-4 py-2.5">{u.video}</td>
                  <td className="px-4 py-2.5 font-semibold">{u.total}</td>
                  <td className="px-4 py-2.5">{u.avgPerPost ?? '—'}</td>
                  <td className="px-4 py-2.5">{rupees(u.costInr || 0)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{u.lastUsedAt ? new Date(u.lastUsedAt).toLocaleString('en-IN') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

// ── Razorpay payments ────────────────────────────────────────────────────────
const PaymentsTab = () => {
  const [status, setStatus] = useState('paid');
  const [list, setList] = useState(null);
  useEffect(() => {
    setList(null);
    adminAPI.payments(status).then((r) => setList(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load payments')); setList([]); });
  }, [status]);

  const total = (list || []).filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount / 100, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['paid', 'created', 'failed', 'all'].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={cn('rounded-full px-3 py-1.5 text-sm font-medium capitalize', status === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
            {s === 'created' ? 'started, not paid' : s}
          </button>
        ))}
        {list && <span className="ml-auto text-sm text-slate-500">Paid in this list: <b className="text-slate-900">{rupees(total)}</b></span>}
      </div>
      {!list ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">No payments</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Razorpay id</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(p.paidAt || p.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5"><p className="text-slate-800">{p.userName}</p><p className="text-xs text-slate-400">{p.userEmail}</p></td>
                  <td className="px-4 py-2.5 text-slate-700">{p.packName}<p className="text-xs text-slate-400">{creditLine(p.credits)}</p></td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{rupees(p.amount / 100)}{p.method ? <span className="block text-xs font-normal text-slate-400">{p.method}</span> : null}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-600">{p.status}{p.gateway === 'dummy' && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 normal-case">TEST</span>}{p.error ? <span className="block text-xs text-red-500 normal-case">{p.error}</span> : null}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{p.razorpayPaymentId || p.razorpayOrderId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Users ────────────────────────────────────────────────────────────────────
const GrantForm = ({ user, onDone }) => {
  const [form, setForm] = useState({ post: '', image: '', video: '', note: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminAPI.addCredits(user.id, form);
      toast.success(`Credits updated for ${user.email}`);
      onDone();
    } catch (error) {
      toast.error(errorText(error, 'Could not update credits'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[repeat(3,90px)_1fr_auto]">
      {KINDS.map(([k, l]) => (
        <input key={k} type="number" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={`+ ${l}`} className={inputCls} />
      ))}
      <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Reason (e.g. bonus, refund, paid offline)" className={inputCls} />
      <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Apply
      </button>
      <p className="text-xs text-slate-400 md:col-span-5">Use a minus number to remove credits, e.g. -5.</p>
    </form>
  );
};

const UsersTab = () => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState(null);

  const toggleCompany = async (u) => {
    const turnOn = !u.company;
    if (turnOn && !window.confirm(`Make ${u.email} a company account?\nThey get unlimited AI for free. Every use is still tracked on the Usage tab.`)) return;
    setSaving(u.id);
    try {
      await adminAPI.setCompany(u.id, turnOn);
      toast.success(turnOn ? `${u.email} is now a company account` : `${u.email} is a normal customer again`);
      load(search.trim());
    } catch (e) {
      toast.error(errorText(e, 'Could not update the account'));
    } finally {
      setSaving(null);
    }
  };

  const load = useCallback(async (q = '') => {
    try { setUsers((await adminAPI.users(q)).data); } catch (e) { toast.error(errorText(e, 'Could not load users')); setUsers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); load(search.trim()); }} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className={cn(inputCls, 'pl-9')} />
        </div>
        <button type="submit" className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">Search</button>
      </form>
      {!users ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {users.length === 0 && <p className="p-6 text-center text-slate-400">No users found</p>}
          {users.map((u) => (
            <div key={u.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {u.name} {u.isAdmin && <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">admin</span>}
                    {u.company && <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">company · free</span>}
                  </p>
                  <p className="text-sm text-slate-500">{u.email} · joined {new Date(u.createdAt).toLocaleDateString('en-IN')}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {u.connected?.length ? <>Connected: <b className="capitalize text-slate-700">{u.connected.join(', ')}</b></> : <span className="text-amber-600">No accounts connected</span>}
                    {' · '}30 days: {u.usage30d?.total || 0} credits used ({u.usage30d?.post || 0} posts · {u.usage30d?.image || 0} images · {u.usage30d?.video || 0} videos)
                    {u.usage30d?.avgPerPost ? ` · ${u.usage30d.avgPerPost} credits / AI post` : ''}
                    {u.usage30d?.costInr ? ` · ≈ ${rupees(u.usage30d.costInr)} AI cost` : ''}
                    {' · '}{u.publishedPosts30d || 0} posts published
                  </p>
                </div>
                <div className="text-sm text-slate-700">
                  {u.wallet
                    ? <>Plan <b className="capitalize">{u.wallet.plan}</b> · {KINDS.map(([k, l]) => `${u.wallet.balance[k]} ${l.toLowerCase()}`).join(' · ')}</>
                    : <span className="text-slate-400">Free credits not used yet</span>}
                </div>
                <button type="button" disabled={saving === u.id} onClick={() => toggleCompany(u)}
                  title="Company accounts use AI for free; every use is still tracked"
                  className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold disabled:opacity-60',
                    u.company ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  <Building2 className="w-4 h-4" /> {u.company ? 'Company ✓' : 'Make company'}
                </button>
                <button type="button" onClick={() => setOpen(open === u.id ? null : u.id)}
                  className="rounded-xl border border-indigo-200 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
                  {open === u.id ? 'Close' : 'Give credits'}
                </button>
              </div>
              {open === u.id && <GrantForm user={u} onDone={() => { setOpen(null); load(search.trim()); }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Plans & settings ─────────────────────────────────────────────────────────
const PackEditor = ({ pack, onChange, onRemove, showHighlight }) => {
  const set = (patch) => onChange({ ...pack, ...patch });
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto]">
        <label className="text-xs font-semibold text-slate-500">Name<input value={pack.name} onChange={(e) => set({ name: e.target.value })} className={cn(inputCls, 'mt-1')} /></label>
        <label className="text-xs font-semibold text-slate-500">Id (no spaces)<input value={pack.id} onChange={(e) => set({ id: e.target.value })} className={cn(inputCls, 'mt-1')} /></label>
        <label className="text-xs font-semibold text-slate-500">Price ₹<input type="number" value={pack.price} onChange={(e) => set({ price: e.target.value })} className={cn(inputCls, 'mt-1')} /></label>
        <button type="button" onClick={onRemove} className="self-end rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove"><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 grid-cols-3">
        {KINDS.map(([k, l]) => (
          <label key={k} className="text-xs font-semibold text-slate-500">AI {l.toLowerCase()}
            <input type="number" min="0" value={pack.credits?.[k] ?? 0} onChange={(e) => set({ credits: { ...pack.credits, [k]: e.target.value } })} className={cn(inputCls, 'mt-1')} />
          </label>
        ))}
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-500">Features shown to customers (one per line)
        <textarea rows={3} value={(pack.features || []).join('\n')} onChange={(e) => set({ features: e.target.value.split('\n') })} className={cn(inputCls, 'mt-1')} />
      </label>
      {showHighlight && (
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!pack.highlight} onChange={(e) => set({ highlight: e.target.checked })} /> Show as “Most popular”
        </label>
      )}
    </div>
  );
};

// 🆕 Company creator accounts
const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  window.crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
};

const CreatorsTab = () => {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);

  const load = useCallback(() => {
    adminAPI.creators().then((r) => setList(r.data)).catch((e) => { toast.error(errorText(e, 'Could not load creators')); setList([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await adminAPI.createCreator(form);
      setLastCreated(data.created ? { email: data.email, password: form.password } : null);
      toast.success(data.created ? `Creator account created for ${data.email}` : `${data.email} already had an account — it is now a company creator`);
      setForm({ name: '', email: '', password: '', note: '' });
      load();
    } catch (error) {
      toast.error(errorText(error, 'Could not create the account'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Remove company access for ${c.email}?\nTheir account stays, but AI will use normal credits again.`)) return;
    try {
      await adminAPI.setCompany(c.id, false);
      toast.success('Company access removed');
      load();
    } catch (error) {
      toast.error(errorText(error, 'Could not update'));
    }
  };

  const totals = (list || []).reduce((a, c) => ({ credits: a.credits + (c.usage30d?.total || 0), cost: a.cost + (c.usage30d?.costInr || 0), posts: a.posts + (c.publishedPosts30d || 0) }), { credits: 0, cost: 0, posts: 0 });

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-heading text-lg font-bold text-slate-900">Create a creator account</h3>
        <p className="mt-1 mb-4 text-sm text-slate-500">For your own team. They log in on the website or the app like anyone else, use AI for free, and every use is tracked here and on the Usage tab. An existing account with the same email is converted instead.</p>
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className={inputCls} />
          <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email (they log in with this)" className={inputCls} />
          <div className="flex gap-2">
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Temporary password (min 8)" className={inputCls} />
            <button type="button" onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))} className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Generate</button>
          </div>
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Note (team / role, optional)" className={inputCls} />
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2 md:justify-self-start">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create creator account
          </button>
        </form>
        {lastCreated && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            Share these login details privately (not in a group chat): <b>{lastCreated.email}</b> / <b>{lastCreated.password}</b>. Ask them to change the password after the first login.
            <button type="button" onClick={() => setLastCreated(null)} className="ml-2 text-emerald-600 underline">Hide</button>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <h3 className="font-heading text-lg font-bold text-slate-900">Company creators ({list?.length || 0})</h3>
          <p className="text-sm text-slate-500">Last 30 days: {totals.credits} credits · ≈ {rupees(totals.cost)} AI cost · {totals.posts} posts published</p>
        </div>
        {!list ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">No creator accounts yet</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Creator</th><th className="px-4 py-3">Connected</th><th className="px-4 py-3">Posts</th><th className="px-4 py-3">Images</th><th className="px-4 py-3">Videos</th><th className="px-4 py-3">Published</th><th className="px-4 py-3">Est. cost</th><th className="px-4 py-3">Last AI use</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5"><p className="text-slate-800">{c.name}</p><p className="text-xs text-slate-400">{c.email}{c.note ? ` · ${c.note}` : ''}</p></td>
                    <td className="px-4 py-2.5 capitalize text-slate-600">{c.connected.length ? c.connected.join(', ') : <span className="text-amber-600 normal-case">none</span>}</td>
                    <td className="px-4 py-2.5">{c.usage30d.post}</td>
                    <td className="px-4 py-2.5">{c.usage30d.image}</td>
                    <td className="px-4 py-2.5">{c.usage30d.video}</td>
                    <td className="px-4 py-2.5">{c.publishedPosts30d}</td>
                    <td className="px-4 py-2.5 font-semibold">{rupees(c.usage30d.costInr || 0)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.usage30d.lastUsedAt ? new Date(c.usage30d.lastUsedAt).toLocaleString('en-IN') : '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {c.byDomain
                        ? <span className="text-xs text-slate-400" title="Free because of COMPANY_EMAIL_DOMAINS in .env">by email domain</span>
                        : <button type="button" onClick={() => remove(c)} className="text-xs font-semibold text-slate-500 hover:text-red-600">Remove access</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

// 🆕 Who can open this page
const AdminsCard = () => {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { adminAPI.admins().then((r) => setData(r.data)).catch((e) => toast.error(errorText(e, 'Could not load admins'))); }, []);
  const save = async (list) => {
    setSaving(true);
    try {
      const { data: saved } = await adminAPI.saveAdmins(list);
      setData((d) => ({ ...d, added: saved.added }));
      setEmail('');
      toast.success('Admins saved');
    } catch (e) {
      toast.error(errorText(e, 'Could not save admins'));
    } finally {
      setSaving(false);
    }
  };
  if (!data) return <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />;
  return (
    <section>
      <h3 className="mb-1 font-heading text-lg font-bold text-slate-900">Admins</h3>
      <p className="mb-3 text-sm text-slate-500">They can open this page, give credits and approve payments. Their own AI use is free and tracked. The person must already have a SocialHub account with this email.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {data.fromEnv.map((e) => <span key={e} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600" title="From ADMIN_EMAILS in backend/.env">{e} · .env</span>)}
        {data.added.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700">
            {e}
            <button type="button" disabled={saving} onClick={() => save(data.added.filter((x) => x !== e))} className="text-indigo-400 hover:text-red-600" title="Remove"><X className="w-3.5 h-3.5" /></button>
          </span>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) save([...data.added, email.trim()]); }} className="flex max-w-md gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new-admin@yourcompany.com" className={inputCls} />
        <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Add</button>
      </form>
    </section>
  );
};

const SettingsTab = () => {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminAPI.settings().then((r) => setS(r.data)).catch((e) => toast.error(errorText(e, 'Could not load settings')));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const clean = {
        ...s,
        plans: s.plans.map((p) => ({ ...p, features: (p.features || []).map((f) => f.trim()).filter(Boolean) })),
        topups: s.topups.map((p) => ({ ...p, features: (p.features || []).map((f) => f.trim()).filter(Boolean) })),
        enterprise: { ...s.enterprise, features: (s.enterprise?.features || []).map((f) => f.trim()).filter(Boolean) },
      };
      setS((await adminAPI.saveSettings(clean)).data);
      toast.success('Saved. Customers see the new plans right away.');
    } catch (error) {
      toast.error(errorText(error, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  if (!s) return <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />;
  const update = (key, i, pack) => setS((prev) => ({ ...prev, [key]: prev[key].map((p, j) => (j === i ? pack : p)) }));
  const remove = (key, i) => setS((prev) => ({ ...prev, [key]: prev[key].filter((_, j) => j !== i) }));
  const add = (key) => setS((prev) => ({
    ...prev,
    [key]: [...prev[key], { id: `${key === 'topups' ? 'topup' : 'plan'}${prev[key].length + 1}`, name: 'New', price: 0, credits: { post: 0, image: 0, video: 0 }, features: [] }],
  }));

  return (
    <div className="space-y-8">
      <AdminsCard />

      <section>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-900">Your AI cost per credit (₹)</h3>
        <p className="mb-3 text-sm text-slate-500">Only used for the cost estimate on the Usage tab. Defaults: post ₹3, image ₹7, video ₹80.</p>
        <div className="grid max-w-md grid-cols-3 gap-3">
          {KINDS.map(([k, l]) => (
            <label key={k} className="text-xs font-semibold text-slate-500">1 AI {l.toLowerCase().replace(/s$/, '')}
              <input type="number" min="0" step="0.5" value={s.costPerCredit?.[k] ?? 0}
                onChange={(e) => setS((prev) => ({ ...prev, costPerCredit: { ...prev.costPerCredit, [k]: e.target.value } }))} className={cn(inputCls, 'mt-1')} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-900">Free credits for every new user</h3>
        <p className="mb-3 text-sm text-slate-500">Given once, the first time a user opens an AI feature (existing users too).</p>
        <div className="grid max-w-md grid-cols-3 gap-3">
          {KINDS.map(([k, l]) => (
            <label key={k} className="text-xs font-semibold text-slate-500">AI {l.toLowerCase()}
              <input type="number" min="0" value={s.signupCredits?.[k] ?? 0}
                onChange={(e) => setS((prev) => ({ ...prev, signupCredits: { ...prev.signupCredits, [k]: e.target.value } }))} className={cn(inputCls, 'mt-1')} />
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-lg font-bold text-slate-900">Plans</h3>
          <button type="button" onClick={() => add('plans')} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><Plus className="w-4 h-4" /> Add plan</button>
        </div>
        <div className="space-y-3">
          {s.plans.map((p, i) => <PackEditor key={i} pack={p} showHighlight onChange={(v) => update('plans', i, v)} onRemove={() => remove('plans', i)} />)}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-lg font-bold text-slate-900">Top-ups (one-time)</h3>
          <button type="button" onClick={() => add('topups')} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><Plus className="w-4 h-4" /> Add top-up</button>
        </div>
        <div className="space-y-3">
          {s.topups.map((p, i) => <PackEditor key={i} pack={p} onChange={(v) => update('topups', i, v)} onRemove={() => remove('topups', i)} />)}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-900">Enterprise (website card — call / WhatsApp / email)</h3>
        <p className="mb-3 text-sm text-slate-500">No price is shown. Leave phone or WhatsApp empty to hide that button. “Request a call back” requests appear under Upgrade requests.</p>
        <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={s.enterprise?.enabled !== false}
            onChange={(e) => setS((prev) => ({ ...prev, enterprise: { ...prev.enterprise, enabled: e.target.checked } }))} /> Show the Enterprise card
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          {[['name', 'Name'], ['tagline', 'Tagline'], ['phone', 'Phone (e.g. +91 98765 43210)'], ['whatsapp', 'WhatsApp number with country code (e.g. 919876543210)'], ['email', 'Email']].map(([k, l]) => (
            <label key={k} className="text-xs font-semibold text-slate-500">{l}
              <input value={s.enterprise?.[k] || ''} onChange={(e) => setS((prev) => ({ ...prev, enterprise: { ...prev.enterprise, [k]: e.target.value } }))} className={cn(inputCls, 'mt-1')} />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-500">Features (one per line)
          <textarea rows={4} value={(s.enterprise?.features || []).join('\n')}
            onChange={(e) => setS((prev) => ({ ...prev, enterprise: { ...prev.enterprise, features: e.target.value.split('\n') } }))} className={cn(inputCls, 'mt-1')} />
        </label>
      </section>

      <section>
        <h3 className="mb-1 font-heading text-lg font-bold text-slate-900">GST at checkout (Razorpay)</h3>
        <p className="mb-3 text-sm text-slate-500">0 = your prices already include GST. 18 = add 18% on top (₹2,499 becomes ₹2,948.82).</p>
        <label className="text-xs font-semibold text-slate-500">GST %
          <input type="number" min="0" max="28" value={s.gstPercent ?? 0}
            onChange={(e) => setS((prev) => ({ ...prev, gstPercent: e.target.value }))} className={cn(inputCls, 'mt-1 max-w-[120px]')} />
        </label>
      </section>

      <section>
        <h3 className="mb-2 font-heading text-lg font-bold text-slate-900">Payment instructions (shown on the Credits page when Razorpay is not set up)</h3>
        <textarea rows={3} value={s.paymentInstructions || ''} onChange={(e) => setS((prev) => ({ ...prev, paymentInstructions: e.target.value }))} className={inputCls} />
      </section>

      <button type="button" onClick={save} disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plans & settings
      </button>
    </div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const TABS = [['usage', 'Usage'], ['aicosts', 'AI costs'], ['creators', 'Company creators'], ['payments', 'Payments'], ['requests', 'Upgrade requests'], ['users', 'Users & credits'], ['settings', 'Plans & settings']];

const Admin = () => {
  const [tab, setTab] = useState('usage');
  const [overview, setOverview] = useState(null);
  const [denied, setDenied] = useState('');

  const loadOverview = useCallback(() => {
    adminAPI.overview().then((r) => setOverview(r.data)).catch((e) => {
      if (e?.response?.status === 403) setDenied(errorText(e, 'Admins only.'));
    });
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  if (denied) {
    return (
      <PageWrapper title="Admin">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">{denied}</p>
      </PageWrapper>
    );
  }

  const cards = overview ? [
    ['Users', `${overview.users} · ${overview.connectedUsers ?? 0} connected`],
    ['Credits used today', KINDS.map(([k, l]) => `${overview.usedToday?.[k] || 0} ${l.toLowerCase()}`).join(' · ')],
    ['Pending requests', overview.pendingRequests],
    ['Revenue (30 days)', `${rupees(overview.last30Days.revenue)} · ${overview.last30Days.onlinePayments || 0} online + ${overview.last30Days.approvedRequests} manual`],
    ['AI used (30 days)', KINDS.map(([k, l]) => `${overview.last30Days.used[k]} ${l.toLowerCase()}`).join(' · ')],
  ] : [];

  return (
    <PageWrapper>
      <div className="mb-8 flex items-center gap-3">
        <ShieldCheck className="w-8 h-8 text-indigo-600" />
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-slate-900">Admin</h1>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-1 font-heading text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold', tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {label}{id === 'requests' && overview?.pendingRequests ? ` (${overview.pendingRequests})` : ''}
          </button>
        ))}
      </div>

      {tab === 'usage' && <UsageTab />}
      {tab === 'aicosts' && <AiCostsTab />}
      {tab === 'creators' && <CreatorsTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'requests' && <RequestsTab onChanged={loadOverview} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'settings' && <SettingsTab />}
    </PageWrapper>
  );
};

export default Admin;
