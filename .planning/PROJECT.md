# Sree AI

## What This Is

A multi-model AI SaaS platform that gives users access to chat, voice, and image generation capabilities across multiple AI providers (NVIDIA NIM, OpenAI, Anthropic, Gemini, Groq). Built with React/Vite frontend, Express/Node.js backend, and Supabase for auth and data.

## Core Value

Users can interact with the best AI models through a single premium interface — without managing multiple subscriptions or API keys.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Multi-model AI chat with streaming SSE responses — v2.0
- ✓ NVIDIA NIM integration with dynamic model switching — v2.0
- ✓ Voice interaction page — v2.0
- ✓ Image generation page with model selection — v2.0
- ✓ Model selector UI with glassmorphic design — v2.0
- ✓ Plan-based model access control (Free/Starter/Pro tiers) — v2.0
- ✓ Pricing modal with tier comparison — v2.0
- ✓ Settings page with profile, security, API key management — v2.0
- ✓ BYOK (Bring Your Own Key) storage and provider logos — v2.0
- ✓ Supabase auth with session persistence — v2.0
- ✓ Dashboard with sidebar navigation — v2.0
- ✓ File upload support for chat context — v2.0
- ✓ Anonymous user identity system (UUID + Fingerprint + IP Hash) — v1.0 Ph 6-7
- ✓ Multi-layer rate limiting (Atomic per-minute/daily/monthly) — v1.0 Ph 8
- ✓ Subscription & Feature Gating (Queue Priority, Upload Limits) — v1.0 Ph 9
- ✓ Database schema for anonymous users and usage tracking — v1.0 Ph 6
- ✓ BYOK quota reduction logic (0.2x quota consumption) — v1.0 Ph 10
- ✓ Abuse detection and prevention system (pattern recognition) — v1.0 Ph 11
- ✓ Anonymous-to-authenticated data migration — v1.0 Ph 12
- ✓ Frontend Limit UX & Polish (modals, blocking indicators) — v1.0 Ph 13

### Active

<!-- Current scope. Building toward these. -->

- [ ] v2.1: Glassmorphic Video page UI designed with 21st.dev components & StitchMCP
- [ ] v2.1: Google Veo 3.1, Veo 3, and Veo 2 models integrated in backend
- [ ] v2.1: Model access gating (requires minimum Starter subscription tier)
- [ ] v2.1: Video generation rate limiting, pricing tiers, and credit usage logs (BYOK support)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Custom model fine-tuning interface — deferred

## Next Milestone: v2.1 Video Generation & Google Veo Integration

**Goal:** Create a premium glassmorphic Video Generation interface and integrate Google's state-of-the-art Veo models, gated behind the Starter plan (premium tier).

**Target features:**
- Premium glassmorphic Video page (`VideoGenPage.tsx`) using 21st.dev components & StitchMCP design tokens.
- Integration of Google Gemini/Veo APIs (`veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview`, `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001`).
- Feature gating ensuring the minimum subscription plan required is "Starter" (block Free plan access).
- Backend credit usage tracking, pricing logs, and rate limit validation with support for user-supplied API keys (BYOK).

## Future Milestone: v3.0 Payments & Administration

**Goal:** Commercialize the platform by integrating payment gateways (Stripe/Razorpay) and building administration and analytics tools for scale.

## Completed Milestone: v1.0 Subscription & Rate Limiting System (✓)

**Goal:** Build the complete business logic, anonymous user tracking, pricing/rate-limit enforcement, and database architecture for the AI SaaS platform.

## Context

- **Stack:** React 18 + Vite frontend, Express/Node.js backend, Supabase (auth + PostgreSQL)
- **Existing DB:** users, subscriptions, usage_logs, api_keys, feature_flags, usage_counters tables
- **Existing services:** ai.service.ts (chat/voice/image), apiKey.service.ts, file.service.ts
- **subscription.service.ts is implemented** — provides plan lookup and feature gating
- **usage.service.ts is implemented** — tracks multi-tool rate limiting with atomic RPC
- **Anonymous user concept is implemented** — includes middleware and frontend tracking
- **Plan tiers are enforced** — limits applied to chat, voice, and image generation

## Constraints

- **Database:** Supabase PostgreSQL with RLS — all new tables need proper RLS policies
- **Privacy:** Never store raw IP addresses — only sha256 hashes
- **Security:** Fingerprint data stored as hashed values only
- **Compatibility:** Must work with existing Supabase auth flow — no breaking changes to login/signup

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Supabase for auth + DB | Existing infrastructure, good DX, built-in RLS | ✓ Good |
| Express backend (not serverless) | Existing architecture, streaming SSE support | ✓ Good |
| Zustand for frontend state | Already in use, lightweight, fits the app | ✓ Good |
| BYOK at 0.2x quota | Incentivize own keys without eliminating limits | ✓ Good |
| sha256 for IP hashing | Industry standard, privacy-compliant | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-15 after milestone v1.0 completion*
