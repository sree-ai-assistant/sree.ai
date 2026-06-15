import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Dashboard from './pages/Dashboard';
import ChatPage from './pages/ChatPage';
import ImageGenPage from './pages/ImageGenPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';
import PricingPage from './pages/PricingPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { supabase } from './lib/supabase';

import { Toaster } from 'react-hot-toast';

function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    // One-time cleanup: remove legacy cache key that is no longer used
    try { localStorage.removeItem('sree_models_cache'); } catch (_) { /* ignore */ }
    initialize();
  }, [initialize]);

  // Handle visibility change to prevent Supabase auth lock bug on tab switch
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <Router>
      <Toaster position="top-right" />
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Onboarding Route (protected — requires auth) */}
        <Route
          path="/onboarding"
          element={
            <OnboardingGuard>
              <OnboardingPage />
            </OnboardingGuard>
          }
        />

        {/* Public/Protected Hybrid Routes */}
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route
          path="/chat/:id?"
          element={
            <HybridOnboardingGuard>
              <ChatPage />
            </HybridOnboardingGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <HybridOnboardingGuard>
              <Dashboard />
            </HybridOnboardingGuard>
          }
        />
        <Route path="/voice" element={<Navigate to="/voice/chat" replace />} />
        <Route
          path="/voice/chat/:id?"
          element={
            <HybridOnboardingGuard>
              <ChatPage />
            </HybridOnboardingGuard>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/images/:id?"
          element={
            <ProtectedRoute>
              <ImageGenPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/upgrade" element={<Navigate to="/pricing" replace />} />

        {/* Redirects */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

/**
 * HybridOnboardingGuard — If a user is logged in (authenticated) but
 * has not completed onboarding, they are redirected to /onboarding.
 * Anonymous (non-logged in) users are allowed to pass through.
 */
function HybridOnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-dark)',
        color: 'white'
      }}>
        <div className="loader">Loading...</div>
      </div>
    );
  }

  // Logged in but onboarding not completed -> redirect to onboarding wizard
  if (user && user.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

/**
 * OnboardingGuard — Ensures only authenticated users who haven't
 * completed onboarding can access /onboarding. Already-onboarded
 * users are redirected to the app.
 */
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-dark)',
        color: 'white'
      }}>
        <div className="loader">Loading...</div>
      </div>
    );
  }

  // Not logged in — redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Already completed onboarding — redirect to app
  if (user.onboarding_completed) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
}

export default App;
