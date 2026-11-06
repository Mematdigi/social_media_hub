// pages/DeleteAccount.jsx — public page (link it in Google Play → Data safety → "Delete account URL")
// Anyone can delete their SocialHub account here by signing in with their email and password.
import React, { useState } from 'react';
import { Sparkles, Trash2, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../services/api';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const DELETED = [
  'Your SocialHub profile and login',
  'Connected social accounts and their access tokens',
  'Your posts, drafts and schedules in SocialHub',
  'Uploaded photos and videos stored on our server',
  'AI Agent chats and AI-created images',
  'Inbox messages and analytics saved in SocialHub',
];

export default function DeleteAccount() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    if (confirmText.trim().toUpperCase() !== 'DELETE') { setError('Type DELETE to confirm.'); return; }

    setLoading(true);
    try {
      const { data } = await authAPI.login({ email: email.trim().toLowerCase(), password });
      await api.post('/auth/delete-account', { password }, { headers: { Authorization: `Bearer ${data.token}` } });
      localStorage.removeItem('socialhub_token');
      localStorage.removeItem('socialhub_user_id');
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not delete the account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-heading font-bold text-2xl text-slate-900">SocialHub</span>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h1 className="mt-3 font-heading text-2xl font-bold text-slate-900">Your account has been deleted</h1>
            <p className="mt-2 text-slate-600">Your SocialHub account and the data stored with it have been permanently removed.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h1 className="font-heading text-2xl font-bold text-slate-900">Delete your SocialHub account</h1>
            <p className="mt-2 text-slate-600">This works for accounts created in the SocialHub app or on the website. It permanently deletes:</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
              {DELETED.map((d) => <li key={d}>{d}</li>)}
            </ul>
            <p className="mt-3 text-sm text-slate-500">
              Posts already published on Facebook, Instagram, YouTube or X stay on those platforms. Deletion happens immediately
              and can’t be undone. Can’t sign in? Email us from your registered email address at <a href="mailto:hello@mematdigi.com" className="text-indigo-600 font-medium">hello@mematdigi.com</a>.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="del-email">Email</Label>
                <Input id="del-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="del-password">Password</Label>
                <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="del-confirm">Type DELETE to confirm</Label>
                <Input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="h-11 rounded-xl" />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold">
                {loading ? 'Deleting…' : <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete my account permanently</span>}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
