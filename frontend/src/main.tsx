import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import posthog from 'posthog-js'
import { PostHogProvider } from '@posthog/react'
import { getStoredAnonId } from './lib/fingerprint'
import CookieConsent, { getStoredConsent } from './components/shared/CookieConsent'

// ── PostHog initializer (only called after consent) ──────────────
function initPostHog() {
  if (posthog.__loaded) return // already initialized

  const anonId = getStoredAnonId()

  posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    defaults: '2026-05-30',
    // ── Error Tracking ──────────────────────────────────────────────
    // This is the critical flag that enables $exception event capture
    // for the PostHog Error Tracking dashboard.
    capture_exceptions: true,
    // ── Session Replay ──────────────────────────────────────────────
    enable_recording_console_log: true,
    session_recording: {
      recordCrossOriginIframes: true,
    },
    // Use your existing sreeai_anon_id as the PostHog distinct_id
    // so errors can be cross-referenced with the anonymous_users table
    bootstrap: anonId ? { distinctID: anonId } : undefined,
    persistence: 'localStorage+cookie',
  })
}

// ── Root wrapper that gates PostHog on cookie consent ────────────
function Root() {
  const [posthogReady, setPosthogReady] = useState(false)

  // Check if consent was already given in a previous session
  useEffect(() => {
    const existing = getStoredConsent()
    if (existing === 'accepted') {
      initPostHog()
      setPosthogReady(true)
    }
    // If 'declined' or null, PostHog stays off
  }, [])

  const handleConsent = useCallback((accepted: boolean) => {
    if (accepted) {
      initPostHog()
      setPosthogReady(true)
    }
    // If declined, PostHog stays uninitialized — no tracking at all
  }, [])

  // Always show the consent banner (it self-hides if already decided)
  // Wrap app in PostHogProvider only when PostHog is initialized
  return (
    <>
      {posthogReady ? (
        <PostHogProvider client={posthog}>
          <App />
        </PostHogProvider>
      ) : (
        <App />
      )}
      <CookieConsent onConsent={handleConsent} />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
