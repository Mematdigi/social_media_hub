// pages/Credits.jsx
// ─────────────────────────────────────────────────────────────────────────────
// AI credits: what is left, the plans (₹2,499 / ₹4,999 / ₹9,999) and the ₹149 top-up.
// With Razorpay keys in backend/.env the customer pays online and the credits are added
// at once. Without them, "Upgrade" sends a request that you approve on the Admin page.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Crown, FileText, Image as ImageIcon, Loader2, Sparkles, Video, X, Zap, Clock } from 'lucide-react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { creditsAPI, paymentsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

const errorText = (error, fallback) => error?.response?.data?.detail || error?.message || fallback;
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Loads Razorpay's checkout script once
let razorpayScript = null;
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve) => {
      const tag = document.createElement('script');
      tag.src = 'https://checkout.razorpay.com/v1/checkout.js';
      tag.onload = () => resolve(true);
      tag.onerror = () => { razorpayScript = null; resolve(false); };
      document.body.appendChild(tag);
    });
  }
  return razorpayScript;
};

const KINDS = [
  { key: 'post', label: 'AI posts', hint: 'Write with AI & AI Agent posts', icon: FileText, tint: 'text-indigo-600 bg-indigo-50' },
  { key: 'image', label: 'AI images', hint: 'Generate or enhance with AI', icon: ImageIcon, tint: 'text-pink-600 bg-pink-50' },
  { key: 'video', label: 'AI videos', hint: 'Short AI videos for Reels & Shorts', icon: Video, tint: 'text-purple-600 bg-purple-50' },
];

const STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const creditLine = (c = {}) =>
  [c.post ? `${c.post} posts` : null, c.image ? `${c.image} images` : null, c.video ? `${c.video} videos` : null]
    .filter(Boolean).join(' · ') || '—';

const PackCard = ({ pack, current, pending, onRequest, onPay, online, gstPercent, busy }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const isTopup = pack.period === 'once';

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-white p-6',
        pack.highlight ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-lg shadow-indigo-100/60' : 'border-slate-200'
      )}
    >
      {pack.highlight && (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-3 py-1 text-xs font-bold text-white">
          Most popular
        </span>
      )}
      <div className="flex items-center gap-2">
        {isTopup ? <Zap className="w-5 h-5 text-amber-500" /> : <Crown className="w-5 h-5 text-indigo-500" />}
        <h3 className="font-heading text-xl font-bold text-slate-900">{pack.name}</h3>
        {current && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Current</span>}
      </div>
      <p className="mt-3">
        <span className="font-heading text-4xl font-bold text-slate-900">{rupees(pack.price)}</span>
        <span className="text-sm text-slate-500"> {isTopup ? 'one time' : `/ ${pack.period || 'month'}`}</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {gstPercent > 0 ? `+ ${gstPercent}% GST = ${rupees(pack.price * (1 + gstPercent / 100))}` : 'Including GST'}
      </p>

      <ul className="mt-5 space-y-2 flex-1">
        {(pack.features?.length ? pack.features : [creditLine(pack.credits)]).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-500" /> {f}
          </li>
        ))}
      </ul>

      {online ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onPay(pack)}
          className={cn(
            'mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60',
            pack.highlight || isTopup
              ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:opacity-95'
              : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50'
          )}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {isTopup ? 'Buy top-up' : current ? 'Renew' : 'Upgrade'} · Pay {rupees(pack.price * (1 + (gstPercent || 0) / 100))}
        </button>
      ) : pending ? (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-800">
          <Clock className="w-4 h-4" /> Request sent — we will contact you
        </div>
      ) : open ? (
        <div className="mt-6 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional: phone number, or UPI transaction ID if you already paid"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onRequest(pack, note).then((ok) => ok && setOpen(false))}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Send request
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-3 text-slate-500 hover:bg-slate-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
            pack.highlight || isTopup
              ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white hover:opacity-95'
              : 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50'
          )}
        >
          {isTopup ? 'Buy top-up' : current ? 'Renew' : 'Upgrade'}
        </button>
      )}
    </div>
  );
};

const Credits = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await creditsAPI.get();
      setData(res.data);
    } catch (error) {
      toast.error(errorText(error, 'Could not load your credits.'));
    }
  }, []);

  const loadPayments = useCallback(() => {
    paymentsAPI.list().then((r) => setPayments(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); loadPayments(); }, [load, loadPayments]);

  // 🆕 Razorpay checkout
  const pay = async (pack) => {
    setBusy(pack.id);
    try {
      if (!(await loadRazorpay())) throw new Error('Could not load Razorpay. Check your internet connection and try again.');
      const { data: order } = await paymentsAPI.createOrder(pack.id);
      await new Promise((resolve) => {
        const checkout = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: 'SocialHub',
          description: order.description,
          prefill: { name: user?.name || '', email: user?.email || '' },
          theme: { color: '#6366F1' },
          handler: async (result) => {
            try {
              const { data: done } = await paymentsAPI.verify(result);
              toast.success(`Payment received — ${done.packName || pack.name} credits added!`);
            } catch (error) {
              toast.error(errorText(error, 'Payment done, but we could not confirm it yet. Your credits will appear in a few minutes.'));
            } finally {
              await load();
              loadPayments();
              resolve();
            }
          },
          modal: { ondismiss: () => resolve() },
        });
        checkout.on('payment.failed', (response) => {
          toast.error(response?.error?.description || 'Payment failed. No money was taken — please try again.');
        });
        checkout.open();
      });
    } catch (error) {
      toast.error(errorText(error, 'Could not start the payment.'));
    } finally {
      setBusy(null);
    }
  };

  const openHistory = async () => {
    setShowHistory((v) => !v);
    if (!history.length) {
      try { setHistory((await creditsAPI.history()).data || []); } catch { /* shown as empty */ }
    }
  };

  const request = async (pack, note) => {
    setBusy(pack.id);
    try {
      await creditsAPI.request(pack.id, note);
      toast.success(`Request for ${pack.name} sent. We will contact you on your email shortly.`);
      await load();
      return true;
    } catch (error) {
      toast.error(errorText(error, 'Could not send the request.'));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id) => {
    try {
      await creditsAPI.cancelRequest(id);
      toast.success('Request cancelled');
      load();
    } catch (error) {
      toast.error(errorText(error, 'Could not cancel the request.'));
    }
  };

  if (!data) {
    return (
      <PageWrapper title="Credits & plans">
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
      </PageWrapper>
    );
  }

  const pendingIds = new Set((data.requests || []).filter((r) => r.status === 'pending').map((r) => r.planId));
  const online = Boolean(data.razorpay?.enabled);
  const gstPercent = Number(data.gstPercent) || 0;

  return (
    <PageWrapper title="Credits & plans">
      {/* Balance */}
      <section className="grid gap-4 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.key} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', k.tint)}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{k.label} left</p>
                <p className="font-heading text-3xl font-bold text-slate-900">
                  {data.unlimited ? '∞' : data.balance?.[k.key] ?? 0}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{k.hint} · used {data.used?.[k.key] || 0}</p>
          </div>
        ))}
      </section>
      <p className="mt-3 text-sm text-slate-500">
        Current plan: <span className="font-semibold capitalize text-slate-800">{data.plan}</span>
        {data.unlimited && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">Admin — unlimited</span>}
        <span className="mx-2 text-slate-300">·</span>
        Normal posting, scheduling, inbox and analytics never use credits.
      </p>

      {/* Plans */}
      <h2 className="mt-10 mb-5 font-heading text-2xl font-bold text-slate-900">Upgrade your plan</h2>
      <section className="grid gap-6 lg:grid-cols-3">
        {(data.plans || []).map((p) => (
          <PackCard key={p.id} pack={p} current={data.plan === p.id} pending={pendingIds.has(p.id)} onRequest={request} onPay={pay} online={online} gstPercent={gstPercent} busy={busy === p.id} />
        ))}
      </section>

      {/* Top-ups */}
      {(data.topups || []).length > 0 && (
        <>
          <h2 className="mt-10 mb-5 font-heading text-2xl font-bold text-slate-900">Ran out? Top up</h2>
          <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.topups.map((p) => (
              <PackCard key={p.id} pack={p} pending={pendingIds.has(p.id)} onRequest={request} onPay={pay} online={online} gstPercent={gstPercent} busy={busy === p.id} />
            ))}
          </section>
        </>
      )}

      {online ? (
        <p className="mt-6 text-sm text-slate-500">
          Secure payment by Razorpay — UPI, cards, net banking and wallets. Credits are added as soon as the payment succeeds.
        </p>
      ) : data.paymentInstructions && (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-900">
          <p className="font-semibold">How payment works</p>
          <p className="mt-1 whitespace-pre-line">{data.paymentInstructions}</p>
        </div>
      )}

      {/* Payments */}
      {payments.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-heading text-xl font-bold text-slate-900">Your payments</h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{p.packName} · {rupees(p.amount / 100)}</p>
                  <p className="text-xs text-slate-500">
                    {creditLine(p.credits)} · {new Date(p.paidAt || p.createdAt).toLocaleString('en-IN')}
                    {p.razorpayPaymentId ? ` · ${p.razorpayPaymentId}` : ''}
                  </p>
                </div>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold capitalize', p.status === 'paid' ? STATUS_STYLE.approved : STATUS_STYLE.rejected)}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Requests */}
      {(data.requests || []).length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-heading text-xl font-bold text-slate-900">Your requests</h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {data.requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{r.planName} · {rupees(r.price)}</p>
                  <p className="text-xs text-slate-500">{creditLine(r.credits)} · {new Date(r.createdAt).toLocaleString('en-IN')}</p>
                  {r.adminNote && <p className="mt-1 text-xs text-slate-500">Note from us: {r.adminNote}</p>}
                </div>
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold capitalize', STATUS_STYLE[r.status])}>{r.status}</span>
                {r.status === 'pending' && (
                  <button type="button" onClick={() => cancel(r.id)} className="text-xs font-medium text-slate-500 hover:text-red-600">Cancel</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="mt-10">
        <button type="button" onClick={openHistory} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
          {showHistory ? 'Hide credit history' : 'Show credit history'}
        </button>
        {showHistory && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">What</th><th className="px-4 py-3">Credits</th><th className="px-4 py-3">Left</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No history yet</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(h.createdAt).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2.5 text-slate-700">{h.note || (h.action || h.type).replace(/_/g, ' ')}</td>
                    <td className={cn('px-4 py-2.5 font-semibold', h.amount < 0 ? 'text-slate-700' : 'text-emerald-600')}>
                      {h.amount > 0 ? '+' : ''}{h.amount} {h.kind}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{h.balanceAfter ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageWrapper>
  );
};

export default Credits;
