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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Anonymous user identity system with multi-layer tracking
- [ ] Tiered subscription enforcement (Anonymous/Free/Starter/Pro)
- [ ] Multi-layer rate limiting (per-minute, daily, monthly)
- [ ] BYOK quota reduction logic
- [ ] Abuse detection and prevention system
- [ ] Queue priority system based on plan tier
- [ ] File upload size limits per plan
- [ ] Anonymous-to-authenticated data migration
- [ ] Complete database schema for anonymous users and enhanced usage tracking

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Payment gateway integration (Stripe/Razorpay) — separate milestone after business logic is solid
- Admin dashboard for user management — future milestone
- Team/organization accounts — future milestone
- Real-time usage analytics dashboard — future milestone
- Custom model fine-tuning interface — deferred

## Current Milestone: v1.0 Subscription & Rate Limiting System

**Goal:** Build the complete business logic, anonymous user tracking, pricing/rate-limit enforcement, and database architecture for the AI SaaS platform.

**Target features:**
- Anonymous user identity system (UUID + cookie + localStorage + fingerprint + IP hash)
- Tiered subscription plans with enforced limits (Anonymous $0, Free $0, Starter $8/mo, Pro $29/mo)
- Multi-layer rate limiting (per-minute, daily, monthly) with proper limit-exceeded UX
- BYOK quota reduction logic (platform request = 1 quota, BYOK = 0.2 quota)
- Abuse detection and prevention (fingerprinting, IP tracking, cooldowns)
- Queue priority system (Anonymous=0, Free=1, Starter=2, Pro=3)
- File upload rules per plan tier (blocked/10MB/50MB/250MB)
- Anonymous-to-authenticated data migration (chat history, preferences, usage)
- Database schema: anonymous_users table, enhanced subscriptions, usage tracking

## Context

- **Stack:** React 18 + Vite frontend, Express/Node.js backend, Supabase (auth + PostgreSQL)
- **Existing DB:** users, subscriptions, usage_logs, api_keys, feature_flags, usage_counters tables
- **Existing services:** ai.service.ts (chat/voice/image), usage.service.ts (download-only), apiKey.service.ts, file.service.ts
- **subscription.service.ts is empty** — needs full implementation
- **usage.service.ts only tracks downloads** — needs complete rewrite for multi-tool rate limiting
- **No anonymous user concept exists** — needs new tables, middleware, frontend tracking
- **Plan types already defined** in auth store as `free | starter | pro` but not enforced beyond model access

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
| BYOK at 0.2x quota | Incentivize own keys without eliminating limits | — Pending |
| sha256 for IP hashing | Industry standard, privacy-compliant | — Pending |

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
*Last updated: 2026-05-12 after milestone v1.0 initialization*
