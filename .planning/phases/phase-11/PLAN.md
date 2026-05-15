# Phase 11: Abuse Detection System

**Goal:** Implement abuse detection — rapid request detection, cookie-reset bypass prevention, VPN/datacenter flagging, and escalating enforcement responses.

**Requirements:** ABUSE-01, ABUSE-02, ABUSE-03, ABUSE-04, ABUSE-05, ABUSE-06  
**Depends on:** Phase 7 (fingerprinting), Phase 8 (rate limiting)

---

## Architecture Overview

```
Request → flexAuth → anonymousIdentity → abuseDetection → rateLimit → route handler
                                              │
                                  ┌───────────┴───────────┐
                                  │   abuse.service.ts     │
                                  │   (pattern analysis)   │
                                  └───────────┬───────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        abuse_flags     datacenter_cidrs   escalation
                        (DB table)      (config/static)    (in-memory + DB)
```

## Implementation Plan

### Task 1: Database — `abuse_flags` table migration
**File:** `backend/src/migrations/` or Supabase SQL  
**Effort:** Small

Create the `abuse_flags` table to track flagged identities:

```sql
CREATE TABLE abuse_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity columns (at least one must be set)
  anon_id TEXT,
  user_id UUID REFERENCES auth.users(id),
  fingerprint_hash TEXT,
  ip_hash TEXT,
  -- Flag details
  flag_type TEXT NOT NULL,  -- 'rapid_requests' | 'excessive_accounts' | 'prompt_spam' | 'cookie_reset' | 'vpn_datacenter'
  severity INTEGER NOT NULL DEFAULT 1, -- 1=warning, 2=cooldown, 3=strict, 4=captcha, 5=auth_required, 6=ip_restricted
  evidence JSONB DEFAULT '{}',
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,           -- NULL = permanent until resolved
  resolved_at TIMESTAMPTZ,          -- When the flag was cleared
  resolved_by TEXT,                  -- 'auto_expire' | 'admin' | 'user_upgrade'
  -- Metadata
  escalation_count INTEGER DEFAULT 0
);

-- Indexes for fast lookups
CREATE INDEX idx_abuse_flags_anon_id ON abuse_flags(anon_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_fingerprint ON abuse_flags(fingerprint_hash) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_ip_hash ON abuse_flags(ip_hash) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_user_id ON abuse_flags(user_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_abuse_flags_expires ON abuse_flags(expires_at) WHERE resolved_at IS NULL;

-- RLS policy
ALTER TABLE abuse_flags ENABLE ROW LEVEL SECURITY;
-- Service-only table: no direct client access
CREATE POLICY "service_role_only" ON abuse_flags FOR ALL USING (auth.role() = 'service_role');
```

### Task 2: VPN/Datacenter CIDR Configuration
**File:** `backend/src/config/datacenter-cidrs.ts`  
**Effort:** Small

Static list of known datacenter/VPN CIDR ranges for flagging (not blocking).

- AWS, GCP, Azure, DigitalOcean, Vultr, Linode well-known ranges
- Export a `isDatacenterIp(ip: string): boolean` function using fast CIDR matching
- Use `ip-cidr` npm package or manual bitmask checks
- Keep the list as a static config array — no external API calls

### Task 3: Abuse Detection Service
**File:** `backend/src/services/abuse.service.ts`  
**Effort:** Large (core logic)

The central service that implements all pattern detection:

```typescript
// Public API:
export interface AbuseCheckResult {
  flagged: boolean;
  flagType?: string;
  severity: number;        // Current escalation level
  action: AbuseAction;     // What to do about it
  cooldownSeconds?: number;
}

type AbuseAction = 'allow' | 'cooldown' | 'strict_limits' | 'require_captcha' | 'require_auth' | 'ip_restrict';

// Main entry point — called by middleware
export async function checkForAbuse(context: AbuseContext): Promise<AbuseCheckResult>

// Individual detectors:
async function detectRapidRequests(ctx)     // ABUSE-01
async function detectExcessiveAccounts(ctx) // ABUSE-02
async function detectPromptSpam(ctx)        // ABUSE-03
async function detectVpnDatacenter(ctx)     // ABUSE-04
async function detectCookieResets(ctx)      // ABUSE-05

// Escalation engine:
async function resolveEscalation(ctx, flagType) // ABUSE-06
```

**Detection Logic:**

| Detector | Trigger | Data Source |
|----------|---------|-------------|
| Rapid Requests | >2x per-minute limit in rolling 60s window | In-memory sliding window (Map) |
| Excessive Accounts | Same fingerprint_hash → >3 distinct anon_ids in 1 hour | `anonymous_users` table query |
| Prompt Spam | >5 identical prompt hashes in 10 minutes | In-memory recent-prompt cache |
| VPN/Datacenter | IP matches known datacenter CIDR | Static CIDR config |
| Cookie Reset | Same fingerprint, >3 new anon_ids in 1 hour | `anonymous_users` table query |

**Escalation Chain (ABUSE-06):**

| Level | Action | Duration |
|-------|--------|----------|
| 1 | Log warning, continue normally | — |
| 2 | Apply cooldown (30s delay on responses) | 5 minutes |
| 3 | Apply stricter limits (50% of tier limits) | 15 minutes |
| 4 | Require CAPTCHA verification | 1 hour |
| 5 | Require authentication (block anonymous) | 6 hours |
| 6 | Temporary IP restriction | 24 hours |

Each repeat offense within the active window escalates to the next level. De-escalation happens automatically when the flag expires.

### Task 4: Abuse Detection Middleware
**File:** `backend/src/middleware/abuseDetection.ts`  
**Effort:** Medium

Express middleware that sits **after** identity resolution and **before** rate limiting:

```typescript
export const abuseDetectionMiddleware = async (req, res, next) => {
  const context: AbuseContext = {
    anonId: req.anonymousUser?.anon_id,
    userId: req.user?.id,
    fingerprintHash: req.headers['x-fingerprint'],
    ipHash: hashIp(getClientIp(req)),
    rawIp: getClientIp(req),
    promptHash: hashPrompt(req.body?.messages),
    userTier: req.userTier,
    toolType: req.toolType || 'chat',
  };

  const result = await checkForAbuse(context);

  if (result.action !== 'allow') {
    // Handle based on action type
    switch (result.action) {
      case 'cooldown':
        await sleep(result.cooldownSeconds * 1000);
        break;
      case 'strict_limits':
        req.abuseStrictLimits = true;  // Picked up by rateLimit middleware
        break;
      case 'require_captcha':
        return res.status(429).json({ code: 'CAPTCHA_REQUIRED', ... });
      case 'require_auth':
        return res.status(401).json({ code: 'AUTH_REQUIRED_ABUSE', ... });
      case 'ip_restrict':
        return res.status(403).json({ code: 'IP_RESTRICTED', ... });
    }
  }

  next();
};
```

### Task 5: Integrate Middleware into Route Pipeline
**File:** `backend/src/routes/ai.routes.ts`  
**Effort:** Small

Insert `abuseDetectionMiddleware` into the AI route pipeline between `flexAuthMiddleware` and `rateLimitMiddleware`:

```
router.post('/chat',
  flexAuthMiddleware,
  abuseDetectionMiddleware,    // ← New
  rateLimitMiddleware('chat'),
  chatHandler
);
```

Apply to all AI routes: `/chat`, `/voice`, `/image`, `/tts`.

### Task 6: Rate Limiter Integration for Strict Limits
**File:** `backend/src/middleware/rateLimit.ts`  
**Effort:** Small

Modify `rateLimitMiddleware` to respect `req.abuseStrictLimits`:
- When true, apply 50% of normal tier limits
- This creates the "stricter limits" escalation behavior without needing a separate middleware

---

## Verification Criteria

1. ✅ Same fingerprint creating >3 anonymous identities in 1 hour triggers abuse flag
2. ✅ Rapid requests beyond 2x per-minute limit triggers cooldown
3. ✅ Escalation chain applies progressively (not immediately at max)
4. ✅ VPN/datacenter IPs are flagged but not blocked outright
5. ✅ Flags expire automatically — not permanent bans
6. ✅ Authenticated paying users (starter/pro) have relaxed abuse thresholds

## File Summary

| File | Action | Task |
|------|--------|------|
| Supabase migration SQL | Create | Task 1 |
| `config/datacenter-cidrs.ts` | Create | Task 2 |
| `services/abuse.service.ts` | Create | Task 3 |
| `middleware/abuseDetection.ts` | Create | Task 4 |
| `routes/ai.routes.ts` | Modify | Task 5 |
| `middleware/rateLimit.ts` | Modify | Task 6 |

## Execution Order

Tasks 1 → 2 → 3 → 4 → 5 → 6 (sequential — each builds on the previous)
