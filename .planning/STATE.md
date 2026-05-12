# State

## Current Position

Phase: 8 — Rate Limiting Engine
Status: Not started
Last activity: 2026-05-12 — Phase 7 completed (3 plans, 2 waves, all verified)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

**Core value:** Users can interact with the best AI models through a single premium interface
**Current focus:** Subscription & Rate Limiting System

## Accumulated Context

- Phase 6 COMPLETE: anonymous_users + usage_tracking tables, RLS policies, plan config constants
- Phase 7 COMPLETE: anonymous identity service, fingerprint module, identity middleware
- Plan config: backend/src/config/plans.ts is the single source of truth for all tier limits
- Migration files: 20260512000001 (tables+indexes), 20260512000002 (RLS policies) — NOT YET PUSHED to database
- anonymous.service.ts: resolveAnonymousIdentity() handles lookup → restore → create flow
- fingerprint.ts: canvas/WebGL/screen SHA-256 fingerprint, localStorage/cookie storage
- anonymousIdentity.ts: flexAuthMiddleware supports both auth and anonymous routes
- api.ts interceptor now sends X-Anon-Id + X-Fingerprint headers on anonymous requests
- cookie-parser added to Express app for httpOnly cookie support
- subscription.service.ts is empty — needs full implementation in Phase 8
- usage.service.ts only tracks downloads — needs complete rewrite in Phase 8
- BYOK_QUOTA_MULTIPLIER = 0.2 is defined in plans.ts
