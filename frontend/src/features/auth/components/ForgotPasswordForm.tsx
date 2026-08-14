import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export const ForgotPasswordForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/login`,
            });

            if (resetError) throw resetError;

            setSent(true);
        } catch (err: any) {
            setError(err.message || 'Failed to send reset link. Please try again.');
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <div>
                <div className="auth-notification success">
                    <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>A password reset link has been sent to <strong>{email}</strong>. Check your inbox (and spam folder).</span>
                </div>

                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '24px' }}>
                    Click the link in the email to reset your password. The link will expire in 1 hour.
                </p>

                <button
                    type="button"
                    className="auth-button-submit"
                    onClick={() => { setSent(false); setEmail(''); setLoading(false); }}
                    style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', boxShadow: 'none' }}
                >
                    <span>Send Again</span>
                </button>

                <div className="auth-footer">
                    Remember your password?
                    <Link to="/login" className="auth-link">Sign In</Link>
                </div>
            </div>
        );
    }

    return (
        <div>
            {error && (
                <div className="auth-notification error">
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{error}</span>
                </div>
            )}

            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '24px' }}>
                Enter the email address associated with your account and we'll send you a magic link to reset your password.
            </p>

            <form onSubmit={handleSubmit}>
                <div className="auth-input-group">
                    <label className="auth-label" htmlFor="reset-email">Email Address</label>
                    <div className="auth-input-wrapper">
                        <Mail className="auth-input-icon" size={18} />
                        <input
                            id="reset-email"
                            type="email"
                            className="auth-input"
                            placeholder="name@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                            autoFocus
                        />
                    </div>
                </div>

                <button id="reset-submit" type="submit" className="auth-button-submit" disabled={loading || !email.trim()}>
                    {loading ? (
                        <>
                            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            <span>Sending...</span>
                        </>
                    ) : (
                        <>
                            <span>Send Reset Link</span>
                            <ArrowRight size={18} />
                        </>
                    )}
                </button>

                <div className="auth-footer">
                    <Link to="/login" className="auth-link" style={{ marginLeft: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowLeft size={14} />
                        Back to Sign In
                    </Link>
                </div>
            </form>
        </div>
    );
};
