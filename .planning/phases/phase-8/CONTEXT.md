# Phase 8: Rate Limiting Engine — Context

## Objective

Build the multi-layer rate limiting system that enforces per-minute, daily, and monthly usage caps for chat, voice, and image generation — supporting both authenticated users (via `req.user`) and anonymous visitors (via `req.anonymousUser`).

## Architecture Decisions

### 1. Usage Tracking Table (already exists)

The `usage_tracking` table from Phase 6 stores per-tool counters:
- `minute_count` / `last_minute_reset` — sliding 60s window
- `daily_count` / `last_daily_reset` — 24h window
- `monthly_count` / `last_monthly_reset` — billing cycle or calendar month
- `is_byok` — tracks whether BYOK was used (Phase 10 will consume this)
- `user_id` XOR `anon_id` — one or the other, never both

### 2. Plan Config (exists in `plans.ts`)

All limits are defined in `PLAN_CONFIGS`:
- `anonymous`: chat 3/min · 10/day · no monthly, voice same, image blocked
- `free`: chat 5/min · 10/day · 50/month, voice 5/min · 20/day · 50/month
- `starter`: higher limits + all models + full history
- `pro`: highest limits

### 3. Existing Code to Replace/Extend

- **`usage.service.ts`** — Currently only tracks downloads on `profiles` table. Needs **complete rewrite** to use `usage_tracking` table with multi-tool support.
- **`subscription.service.ts`** — Empty file. Needs implementation for plan lookup and feature gating.
- **`ai.routes.ts`** — Currently uses `authMiddleware` on all AI routes. Needs to switch to `flexAuthMiddleware` on routes supporting anonymous access (chat, voice) and add rate-limit middleware.

### 4. Integration Points

Routes that need rate limiting:
- `POST /api/ai/chat` → tool_type: `chat` (anonymous + authenticated)
- `POST /api/ai/voice` → tool_type: `voice` (anonymous + authenticated)
- `POST /api/ai/image` → tool_type: `image` (authenticated only, blocked for anon)
- `GET /api/ai/download` → keep existing download tracking (separate concern)

### 5. Error Response Contract

All rate-limit rejections must return:
```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "limitType": "per_minute" | "daily" | "monthly",
  "tool": "chat" | "voice" | "image",
  "limit": 10,
  "current": 10,
  "resetsAt": "2026-05-12T16:00:00Z",
  "message": "Daily chat limit reached (10/day). Create a free account to continue.",
  "upgradeUrl": "/pricing"
}
```

### 6. Check Order

Rate limits are checked in this order (fail fast):
1. **Per-minute** — sliding 60s window (fastest to hit, fastest to reset)
2. **Daily** — 24h rolling window
3. **Monthly** — billing cycle (auth users) or null (anonymous — no monthly tracking)

### 7. Counter Reset Logic

- **Per-minute**: If `NOW - last_minute_reset > 60s`, reset `minute_count` to 0
- **Daily**: If `NOW - last_daily_reset > 24h`, reset `daily_count` to 0
- **Monthly**: If `NOW > billing_cycle_end` (auth) or null check (anon), reset `monthly_count` to 0

## Implementation Plan (3 Plans)

### Plan 1: Usage & Subscription Services (core logic)
- Rewrite `usage.service.ts` with `checkRateLimit()` and `incrementUsage()`
- Build `subscription.service.ts` with `getUserTier()` and `canAccessFeature()`
- Uses `usage_tracking` table via `supabaseAdmin`

### Plan 2: Rate Limit Middleware
- Create `rateLimit.ts` middleware that wraps `checkRateLimit()`
- Structured error responses with proper HTTP 429 status
- Handles both `req.user` and `req.anonymousUser` paths

### Plan 3: Route Integration
- Switch chat/voice routes from `authMiddleware` to `flexAuthMiddleware`
- Add rate-limit middleware to chat, voice, image routes
- Keep image route auth-only (anonymous blocked at feature level)
- Add `/api/ai/usage` endpoint for frontend to query remaining limits

## Dependencies

- ✅ Phase 6: `usage_tracking` table exists in Supabase
- ✅ Phase 7: `anonymousIdentity.ts` middleware and `anonymous.service.ts`
- ✅ `plans.ts`: All tier limits defined
