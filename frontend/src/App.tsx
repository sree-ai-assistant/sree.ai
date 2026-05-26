import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Dashboard from './pages/Dashboard';
import ChatPage from './pages/ChatPage';
import ImageGenPage from './pages/ImageGenPage';
import SettingsPage from './pages/SettingsPage';
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

        {/* Public/Protected Hybrid Routes */}
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat/:id?" element={<ChatPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/voice" element={<Navigate to="/voice/chat" replace />} />
        <Route path="/voice/chat/:id?" element={<ChatPage />} />

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

        {/* Redirects */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
