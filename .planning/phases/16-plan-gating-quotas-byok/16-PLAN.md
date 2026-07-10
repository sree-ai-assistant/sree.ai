---
wave: 1
depends_on: []
files_modified:
  - backend/src/config/plans.ts
  - backend/src/middleware/auth.ts
  - backend/src/middleware/rateLimit.ts
  - backend/src/routes/ai.routes.ts
  - backend/src/services/usage.service.ts
  - frontend/src/store/usage.store.ts
  - frontend/src/pages/SettingsPage.tsx
requirements:
  - VEO-06
  - VEO-07
  - VEO-08
autonomous: true
---

# Phase 16: Plan Gating, Quotas, and BYOK Tracking - Plan

This phase enforces plan-level security gating for video generation models, calculates and tracks flat-rate consumption quotas atomically via the database (charging 1 credit for standard video and 0.2 credits for BYOK requests), and integrates consumption status onto the frontend settings UI.

## Objectives

1. **Access Gating:** Restrict Google Veo model generations to users on the Starter tier or higher. Block free/anonymous users with standard API payloads and status codes.
2. **Quota & Rate calculations:** Charge a flat rate of 1 credit per generated video.
3. **BYOK Multiplier:** Apply a flat rate of 0.2 credits per generated video when a private Bring Your Own Key is detected, and bypass backend API key rotation rate-limits.
4. **Limits & Dashboard UI:** Update usage stores and display consumption details on the Settings Page.

## Tasks

### Backend Security and Plan Gating
- [x] Create `starterPlanMiddleware` in `backend/src/middleware/auth.ts` to check authenticated user tiers and return `401 Unauthorized` for `anonymous` and `403 Forbidden` for `free` tiers.
- [x] Create `videoModelValidationMiddleware` in `backend/src/middleware/auth.ts` to allow only Google Veo models (`veo-3.1-fast-generate-preview` and `veo-2.0-generate-preview`).
- [x] Protect the video route `/api/ai/video` using these gating middlewares in `backend/src/routes/ai.routes.ts`.

### Backend Usage Tracking and Billing Rules
- [x] Define limits for the `video` tool across anonymous (0), free (0), starter (10 daily/50 monthly), and pro (30 daily/200 monthly) plan configurations in `backend/src/config/plans.ts`.
- [x] Implement flat credit calculation (1 credit per video, 0.2 with BYOK) in `backend/src/routes/ai.routes.ts`.
- [x] Increment the DB tracking logs atomically via `checkAndIncrementMultiUsage` on successful generation.
- [x] Map `video` usage resets and caching fields in `getUsageStatus` inside `backend/src/services/usage.service.ts`.

### Frontend Settings and Quotas Integration
- [x] Add the `video` property to the frontend `UsageStatus` interface and store in `frontend/src/store/usage.store.ts`.
- [x] Add a dynamic `Video` service consumption card on the Settings Page `frontend/src/pages/SettingsPage.tsx` using `buildServiceCard`.

## Verification Criteria

### Automated Tests
- Running `npx vitest run` in the backend directory verifies plan gating logic and model validation middleware.

### Manual Verification
- Authentication: Video requests from anonymous or free tier users fail with structured JSON errors.
- Quotas: Starter and Pro tier requests correctly track consumed videos, charging 1 credit for standard requests and 0.2 credits for BYOK requests.
