import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Github } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const method = localStorage.getItem('last_login_method');
      if (method) {
        setLastMethod(method);
      }
    } catch (e) {
      console.warn('Failed to read last login method from localStorage', e);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      localStorage.setItem('last_login_method', 'email');

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.user) {
        // Check if onboarding is completed
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', data.user.id)
          .single();

        if (profile && !profile.onboarding_completed) {
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem('last_login_method', provider);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
    } catch (err: any) {
      setError(err.message || `Failed to sign in with ${provider}`);
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="auth-notification error">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Social Logins */}
      <div className="auth-social-grid">
        <button
          id="google-login-btn"
          type="button"
          className={`auth-social-btn ${lastMethod === 'google' ? 'last-used-highlight' : ''}`}
          onClick={() => handleOAuthLogin('google')}
          disabled={loading}
          aria-label="Sign in with Google"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          <span>Google</span>
          {lastMethod === 'google' && <span className="last-used-badge">Last Used</span>}
        </button>

        <button
          id="github-login-btn"
          type="button"
          className={`auth-social-btn ${lastMethod === 'github' ? 'last-used-highlight' : ''}`}
          onClick={() => handleOAuthLogin('github')}
          disabled={loading}
          aria-label="Sign in with GitHub"
        >
          <Github size={18} style={{ color: '#fff', flexShrink: 0 }} />
          <span>GitHub</span>
          {lastMethod === 'github' && <span className="last-used-badge">Last Used</span>}
        </button>
      </div>

      <div className="auth-divider">Or continue with</div>

      {/* Email Form */}
      <form onSubmit={handleSubmit}>
        <div className="auth-input-group">
          <div className="auth-label-row">
            <label className="auth-label" htmlFor="login-email">Email Address</label>
            {lastMethod === 'email' && <span className="email-last-used-text">Last used method</span>}
          </div>
          <div className="auth-input-wrapper">
            <Mail className="auth-input-icon" size={18} />
            <input 
              id="login-email"
              type="email" 
              className="auth-input" 
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="auth-input-group">
          <label className="auth-label" htmlFor="login-password">Password</label>
          <div className="auth-input-wrapper">
            <Lock className="auth-input-icon" size={18} />
            <input 
              id="login-password"
              type={showPassword ? 'text' : 'password'} 
              className="auth-input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
            <button
              type="button"
              className="auth-input-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button id="login-submit" type="submit" className="auth-button-submit" disabled={loading}>
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          {!loading && <ArrowRight size={18} />}
        </button>

        <div className="auth-footer">
          Don't have an account? 
          <Link to="/signup" className="auth-link">Create Account</Link>
        </div>
      </form>
    </div>
  );
};
