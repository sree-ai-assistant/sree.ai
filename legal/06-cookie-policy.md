# Cookie Policy — Sree AI

**Effective Date:** August 20, 2026  
**Last Updated:** September 30, 2026  
**Application:** Sree AI (accessible via [https://app.sreeai.qzz.io](https://app.sreeai.qzz.io))

---

## 1. What Are Cookies and Local Storage?

Cookies and browser local storage are small text files or data keys placed on your device (computer, tablet, or mobile phone) when you visit our website. They allow the platform to remember your active session, authenticate requests, enforce rate limits, and maintain your user interface preferences.

---

## 2. Categories of Cookies We Use

Sree AI adheres to a privacy-first data philosophy. We do **NOT** use invasive cross-site advertising cookies or sell tracking data to data brokers.

### 2.1 Strictly Necessary Cookies & Storage (Essential)
These tokens and identifiers are required for core platform functionality, user authentication, and rate limiting:

| Key / Cookie Name | Provider | Storage Type | Expiration | Purpose |
|---|---|---|---|---|
| `sb-*-auth-token` | Supabase Auth | Cookie / LocalStorage | 1 Year (Rolling) | Secure encrypted session token authenticating your active user session. |
| `sreeai_anon_id` | Sree AI | Cookie / LocalStorage | 90 Days | Anonymous visitor identifier enabling guest chat, voice trials, and usage quotas. |
| `ai_sass_device_id` | Sree AI | LocalStorage | Persistent | Cryptographically generated unique device ID for trusted devices and session security. |
| `sreeai_cookie_consent` | Sree AI | LocalStorage | 1 Year | Stores proof of user cookie consent decision (accepted or declined). |
| `sree_file_agreement` | Sree AI | LocalStorage | 1 Year | Stores consent for file processing & upload policy disclaimer. |

### 2.2 Analytics & Diagnostics Storage (Sanitized)

We utilize **PostHog Inc.** for privacy-conscious application performance monitoring, UI latency tracking, and error diagnostics:

| Key / Cookie Name | Provider | Storage Type | Expiration | Purpose |
|---|---|---|---|---|
| `ph_<project_token>_posthog` | PostHog | Cookie / LocalStorage | 1 Year | Stores anonymous session telemetry, active feature flags, and UI interaction timestamps without PII. |
| `ph_distinct_id` | PostHog | Cookie / LocalStorage | 1 Year | Unique random UUID to deduplicate client crash reports and measure page load performance. |

### 2.3 Functional & Preference Storage
These preferences ensure a seamless and personalized user experience across page reloads:

| Key / Cookie Name | Provider | Storage Type | Purpose |
|---|---|---|---|
| `sidebar-collapsed` | Sree AI | LocalStorage | Remembers whether your navigation sidebar is open or minimized. |
| `model-storage` | Sree AI | LocalStorage (Zustand) | Remembers your selected AI model, search query, and filter preferences. |
| `image-storage` | Sree AI | LocalStorage (Zustand) | Remembers Creative Studio settings, aspect ratio, and active prompt. |
| `sreeai_live_voice` | Sree AI | LocalStorage | Remembers your preferred voice (e.g. Zephyr, Aoede, Puck) for Gemini Live bidirectional voice mode. |
| `last_login_method` | Sree AI | LocalStorage | Remembers your last used sign-in provider (email, Google, GitHub) for quick access. |
| `sree_notif_prefs` | Sree AI | LocalStorage | Remembers your in-app notification preferences. |
| `voice_lockout` / `chat_lockout` | Sree AI | LocalStorage | Temporary countdown timestamps stored only when rate limits are exceeded to avoid spamming the backend. |
| `sree_anon_banner_dismissed` | Sree AI | SessionStorage | Records whether the anonymous sign-up prompt banner has been dismissed. Cleared when the browser tab closes — never persists across sessions. |
| `sree_anon_modal_last_shown_at` | Sree AI | LocalStorage | Unix timestamp (ms) of when the sign-in prompt modal was last shown to an anonymous user. Enforces a 24-hour cooldown so the modal does not re-appear more than once per day. |

> **Privacy Guarantee:** PostHog telemetry is configured to strip cleartext IP addresses, personal identifiers, chat message bodies, and uploaded file contents. Telemetry is utilized solely for platform reliability and speed optimization.

---

## 3. How to Manage and Control Cookies

1. **Browser Controls:** You can block, disable, or delete cookies directly through your browser settings (Chrome, Safari, Firefox, Edge).
2. **Impact of Disabling Cookies:** Because our cookies are strictly functional and security-oriented, blocking essential cookies (`sb-access-token`, `sree_anon_id`) will prevent you from signing in, persisting chat conversations, or accessing paid subscription tiers.

---

## 4. Contact Information

If you have questions regarding our use of cookies or local storage, please contact:

- **Privacy Desk:** `privacy@sreeai.qzz.io`
- **Official Website:** [https://sreeai.qzz.io](https://sreeai.qzz.io)
