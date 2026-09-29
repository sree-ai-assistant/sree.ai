import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Github, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import styles from './AnonAuthModal.module.css';

interface AnonAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnonAuthModal: React.FC<AnonAuthModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      setLoadingProvider(provider);
      localStorage.setItem('last_login_method', provider);
      const now = new Date().toISOString();
      localStorage.setItem('pending_tos_accepted', 'true');
      localStorage.setItem('pending_tos_accepted_at', now);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
    } catch (err: any) {
      console.error(`Failed to sign in with ${provider}:`, err);
      setLoadingProvider(null);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
    const trimmed = email.trim();
    if (trimmed) {
      navigate('/signup', { state: { email: trimmed } });
    } else {
      navigate('/signup');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="anon-auth-title"
          >
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <h2 id="anon-auth-title" className={styles.title}>
              Log in or sign up
            </h2>
            <p className={styles.subtitle}>
              You'll get smarter responses and can upload files, images, and more.
            </p>

            <div className={styles.socialList}>
              <button
                type="button"
                className={styles.socialBtn}
                onClick={() => handleOAuthLogin('google')}
                disabled={!!loadingProvider}
              >
                {loadingProvider === 'google' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                className={styles.socialBtn}
                onClick={() => handleOAuthLogin('github')}
                disabled={!!loadingProvider}
              >
                {loadingProvider === 'github' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Github size={18} style={{ color: '#fff', flexShrink: 0 }} />
                )}
                <span>Continue with GitHub</span>
              </button>
            </div>

            <div className={styles.divider}>OR</div>

            <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
              <input
                type="email"
                className={styles.emailInput}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={false}
              />
              <button type="submit" className={styles.continueBtn}>
                Continue
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
