# Plan 2: Rate Limit Middleware

## Objective
Create Express middleware that intercepts AI requests, checks rate limits, and returns structured 429 responses when limits are exceeded.

## Tasks

### 2.1 Create `rateLimit.ts` middleware

**File:** `backend/src/middleware/rateLimit.ts`

**Factory function:**
```ts
rateLimitMiddleware(toolType: ToolType)
```

Returns Express middleware that:
1. Resolves identity from `req.user` or `req.anonymousUser`
2. Resolves tier from `req.userTier` (set by flexAuthMiddleware)
3. Calls `checkRateLimit(identity, toolType)`
4. If blocked → return HTTP 429 with structured error
5. If allowed → attach usage info to `req.rateLimitInfo` and call `next()`
6. After response (on `finish` event) → call `incrementUsage()`

**Error response format:**
```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "limitType": "per_minute" | "daily" | "monthly",
  "tool": "chat",
  "limit": 10,
  "current": 10,
  "resetsAt": "ISO timestamp",
  "message": "Human-readable message with action hint",
  "upgradeUrl": "/pricing"
}
```

**Message variations by tier:**
- Anonymous: "Create a free account to continue."
- Free: "Upgrade to Starter for higher limits, or add your own API key."
- Starter: "Upgrade to Pro for the highest limits."

### 2.2 Feature gate middleware

**Function:** `featureGateMiddleware(feature: keyof PlanConfig['features'])`

Blocks requests when the user's tier doesn't include the feature.
- Anonymous trying image gen → 403 with `"code": "FEATURE_BLOCKED"`
- Anonymous trying file upload → 401 with `"code": "AUTH_REQUIRED"`

## Success Criteria
- [ ] Rate limit middleware returns 429 with structured body
- [ ] Usage increment happens only after successful response
- [ ] Feature gate blocks anonymous image generation
- [ ] Error messages are tier-appropriate
