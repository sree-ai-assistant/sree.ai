# Roadmap: Milestone v1.0 — Subscription & Rate Limiting System

**Created:** 2026-05-12
**Phases:** 8
**Requirements mapped:** 45/45

---

## Phase 6: Database Schema & Plan Configuration

**Goal:** Create the database foundation — anonymous_users table, enhanced usage tracking, plan definitions, and all RLS policies.

**Requirements:** DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, PLAN-01, PLAN-02, PLAN-03, PLAN-04

**Tasks:**
- [ ] Create `anonymous_users` table with all specified fields (anon_id, fingerprint_hash, ip_hash, user_agent, country, timestamps, counters)
- [ ] Create `usage_tracking` table with per-minute, daily, monthly counters per tool type
- [ ] Enhance `subscriptions` table with billing cycle metadata
- [ ] Add upload_limit_mb to plan configuration
- [ ] Create RLS policies for anonymous_users (access via anon_id) and usage_tracking
- [ ] Create indexes on fingerprint_hash, ip_hash, anon_id
- [ ] Define plan configuration constants (Anonymous/Free/Starter/Pro limits, features, prices)
- [ ] Create Supabase migration file for all schema changes

**Success Criteria:**
1. All new tables exist with proper columns and constraints
2. RLS policies prevent cross-user data access
3. Plan configuration constants are queryable and correct
4. Migration runs cleanly on fresh database

**Depends on:** Nothing (foundation phase)

---

## Phase 7: Anonymous Identity System

**Goal:** Implement multi-layer anonymous user identification — UUID generation, cookie/localStorage storage, fingerprint hashing, IP hashing, and identity restoration.

**Requirements:** ANON-01, ANON-02, ANON-03, ANON-04, ANON-05, ANON-06

**Tasks:**
- [ ] Create anonymous identity service (backend) — UUID generation, record creation
- [ ] Implement secure httpOnly cookie for anonymous ID storage
- [ ] Implement localStorage backup for anonymous ID
- [ ] Create fingerprint generation module (browser, OS, screen, timezone, language, canvas, WebGL)
- [ ] Implement sha256 IP hashing (never store raw IPs)
- [ ] Build identity restoration logic: match fingerprint + IP hash to restore previous anonymous identity
- [ ] Create middleware that validates/creates anonymous identity on every request
- [ ] Update last_seen_at on every anonymous request

**Success Criteria:**
1. First-time visitor gets a unique anon_id stored in cookie and localStorage
2. Clearing cookies alone does not create a new identity if fingerprint matches
3. Raw IP addresses never appear in database
4. Anonymous user record is created and updated on each visit

**Depends on:** Phase 6 (needs anonymous_users table)

---

## Phase 8: Rate Limiting Engine

**Goal:** Build the multi-layer rate limiting system — per-minute, daily, monthly checks with proper limit enforcement and structured error responses.

**Requirements:** RATE-01, RATE-02, RATE-03, RATE-04, RATE-05, RATE-06, SUB-01

**Tasks:**
- [ ] Rewrite usage.service.ts to support multi-tool rate limiting (chat, voice, image)
- [ ] Implement rate limit check order: per-minute → daily → monthly
- [ ] Build structured error responses: `{success: false, code: "RATE_LIMIT_EXCEEDED", message: "..."}`
- [ ] Implement daily limit reset logic (24-hour window)
- [ ] Implement monthly limit reset logic (billing cycle for authenticated, none for anonymous)
- [ ] Create rate-limit middleware that intercepts all AI requests
- [ ] Build subscription.service.ts with plan lookup and feature gating
- [ ] Integrate rate limiting with both anonymous and authenticated users

**Success Criteria:**
1. Exceeding per-minute limit returns structured error before daily/monthly check
2. Daily counters reset after 24 hours
3. Monthly counters reset at billing cycle boundary
4. Anonymous users only have daily limits, not monthly persistence
5. All AI routes (chat, voice, image) are protected by rate limiting

**Depends on:** Phase 6 (plan config), Phase 7 (anonymous identity)

---

## Phase 9: Subscription Enforcement & Upload Rules

**Goal:** Enforce plan-based feature gating — model access, file upload limits, and feature restrictions per tier.

**Requirements:** SUB-04, SUB-05, QUEUE-01, QUEUE-02

**Tasks:**
- [ ] Implement file upload size validation middleware (blocked/10MB/50MB/250MB per plan)
- [ ] Block file upload entirely for anonymous users (return auth-required error)
- [ ] Create queue priority system: Anonymous=0, Free=1, Starter=2, Pro=3
- [ ] Implement priority-based request processing during high traffic
- [ ] Add plan-tier check to file upload routes
- [ ] Ensure anonymous users can only access free/basic AI models

**Success Criteria:**
1. Anonymous file upload returns 401 with descriptive message
2. Free user uploading >10MB file is rejected with clear error
3. During simulated high traffic, Pro requests process before Free requests
4. Model access respects tier restrictions

**Depends on:** Phase 8 (subscription service must exist)

---

## Phase 10: BYOK Quota Integration

**Goal:** Integrate BYOK (Bring Your Own Key) with the rate limiting system — reduced quota consumption when users provide their own API keys.

**Requirements:** BYOK-01, BYOK-02

**Tasks:**
- [ ] Modify rate limit increment logic to support fractional quota (0.2x for BYOK)
- [ ] Detect when a request uses a user-provided API key vs platform key
- [ ] Support BYOK detection for OpenAI, Anthropic, Gemini, and Groq
- [ ] Update usage tracking to record whether request was BYOK
- [ ] Add BYOK status indicator to usage response

**Success Criteria:**
1. A BYOK request increments usage counter by 0.2 instead of 1.0
2. All four providers (OpenAI, Anthropic, Gemini, Groq) are recognized for BYOK
3. Usage display correctly reflects reduced consumption for BYOK requests

**Depends on:** Phase 8 (rate limiting engine), existing apiKey.service.ts

---

## Phase 11: Abuse Detection System

**Goal:** Implement abuse detection — rapid request detection, cookie-reset bypass prevention, VPN/datacenter flagging, and escalating enforcement responses.

**Requirements:** ABUSE-01, ABUSE-02, ABUSE-03, ABUSE-04, ABUSE-05, ABUSE-06

**Tasks:**
- [ ] Create abuse detection service with pattern recognition
- [ ] Detect rapid repeated requests exceeding per-minute limits
- [ ] Detect excessive account creation from same fingerprint/IP hash
- [ ] Detect suspicious prompt spam patterns (repeated identical prompts)
- [ ] Detect VPN/datacenter IP ranges using known datacenter CIDR lists
- [ ] Detect repeated cookie resets (same fingerprint, multiple anon_ids)
- [ ] Implement escalating response chain: cooldown → stricter limits → captcha → auth required → IP restriction
- [ ] Create abuse_flags table to track flagged identities

**Success Criteria:**
1. Same fingerprint creating >3 anonymous identities in 1 hour triggers abuse flag
2. Rapid requests beyond 2x per-minute limit triggers cooldown
3. Escalation chain applies progressively (not immediately at max)
4. VPN/datacenter IPs are flagged but not blocked outright

**Depends on:** Phase 7 (fingerprinting), Phase 8 (rate limiting)

---

## Phase 12: Anonymous-to-Authenticated Migration

**Goal:** Seamlessly merge anonymous user data into permanent accounts when users sign up — preserving chat history, preferences, and usage records.

**Requirements:** MIG-01, MIG-02, MIG-03

**Tasks:**
- [ ] Create migration service that links anonymous records to new user accounts
- [ ] Migrate chat history from anonymous sessions to permanent user account
- [ ] Migrate preferences and settings from anonymous profile
- [ ] Migrate usage history and counters
- [ ] Ensure no data deletion — anonymous records are marked as migrated, not removed
- [ ] Handle edge case: anonymous user already has data from a previous session
- [ ] Add migration trigger to the signup/login flow

**Success Criteria:**
1. After signup, all previous anonymous chats appear in user's chat history
2. Anonymous usage counts are preserved in the migrated account
3. No data loss during migration — original anonymous records remain marked
4. Multiple anonymous sessions from same fingerprint merge correctly

**Depends on:** Phase 7 (anonymous identity), Phase 8 (usage tracking)

---

## Phase 13: Frontend Limit UX & Polish

**Goal:** Build all frontend UX for limit enforcement — modals, input blocking, usage indicators, and upload restrictions.

**Requirements:** SUB-02, SUB-03, UX-01, UX-02, UX-03, UX-04, UX-05

**Tasks:**
- [ ] Create rate-limit-exceeded modal for anonymous users ("Create a free account to continue")
- [ ] Create upgrade modal for free users (pricing cards + upgrade CTA + API key option)
- [ ] Implement input blur and send button disable when anonymous limit reached
- [ ] Block file upload UI for anonymous users with login modal trigger
- [ ] Add real-time usage indicators showing remaining requests in sidebar/header
- [ ] Connect frontend limit checks to backend rate limit responses
- [ ] Style modals with glassmorphism and backdrop blur consistent with existing design

**Success Criteria:**
1. Anonymous user hitting chat limit sees blurred input + auth modal
2. Free user hitting limit sees pricing cards with upgrade and API key options
3. Anonymous user clicking file upload sees login modal immediately
4. Usage indicator updates in real-time after each request
5. All modals match existing glassmorphic design system

**Depends on:** Phase 8 (rate limiting responses), Phase 9 (upload rules)

---

## Summary

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|-------------|----------|
| 6 | Database Schema & Plan Config | Foundation tables and plan definitions | DB-01..06, PLAN-01..04 | 4 |
| 7 | Anonymous Identity System | Multi-layer anonymous tracking | ANON-01..06 | 4 |
| 8 | Rate Limiting Engine | Per-minute/daily/monthly enforcement | RATE-01..06, SUB-01 | 5 |
| 9 | Subscription Enforcement & Upload Rules | Feature gating and queue priority | SUB-04..05, QUEUE-01..02 | 4 |
| 10 | BYOK Quota Integration | Reduced quota for own API keys | BYOK-01..02 | 3 |
| 11 | Abuse Detection System | Pattern detection and escalation | ABUSE-01..06 | 4 |
| 12 | Anonymous-to-Auth Migration | Data merge on signup | MIG-01..03 | 4 |
| 13 | Frontend Limit UX & Polish | Modals, blocking, usage display | SUB-02..03, UX-01..05 | 5 |

**Total:** 8 phases | 45 requirements | All mapped ✓

---
*Roadmap created: 2026-05-12*
*Phase numbering continues from previous milestone (v2.0 ended at Phase 5)*
