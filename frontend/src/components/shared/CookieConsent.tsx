/**
 * CookieConsent — GDPR-compliant cookie consent banner.
 *
 * Flow:
 *  1. Check localStorage for existing consent decision.
 *  2. If no decision → show the banner, PostHog stays OFF.
 *  3. On "Accept" → init PostHog, save to localStorage + sync to DB.
 *  4. On "Decline" → PostHog stays off, save decline to localStorage + DB.
 *  5. When user logs in, auth.store syncs the consent from anonymous → profile.
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './CookieConsent.module.css';

const CONSENT_KEY = 'sreeai_cookie_consent';
const CONSENT_TIMESTAMP_KEY = 'sreeai_cookie_consent_at';

export type ConsentStatus = 'accepted' | 'declined' | null;

/** Read the persisted consent decision from localStorage, respecting expiration. */
export function getStoredConsent(): ConsentStatus {
    try {
        const v = localStorage.getItem(CONSENT_KEY);
        const ts = localStorage.getItem(CONSENT_TIMESTAMP_KEY);

        if ((v === 'accepted' || v === 'declined') && ts) {
            const decisionDate = new Date(ts).getTime();
            const now = new Date().getTime();
            const daysSinceDecision = (now - decisionDate) / (1000 * 60 * 60 * 24);

            // If declined, ask again after 7 days
            if (v === 'declined' && daysSinceDecision >= 7) {
                localStorage.removeItem(CONSENT_KEY);
                localStorage.removeItem(CONSENT_TIMESTAMP_KEY);
                return null;
            }

            // If accepted, ask again after 365 days
            if (v === 'accepted' && daysSinceDecision >= 365) {
                localStorage.removeItem(CONSENT_KEY);
                localStorage.removeItem(CONSENT_TIMESTAMP_KEY);
                return null;
            }

            return v as ConsentStatus;
        }

        return null;
    } catch {
        return null;
    }
}

/** Persist the consent decision to localStorage. */
export function storeConsent(status: 'accepted' | 'declined'): string {
    const timestamp = new Date().toISOString();
    try {
        localStorage.setItem(CONSENT_KEY, status);
        localStorage.setItem(CONSENT_TIMESTAMP_KEY, timestamp);
    } catch {
        // localStorage blocked (incognito) — silently fail
    }
    return timestamp;
}

/** Get the stored consent timestamp. */
export function getStoredConsentTimestamp(): string | null {
    try {
        return localStorage.getItem(CONSENT_TIMESTAMP_KEY);
    } catch {
        return null;
    }
}

interface CookieConsentProps {
    /** Called when the user makes a consent decision */
    onConsent: (accepted: boolean) => void;
}

export default function CookieConsent({ onConsent }: CookieConsentProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        // Only show if no decision has been made yet
        const existing = getStoredConsent();
        if (!existing) {
            setVisible(true);
        }
    }, []);

    const dismiss = useCallback((accepted: boolean) => {
        setExiting(true);
        const status = accepted ? 'accepted' : 'declined';
        storeConsent(status);

        // Wait for exit animation before removing from DOM
        setTimeout(() => {
            setVisible(false);
            onConsent(accepted);
        }, 400);
    }, [onConsent]);

    if (!visible) return null;

    return (
        <div className={`${styles.cookieOverlay} ${exiting ? styles.exiting : ''}`}>
            <div className={styles.cookieBanner}>
                <div className={styles.cookieIcon}>🍪</div>
                <div className={styles.cookieTitle}>We value your privacy</div>
                <div className={styles.cookieText}>
                    We use cookies and analytics to improve your experience, track errors,
                    and understand how you use Sree AI. Your data helps us build a better product.
                    {' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">
                        Privacy Policy
                    </a>
                </div>
                <div className={styles.cookieActions}>
                    <button
                        className={styles.acceptBtn}
                        onClick={() => dismiss(true)}
                    >
                        Accept All
                    </button>
                    <button
                        className={styles.declineBtn}
                        onClick={() => dismiss(false)}
                    >
                        Decline
                    </button>
                </div>
            </div>
        </div>
    );
}
