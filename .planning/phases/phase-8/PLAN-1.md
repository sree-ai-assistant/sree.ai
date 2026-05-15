# Plan 1: Usage & Subscription Services

## Objective
Rewrite `usage.service.ts` and implement `subscription.service.ts` — the core logic for multi-tool rate limiting and plan-based feature gating.

## Tasks

### 1.1 Rewrite `usage.service.ts`

Replace the download-only tracking with a unified multi-tool rate limiter using the `usage_tracking` table.

**Functions to implement:**

- `checkRateLimit(identity, toolType)` — Check per-minute → daily → monthly limits. Returns structured result with `allowed`, `limitType`, counters, and `resetsAt`.
- `incrementUsage(identity, toolType, isByok)` — Increment the appropriate counters after a successful request.
- `getUsageStatus(identity, toolType)` — Read-only query for frontend usage display.
- `resetExpiredCounters(record)` — Auto-reset minute/daily/monthly counters based on elapsed time.
- `getOrCreateUsageRecord(identity, toolType)` — Upsert into `usage_tracking`.

**Identity type:**
```ts
type RateLimitIdentity = 
  | { type: 'authenticated'; userId: string; tier: PlanTier }
  | { type: 'anonymous'; anonId: string; tier: 'anonymous' };
```

**Key behavior:**
- Auto-reset counters when time window has elapsed (no cron needed)
- Anonymous users have `monthly: null` → skip monthly check
- BYOK flag is recorded but multiplier applied in Phase 10
- All DB operations use `supabaseAdmin` (service role) for RLS bypass

### 1.2 Implement `subscription.service.ts`

**Functions to implement:**

- `getUserTier(userId)` — Look up plan tier from `profiles.plan_type`, default to `'free'`
- `getSubscription(userId)` — Full subscription record with billing cycle dates
- `canAccessFeature(tier, feature)` — Delegate to `plans.ts` helper
- `canAccessTool(tier, toolType)` — Check if the tool's daily limit > 0

## Success Criteria
- [ ] `checkRateLimit()` returns correct limits for all 4 tiers
- [ ] Counter auto-reset works for minute, daily, and monthly windows
- [ ] Anonymous users skip monthly check
- [ ] `subscription.service.ts` correctly resolves tier from profiles table
