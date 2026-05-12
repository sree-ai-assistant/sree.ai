# State

## Current Position

Phase: 7 — Anonymous Identity System
Status: Not started
Last activity: 2026-05-12 — Phase 6 completed (3 plans, 2 waves, all verified)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

**Core value:** Users can interact with the best AI models through a single premium interface
**Current focus:** Subscription & Rate Limiting System

## Accumulated Context

- Phase 6 COMPLETE: anonymous_users + usage_tracking tables, RLS policies, plan config constants
- Plan config: backend/src/config/plans.ts is the single source of truth for all tier limits
- Migration files: 20260512000001 (tables+indexes), 20260512000002 (RLS policies) — NOT YET PUSHED to database
- subscription.service.ts is empty — needs full implementation
- usage.service.ts only tracks downloads — needs complete rewrite
- Plan types (free/starter/pro) exist in auth store but are not enforced beyond model access
- No anonymous user concept exists yet in frontend or middleware — Phase 7 builds this
- Auth middleware uses Bearer token → supabaseAdmin.auth.getUser()
- tierCheck middleware reads plan_type from profiles table
- BYOK_QUOTA_MULTIPLIER = 0.2 is defined in plans.ts
