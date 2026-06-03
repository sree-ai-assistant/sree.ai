import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';

export const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', marginBottom: '20px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div className="auth-input-group">
        <label className="auth-label" htmlFor="login-email">Email Address</label>
        <input 
          id="login-email"
          type="email" 
          className="auth-input" 
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="auth-input-group">
        <label className="auth-label" htmlFor="login-password">Password</label>
        <input 
          id="login-password"
          type="password" 
          className="auth-input" 
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button id="login-submit" type="submit" className="auth-button" disabled={loading}>
        {loading ? 'Authenticating...' : 'Sign In'}
      </button>

      <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem', color: '#94a3b8' }}>
        Don't have an account? <Link to="/signup" className="auth-link">Create Account</Link>
      </div>
    </form>
  );
};
