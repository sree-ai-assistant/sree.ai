# Requirements: Sree AI

**Defined:** 2026-05-12
**Core Value:** Users can interact with the best AI models through a single premium interface

## v1 Requirements

Requirements for milestone v1.0 — Subscription & Rate Limiting System.

### Database Schema

- [x] **DB-01**: Create `anonymous_users` table with id, anon_id, fingerprint_hash, ip_hash, user_agent, country, created_at, last_seen_at, daily_chat_count, daily_voice_count, request_minute_count
- [x] **DB-02**: Create `usage_tracking` table supporting per-minute, daily, and monthly counters per tool type (chat, voice, image) for both anonymous and authenticated users
- [x] **DB-03**: Enhance `subscriptions` table with billing_cycle_start, billing_cycle_end, and plan tier metadata
- [x] **DB-04**: Add RLS policies for all new tables ensuring anonymous users can only access their own data via anon_id
- [x] **DB-05**: Create indexes on fingerprint_hash, ip_hash, and anon_id for fast lookups
- [x] **DB-06**: Add upload_limit_mb column to plan configuration or profiles table

### Anonymous Identity

- [x] **ANON-01**: Generate anonymous UUID on first visit and create anonymous user record in database
- [x] **ANON-02**: Store anonymous identifier in secure httpOnly cookie with localStorage backup
- [x] **ANON-03**: Generate browser fingerprint hash using browser, OS, screen size, timezone, language, canvas, and WebGL data
- [x] **ANON-04**: Store sha256-hashed IP address (never raw IP) for abuse detection
- [x] **ANON-05**: Restore previous anonymous identity when same fingerprint + same IP hash + new cookie is detected (high confidence match)
- [x] **ANON-06**: Update last_seen_at timestamp on every request from an anonymous user

### Plan Definitions

- [x] **PLAN-01**: Define Anonymous tier — chat-only + voice-only, no image gen, no file uploads, free models only, 10 chat/day, 10 voice/day, 3 req/min
- [x] **PLAN-02**: Define Free tier ($0/mo) — file uploads enabled, limited chat history, free models only, 10 chat/day + 50/month, 20 voice/day + 50/month, 5 image/day + 30/month, 5 req/min
- [x] **PLAN-03**: Define Starter tier ($8/mo) — all AI models, file uploads, faster queue priority, 50 chat/day + 600/month, 60 voice/day + 500/month, 30 image/day + 70/month, 10 req/min
- [x] **PLAN-04**: Define Pro tier ($29/mo) — all AI models, priority queue, large file uploads, 200 chat/day + 3000/month, 100 voice/day + 1000/month, 70 image/day + 1000/month, 20 req/min

### Rate Limiting

- [x] **RATE-01**: Implement rate limit checking in order: requests/minute first, then daily limits, then monthly limits
- [x] **RATE-02**: Return structured error response `{success: false, code: "RATE_LIMIT_EXCEEDED", message: "..."}` when any limit is exceeded
- [x] **RATE-03**: Reset daily limits every 24 hours based on first-request timestamp
- [x] **RATE-04**: Reset monthly limits every billing cycle for authenticated users
- [x] **RATE-05**: Anonymous users have daily reset only — no monthly persistence beyond tracking period
- [x] **RATE-06**: Create backend middleware that validates rate limits before processing any AI request

### Subscription Enforcement

- [x] **SUB-01**: Build subscription.service.ts with plan lookup, feature gating, and limit enforcement
- [x] **SUB-02**: When anonymous user reaches limit — blur input, disable send button, show authentication modal with "Create a free account to continue"
- [x] **SUB-03**: When free user reaches limit — show modal with pricing cards, upgrade CTA, and "add your own API key" option
- [x] **SUB-04**: When anonymous user tries file upload — immediately show login/signup modal, completely block upload action
- [x] **SUB-05**: Enforce file upload size limits per plan: Anonymous=blocked, Free=10MB, Starter=50MB, Pro=250MB

### Queue Priority

- [x] **QUEUE-01**: Implement priority queue system: Anonymous=0, Free=1, Starter=2, Pro=3
- [x] **QUEUE-02**: During high traffic, process requests in priority order (Pro first, Anonymous last)

### BYOK Integration

- [x] **BYOK-01**: When user uses their own API key, apply reduced quota consumption (platform=1.0x, BYOK=0.2x)
- [x] **BYOK-02**: Support BYOK for OpenAI, Anthropic, Gemini, and Groq providers

### Abuse Detection

- [x] **ABUSE-01**: Detect rapid repeated requests exceeding per-minute limits
- [x] **ABUSE-02**: Detect excessive account creation from same fingerprint/IP
- [x] **ABUSE-03**: Detect suspicious prompt spam patterns
- [x] **ABUSE-04**: Detect VPN/datacenter IP ranges for flagging
- [x] **ABUSE-05**: Detect repeated cookie resets (same fingerprint, new identity)
- [x] **ABUSE-06**: Apply escalating responses: cooldown → increased rate limiting → require captcha → require authentication → temporary IP restriction

### Data Migration

- [x] **MIG-01**: When anonymous user creates an account, merge chat history into permanent user account
- [x] **MIG-02**: Merge anonymous preferences and usage history into the new account
- [x] **MIG-03**: Preserve all anonymous data — do not delete previous history after migration

### Frontend UX

- [x] **UX-01**: Create rate limit exceeded modal for anonymous users with login/signup prompt
- [x] **UX-02**: Create upgrade modal for free users showing pricing cards and API key option
- [x] **UX-03**: Show real-time usage indicators (remaining requests) in the UI
- [x] **UX-04**: Blur chat input and disable send button when anonymous limit is reached
- [x] **UX-05**: Block file upload UI entirely for anonymous users with login modal trigger

## v2.1 Requirements: Video Generation & Google Veo Integration

### User Interface & Layout (UI)

- [ ] **VEO-01**: Create a premium glassmorphic Video Generation Page (`VideoGenPage.tsx`) using 21st.dev components and Stitch design tokens.
- [ ] **VEO-02**: Provide layout options: prompt input, aspect ratio selectors (16:9, 9:16, 1:1), and quality/tier settings.
- [ ] **VEO-03**: Implement a high-fidelity video player supporting playback, downloading, fullscreen, and smooth loading state animations.

### Model Integration (MODEL)

- [ ] **VEO-04**: Integrate Google Veo 3.1 APIs (`veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`).
- [ ] **VEO-05**: Integrate legacy/stable Google Veo 3 APIs (`veo-3.0-generate-001`, `veo-3.0-fast-generate-001`) and Veo 2 (`veo-2.0-generate-001`).

### Access Gating & Quota (GATE)

- [ ] **VEO-06**: Enforce minimum subscription plan of **Starter** (Premium) for all video generation models, blocking Free and Anonymous users.
- [ ] **VEO-07**: Update backend rate limiting and `usage_tracking` table to support video generation usage tracking by duration and tier.
- [ ] **VEO-08**: Support user-supplied Gemini API Keys (BYOK) for video generation, calculating quota usage at a 0.2x discount rate.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Payments
- **PAY-01**: Integrate Stripe/Razorpay for real subscription billing
- **PAY-02**: Handle subscription upgrades, downgrades, and cancellations
- **PAY-03**: Generate invoices and payment receipts

### Admin
- **ADMIN-01**: Admin dashboard for viewing user analytics and abuse reports
- **ADMIN-02**: Manual override for user plan types and limits
- **ADMIN-03**: Abuse flag review and resolution workflow

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom video post-processing / editing | Out of scope for milestone v2.1 |
| Real payment processing | Deferred to v3.0 |
| Admin dashboard | Deferred to v3.0 |
| Team/org accounts | Deferred to v3.0 |
| Mobile app | Web-first platform |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 6 | Completed |
| DB-02 | Phase 6 | Completed |
| DB-03 | Phase 6 | Completed |
| DB-04 | Phase 6 | Completed |
| DB-05 | Phase 6 | Completed |
| DB-06 | Phase 6 | Completed |
| ANON-01 | Phase 7 | Completed |
| ANON-02 | Phase 7 | Completed |
| ANON-03 | Phase 7 | Completed |
| ANON-04 | Phase 7 | Completed |
| ANON-05 | Phase 7 | Completed |
| ANON-06 | Phase 7 | Completed |
| PLAN-01 | Phase 6 | Completed |
| PLAN-02 | Phase 6 | Completed |
| PLAN-03 | Phase 6 | Completed |
| PLAN-04 | Phase 6 | Completed |
| RATE-01 | Phase 8 | Completed |
| RATE-02 | Phase 8 | Completed |
| RATE-03 | Phase 8 | Completed |
| RATE-04 | Phase 8 | Completed |
| RATE-05 | Phase 8 | Completed |
| RATE-06 | Phase 8 | Completed |
| SUB-01 | Phase 8 | Completed |
| SUB-02 | Phase 13 | Completed |
| SUB-03 | Phase 13 | Completed |
| SUB-04 | Phase 9 | Completed |
| SUB-05 | Phase 9 | Completed |
| QUEUE-01 | Phase 9 | Completed |
| QUEUE-02 | Phase 9 | Completed |
| BYOK-01 | Phase 10 | Completed |
| BYOK-02 | Phase 10 | Completed |
| ABUSE-01 | Phase 11 | Completed |
| ABUSE-02 | Phase 11 | Completed |
| ABUSE-03 | Phase 11 | Completed |
| ABUSE-04 | Phase 11 | Completed |
| ABUSE-05 | Phase 11 | Completed |
| ABUSE-06 | Phase 11 | Completed |
| MIG-01 | Phase 12 | Completed |
| MIG-02 | Phase 12 | Completed |
| MIG-03 | Phase 12 | Completed |
| UX-01 | Phase 13 | Completed |
| UX-02 | Phase 13 | Completed |
| UX-03 | Phase 13 | Completed |
| UX-04 | Phase 13 | Completed |
| UX-05 | Phase 13 | Completed |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-15 after milestone v1.0 completion*
