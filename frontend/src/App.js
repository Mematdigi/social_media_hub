import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccountsProvider } from './context/AccountsContext';
import './App.css';

import { RouteFallback } from './components/common/RouteFallback';

// Pages — each one is loaded on demand (see routes/lazyPages.js)
import {
  Login, Register, Dashboard, Accounts, Posts, AddPost, EditPost, Scheduler,
  Inbox, Analytics, AIAgent, PrivacyPolicy, TermsAndConditions, preloadAppPages,
} from './routes/lazyPages';
// import Home from './pages/Home';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
};

// Public Route Component
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Suspense fallback={<RouteFallback withShell={false} />}>{children}</Suspense>;
};

// Warm the other app pages once the user is signed in and the browser is idle
const PreloadWhenSignedIn = () => {
  const { isAuthenticated } = useAuth();
  useEffect(() => { if (isAuthenticated) preloadAppPages(); }, [isAuthenticated]);
  return null;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/privacy-policy" element={<PublicRoute><PrivacyPolicy/></PublicRoute>} />
      <Route path="/terms-condition" element={<PublicRoute><TermsAndConditions/></PublicRoute>} />
      {/* <Route path="/" element={<PublicRoute><Home/></PublicRoute>}/> */}

      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
      <Route path="/posts" element={<ProtectedRoute><Posts /></ProtectedRoute>} />
      <Route path="/posts/new" element={<ProtectedRoute><AddPost /></ProtectedRoute>} />
      <Route path="/posts/:id/edit" element={<ProtectedRoute><EditPost /></ProtectedRoute>} />
      <Route path="/scheduler" element={<ProtectedRoute><Scheduler /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/agent" element={<ProtectedRoute><AIAgent /></ProtectedRoute>} />

      {/* Redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountsProvider>
          <MotionConfig reducedMotion="user">
            <AppRoutes />
          </MotionConfig>
          <PreloadWhenSignedIn />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '1rem',
                padding: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              },
              className: 'font-body',
            }}
          />
        </AccountsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;