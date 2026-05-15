# Phase 9: Subscription Enforcement & Upload Rules - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce plan-based feature gating — model access, file upload limits, and feature restrictions per tier. This phase focuses on the server-side enforcement of subscription rules created in Phase 8.

</domain>

<decisions>
## Implementation Decisions

### File Upload Limits (Middleware)
- **D-01:** Implement a centralized validation middleware for file uploads.
- **D-02:** Anonymous users are BLOCKED from uploading files (return 401 Unauthorized with a clear message).
- **D-03:** Free Tier: 10MB limit per file.
- **D-04:** Starter Tier: 50MB limit per file.
- **D-05:** Pro Tier: 250MB limit per file.
- **D-06:** Validation must happen BEFORE the file is processed/stored to save bandwidth and costs.

### Queue Priority System
- **D-07:** Every request must have a priority header or metadata derived from the user's subscription tier.
- **D-08:** Priority levels:
  - Anonymous: 0
  - Free: 1
  - Starter: 2
  - Pro: 3
- **D-09:** Implement priority-based request processing (logic to handle Pro requests before Free requests during high traffic).

### Model Access Gating
- **D-10:** Create a registry of models and their minimum required subscription tier.
- **D-11:** Block "Pro-only" models (like Gemini 1.5 Pro, GPT-4o) for users on Free/Starter tiers.
- **D-12:** Return a 403 Forbidden with a "Upgrade to Pro" message when a restricted model is requested.

### the agent's Discretion
- Exact implementation of the priority queue logic (Redis vs. In-memory vs. Middleware-based).
- How the model registry is stored (Config file vs. Database).
- The specific error messages for each enforcement point.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Subscription Schema & Service
- `.planning/phases/08-subscription-service-management/08-SUMMARY.md` — What was built for subscriptions.
- `src/services/subscription.ts` (hypothetical) — The service to check user tiers.

### Rate Limiting & Queue
- `src/middleware/rate-limit.ts` (hypothetical) — Existing rate limiting to integrate with.

</canonical_refs>

<code_context>
## Existing Code Insights

### Integration Points
- `src/middleware/upload.ts` (if it exists) or wherever file uploads are handled.
- `src/api/inference.ts` (if it exists) or wherever model inference is triggered.

</code_context>

<deferred>
## Deferred Ideas

- Team-based quotas — Future phase.
- Dynamic quota adjustments — Future phase.

</deferred>

---

*Phase: 09-subscription-enforcement-upload-rules*
*Context gathered: 2026-05-13*
