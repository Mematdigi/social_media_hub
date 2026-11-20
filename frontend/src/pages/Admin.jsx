// pages/Admin.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin (only the emails in ADMIN_EMAILS in backend/.env):
//   • Requests — approve after you receive the payment → the plan's credits are added
//   • Users    — search anyone and add / remove AI post, image and video credits
//   • Payments — Razorpay payments made on the website (credits are added automatically)
//   • Plans    — prices, GST, credits per plan, the ₹149 top-up and the free sign-up credits
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { adminAPI } from '../services/api';
import { cn } from '../lib/utils';

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
                  <td className="px-4 py-2.5 capitalize text-slate-600">{p.status}{p.error ? <span className="block text-xs text-red-500 normal-case">{p.error}</span> : null}</td>
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
                  <p className="font-medium text-slate-900">{u.name} {u.isAdmin && <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">admin</span>}</p>
                  <p className="text-sm text-slate-500">{u.email} · joined {new Date(u.createdAt).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-sm text-slate-700">
                  {u.wallet
                    ? <>Plan <b className="capitalize">{u.wallet.plan}</b> · {KINDS.map(([k, l]) => `${u.wallet.balance[k]} ${l.toLowerCase()}`).join(' · ')}</>
                    : <span className="text-slate-400">Free credits not used yet</span>}
                </div>
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
const TABS = [['payments', 'Payments'], ['requests', 'Upgrade requests'], ['users', 'Users & credits'], ['settings', 'Plans & settings']];

const Admin = () => {
  const [tab, setTab] = useState('payments');
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
    ['Users', overview.users],
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

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      {tab === 'payments' && <PaymentsTab />}
      {tab === 'requests' && <RequestsTab onChanged={loadOverview} />}
      {tab === 'users' && <UsersTab />}
      {tab === 'settings' && <SettingsTab />}
    </PageWrapper>
  );
};

export default Admin;
