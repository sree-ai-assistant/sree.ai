# Phase 16: Plan Gating, Quotas, and BYOK Tracking - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase implements Starter plan gating, credit calculations, rate limits, and BYOK consumption rules for the newly integrated Google Veo video generation models. It secures the video generation endpoint by blocking free/anonymous users, configures credit consumption and tracking for Starter and Pro plans, and applies a 0.2x consumption discount for users bringing their own Google API keys.

</domain>

<decisions>
## Implementation Decisions

### Access Gating
- **D-01:** Video generation is gated behind a minimum subscription plan of `Starter`. Anonymous and free tier users are blocked with `401 Unauthorized` (auth required) and `403 Forbidden` (upgrade required/feature locked) respectively.

### Credit Usage and Quotas
- **D-02:** Credit consumption rates for video generation are duration-based. Rate is calculated as `durationSeconds * modelRate`, where `modelRate` depends on the Google Veo model tier (Lite: 0.06, Fast: 0.20, default: 0.40).
- **D-03:** BYOK (Bring Your Own Key) requests bypass standard rate limits on the backend key rotation pool but are charged at a 0.2x multiplier discount to reflect the use of private credentials.

### Frontend Dashboard & Limits UI
- **D-04:** The User Settings page shows active consumption metrics for the 'Video' service alongside Chat, Voice, Image, and Speech-to-Text cards.

### the agent's Discretion
- The implementation details of the rate limiting validation and the schema limits for video are already configured in `plans.ts`.
- The testing suite integrates the mock tests for `starterPlanMiddleware` and `videoModelValidationMiddleware`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Configuration and Limits
- [backend/src/config/plans.ts](file:///p:/antygravity-projects/Ai-Sass-3/backend/src/config/plans.ts) — Defines PlanConfig tiers, limits, and BYOK multiplier.

### Middleware and Gating
- [backend/src/middleware/auth.ts](file:///p:/antygravity-projects/Ai-Sass-3/backend/src/middleware/auth.ts) — Implements plan gating (`starterPlanMiddleware`) and model validation.
- [backend/src/middleware/rateLimit.ts](file:///p:/antygravity-projects/Ai-Sass-3/backend/src/middleware/rateLimit.ts) — Implements tool-type rate limiting.

### Routes and Services
- [backend/src/routes/ai.routes.ts](file:///p:/antygravity-projects/Ai-Sass-3/backend/src/routes/ai.routes.ts) — Handles `/video` route endpoint, rate calculation, and usage tracking increment.
- [backend/src/services/usage.service.ts](file:///p:/antygravity-projects/Ai-Sass-3/backend/src/services/usage.service.ts) — Core multi-usage tracking database RPC interface (`checkAndIncrementMultiUsage`).

### Frontend Integration
- [frontend/src/store/usage.store.ts](file:///p:/antygravity-projects/Ai-Sass-3/frontend/src/store/usage.store.ts) — Keeps track of local usage limits for video on client.
- [frontend/src/pages/SettingsPage.tsx](file:///p:/antygravity-projects/Ai-Sass-3/frontend/src/pages/SettingsPage.tsx) — Displays user quotas and remaining video usage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `starterPlanMiddleware` and `videoModelValidationMiddleware` in `backend/src/middleware/auth.ts` gate subscription access.
- `checkAndIncrementMultiUsage` in `backend/src/services/usage.service.ts` handles atomic DB increments.

### Established Patterns
- Billing and usage are tracked in Supabase `usage_tracking` table per tool type (`video`, `chat`, etc.).
- BYOK keys are resolved and rotation is bypassed if the user provides their own key header.

### Integration Points
- `/api/ai/video` endpoint is the gateway for video generations.
- Frontend Settings Page displays remaining video usage under `displayUsage?.video`.

</code_context>

<specifics>
## Specific Ideas

- The default video duration is 5 seconds.
- Video rates: Lite = 0.06 credits/sec, Fast = 0.20 credits/sec, Standard/Other = 0.40 credits/sec.

</specifics>

<deferred>
## Deferred Ideas

- Stripe/Razorpay integration for subscription payments (deferred to v2.2/PAY-01).

</deferred>

---

*Phase: 16-Plan Gating, Quotas, and BYOK Tracking*
*Context gathered: 2026-07-07*
