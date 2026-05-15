# Plan 3: Route Integration & Usage Endpoint

## Objective
Wire the rate limiting middleware into all AI routes, switch anonymous-capable routes to `flexAuthMiddleware`, and add a usage status endpoint.

## Tasks

### 3.1 Update `ai.routes.ts` middleware chain

**Routes to update:**

| Route | Current Middleware | New Middleware |
|-------|-------------------|---------------|
| `POST /chat` | `authMiddleware, tierCheckMiddleware` | `flexAuthMiddleware, rateLimitMiddleware('chat')` |
| `POST /voice` | `authMiddleware` | `flexAuthMiddleware, rateLimitMiddleware('voice')` |
| `POST /image` | `authMiddleware, tierCheckMiddleware` | `authMiddleware, featureGateMiddleware('imageGeneration'), rateLimitMiddleware('image')` |
| `POST /upload` | `authMiddleware` | `authMiddleware, featureGateMiddleware('fileUpload')` |
| `GET /download` | `authMiddleware` | Keep as-is (separate download tracking) |

**Key changes:**
- Chat and voice become anonymous-accessible via `flexAuthMiddleware`
- Image stays auth-only but adds feature gate + rate limit
- Upload stays auth-only but adds feature gate
- Remove the old `tierCheckMiddleware` from routes (replaced by rate limit)

### 3.2 Add usage status endpoint

**Route:** `GET /api/ai/usage`
**Middleware:** `flexAuthMiddleware`

Returns current usage status for all tools:
```json
{
  "success": true,
  "data": {
    "tier": "free",
    "chat": { "minute": { "used": 2, "limit": 5 }, "daily": { "used": 5, "limit": 10 }, "monthly": { "used": 30, "limit": 50 } },
    "voice": { ... },
    "image": { ... }
  }
}
```

### 3.3 Handle anonymous API key requirement

For anonymous chat/voice routes, skip the user-specific API key lookup. Use platform keys (environment variables) for anonymous users, user-configured keys for authenticated users.

## Success Criteria
- [ ] Chat and voice routes work for both authenticated and anonymous users
- [ ] Image generation blocked for anonymous users with clear error
- [ ] Rate limit enforced on all AI routes
- [ ] `/api/ai/usage` returns correct counters for current identity
- [ ] Existing download tracking unaffected
