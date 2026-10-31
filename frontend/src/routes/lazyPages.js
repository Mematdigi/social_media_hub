// ─────────────────────────────────────────────────────────────────────────────
// Route-level code splitting.
// Each page is its own JS chunk, so the first load only downloads what the
// current screen needs. `preloadRoute(path)` warms a chunk before navigation
// (used on sidebar hover/focus/touch and when the browser is idle).
// ─────────────────────────────────────────────────────────────────────────────
import React, { lazy } from 'react';

const loaders = {
  '/login': () => import(/* webpackChunkName: "page-login" */ '../pages/Login'),
  '/register': () => import(/* webpackChunkName: "page-register" */ '../pages/Register'),
  '/privacy-policy': () => import(/* webpackChunkName: "page-legal-privacy" */ '../pages/PrivacyPolicy'),
  '/terms-condition': () => import(/* webpackChunkName: "page-legal-terms" */ '../pages/TermsCondition'),
  '/dashboard': () => import(/* webpackChunkName: "page-dashboard" */ '../pages/Dashboard'),
  '/accounts': () => import(/* webpackChunkName: "page-accounts" */ '../pages/Accounts'),
  '/posts': () => import(/* webpackChunkName: "page-posts" */ '../pages/Posts'),
  '/posts/new': () => import(/* webpackChunkName: "page-add-post" */ '../pages/AddPost'),
  '/posts/edit': () => import(/* webpackChunkName: "page-edit-post" */ '../pages/EditPost'),
  '/scheduler': () => import(/* webpackChunkName: "page-scheduler" */ '../pages/Scheduler'),
  '/inbox': () => import(/* webpackChunkName: "page-inbox" */ '../pages/Inbox'),
  '/analytics': () => import(/* webpackChunkName: "page-analytics" */ '../pages/Analytics'),
  '/agent': () => import(/* webpackChunkName: "page-agent" */ '../pages/AIAgent'),
};

const started = new Map();
const ready = new Map(); // key -> component, once its chunk has arrived
const load = (key) => {
  if (!started.has(key)) {
    started.set(key, loaders[key]()
      .then((mod) => { ready.set(key, mod.default); return mod; })
      // If a chunk fails (e.g. a deploy replaced it), allow a retry next time
      .catch((err) => { started.delete(key); throw err; }));
  }
  return started.get(key);
};

export const preloadRoute = (path) => {
  const key = loaders[path] ? path : /^\/posts\/[^/]+\/edit$/.test(path) ? '/posts/edit' : null;
  if (key) load(key).catch(() => {});
};

// After the app is idle, quietly warm the main app pages
export const preloadAppPages = () => {
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
  const conn = navigator.connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return; // respect data saver / slow networks
  const queue = ['/dashboard', '/posts', '/analytics', '/posts/new', '/agent', '/scheduler', '/inbox', '/accounts', '/posts/edit'];
  const next = () => {
    const p = queue.shift();
    if (!p) return;
    preloadRoute(p);
    idle(next, { timeout: 1200 });
  };
  setTimeout(() => idle(next, { timeout: 1500 }), 600);
};

// Renders the page directly when its chunk is already downloaded (no loading
// flash on navigation); otherwise falls back to React.lazy + Suspense.
const page = (key) => {
  const Lazy = lazy(() => load(key));
  const Page = (props) => {
    const Ready = ready.get(key);
    return Ready ? React.createElement(Ready, props) : React.createElement(Lazy, props);
  };
  Page.displayName = `Page(${key})`;
  return Page;
};

export const Login = page('/login');
export const Register = page('/register');
export const PrivacyPolicy = page('/privacy-policy');
export const TermsAndConditions = page('/terms-condition');
export const Dashboard = page('/dashboard');
export const Accounts = page('/accounts');
export const Posts = page('/posts');
export const AddPost = page('/posts/new');
export const EditPost = page('/posts/edit');
export const Scheduler = page('/scheduler');
export const Inbox = page('/inbox');
export const Analytics = page('/analytics');
export const AIAgent = page('/agent');

// Start downloading the page for the current URL immediately — in parallel with
// the sign-in check — instead of waiting for it (removes a network waterfall).
if (typeof window !== 'undefined') preloadRoute(window.location.pathname === '/' ? '/dashboard' : window.location.pathname);
