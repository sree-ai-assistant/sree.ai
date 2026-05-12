# Requirements: Sree AI

**Defined:** 2026-05-12
**Core Value:** Users can interact with the best AI models through a single premium interface

## v1 Requirements

Requirements for milestone v1.0 — Subscription & Rate Limiting System.

### Database Schema

- [ ] **DB-01**: Create `anonymous_users` table with id, anon_id, fingerprint_hash, ip_hash, user_agent, country, created_at, last_seen_at, daily_chat_count, daily_voice_count, request_minute_count
- [ ] **DB-02**: Create `usage_tracking` table supporting per-minute, daily, and monthly counters per tool type (chat, voice, image) for both anonymous and authenticated users
- [ ] **DB-03**: Enhance `subscriptions` table with billing_cycle_start, billing_cycle_end, and plan tier metadata
- [ ] **DB-04**: Add RLS policies for all new tables ensuring anonymous users can only access their own data via anon_id
- [ ] **DB-05**: Create indexes on fingerprint_hash, ip_hash, and anon_id for fast lookups
- [ ] **DB-06**: Add upload_limit_mb column to plan configuration or profiles table

### Anonymous Identity

- [ ] **ANON-01**: Generate anonymous UUID on first visit and create anonymous user record in database
- [ ] **ANON-02**: Store anonymous identifier in secure httpOnly cookie with localStorage backup
- [ ] **ANON-03**: Generate browser fingerprint hash using browser, OS, screen size, timezone, language, canvas, and WebGL data
- [ ] **ANON-04**: Store sha256-hashed IP address (never raw IP) for abuse detection
- [ ] **ANON-05**: Restore previous anonymous identity when same fingerprint + same IP hash + new cookie is detected (high confidence match)
- [ ] **ANON-06**: Update last_seen_at timestamp on every request from an anonymous user

### Plan Definitions

- [ ] **PLAN-01**: Define Anonymous tier — chat-only + voice-only, no image gen, no file uploads, free models only, 10 chat/day, 10 voice/day, 3 req/min
- [ ] **PLAN-02**: Define Free tier ($0/mo) — file uploads enabled, limited chat history, free models only, 10 chat/day + 50/month, 20 voice/day + 50/month, 5 image/day + 30/month, 5 req/min
- [ ] **PLAN-03**: Define Starter tier ($8/mo) — all AI models, file uploads, faster queue priority, 50 chat/day + 600/month, 60 voice/day + 500/month, 30 image/day + 70/month, 10 req/min
- [ ] **PLAN-04**: Define Pro tier ($29/mo) — all AI models, priority queue, large file uploads, 200 chat/day + 3000/month, 100 voice/day + 1000/month, 70 image/day + 1000/month, 20 req/min

### Rate Limiting

- [ ] **RATE-01**: Implement rate limit checking in order: requests/minute first, then daily limits, then monthly limits
- [ ] **RATE-02**: Return structured error response `{success: false, code: "RATE_LIMIT_EXCEEDED", message: "..."}` when any limit is exceeded
- [ ] **RATE-03**: Reset daily limits every 24 hours based on first-request timestamp
- [ ] **RATE-04**: Reset monthly limits every billing cycle for authenticated users
- [ ] **RATE-05**: Anonymous users have daily reset only — no monthly persistence beyond tracking period
- [ ] **RATE-06**: Create backend middleware that validates rate limits before processing any AI request

### Subscription Enforcement

- [ ] **SUB-01**: Build subscription.service.ts with plan lookup, feature gating, and limit enforcement
- [ ] **SUB-02**: When anonymous user reaches limit — blur input, disable send button, show authentication modal with "Create a free account to continue"
- [ ] **SUB-03**: When free user reaches limit — show modal with pricing cards, upgrade CTA, and "add your own API key" option
- [ ] **SUB-04**: When anonymous user tries file upload — immediately show login/signup modal, completely block upload action
- [ ] **SUB-05**: Enforce file upload size limits per plan: Anonymous=blocked, Free=10MB, Starter=50MB, Pro=250MB

### Queue Priority

- [ ] **QUEUE-01**: Implement priority queue system: Anonymous=0, Free=1, Starter=2, Pro=3
- [ ] **QUEUE-02**: During high traffic, process requests in priority order (Pro first, Anonymous last)

### BYOK Integration

- [ ] **BYOK-01**: When user uses their own API key, apply reduced quota consumption (platform=1.0x, BYOK=0.2x)
- [ ] **BYOK-02**: Support BYOK for OpenAI, Anthropic, Gemini, and Groq providers

### Abuse Detection

- [ ] **ABUSE-01**: Detect rapid repeated requests exceeding per-minute limits
- [ ] **ABUSE-02**: Detect excessive account creation from same fingerprint/IP
- [ ] **ABUSE-03**: Detect suspicious prompt spam patterns
- [ ] **ABUSE-04**: Detect VPN/datacenter IP ranges for flagging
- [ ] **ABUSE-05**: Detect repeated cookie resets (same fingerprint, new identity)
- [ ] **ABUSE-06**: Apply escalating responses: cooldown → increased rate limiting → require captcha → require authentication → temporary IP restriction

### Data Migration

- [ ] **MIG-01**: When anonymous user creates an account, merge chat history into permanent user account
- [ ] **MIG-02**: Merge anonymous preferences and usage history into the new account
- [ ] **MIG-03**: Preserve all anonymous data — do not delete previous history after migration

### Frontend UX

- [ ] **UX-01**: Create rate limit exceeded modal for anonymous users with login/signup prompt
- [ ] **UX-02**: Create upgrade modal for free users showing pricing cards and API key option
- [ ] **UX-03**: Show real-time usage indicators (remaining requests) in the UI
- [ ] **UX-04**: Blur chat input and disable send button when anonymous limit is reached
- [ ] **UX-05**: Block file upload UI entirely for anonymous users with login modal trigger

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
| Real payment processing | Separate milestone — business logic must be solid first |
| Admin dashboard | Future milestone after core enforcement works |
| Team/org accounts | Different user model, deferred |
| Usage analytics dashboard | Nice-to-have, not core enforcement |
| Custom model fine-tuning | Unrelated to subscription system |
| Mobile app | Web-first platform |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 6 | Pending |
| DB-02 | Phase 6 | Pending |
| DB-03 | Phase 6 | Pending |
| DB-04 | Phase 6 | Pending |
| DB-05 | Phase 6 | Pending |
| DB-06 | Phase 6 | Pending |
| ANON-01 | Phase 7 | Pending |
| ANON-02 | Phase 7 | Pending |
| ANON-03 | Phase 7 | Pending |
| ANON-04 | Phase 7 | Pending |
| ANON-05 | Phase 7 | Pending |
| ANON-06 | Phase 7 | Pending |
| PLAN-01 | Phase 6 | Pending |
| PLAN-02 | Phase 6 | Pending |
| PLAN-03 | Phase 6 | Pending |
| PLAN-04 | Phase 6 | Pending |
| RATE-01 | Phase 8 | Pending |
| RATE-02 | Phase 8 | Pending |
| RATE-03 | Phase 8 | Pending |
| RATE-04 | Phase 8 | Pending |
| RATE-05 | Phase 8 | Pending |
| RATE-06 | Phase 8 | Pending |
| SUB-01 | Phase 8 | Pending |
| SUB-02 | Phase 13 | Pending |
| SUB-03 | Phase 13 | Pending |
| SUB-04 | Phase 9 | Pending |
| SUB-05 | Phase 9 | Pending |
| QUEUE-01 | Phase 9 | Pending |
| QUEUE-02 | Phase 9 | Pending |
| BYOK-01 | Phase 10 | Pending |
| BYOK-02 | Phase 10 | Pending |
| ABUSE-01 | Phase 11 | Pending |
| ABUSE-02 | Phase 11 | Pending |
| ABUSE-03 | Phase 11 | Pending |
| ABUSE-04 | Phase 11 | Pending |
| ABUSE-05 | Phase 11 | Pending |
| ABUSE-06 | Phase 11 | Pending |
| MIG-01 | Phase 12 | Pending |
| MIG-02 | Phase 12 | Pending |
| MIG-03 | Phase 12 | Pending |
| UX-01 | Phase 13 | Pending |
| UX-02 | Phase 13 | Pending |
| UX-03 | Phase 13 | Pending |
| UX-04 | Phase 13 | Pending |
| UX-05 | Phase 13 | Pending |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 after initial definition*
